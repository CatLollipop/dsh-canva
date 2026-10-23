export const RPC_ENDPOINT = 'canva'

const USER_METHODS = new Set([
  'status',
  'setEnabled',
  'test',
  'listTools',
  'callTool',
  'canvaAuthorizeStart',
  'canvaAuthorizeStatus',
  'canvaRevoke',
  'reportClientError',
])

export function registerOpenCanvasRoute(ctx, service) {
  if (typeof ctx.connection?.fetch?.register !== 'function') {
    throw new Error('Host Connection Fetch 注册表不可用。')
  }
  return ctx.connection.fetch.register({
    path: `/api/${RPC_ENDPOINT}`,
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      if (request.method !== 'POST') return new Response('method not allowed', { status: 405 })
      const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
      if (contentType !== 'application/json') return new Response('content type must be application/json', { status: 415 })
      const contentLength = Number(request.headers.get('content-length') || 0)
      if (contentLength > 65536) return new Response('payload too large', { status: 413 })
      let message
      try {
        message = await request.json()
      } catch {
        return new Response('body is not JSON', { status: 400 })
      }
      const rpcId = typeof message?.rpcId === 'string' ? message.rpcId : 'invalid-request'
      const call = message?.payload
      if (!isRecord(message) || message.type !== 'client-request' || typeof message.rpcId !== 'string'
        || message.method !== RPC_ENDPOINT || !isRecord(call) || typeof call.method !== 'string'
        || !Object.hasOwn(call, 'payload')) {
        return reply(rpcId, fail('canva/bad-request', '请求格式不正确。'))
      }
      try {
        return reply(rpcId, await handleOpenCanvasCall(service, call.method, call.payload, request.signal))
      } catch (error) {
        return reply(rpcId, fail('canva/failed', error?.name === 'AbortError' ? '请求已取消或超时。' : (error?.message || '操作失败。')))
      }
    },
  })
}

export async function handleOpenCanvasCall(service, method, payload, signal) {
  if (!USER_METHODS.has(method)) return fail('canva/unknown-method', '没有这个操作。')
  const input = isRecord(payload) ? payload : {}
  if (method === 'status') return ok(await service.status())
  if (method === 'setEnabled') return ok(await service.setEnabled(input.enabled === true))
  if (method === 'test') return ok(await service.test())
  if (method === 'listTools') return ok(await service.listTools(input.force !== false))
  if (method === 'callTool') return ok(await service.callTool(input.tool, input.arguments || {}))
  if (method === 'canvaAuthorizeStart') return ok(await service.canvaAuthorizeStart())
  if (method === 'canvaAuthorizeStatus') return ok(await service.canvaAuthorizeStatus())
  if (method === 'canvaRevoke') return ok(await service.canvaRevoke())
  return ok(await service.reportClientError(input))
}

function ok(value) {
  return { ok: true, value }
}

function fail(code, message) {
  return { ok: false, error: { code, message, details: {} } }
}

function reply(rpcId, result) {
  const value = result.ok === false
    ? { ...result, error: { ...result.error, details: result.error.details ?? {} } }
    : result
  return Response.json({ type: 'server-response', rpcId, result: value })
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
