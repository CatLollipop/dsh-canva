import assert from 'node:assert/strict'
import test from 'node:test'

import { RPC_ENDPOINT, handleOpenCanvasCall, registerOpenCanvasRoute } from './rpc.js'
import { __test__ } from './index.js'

function fakeService(overrides = {}) {
  const calls = []
  const base = {
    calls,
    async status() {
      calls.push('status')
      return { providers: [{ id: 'canvas', enabled: false, oauth: { authorized: false }, tools: 0, toolNames: [] }] }
    },
    async setEnabled(enabled) {
      calls.push(['setEnabled', enabled])
      return { provider: 'canvas', enabled }
    },
    async test() {
      calls.push('test')
      return { provider: 'canvas', ok: true, tools: 2, message: 'ok' }
    },
    async listTools(force) {
      calls.push(['listTools', force])
      return { provider: 'canvas', count: 0, tools: [] }
    },
    async callTool(tool, args) {
      calls.push(['callTool', tool, args])
      return { provider: 'canvas', tool, content: [{ type: 'text', text: 'hi' }] }
    },
    async canvaAuthorizeStart() {
      calls.push('authorizeStart')
      return { authorizeUrl: 'https://mcp.canva.com/authorize?x=1', opened: false }
    },
    async canvaAuthorizeStatus() {
      calls.push('authorizeStatus')
      return { authorized: false }
    },
    async canvaRevoke() {
      calls.push('revoke')
      return { provider: 'canvas', authorized: false }
    },
    async reportClientError(payload) {
      calls.push(['reportClientError', payload])
      return { logged: true }
    },
  }
  return { ...base, ...overrides }
}

function request(body) {
  return new Request(`http://127.0.0.1/api/${RPC_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function envelope(method, payload = {}) {
  return { type: 'client-request', rpcId: 'rpc-1', method: RPC_ENDPOINT, payload: { method, payload } }
}

test('settings page RPC wraps results in the client envelope', async () => {
  let route
  const ctx = { connection: { fetch: { register(value) { route = value; return async () => {} } } } }
  const service = fakeService()
  registerOpenCanvasRoute(ctx, service)
  assert.equal(route.path, `/api/${RPC_ENDPOINT}`)

  const response = await route.fetch(request(envelope('status')))
  const body = await response.json()
  assert.equal(body.type, 'server-response')
  assert.equal(body.rpcId, 'rpc-1')
  assert.equal(body.result.ok, true)
  assert.equal(body.result.value.providers[0].id, 'canvas')

  const start = await (await route.fetch(request(envelope('canvaAuthorizeStart')))).json()
  assert.equal(start.result.value.authorizeUrl.includes('mcp.canva.com'), true)
  assert.deepEqual(service.calls, ['status', 'authorizeStart'])
})

test('RPC maps methods onto the service without leaking internals', async () => {
  const service = fakeService()
  const status = await handleOpenCanvasCall(service, 'status', {})
  assert.equal(status.ok, true)
  const called = await handleOpenCanvasCall(service, 'callTool', { tool: 'get-design', arguments: { design_id: 'D1' } })
  assert.equal(called.ok, true)
  assert.equal(called.value.tool, 'get-design')
  const authorized = await handleOpenCanvasCall(service, 'canvaAuthorizeStatus', {})
  assert.equal(authorized.value.authorized, false)
  const unknown = await handleOpenCanvasCall(service, 'setSecret', {})
  assert.equal(unknown.error.code, 'canva/unknown-method')
})

test('malformed requests are rejected with stable codes', async () => {
  let route
  const ctx = { connection: { fetch: { register(value) { route = value; return async () => {} } } } }
  registerOpenCanvasRoute(ctx, fakeService())

  const bad = await (await route.fetch(request({ type: 'client-request' }))).json()
  assert.equal(bad.result.error.code, 'canva/bad-request')
  assert.deepEqual(bad.result.error.details, {})

  const notJson = await route.fetch(request('not json'))
  assert.equal(notJson.status, 400)
  const wrongType = await route.fetch(new Request(`http://127.0.0.1/api/${RPC_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: 'x',
  }))
  assert.equal(wrongType.status, 415)
  const wrongMethod = await route.fetch(new Request(`http://127.0.0.1/api/${RPC_ENDPOINT}`, { method: 'GET' }))
  assert.equal(wrongMethod.status, 405)
})

test('Canva MCP tool schemas are sanitized for the host registry', () => {
  const { sanitizeSchema, toolNameFor, parseFrontmatter } = __test__
  const schema = sanitizeSchema({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {
      design_id: { type: 'string', description: 'id', minLength: 1 },
      options: {
        type: 'object',
        properties: { format: { type: 'string', enum: ['png', 'jpg'] }, nested: { $ref: '#/$defs/x' } },
        required: ['format', 'missing'],
      },
      tags: { type: 'array', items: { type: 'string' } },
    },
    required: ['design_id', 'not_a_property'],
    additionalProperties: false,
    $defs: { x: { type: 'string' } },
  })
  assert.equal(schema.type, 'object')
  assert.deepEqual(schema.required, ['design_id'])
  assert.equal(schema.$defs, undefined)
  assert.equal(schema.$schema, undefined)
  assert.equal(schema.properties.design_id.minLength, undefined)
  assert.equal(schema.properties.design_id.type, 'string')
  assert.deepEqual(schema.properties.options.required, ['format'])
  assert.deepEqual(schema.properties.options.properties.format.enum, ['png', 'jpg'])
  assert.equal(schema.properties.options.properties.nested.type, 'string')
  assert.deepEqual(schema.properties.tags.items, { type: 'string' })

  assert.equal(toolNameFor('get-design'), 'canva_get_design')
  assert.equal(toolNameFor('weird name!'), 'canva_weird_name_')
  assert.equal(toolNameFor(''), '')

  const parsed = parseFrontmatter('---\nname: canva-test\ndescription: Test skill\n---\n\n# Body\n')
  assert.equal(parsed.data.name, 'canva-test')
  assert.equal(parsed.data.description, 'Test skill')
  assert.match(parsed.body, /# Body/)
})
