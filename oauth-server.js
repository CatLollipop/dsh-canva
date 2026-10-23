import http from 'node:http'

export const CANVA_CALLBACK_PATH = '/canva/oauth/callback'

/** Preferred loopback ports; the first free one hosts the OAuth callback. */
const PREFERRED_PORTS = [47653, 47654, 47655, 47656, 47657]

function renderPage(result) {
  const ok = result?.ok === true
  const title = ok ? 'Canva 授权成功' : 'Canva 授权失败'
  const detail = String(result?.message || (ok ? '令牌已缓存，可以回到 DSH。' : '请回到设置页重试。')).slice(0, 500)
  const accent = ok ? '#2f8f86' : '#c0392b'
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#101314;color:#e8ecec;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.card{max-width:420px;padding:28px 32px;border:1px solid #2a3234;border-radius:14px;background:#171c1d}
h1{margin:0 0 10px;font-size:18px;color:${accent}}p{margin:0;color:#a9b4b5}code{word-break:break-all}
button{margin-top:20px;padding:8px 16px;border-radius:8px;border:1px solid #2f8f86;background:transparent;color:#2f8f86;font:inherit;cursor:pointer}</style></head>
<body><div class="card"><h1>${title}</h1><p>${detail.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</p>
<button type="button" onclick="window.close()">关闭此页</button></div></body></html>`
}

/**
 * Loopback listener for Canva's OAuth redirect. It is a plain localhost server
 * (not the DSH web route) so the redirect lands on a stable address that can be
 * registered once in the Canva developer app.
 */
export function startCanvaCallbackServer({ onAuthorized }) {
  let server = null
  let uri = ''
  let disposed = false

  function listen(port) {
    return new Promise((resolve) => {
      const candidate = http.createServer((request, response) => {
        void handle(request, response)
      })
      const onError = () => {
        candidate.removeListener('listening', onListening)
        resolve(null)
      }
      const onListening = () => {
        candidate.removeListener('error', onError)
        resolve(candidate)
      }
      candidate.once('error', onError)
      candidate.once('listening', onListening)
      candidate.listen(port, '127.0.0.1')
    })
  }

  async function handle(request, response) {
    const finish = (status, body, type = 'text/plain; charset=utf-8') => {
      try {
        response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' })
        response.end(body)
      } catch {}
    }
    if (disposed) return finish(503, 'shutting down')
    let url
    try {
      url = new URL(request.url || '/', 'http://127.0.0.1')
    } catch {
      return finish(400, 'bad request')
    }
    if (url.pathname !== CANVA_CALLBACK_PATH) return finish(404, 'not found')
    if (request.method !== 'GET') return finish(405, 'method not allowed')
    const params = Object.fromEntries(url.searchParams.entries())
    let result
    try {
      result = await onAuthorized(params)
    } catch (error) {
      result = { ok: false, message: error?.message || '授权失败。' }
    }
    return finish(200, renderPage(result), 'text/html; charset=utf-8')
  }

  const ready = (async () => {
    for (const port of PREFERRED_PORTS) {
      if (disposed) return ''
      const candidate = await listen(port)
      if (!candidate) continue
      server = candidate
      uri = `http://127.0.0.1:${port}${CANVA_CALLBACK_PATH}`
      return uri
    }
    return ''
  })()

  return {
    ready,
    get uri() {
      return uri
    },
    async close() {
      disposed = true
      if (!server) return
      const current = server
      server = null
      await new Promise((resolve) => {
        current.close(() => resolve())
        current.closeAllConnections?.()
      })
    },
  }
}
