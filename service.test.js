import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { MCP_URL, PRM_URL, createDesignConnectors } from './service.js'

const AS_URL = 'https://mcp.canva.com/.well-known/oauth-authorization-server'
const CALLBACK = 'http://127.0.0.1:47653/canva/oauth/callback'

const PRM = {
  resource: 'https://mcp.canva.com',
  authorization_servers: ['https://mcp.canva.com'],
  scopes_supported: ['profile:read', 'design:meta:read', 'design:content:read', 'design:content:write'],
}
const AS = {
  issuer: 'https://mcp.canva.com',
  authorization_endpoint: 'https://mcp.canva.com/authorize',
  token_endpoint: 'https://mcp.canva.com/token',
  registration_endpoint: 'https://mcp.canva.com/register',
  revocation_endpoint: 'https://mcp.canva.com/token',
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none'],
}

function memoryCredentials() {
  const records = new Map()
  return {
    async resolve() { return undefined },
    async describe() { return { configured: false, writable: true } },
    async set() {},
    async unset() {},
    async readRecord(key) { return records.get(String(key)) },
    async describeRecord(key) {
      const configured = records.has(String(key))
      return { configured, kind: configured ? 'grant' : undefined, writable: true }
    },
    async modifyRecord(key, mutate) {
      const next = await mutate(records.get(String(key)))
      if (next !== undefined) records.set(String(key), next)
      return records.get(String(key))
    },
    async deleteRecord(key) { records.delete(String(key)) },
  }
}

function mcpResponse(body, headers = {}) {
  return Response.json(body, { headers: { 'content-type': 'application/json', ...headers } })
}

function createWorld() {
  const world = {
    registrations: [],
    tokenRequests: [],
    authorizeUrls: [],
    mcpCalls: [],
    mcpAuthHeaders: [],
    sessionCounter: 0,
  }

  world.fetch = async (url, init = {}) => {
    const u = String(url)
    if (u === PRM_URL) return Response.json(PRM)
    if (u === AS_URL) return Response.json(AS)
    if (u.endsWith('/register')) {
      world.registrations.push(JSON.parse(init.body))
      return Response.json({ client_id: 'g-test-client', token_endpoint_auth_method: 'none' }, { status: 201 })
    }
    if (u.endsWith('/token')) {
      const params = new URLSearchParams(String(init.body || ''))
      world.tokenRequests.push(Object.fromEntries(params.entries()))
      const refresh = params.get('grant_type') === 'refresh_token'
      return Response.json({
        access_token: refresh ? 'at-refreshed' : 'at-code',
        refresh_token: refresh ? 'rt-refreshed' : 'rt-code',
        expires_in: 3600,
        scope: 'profile:read design:meta:read',
        token_type: 'bearer',
      })
    }
    if (u === MCP_URL) {
      const payload = JSON.parse(init.body)
      world.mcpCalls.push(payload.method)
      world.mcpAuthHeaders.push(init.headers.authorization)
      if (payload.method === 'initialize') {
        world.sessionCounter += 1
        return mcpResponse(
          { jsonrpc: '2.0', id: payload.id, result: { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'canva' } } },
          { 'mcp-session-id': `sess-${world.sessionCounter}` },
        )
      }
      if (payload.method === 'notifications/initialized') return new Response('', { status: 202 })
      if (payload.method === 'tools/list') {
        return mcpResponse({
          jsonrpc: '2.0',
          id: payload.id,
          result: {
            tools: [
              {
                name: 'get-design',
                description: 'Get a Canva design',
                inputSchema: { type: 'object', properties: { design_id: { type: 'string', description: 'design id' } }, required: ['design_id'] },
              },
              { name: 'create-design', description: 'Create a Canva design', inputSchema: { type: 'object', properties: {} } },
            ],
          },
        })
      }
      if (payload.method === 'tools/call') {
        return mcpResponse({
          jsonrpc: '2.0',
          id: payload.id,
          result: { content: [{ type: 'text', text: JSON.stringify(payload.params) }], isError: false },
        })
      }
      return Response.json({ jsonrpc: '2.0', id: payload.id, error: { code: -32601, message: 'method not found' } })
    }
    throw new Error(`unexpected url ${u}`)
  }
  return world
}

async function harness() {
  const dir = await mkdtemp(path.join(tmpdir(), 'canva-'))
  const credentials = memoryCredentials()
  const world = createWorld()
  const service = createDesignConnectors({
    credentials,
    settingsPath: path.join(dir, 'canva.json'),
    fetchImpl: world.fetch,
    getCallbackUri: () => CALLBACK,
  })
  return { dir, service, credentials, world }
}

async function authorize(service) {
  const started = await service.canvaAuthorizeStart()
  const state = new URL(started.authorizeUrl).searchParams.get('state')
  return { started, state }
}

