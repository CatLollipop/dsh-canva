window.__ModuleLoader__.load({
  id: 'dsh-canva',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'canva'
    const CSS = `
.oc-page { box-sizing: border-box; max-width: 680px; margin: 0 auto; padding: 8px 4px 24px; color: var(--dsw-alias-label-primary); font: inherit; }
.oc-page * { box-sizing: border-box; }
.oc-head h1 { margin: 0 0 8px; font-size: 20px; font-weight: 600; line-height: 1.3; }
.oc-head p, .oc-help, .oc-hint, .oc-muted { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 1.5; }
.oc-head p + p { margin-top: 4px; }
.oc-card { margin-top: 16px; background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 16px; }
.oc-card-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
.oc-card h2 { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: 0.1px; }
.oc-card-head .oc-muted { margin-top: 4px; }
.oc-switch-row { display: flex; align-items: center; gap: 10px; flex: none; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.oc-switch { width: 42px; height: 24px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); padding: 0; position: relative; cursor: pointer; transition: background-color .16s ease, border-color .16s ease; }
.oc-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.oc-thumb { position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: var(--dsw-alias-bg-base); box-shadow: 0 1px 2px rgba(0,0,0,.18); transition: left .16s ease; }
.oc-switch[aria-checked="true"] .oc-thumb { left: 20px; }
.oc-switch:disabled { cursor: default; opacity: .6; }
.oc-hero { display: flex; gap: 12px; align-items: flex-start; padding: 14px 16px; border-radius: 12px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); }
.oc-dot { flex: none; width: 9px; height: 9px; margin-top: 5px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); }
.oc-dot[data-tone="on"] { background: var(--dsw-alias-state-success-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-success-primary) 18%, transparent); }
.oc-dot[data-tone="wait"] { background: var(--dsw-alias-state-warn-primary); animation: oc-pulse 1.4s ease-in-out infinite; }
@keyframes oc-pulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
.oc-hero-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.oc-hero-title { font-size: 14px; font-weight: 600; line-height: 1.4; }
.oc-hero-sub { font-size: 12.5px; line-height: 1.55; color: var(--dsw-alias-label-secondary); }
.oc-hintbox { padding: 12px 14px; border-radius: 10px; border: 1px dashed var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); font-size: 12.5px; line-height: 1.65; color: var(--dsw-alias-label-secondary); }
.oc-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; }
.oc-link { padding: 0; border: 0; background: none; color: var(--dsw-alias-brand-primary); font: inherit; font-size: 12.5px; cursor: pointer; }
.oc-link:disabled { cursor: default; opacity: .55; }
.oc-secondary { min-height: 32px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; cursor: pointer; }
.oc-secondary:disabled { cursor: default; opacity: .6; }
.oc-ok { margin: 0; color: var(--dsw-alias-state-success-primary); font-size: 12.5px; }
.oc-error, .oc-note { margin: 0; color: var(--dsw-alias-state-error-primary); font-size: 12.5px; line-height: 1.5; }
.oc-tools { display: flex; flex-wrap: wrap; gap: 6px; }
.oc-chip { padding: 2px 9px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); font-size: 11.5px; line-height: 18px; }
.oc-page :focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
`
    const zh = {
      title: 'Canva',
      intro: '打开右侧开关即可连接 Canva：自动注册客户端、打开 Canva 登录/授权页，同意后令牌与工具自动就绪。',
      privacy: '授权令牌只写入本机凭证库，不显示在页面、设置文件或对话里。',
      usage: '连接后模型可以直接调用 canva_* 工具，或使用内置 Canva 技能（改尺寸、批量创建、改稿、反馈、品牌检查等）。',
      summary: '打开开关即可一键连接 Canva。',
      loading: '正在读取配置…',
      loadFailed: 'Canva 加载失败：',
      unavailable: '无法连接宿主，请刷新页面后重试。',
      enable: '启用',
      name: 'Canva',
      sub: 'Canva 官方 MCP 服务 · 无需填写任何应用凭证',
      on: '已连接',
      off: '未连接',
      waiting: '等待 Canva 授权…',
      offSub: '打开右侧开关后，会自动打开 Canva 登录/授权页，完成登录并同意即可，不需要再点别的按钮。',
      waitSub: '已打开 Canva 登录页，请在侧边栏「Agent 浏览器」里登录并同意；完成后这里会自动变成已连接。',
      onSub: 'Canva 工具已就绪，模型可以直接调用 canva_* 工具。',
      expiresAt: '令牌有效期至',
      toolsUnit: '个工具',
      skillsHint: '同时启用的 Canva 技能：改尺寸、批量创建、编辑设计、设计反馈、落实反馈、品牌检查、品牌演示、翻译设计。',
      retest: '重新检测',
      clear: '清除授权',
      working: '正在处理…',
      connected: '连接成功。',
      failed: '操作失败。',
      authorizeOpened: '已打开 Canva 登录/授权页，完成登录并同意后会自动连接。',
      authorizeManual: '请在浏览器里打开授权链接，完成登录并同意后会自动连接。',
      authSuccess: 'Canva 已连接，工具已就绪。',
      revoked: '已清除 Canva 授权。',
      offNote: '已断开。授权仍保留，重新打开开关即可再次使用。',
      clearNote: '清除后需要重新走一次授权流程。',
    }
    const en = {
      title: 'Canva',
      intro: 'Turn the switch on to connect Canva: the plugin registers its client, opens Canva’s login/consent page, and the tokens and tools are ready once approved.',
      privacy: 'Tokens stay in the local credential store; they never appear in the page, the settings file, or the chat.',
      usage: 'Once connected the model can call canva_* tools directly, or use the bundled Canva skills (resize, bulk create, edit, feedback, brand check and more).',
      summary: 'Turn the switch on to connect Canva.',
      loading: 'Loading configuration…',
      loadFailed: 'Canva failed to load: ',
      unavailable: 'Cannot reach the host. Refresh the page and try again.',
      enable: 'Enable',
      name: 'Canva',
      sub: 'Canva official MCP server · no app credentials to fill in',
      on: 'Connected',
      off: 'Not connected',
      waiting: 'Waiting for Canva authorization…',
      offSub: 'Turn the switch on and Canva’s login/consent page opens automatically. Sign in, approve, and this card connects itself — no other button needed.',
      waitSub: 'The Canva login page is open in the side-panel Agent Browser. Sign in and approve; this card connects automatically.',
      onSub: 'Canva tools are ready; the model can call canva_* tools directly.',
      expiresAt: 'Token expires',
      toolsUnit: 'tools',
      skillsHint: 'Bundled Canva skills: resize for social media, bulk create, edit designs, design feedback, implement feedback, brand check, branded presentation, translate design.',
      retest: 'Re-check',
      clear: 'Clear authorization',
      working: 'Working…',
      connected: 'Connected.',
      failed: 'Something went wrong.',
      authorizeOpened: 'Opened the Canva login/consent page; the card connects automatically after approval.',
      authorizeManual: 'Approve the authorization link in a browser; the card connects automatically.',
      authSuccess: 'Canva connected; tools are ready.',
      revoked: 'Canva authorization cleared.',
      offNote: 'Disconnected. The authorization is kept — turn the switch back on to use it again.',
      clearNote: 'Clearing means running the authorization flow again next time.',
    }
    let currentCtx = null
    let mountedPinged = false

    function translate(key) {
      const locale = currentCtx?.locale
      const bound = typeof locale?.bind === 'function' ? locale.bind(NS) : null
      if (typeof bound === 'function') {
        const value = bound(key)
        if (value && value !== key) return value
      }
      const active = locale?.getLocale?.()?.active || locale?.getSnapshot?.()?.active || ''
      const dict = String(active).toLowerCase().startsWith('zh') ? zh : en
      return dict[key] || zh[key] || key
    }

    /**
     * Cordis throws when an un-injected service is read as a property, so the
     * optional `connection` service is only ever read through ctx.get().
     */
    function connectionOf(ctx) {
      try {
        return ctx?.get?.('connection')
      } catch {
        return undefined
      }
    }

    function reportClientDiagnostic(payload) {
      try {
        const connection = connectionOf(currentCtx)
        if (!connection?.rpc?.call) return
        connection.rpc.call('/api', 'canva', {
          method: 'reportClientError',
          payload: { ...payload, href: String(globalThis.location?.hash || globalThis.location?.href || '') },
        }).catch(() => {})
      } catch {}
    }

    async function callHost(method, payload, signal) {
      const connection = connectionOf(currentCtx)
      if (!connection?.rpc?.call) throw new Error(translate('unavailable'))
      const result = await connection.rpc.call('/api', 'canva', { method, payload: payload ?? {} }, signal)
      if (result?.ok === true && Object.hasOwn(result, 'value')) return result.value
      if (result?.ok === false) {
        const error = new Error(result.error?.message || translate('failed'))
        error.code = result.error?.code
        throw error
      }
      return result
    }

    function formatTime(value) {
      if (!value) return ''
      try {
        return new Date(value).toLocaleString()
      } catch {
        return ''
      }
    }

    function OpenCanvasPage() {
      try {
        return renderPage()
      } catch (error) {
        const message = error?.message || String(error)
        reportClientDiagnostic({ message: `[render-crash] ${message}`, stack: String(error?.stack || '') })
        try { console.error('canva: settings page render failed', error) } catch {}
        return h('div', { className: 'oc-page' },
          h('style', null, CSS),
          h('p', { className: 'oc-error', role: 'alert' }, `Canva 渲染失败：${message}`))
      }
    }

    function renderPage() {
      const [provider, setProvider] = React.useState(null)
      const [pending, setPending] = React.useState('')
      const [note, setNote] = React.useState('')
      const [noteOk, setNoteOk] = React.useState(false)
      const [loadError, setLoadError] = React.useState('')
      const [polling, setPolling] = React.useState(false)
      const [localeTick, setLocaleTick] = React.useState(0)
      void localeTick

      async function loadStatus(signal) {
        const value = await callHost('status', {}, signal)
        const row = Array.isArray(value?.providers) ? value.providers[0] : null
        setProvider(row || null)
        return row
      }

      React.useEffect(() => {
        if (mountedPinged) return
        mountedPinged = true
        reportClientDiagnostic({ message: '[mounted] canva settings page rendered' })
      }, [])

      React.useEffect(() => {
        const locale = currentCtx?.locale
        if (typeof locale?.subscribe !== 'function') return undefined
        return locale.subscribe(() => setLocaleTick((value) => value + 1))
      }, [])

      React.useEffect(() => {
        const controller = new AbortController()
        loadStatus(controller.signal).catch((error) => {
          if (controller.signal.aborted) return
          setLoadError(error?.message || translate('loadFailed'))
        })
        return () => controller.abort()
      }, [])

      React.useEffect(() => {
        if (!polling) return undefined
        const timer = setInterval(() => {
          loadStatus().then((row) => {
            if (row?.oauth?.authorized) {
              setPolling(false)
              setNote(translate('authSuccess'))
              setNoteOk(true)
            }
          }).catch(() => {})
        }, 2000)
        const stop = setTimeout(() => setPolling(false), 180000)
        return () => {
          clearInterval(timer)
          clearTimeout(stop)
        }
      }, [polling])

      async function run(key, task) {
        setPending(key)
        setNote('')
        setNoteOk(false)
        try {
          const message = await task()
          await loadStatus()
          if (message) {
            setNote(message)
            setNoteOk(true)
          }
        } catch (error) {
          setNote(error?.message || translate('failed'))
          setNoteOk(false)
        } finally {
          setPending('')
        }
      }

      const t = translate
      const connected = connectionOf(currentCtx)
      const oauth = provider?.oauth || {}
      const authorized = oauth.authorized === true
      const busy = pending !== ''
      const waiting = polling && !authorized
      const toolCount = provider?.tools || 0

      /** The switch is the only authorization entry point: on = enable (+ authorize when needed). */
      async function toggle() {
        if (!provider || busy || waiting) return
        const next = !provider.enabled
        if (!next) {
          await run('toggle', async () => {
            await callHost('setEnabled', { enabled: false })
            return t('offNote')
          })
          return
        }
        if (authorized) {
          await run('toggle', async () => {
            await callHost('setEnabled', { enabled: true })
            return ''
          })
          return
        }
        await run('authorize', async () => {
          const result = await callHost('canvaAuthorizeStart', {})
          if (!result?.opened && result?.authorizeUrl) {
            try { globalThis.open?.(result.authorizeUrl, '_blank', 'noopener') } catch {}
          }
          setPolling(true)
          return result?.opened ? t('authorizeOpened') : t('authorizeManual')
        })
      }

      function renderHero() {
        const tone = waiting ? 'wait' : authorized ? 'on' : 'idle'
        const title = waiting ? t('waiting') : authorized ? t('on') : t('off')
        const subParts = []
        if (waiting) subParts.push(t('waitSub'))
        else if (authorized) {
          const when = formatTime(oauth.expiresAt)
          if (when) subParts.push(`${t('expiresAt')} ${when}`)
          if (toolCount) subParts.push(`${toolCount} ${t('toolsUnit')}`)
          subParts.push(t('onSub'))
        } else {
          subParts.push(t('offSub'))
        }
        return h('div', { className: 'oc-hero' },
          h('span', { className: 'oc-dot', 'data-tone': tone }),
          h('div', { className: 'oc-hero-body' },
            h('span', { className: 'oc-hero-title' }, title),
            h('span', { className: 'oc-hero-sub' }, subParts.join(' · '))))
      }

      function renderTools() {
        if (!authorized || !Array.isArray(provider.toolNames) || provider.toolNames.length === 0) return null
        return h('div', { className: 'oc-tools' },
          ...provider.toolNames.slice(0, 16).map((name) => h('span', { key: name, className: 'oc-chip' }, String(name))))
      }

      function renderActions() {
        if (!authorized) return null
        const buttons = []
        buttons.push(h('button', {
          key: 'retest',
          type: 'button',
          className: 'oc-secondary',
          disabled: busy,
          onClick: () => run('test', async () => {
            const result = await callHost('test', {})
            return result?.message || t('connected')
          }),
        }, pending === 'test' ? t('working') : t('retest')))
        buttons.push(h('button', {
          key: 'clear',
          type: 'button',
          className: 'oc-link',
          disabled: busy,
          title: t('clearNote'),
          onClick: () => run('revoke', async () => {
            await callHost('canvaRevoke', {})
            return t('revoked')
          }),
        }, pending === 'revoke' ? t('working') : t('clear')))
        return h('div', { className: 'oc-actions' }, ...buttons)
      }

      function buildCard() {
        const children = []
        children.push(h('div', { key: 'head', className: 'oc-card-head' },
          h('div', null,
            h('h2', { id: 'oc-title' }, t('name')),
            h('p', { className: 'oc-muted' }, t('sub'))),
          h('div', { className: 'oc-switch-row' },
            h('span', null, t('enable')),
            h('button', {
              type: 'button',
              className: 'oc-switch',
              role: 'switch',
              'aria-checked': provider.enabled ? 'true' : 'false',
              'aria-busy': busy || waiting ? 'true' : 'false',
              'aria-label': `${t('name')} ${t('enable')}`,
              disabled: busy || waiting,
              onClick: toggle,
            }, h('span', { className: 'oc-thumb' })))))
        children.push(renderHero())
        if (!authorized && !waiting) children.push(h('div', { key: 'hint', className: 'oc-hintbox' }, t('offSub')))
        children.push(h('p', { key: 'skills', className: 'oc-help' }, t('skillsHint')))
        const tools = renderTools()
        if (tools) children.push(tools)
        const actions = renderActions()
        if (actions) children.push(actions)
        if (note) children.push(h('p', { key: 'note', className: noteOk ? 'oc-ok' : 'oc-note', role: 'status', 'aria-live': 'polite' }, note))
        return h('section', { className: 'oc-card', 'aria-labelledby': 'oc-title' }, ...children)
      }

      return h('div', { className: 'oc-page' },
        h('style', null, CSS),
        h('header', { className: 'oc-head' },
          h('h1', null, t('title')),
          h('p', null, t('intro')),
          h('p', null, t('privacy')),
          h('p', null, t('usage'))),
        !connected ? h('p', { className: 'oc-error', role: 'alert' }, t('unavailable')) : null,
        loadError ? h('p', { className: 'oc-error', role: 'alert' }, loadError) : null,
        !provider && !loadError ? h('p', { className: 'oc-muted' }, t('loading')) : null,
        provider ? buildCard() : null)
    }

    function SummaryLine() {
      return h('span', null, translate('summary'))
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        currentCtx = ctx
        if (typeof ctx.locale?.register === 'function') {
          ctx.effect(() => ctx.locale.register(NS, { zh, en }))
        }
        ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'canva',
          order: 30,
          label: () => translate('title'),
        }, OpenCanvasPage)))
        // The bundle row in Settings → Plugins also opens this page, like a
        // first-party bundle's own configuration view.
        ctx.effect(() => ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
          name: 'plugins.row.config',
          key: 'dsh-canva#canva',
        }, (props) => props?.view === 'summary' ? h(SummaryLine, null) : h(OpenCanvasPage, null))))
      },
    }
  },
})
