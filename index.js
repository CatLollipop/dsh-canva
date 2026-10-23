import os from 'node:os'
import path from 'node:path'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { registerOpenCanvasRoute } from './rpc.js'
import { startCanvaCallbackServer } from './oauth-server.js'
import { createDesignConnectors, MCP_URL } from './service.js'

export const inject = ['credentials', 'connection', 'tools']

const SKILLS_DIR = fileURLToPath(new URL('./skills/', import.meta.url))
const TOOL_PREFIX = 'canva_'

const PROMPT = [
  'This plugin connects Canva through its official MCP server (https://mcp.canva.com/mcp), authorized in Settings → Canva with one click.',
  'After authorization the Canva MCP tools are registered natively (names prefixed with canva_) and the bundled Canva skills are available in the skill catalog.',
  'Call canva_* tools directly for Canva work; use the canva tool for status, listing tools, testing, or calling a tool by name.',
  'If Canva is not authorized, point the user to Settings → Canva instead of retrying tools.',
  'Never ask the user for Canva tokens, cookies, or client credentials: the plugin obtains and caches them itself.',
].join(' ')

/** Sanitize an MCP JSON Schema into the registry's supported subset. */
function sanitizeSchema(node, depth = 0) {
  if (depth > 8 || !node || typeof node !== 'object') return { type: 'object', additionalProperties: true }
  const out = {}
  if (typeof node.type === 'string' && ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'].includes(node.type)) {
    out.type = node.type
  }
  if (typeof node.description === 'string') out.description = node.description.slice(0, 800)
  if (typeof node.title === 'string') out.title = node.title.slice(0, 200)
  if (Array.isArray(node.enum)) out.enum = node.enum.filter((value) => value === null || ['string', 'number', 'boolean'].includes(typeof value)).slice(0, 100)
  if (node.const !== undefined && (node.const === null || ['string', 'number', 'boolean'].includes(typeof node.const))) out.const = node.const
  if (typeof node.default !== 'undefined' && node.default !== null && ['string', 'number', 'boolean'].includes(typeof node.default)) out.default = node.default
  if (Array.isArray(node.examples)) out.examples = node.examples.slice(0, 3)
  if (Array.isArray(node.oneOf) && node.oneOf.length) {
    const variants = node.oneOf.slice(0, 8).map((variant) => sanitizeSchema(variant, depth + 1))
    if (variants.length) out.oneOf = variants
  }
  if (node.properties && typeof node.properties === 'object') {
    const properties = {}
    for (const [key, value] of Object.entries(node.properties).slice(0, 40)) {
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(key)) continue
      properties[key] = sanitizeSchema(value, depth + 1)
    }
    out.type = out.type || 'object'
    out.properties = properties
    if (Array.isArray(node.required)) {
      const required = node.required.filter((key) => Object.hasOwn(properties, key)).slice(0, 40)
      if (required.length) out.required = required
    }
    out.additionalProperties = node.additionalProperties === true
  } else if (node.type === 'object' || node.additionalProperties !== undefined) {
    out.type = out.type || 'object'
    out.additionalProperties = node.additionalProperties === true
  }
  if (node.items && typeof node.items === 'object') {
    out.type = out.type || 'array'
    out.items = sanitizeSchema(node.items, depth + 1)
  } else if (node.type === 'array') {
    out.items = { type: 'object', additionalProperties: true }
  }
  if (!out.type) out.type = out.properties ? 'object' : 'string'
  return out
}

function toolNameFor(name) {
  const cleaned = String(name || '').replace(/[^A-Za-z0-9_]/g, '_').slice(0, 56)
  if (!cleaned) return ''
  return `${TOOL_PREFIX}${cleaned}`
}

function renderContent(result) {
  const blocks = Array.isArray(result?.content) ? result.content : []
  const lines = []
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue
    if (block.type === 'text' && typeof block.text === 'string') lines.push(block.text)
    else if (block.type === 'image') lines.push('[image content from Canva]')
    else if (block.type === 'resource' && typeof block.resource?.text === 'string') lines.push(block.resource.text)
    else lines.push(JSON.stringify(block).slice(0, 2000))
  }
  const text = lines.join('\n\n') || JSON.stringify(result)
  return text.length <= 16000 ? text : `${text.slice(0, 16000)}\n…(truncated)`
}

/**
 * A registry-ready tool definition built without importing @deepseek-ai/dsh-tools:
 * that package is not resolvable from a workspace-linked bundle. The shape mirrors
 * what defineTool() returns — raw JSON Schema parameters, an output schema with a
 * render callback, and an execute body.
 */