test('status starts unauthenticated and discovery is not required', async () => {
  const { dir, service, world } = await harness()
  try {
    const status = await service.status()
    const [row] = status.providers
    assert.equal(row.id, 'canvas')
    assert.equal(row.enabled, false)
    assert.equal(row.oauth.authorized, false)
    assert.equal(world.registrations.length, 0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('one-click authorization registers a public client dynamically and builds a PKCE URL', async () => {
  const { dir, service, world } = await harness()
  try {
    const { started, state } = await authorize(service)
    assert.equal(world.registrations.length, 1)
    const registration = world.registrations[0]
    assert.deepEqual(registration.redirect_uris, [CALLBACK])
    assert.equal(registration.token_endpoint_auth_method, 'none')
    assert.deepEqual(registration.grant_types, ['authorization_code', 'refresh_token'])

    const url = new URL(started.authorizeUrl)
    assert.equal(url.origin + url.pathname, 'https://mcp.canva.com/authorize')
    assert.equal(url.searchParams.get('response_type'), 'code')
    assert.equal(url.searchParams.get('client_id'), 'g-test-client')
    assert.equal(url.searchParams.get('redirect_uri'), CALLBACK)
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
    assert.equal(url.searchParams.get('resource'), 'https://mcp.canva.com')
    assert.equal(url.searchParams.get('scope'), PRM.scopes_supported.join(' '))
    assert.ok((state || '').length >= 20)
    assert.equal(started.opened, false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('callback caches tokens, connects MCP and calls tools', async () => {
  const { dir, service, world } = await harness()
  try {
    const { state } = await authorize(service)
    const completed = await service.completeCanvaAuthorization({ code: 'auth-code', state })
    assert.equal(completed.ok, true)
    assert.equal(completed.tools, 2)

    const tokenRequest = world.tokenRequests.find((request) => request.grant_type === 'authorization_code')
    assert.equal(tokenRequest.client_id, 'g-test-client')
    assert.equal(tokenRequest.redirect_uri, CALLBACK)
    assert.ok(tokenRequest.code_verifier)

    const status = await service.status()
    const [row] = status.providers
    assert.equal(row.oauth.authorized, true)
    assert.deepEqual(row.toolNames, ['get-design', 'create-design'])

    const result = await service.callTool('get-design', { design_id: 'D123' })
    assert.equal(result.tool, 'get-design')
    assert.equal(result.content[0].type, 'text')
    assert.match(result.content[0].text, /D123/)

    const settingsText = await readFile(path.join(dir, 'canva.json'), 'utf8')
    assert.equal(settingsText.includes('at-code'), false)
    assert.equal(settingsText.includes('rt-code'), false)
    assert.equal(world.mcpAuthHeaders.every((header) => header === 'Bearer at-code'), true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('an expired token is refreshed before the next MCP call', async () => {
  const { dir, service, world, credentials } = await harness()
  try {
    const { state } = await authorize(service)
    await service.completeCanvaAuthorization({ code: 'auth-code', state })
    await credentials.modifyRecord('canva/canva-oauth', async (current) => ({
      ...current,
      payload: { ...current.payload, accessToken: 'stale', expiresAt: Date.now() - 1000, refreshToken: 'rt-code' },
    }))
    const listed = await service.listTools(true)
    assert.equal(listed.count, 2)
    const refreshRequest = world.tokenRequests.find((request) => request.grant_type === 'refresh_token')
    assert.ok(refreshRequest)
    assert.equal(refreshRequest.refresh_token, 'rt-code')
    assert.equal(world.mcpAuthHeaders.includes('Bearer at-refreshed'), true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('invalid callback state is rejected and revoke clears the authorization', async () => {
  const { dir, service } = await harness()
  try {
    const rejected = await service.completeCanvaAuthorization({ code: 'x', state: 'forged' })
    assert.equal(rejected.ok, false)
    assert.match(rejected.message, /授权/)

    const { state } = await authorize(service)
    await service.completeCanvaAuthorization({ code: 'auth-code', state })
    assert.equal((await service.status()).providers[0].oauth.authorized, true)
    await service.canvaRevoke()
    const status = await service.status()
    assert.equal(status.providers[0].oauth.authorized, false)
    assert.equal(status.providers[0].tools, 0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('dispatch exposes status, tools, test and call actions', async () => {
  const { dir, service } = await harness()
  try {
    const status = await service.dispatch({ action: 'status' })
    assert.equal(status.providers.length, 1)
    await assert.rejects(() => service.dispatch({ action: 'call', tool: 'x', arguments: 'not json' }), /arguments/)
    await assert.rejects(() => service.dispatch({ action: 'nope' }), /action/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
