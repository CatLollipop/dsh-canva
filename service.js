import { appendFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import crypto from 'node:crypto'
import path from 'node:path'

export const MCP_URL = 'https://mcp.canva.com/mcp'
export const PRM_URL = 'https://mcp.canva.com/.well-known/oauth-protected-resource'
export const DEFAULT_SCOPES = [
  'profile:read',
  'design:meta:read',
  'design:content:read',
  'design:content:write',
  'folder:read',
  'folder:write',
  'brandtemplate:meta:read',
  'brandtemplate:content:read',
  'asset:read',
  'asset:write',
  'brandkit:read',
  'comment:read',
  'comment:write',
]

const STATE_TTL_MS = 10 * 60 * 1000
const MCP_PROTOCOL = '2025-06-18'
const CLIENT_NAME = 'Canva for DSH'

export function createDesignConnectors({ credentials, settingsPath, fetchImpl = globalThis.fetch, tools, getCallbackUri }) {
  if (!credentials) throw new Error('凭证服务不可用。')
  if (!settingsPath) throw new Error('缺少设置文件路径。')
  const clientErrorLogPath = path.join(path.dirname(settingsPath), 'canva-client-errors.log')
  let chain = Promise.resolve()
  const enqueue = (fn) => {
    const run = chain.then(fn, fn)
    chain = run.then(() => {}, () => {})
    return run
  }

  const legacySettingsPath = path.join(path.dirname(settingsPath), 'open-canvas.json')

  /**
   * Read the settings document, migrating the previous `open-canvas.json`
   * (the plugin's former name) so an existing authorization survives the rename.
   */
  async function readSettings() {
    try {
      return normalizeSettings(JSON.parse(await readFile(settingsPath, 'utf8')))
    } catch {}
    try {
      const legacy = normalizeSettings(JSON.parse(await readFile(legacySettingsPath, 'utf8')))
      await writeSettings(legacy)
      return legacy
    } catch {}
    return normalizeSettings(null)
  }

  async function writeSettings(settings) {
    const next = normalizeSettings(settings)
    await mkdir(path.dirname(settingsPath), { recursive: true })
    const temporary = `${settingsPath}.${process.pid}.tmp`
    try {
      await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
      await rename(temporary, settingsPath)
    } catch (error) {
      await unlink(temporary).catch(() => {})
      throw error
    }
    return next
  }

  function updateSettings(mutator) {
    return enqueue(async () => writeSettings(mutator(await readSettings())))
  }

  function callbackUri() {
    try {
      return typeof getCallbackUri === 'function' ? String(getCallbackUri() || '') : ''
    } catch {
      return ''
    }
  }

  // ---- OAuth: discovery, dynamic client registration, PKCE, refresh ----

  const authKey = 'canva/canva-oauth'
  const pendingAuthorizations = new Map()
  let discovery = null
  let session = null
  let toolsCache = null
  let nextRpcId = 1
  let onToolsChanged = null

  async function fetchJson(url, options = {}) {
    let response
    try {
      response = await fetchImpl(url, {
        ...options,
        headers: { accept: 'application/json', ...options.headers },
        redirect: 'error',
        signal: AbortSignal.timeout(options.timeoutMs || 15000),
      })
    } catch {
      throw new Error('连接 Canva 服务失败，请检查网络。')
    }
    const text = await response.text()
    let body = null
    if (text) {
      try { body = JSON.parse(text) } catch { body = null }
    }
    return { status: response.status, headers: response.headers, ok: response.ok, body }
  }

  async function discover() {
    if (discovery) return discovery
    const prm = await fetchJson(PRM_URL)
    if (!prm.ok || !prm.body?.authorization_servers?.length) throw new Error('无法读取 Canva MCP 的授权信息。')
    const asUrl = new URL('/.well-known/oauth-authorization-server', prm.body.authorization_servers[0]).toString()
    const as = await fetchJson(asUrl)
    if (!as.ok || typeof as.body?.token_endpoint !== 'string' || typeof as.body?.registration_endpoint !== 'string') {
      throw new Error('Canva MCP 授权服务器元数据不完整。')
    }
    discovery = {
      resource: prm.body.resource || 'https://mcp.canva.com',
      scopes: Array.isArray(prm.body.scopes_supported) && prm.body.scopes_supported.length
        ? prm.body.scopes_supported
        : DEFAULT_SCOPES,
      authorizationEndpoint: as.body.authorization_endpoint,
      tokenEndpoint: as.body.token_endpoint,
      registrationEndpoint: as.body.registration_endpoint,
      revocationEndpoint: as.body.revocation_endpoint || as.body.token_endpoint,
      codeChallengeMethods: as.body.code_challenge_methods_supported || ['S256'],
    }
    return discovery
  }

  const legacyAuthKey = 'open-canvas/canva-oauth'

  /**
   * Read the stored Canva authorization, migrating the record saved under the
   * plugin's former name so an authorized user keeps working after the rename.
   */
  async function readAuthRecord() {
    if (typeof credentials.readRecord !== 'function') return null
    try {
      const record = await credentials.readRecord(authKey)
      const payload = record?.payload
      if (payload && typeof payload === 'object' && typeof payload.accessToken === 'string') return payload
    } catch {}
    try {
      const legacy = await credentials.readRecord(legacyAuthKey)
      const payload = legacy?.payload
      if (payload && typeof payload === 'object' && typeof payload.accessToken === 'string') {
        await writeAuthRecord(payload)
        return payload
      }
    } catch {}
    return null
  }

  async function writeAuthRecord(payload) {
    if (typeof credentials.modifyRecord !== 'function') throw new Error('凭证库不支持授权记录。')
    await credentials.modifyRecord(authKey, async () => ({ kind: 'grant', payload }))
  }

  async function deleteAuthRecord() {
    if (typeof credentials.deleteRecord !== 'function') return
    await credentials.deleteRecord(authKey).catch(() => {})
  }

  /** Register this loopback client once (DCR); re-register when the callback URI changes. */
  async function ensureClient(info, redirectUri) {
    const settings = await readSettings()
    const row = settings.providers.canvas
    if (row.clientId && row.redirectUri === redirectUri) return row.clientId
    const registered = await fetchJson(info.registrationEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: CLIENT_NAME,
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: info.scopes.join(' '),
      }),
    })
    if (!registered.ok || typeof registered.body?.client_id !== 'string') {
      throw new Error(`Canva 客户端注册失败（HTTP ${registered.status}）。`)
    }
    await updateSettings((current) => {
      current.providers.canvas.clientId = registered.body.client_id
      current.providers.canvas.redirectUri = redirectUri
      return current
    })
    return registered.body.client_id
  }

  async function exchange(params) {
    const info = await discover()
    const settings = await readSettings()
    const clientId = settings.providers.canvas.clientId
    if (!clientId) throw new Error('Canva 客户端尚未注册，请重新点「一键授权」。')
    const body = new URLSearchParams({ ...params, client_id: clientId })
    const response = await fetchJson(info.tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    if (!response.ok || typeof response.body?.access_token !== 'string') {
      const code = response.body?.error || ''
      throw new Error(`Canva 令牌交换失败（HTTP ${response.status}${code ? ` ${code}` : ''}）。`)
    }
    const expiresIn = Number(response.body.expires_in) > 0 ? Number(response.body.expires_in) : 0
    const payload = {
      accessToken: response.body.access_token,
      refreshToken: typeof response.body.refresh_token === 'string' ? response.body.refresh_token : '',
      expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : 0,
      scopes: typeof response.body.scope === 'string' ? response.body.scope.split(/\s+/).filter(Boolean) : [],
      obtainedAt: new Date().toISOString(),
    }
    await writeAuthRecord(payload)
    session = null
    toolsCache = null
    return payload
  }

  async function accessToken(force = false) {
    const record = await readAuthRecord()
    if (!record) throw new Error('Canva 还没有授权。请在设置 → Canva 里点「一键授权」。')
    if (!force && (!record.expiresAt || record.expiresAt - 60_000 > Date.now())) return record.accessToken
    if (!record.refreshToken) {
      await deleteAuthRecord()
      throw new Error('Canva 授权已过期，请重新授权。')
    }
    try {
      const next = await exchange({ grant_type: 'refresh_token', refresh_token: record.refreshToken })
      return next.accessToken
    } catch {
      await deleteAuthRecord()
      throw new Error('Canva 授权已过期，请重新授权。')
    }
  }

  // ---- MCP (Streamable HTTP JSON-RPC) ----

  function parseRpcBody(res, expectedId) {
    const text = res.text
    const type = String(res.headers?.get?.('content-type') || '')
    if (type.includes('text/event-stream')) {
      let last = null
      for (const line of text.split('\n')) {
        if (!line.startsWith('data:')) continue
        try { last = JSON.parse(line.slice(5).trim()) } catch {}
      }
      if (!last) throw new Error('Canva MCP 返回了无法解析的事件流。')
      return last
    }
    try {
      return JSON.parse(text)
    } catch {
      throw new Error('Canva MCP 返回了非 JSON 响应。')
    }
  }

  async function postMcp(payload, { notification = false } = {}) {
    const token = await accessToken()
    let response
    try {
      response = await fetchImpl(MCP_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
          ...(session?.id ? { 'mcp-session-id': session.id } : {}),
        },
        body: JSON.stringify(payload),
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
      })
    } catch {
      throw new Error('连接 Canva MCP 失败，请检查网络。')
    }
    const text = await response.text()
    if (notification) {
      if (response.status >= 400) throw new Error(`Canva MCP 通知失败（HTTP ${response.status}）。`)
      return null
    }
    if (response.status === 401) return { unauthorized: true, status: 401, headers: response.headers, text }
    if (!response.ok) throw new Error(`Canva MCP 请求失败（HTTP ${response.status}）。`)
    return { unauthorized: false, status: response.status, headers: response.headers, text }
  }

  async function initializeSession() {
    const initId = nextRpcId++
    let result = await postMcp({
      jsonrpc: '2.0',
      id: initId,
      method: 'initialize',
      params: { protocolVersion: MCP_PROTOCOL, capabilities: {}, clientInfo: { name: CLIENT_NAME, version: '1.0.0' } },
    })
    if (result.unauthorized) {
      await accessToken(true)
      result = await postMcp({
        jsonrpc: '2.0',
        id: initId,
        method: 'initialize',
        params: { protocolVersion: MCP_PROTOCOL, capabilities: {}, clientInfo: { name: CLIENT_NAME, version: '1.0.0' } },
      })
    }
    if (result.unauthorized) {
      await deleteAuthRecord()
      throw new Error('Canva 授权已失效，请重新授权。')
    }
    const body = parseRpcBody(result, initId)
    if (body?.error) throw new Error(`Canva MCP 初始化失败：${body.error.message || body.error.code || 'unknown'}`)
    session = {
      id: String(result.headers?.get?.('mcp-session-id') || ''),
      ready: true,
      protocolVersion: body?.result?.protocolVersion || MCP_PROTOCOL,
    }
    await postMcp({ jsonrpc: '2.0', method: 'notifications/initialized' }, { notification: true }).catch(() => {})
    return session
  }

  let sessionPromise = null
  async function ensureSession() {
    if (session?.ready) return session
    if (sessionPromise) return sessionPromise
    sessionPromise = initializeSession().finally(() => { sessionPromise = null })
    return sessionPromise
  }

  async function rpc(payload) {
    await ensureSession()
    const id = payload.id ?? nextRpcId++
    const request = { ...payload, jsonrpc: '2.0', id }
    let result = await postMcp(request)
    if (result.unauthorized) {
      await accessToken(true)
      session = null
      await initializeSession()
      result = await postMcp(request)
    }
    if (result.unauthorized) {
      await deleteAuthRecord()
      throw new Error('Canva 授权已失效，请重新授权。')
    }
    const body = parseRpcBody(result, id)
    if (body?.error) {
      const message = body.error.message || body.error.code || 'unknown error'
      throw new Error(`Canva MCP 工具错误：${message}`)
    }
    return body?.result
  }

  async function refreshTools(force = false) {
    if (!force && toolsCache) return toolsCache
    const list = []
    let cursor = ''
    for (let page = 0; page < 5; page += 1) {
      const result = await rpc({
        method: 'tools/list',
        params: cursor ? { cursor } : {},
      })
      if (Array.isArray(result?.tools)) list.push(...result.tools)
      cursor = typeof result?.nextCursor === 'string' ? result.nextCursor : ''
      if (!cursor) break
    }
    toolsCache = { tools: list, fetchedAt: Date.now() }
    if (onToolsChanged) {
      try { await onToolsChanged(toolsCache.tools) } catch {}
    }
    return toolsCache
  }

  function prunePending() {
    const cutoff = Date.now() - STATE_TTL_MS
    for (const [state, pending] of pendingAuthorizations) {
      if (pending.createdAt < cutoff) pendingAuthorizations.delete(state)
    }
  }

  function egoTool(name) {
    const definition = tools?.get?.(name)
    if (!definition || typeof definition.execute !== 'function') return null
    return definition
  }

  async function openInBrowser(url) {
    const navigate = egoTool('ego_navigate')
    if (!navigate) return false
    try {
      const result = await navigate.execute({ url, space: 'default', wait: true, timeout: 30000 }, { signal: AbortSignal.timeout(30000) })
      return result?.ok !== false
    } catch {
      return false
    }
  }

  return {
    /** Set the hook the host uses to (re)publish Canva MCP tools after authorization. */
    setToolsChangedHandler(handler) {
      onToolsChanged = typeof handler === 'function' ? handler : null
    },

    async status() {
      const settings = await readSettings()
      const record = await readAuthRecord()
      return {
        providers: [{
          id: 'canvas',
          enabled: settings.providers.canvas.enabled,
          oauth: {
            authorized: Boolean(record),
            expiresAt: record?.expiresAt || 0,
            scopes: record?.scopes || [],
            clientId: settings.providers.canvas.clientId,
            callbackUri: callbackUri(),
            mcpUrl: MCP_URL,
          },
          tools: toolsCache?.tools?.length || 0,
          toolNames: toolsCache?.tools?.map((tool) => tool.name) || [],
          connected: Boolean(session?.ready),
        }],
      }
    },

    setEnabled(enabled) {
      return updateSettings((settings) => {
        settings.providers.canvas.enabled = enabled === true
        return settings
      }).then((settings) => ({ provider: 'canvas', enabled: settings.providers.canvas.enabled }))
    },

    async canvaAuthorizeStatus() {
      const status = await this.status()
      return status.providers[0].oauth
    },

    /**
     * One click: discover Canva's OAuth metadata, register this loopback client
     * dynamically (no credentials for the user to fill), then open the consent
     * page. The consent redirect lands on the loopback callback and auto-caches.
     */
    async canvaAuthorizeStart() {
      const uri = callbackUri()
      if (!uri) throw new Error('Canva 回调地址还没就绪，请稍后重试或重启 DSH。')
      const info = await discover()
      const clientId = await ensureClient(info, uri)
      prunePending()
      const state = crypto.randomBytes(32).toString('base64url')
      const verifier = crypto.randomBytes(64).toString('base64url')
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
      pendingAuthorizations.set(state, { verifier, redirectUri: uri, createdAt: Date.now() })

      const url = new URL(info.authorizationEndpoint)
      url.search = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: uri,
        scope: info.scopes.join(' '),
        state,
        code_challenge: challenge,
        code_challenge_method: info.codeChallengeMethods.includes('S256') ? 'S256' : 'plain',
        resource: info.resource,
      }).toString()

      const opened = await openInBrowser(url.toString())
      await updateSettings((settings) => {
        settings.providers.canvas.enabled = true
        return settings
      })
      return {
        provider: 'canvas',
        authorizeUrl: url.toString(),
        redirectUri: uri,
        opened,
        scopes: info.scopes,
        message: opened
          ? '已打开 Canva 授权页，同意后令牌会自动缓存。'
          : '请在浏览器里打开授权链接完成同意，令牌会自动缓存。',
      }
    },

    async completeCanvaAuthorization(params = {}) {
      const code = typeof params.code === 'string' ? params.code.trim() : ''
      const state = typeof params.state === 'string' ? params.state.trim() : ''
      if (params.error) return { ok: false, message: String(params.error_description || params.error).slice(0, 300) }
      if (!code) return { ok: false, message: 'Canva 回调缺少授权码。' }
      const pending = pendingAuthorizations.get(state)
      pendingAuthorizations.delete(state)
      if (!pending) return { ok: false, message: '授权状态已失效，请回到设置页重新点「一键授权」。' }
      if (pending.createdAt < Date.now() - STATE_TTL_MS) return { ok: false, message: '授权超时，请重新点「一键授权」。' }
      try {
        const record = await exchange({
          grant_type: 'authorization_code',
          code,
          redirect_uri: pending.redirectUri,
          code_verifier: pending.verifier,
        })
        try {
          await refreshTools(true)
        } catch (error) {
          return { ok: true, expiresAt: record.expiresAt, warning: error?.message || '工具列表暂未读取到。', message: 'Canva 授权成功，但工具列表读取失败。' }
        }
        return { ok: true, expiresAt: record.expiresAt, scopes: record.scopes, tools: toolsCache?.tools?.length || 0, message: 'Canva 授权成功，令牌已缓存。' }
      } catch (error) {
        return { ok: false, message: error?.message || 'Canva 授权失败。' }
      }
    },

    async canvaRevoke() {
      const record = await readAuthRecord()
      if (record) {
        try {
          const info = await discover()
          const settings = await readSettings()
          await fetchImpl(info.revocationEndpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              token: record.refreshToken || record.accessToken,
              client_id: settings.providers.canvas.clientId || '',
              token_type_hint: record.refreshToken ? 'refresh_token' : 'access_token',
            }).toString(),
            signal: AbortSignal.timeout(8000),
          }).catch(() => {})
        } catch {}
      }
      await deleteAuthRecord()
      session = null
      toolsCache = null
      if (onToolsChanged) {
        try { await onToolsChanged([]) } catch {}
      }
      return { provider: 'canvas', authorized: false }
    },

    /** List the Canva MCP tools (cached until forced). */
    async listTools(force = false) {
      const cache = await refreshTools(force)
      return {
        provider: 'canvas',
        count: cache.tools.length,
        tools: cache.tools.map((tool) => ({
          name: String(tool.name || ''),
          description: String(tool.description || '').slice(0, 500),
          inputSchema: tool.inputSchema || tool.input_schema || null,
        })),
      }
    },

    /** Call one Canva MCP tool and return its content blocks. */
    async callTool(name, args = {}) {
      const toolName = String(name || '').trim()
      if (!toolName) throw new Error('缺少 Canva 工具名，请先调用 tools 查看可用工具。')
      const result = await rpc({
        method: 'tools/call',
        params: { name: toolName, arguments: args && typeof args === 'object' ? args : {} },
      })
      return {
        provider: 'canvas',
        tool: toolName,
        isError: result?.isError === true,
        content: Array.isArray(result?.content) ? result.content : result?.content ? [result.content] : [],
        structured: result?.structuredContent ?? null,
      }
    },

    /** Connect and read the tool catalog; used by the page's "test" action. */
    async test() {
      const cache = await refreshTools(true)
      return {
        provider: 'canvas',
        ok: true,
        tools: cache.tools.length,
        message: `Canva 已连接，共 ${cache.tools.length} 个工具。`,
      }
    },

    async reportClientError(payload = {}) {
      const clip = (value) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, 4000)
      const line = JSON.stringify({
        at: new Date().toISOString(),
        message: clip(payload.message),
        stack: clip(payload.stack),
        componentStack: clip(payload.componentStack),
        href: clip(payload.href),
      })
      await mkdir(path.dirname(settingsPath), { recursive: true })
      await appendFile(clientErrorLogPath, `${line}\n`, { mode: 0o600 })
      return { logged: true }
    },

    async dispatch(args, signal) {
      const action = typeof args?.action === 'string' ? args.action : ''
      if (signal?.aborted) throw abortError()
      if (action === 'status') return this.status()
      if (action === 'tools') return this.listTools(true)
      if (action === 'test') return this.test()
      if (action === 'call') {
        let parsed = args?.arguments
        if (typeof parsed === 'string') {
          try { parsed = parsed.trim() ? JSON.parse(parsed) : {} } catch { throw new Error('arguments 必须是 JSON 对象字符串。') }
        }
        if (parsed !== undefined && (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))) {
          throw new Error('arguments 必须是 JSON 对象。')
        }
        return this.callTool(args?.tool, parsed || {})
      }
      throw new Error('action 必须是 status、tools、test 或 call。')
    },
  }
}

function normalizeSettings(raw) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const stored = input.providers && typeof input.providers === 'object' ? input.providers : {}
  const item = stored.canvas && typeof stored.canvas === 'object' && !Array.isArray(stored.canvas) ? stored.canvas : {}
  return {
    version: 3,
    providers: {
      canvas: {
        enabled: item.enabled === true,
        clientId: typeof item.clientId === 'string' ? item.clientId.slice(0, 200) : '',
        redirectUri: typeof item.redirectUri === 'string' ? item.redirectUri.slice(0, 300) : '',
      },
    },
  }
}

function abortError() {
  const error = new Error('请求已取消或超时。')
  error.name = 'AbortError'
  return error
}