function openCanvasTool(service) {
  return {
    name: 'canva',
    description: 'Canva 连接入口。action=status 查看授权与工具状态；action=tools 列出 Canva MCP 工具；action=test 重新连接并读取工具；action=call 用 tool 和 arguments（JSON 对象字符串）调用任意 Canva 工具。Canva 工具通常已作为 canva_* 原生工具注册，优先直接调用。授权在设置 → Canva 一键完成，不要向用户索要令牌。',
    timeoutMs: 30000,
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['status', 'tools', 'test', 'call'],
          description: 'status 查看状态；tools 列出工具；test 测试连接；call 调用工具。',
        },
        tool: { type: 'string', description: 'action=call 时必填：Canva 工具名（不带 canva_ 前缀）。' },
        arguments: { type: 'string', description: 'action=call 时的 JSON 对象字符串，例如 {"design_id":"D..."}。' },
      },
      required: ['action'],
    },
    output: {
      schema: { type: 'string' },
      render(_args, value) {
        return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }]
      },
    },
    isConcurrencySafe() {
      return true
    },
    async execute(args, exec) {
      const value = await service.dispatch(args, exec?.signal)
      if (args?.action === 'call' && value && Array.isArray(value.content)) return renderContent(value)
      const text = JSON.stringify(value, null, 2)
      return text.length <= 12000 ? text : `${text.slice(0, 12000)}\n…(truncated)`
    },
  }
}

function parseFrontmatter(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source)
  if (!match) return { data: {}, body: source }
  const data = {}
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    data[key] = value
  }
  return { data, body: match[2] }
}

async function loadCanvaSkills() {
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true }).catch(() => [])
  const skills = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    try {
      const source = await readFile(path.join(SKILLS_DIR, entry.name, 'SKILL.md'), 'utf8')
      const { data, body } = parseFrontmatter(source)
      const name = String(data.name || entry.name).trim()
      const description = String(data.description || '').trim()
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || !description) continue
      skills.push({ name, description, content: body.trim() })
    } catch {}
  }
  return skills
}

function disposeAll(disposers) {
  for (const dispose of disposers) {
    try { dispose() } catch {}
  }
  disposers.length = 0
}

export function apply(ctx) {
  let callbackServer = null
  const canvaToolDisposers = []
  let disposed = false

  const service = createDesignConnectors({
    credentials: ctx.credentials,
    tools: ctx.tools,
    settingsPath: path.join(process.env.DSH_HOME?.trim() || path.join(os.homedir(), '.dsh'), 'canva.json'),
    getCallbackUri: () => callbackServer?.uri || '',
  })

  async function publishCanvaTools(mcpTools) {
    disposeAll(canvaToolDisposers)
    if (disposed) return
    const usedNames = new Set()
    for (const mcpTool of mcpTools || []) {
      const rawName = String(mcpTool?.name || '')
      let name = toolNameFor(rawName)
      if (!name) continue
      if (usedNames.has(name)) {
        let suffix = 2
        while (usedNames.has(`${name}_${suffix}`)) suffix += 1
        name = `${name}_${suffix}`
      }
      usedNames.add(name)
      let parameters
      try {
        parameters = sanitizeSchema(mcpTool.inputSchema || mcpTool.input_schema || { type: 'object', properties: {} })
      } catch {
        continue
      }
      try {
        const dispose = ctx.tools.register({
          name,
          description: `[Canva] ${String(mcpTool.description || rawName).slice(0, 1200)}`,
          timeoutMs: 60000,
          parameters,
          output: {
            schema: { type: 'string' },
            render(_args, value) {
              return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }]
            },
          },
          isConcurrencySafe() {
            return true
          },
          async execute(args) {
            const result = await service.callTool(rawName, args && typeof args === 'object' ? args : {})
            return renderContent(result)
          },
        })
        canvaToolDisposers.push(dispose)
      } catch {}
    }
  }

  service.setToolsChangedHandler(publishCanvaTools)

  ctx.effect(() => {
    callbackServer = startCanvaCallbackServer({
      onAuthorized: (params) => service.completeCanvaAuthorization(params),
    })
    void callbackServer.ready
    const disposeRoute = registerOpenCanvasRoute(ctx, service)
    const disposeTool = ctx.tools.register(openCanvasTool(service))
    let disposePrompt
    try {
      const systemPrompt = ctx.get?.('systemPrompt')
      disposePrompt = systemPrompt?.section?.({
        name: 'canva',
        order: 7400,
        interpolate: false,
        text: PROMPT,
      })
    } catch {
      disposePrompt = undefined
    }
    const disposeSkills = registerSkills(ctx)
    // Warm the Canva MCP tool catalog when an authorization already exists.
    void service.listTools(false).then((value) => publishCanvaTools(value.tools)).catch(() => {})
    return () => {
      disposed = true
      disposeRoute?.()
      disposeTool?.()
      disposePrompt?.()
      disposeSkills?.()
      disposeAll(canvaToolDisposers)
      void callbackServer?.close()
      callbackServer = null
    }
  })

  function registerSkills(host) {
    try {
      const stop = host.inject(['skills'], (skillsCtx) => {
        void loadCanvaSkills().then((skills) => {
          if (disposed) return
          for (const skill of skills) {
            try {
              skillsCtx.skills.register({
                name: skill.name,
                description: skill.description,
                content: skill.content,
                whenToUse: skill.description,
                source: 'bundled',
                provider: 'dsh-canva',
                invocation: { modelInvocable: true, userInvocable: true },
              })
            } catch {}
          }
        }).catch(() => {})
        return () => {}
      })
      return typeof stop === 'function' ? stop : () => {}
    } catch {
      // Skills are optional; the tools still work without the registry.
      return () => {}
    }
  }
}

export const __test__ = { sanitizeSchema, toolNameFor, parseFrontmatter, loadCanvaSkills, TOOL_PREFIX, MCP_URL }
