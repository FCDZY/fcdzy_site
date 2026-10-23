/**
 * 全局回到顶部按钮检查：300px 阈值、平滑滚动、主题适配、前台/后台均生效。
 * 用法：node scripts/smoke-backtop.cjs
 * 可选：SMOKE_SHOT=<路径前缀> 输出浅色/深色截图
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5173'
const API = process.env.SMOKE_API || 'http://127.0.0.1:8080'
const DEBUG_PORT = 9666
const VIEW = { width: 1440, height: 900 }

const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
].filter(Boolean)
const chrome = chromeCandidates.find((p) => fs.existsSync(p))
if (!chrome) {
  console.error('未找到 Chrome/Edge，可通过环境变量 CHROME_PATH 指定')
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForDevtools() {
  for (let i = 0; i < 60; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json()
      const page = targets.find((t) => t.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch {
      /* 等待 */
    }
    await sleep(500)
  }
  throw new Error('DevTools 端口未就绪')
}

let failures = 0
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '[OK]  ' : '[MISS]'} ${label}${detail ? `  → ${detail}` : ''}`)
  if (!ok) failures++
}

const PROBE = `(() => {
  const btn = document.querySelector('.back-to-top')
  const cs = btn ? getComputedStyle(btn) : null
  const r = btn ? btn.getBoundingClientRect() : null
  return JSON.stringify({
    exists: !!btn,
    display: cs ? cs.display : '',
    opacity: cs ? cs.opacity : '',
    position: cs ? cs.position : '',
    right: cs ? cs.right : '',
    bottom: cs ? cs.bottom : '',
    zIndex: cs ? cs.zIndex : '',
    bg: cs ? cs.backgroundColor : '',
    border: cs ? cs.borderColor : '',
    color: cs ? cs.color : '',
    boxShadow: cs ? cs.boxShadow.slice(0, 40) : '',
    text: btn ? (btn.getAttribute('aria-label') || '') : '',
    rect: r ? { x: Math.round(r.right), y: Math.round(r.bottom) } : null,
    scrollY: Math.round(window.scrollY || document.documentElement.scrollTop || 0),
    docHeight: document.documentElement.scrollHeight,
    viewH: window.innerHeight,
    isDark: document.documentElement.classList.contains('dark'),
    center: r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null,
    /** 文档坐标：CDP 的 clip 用文档坐标，截图时必须用它 */
    centerPage: r
      ? {
          x: Math.round(r.left + r.width / 2),
          y: Math.round(r.top + r.height / 2 + (window.scrollY || document.documentElement.scrollTop || 0))
        }
      : null
  })
})()`

;(async () => {
  const profile = path.join(os.tmpdir(), 'dsh-smoke-backtop-profile')
  const proc = spawn(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-extensions',
      '--hide-scrollbars',
      `--window-size=${VIEW.width},${VIEW.height}`,
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${DEBUG_PORT}`,
      'about:blank'
    ],
    { stdio: 'ignore' }
  )

  try {
    const ws = new WebSocket(await waitForDevtools())
    await new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = reject
    })

    let msgId = 0
    const pending = new Map()
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg)
        pending.delete(msg.id)
      }
    }
    const send = (method, params = {}) =>
      new Promise((resolve) => {
        const id = ++msgId
        pending.set(id, resolve)
        ws.send(JSON.stringify({ id, method, params }))
      })

    await send('Page.enable')
    await send('Runtime.enable')

    const evaluate = async (expression) => {
      const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (res.result?.exceptionDetails) {
        throw new Error(res.result.exceptionDetails.exception?.description || 'evaluate failed')
      }
      return res.result?.result?.value
    }
    const probe = async () => JSON.parse(await evaluate(PROBE))
    const click = async (x, y) => {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 })
    }
    const scrollTo = async (y) => {
      await evaluate(`window.scrollTo({ top: ${y}, behavior: 'auto' })`)
      await sleep(400)
      return probe()
    }
    const shoot = async (file, clip) => {
      const params = clip
        ? { format: 'png', clip: { ...clip, scale: 1 }, captureBeyondViewport: true }
        : { format: 'png' }
      const res = await send('Page.captureScreenshot', params)
      if (res.result?.data) fs.writeFileSync(file, Buffer.from(res.result.data, 'base64'))
    }
    const goto = async (url, ready) => {
      await send('Page.navigate', { url })
      for (let i = 0; i < 40; i++) {
        await sleep(300)
        if (await evaluate(ready).catch(() => false)) {
          await sleep(700)
          return
        }
      }
    }

    const homeReady = "!!document.querySelector('.hot-card') || !!document.querySelector('.article-card')"
    const shotPrefix = process.env.SMOKE_SHOT

    // 确保从浅色开始
    await goto(`${BASE}/`, "!!document.querySelector('#app')")
    await evaluate("localStorage.removeItem('fcdzy_theme'); document.documentElement.classList.remove('dark')")
    await goto(`${BASE}/`, homeReady)

    const top = await probe()
    console.log(`前台首页（${BASE}/），文档高 ${top.docHeight}px / 视口 ${top.viewH}px\n`)

    console.log('【需求 1】滚动超过 300px 才显示')
    check('按钮已挂载', top.exists)
    check('初始状态不显示', top.display === 'none', top.display)
    check('固定在右下角', top.position === 'fixed', `right=${top.right} bottom=${top.bottom}`)

    const at250 = await scrollTo(250)
    check('滚动 250px 时仍隐藏', at250.display === 'none', `scrollY=${at250.scrollY}, display=${at250.display}`)

    const at350 = await scrollTo(350)
    check('滚动 350px 后显示', at350.display !== 'none', `scrollY=${at350.scrollY}, display=${at350.display}`)
    await sleep(400)
    const shown = await probe()
    check('淡入完成后不透明', Number(shown.opacity) > 0.9, `opacity=${shown.opacity}`)
    check('位于视口右下角', shown.rect && shown.rect.x > VIEW.width - 100, `right 边缘 x=${shown.rect?.x}`)
    check('层级高于内容', Number(shown.zIndex) >= 100, `z-index=${shown.zIndex}`)
    check('有无障碍标签', shown.text.includes('回到顶部'), shown.text)
    if (shotPrefix && shown.centerPage) {
      await shoot(`${shotPrefix}-backtop-light.png`, {
        x: shown.centerPage.x - 60,
        y: shown.centerPage.y - 70,
        width: 120,
        height: 140
      })
    }

    console.log('\n【需求 2】点击平滑滚回顶部')
    const reduceMotion = await evaluate("window.matchMedia('(prefers-reduced-motion: reduce)').matches")
    const startY = shown.scrollY
    await click(shown.center.x, shown.center.y)
    let intermediates = []
    let landed = false
    for (let i = 0; i < 50; i++) {
      await sleep(60)
      const y = await evaluate('Math.round(window.scrollY)')
      if (y > 0 && y < startY) intermediates.push(y)
      if (y === 0) {
        landed = true
        break
      }
    }
    check('最终回到顶部', landed, `scrollY=${await evaluate('Math.round(window.scrollY)')}`)
    if (reduceMotion) {
      console.log('  (系统开启了「减少动态效果」，此处直接跳转)')
    } else {
      check('滚动过程是平滑的（有中间位置）', intermediates.length > 0, `采到 ${intermediates.length} 个中间值，例如 ${intermediates.slice(0, 4).join(', ')}`)
    }
    const backTop = await probe()
    await sleep(600)
    const hidden = await probe()
    check('回到顶部后按钮自动隐藏', hidden.display === 'none', `display=${hidden.display}`)

    console.log('\n【需求 3】适配深浅色模式')
    // 先把鼠标移开，避免 hover 态影响取色
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 10, y: 10, button: 'none', buttons: 0 })
    const light = await scrollTo(400)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 10, y: 10, button: 'none', buttons: 0 })
    await sleep(300)
    const lightIdle = await probe()
    check('浅色下为白色面板', lightIdle.bg === 'rgb(255, 255, 255)', lightIdle.bg)
    check('浅色下描边跟随主题', lightIdle.border === 'rgb(229, 231, 235)', lightIdle.border)
    check('浅色下图标为深色', lightIdle.color === 'rgb(75, 85, 99)', lightIdle.color)

    // 首页导航栏在 Hero 内部会随页面滚走，先回到顶部再点主题按钮
    await scrollTo(0)
    const toggle = JSON.parse(await evaluate(`(() => {
      const el = document.querySelector('.theme-toggle')
      const r = el ? el.getBoundingClientRect() : null
      return JSON.stringify(r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null)
    })()`))
    if (toggle) {
      await click(toggle.x, toggle.y)
      await sleep(700)
    }
    await scrollTo(400)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 10, y: 10, button: 'none', buttons: 0 })
    await sleep(300)
    const dark = await probe()
    if (shotPrefix && dark.centerPage) {
      await shoot(`${shotPrefix}-backtop-dark.png`, {
        x: dark.centerPage.x - 60,
        y: dark.centerPage.y - 70,
        width: 120,
        height: 140
      })
    }
    check('深色模式已生效', dark.isDark)
    check('深色下为深色面板', dark.bg === 'rgb(23, 26, 33)', dark.bg)
    check('深色下描边跟随主题', dark.border === 'rgb(42, 48, 57)', dark.border)
    check('深色下图标为浅色', dark.color === 'rgb(178, 185, 197)', dark.color)
    check('切换主题后按钮仍正常显示', dark.display !== 'none', dark.display)

    console.log('\n【需求 1】后台页面同样生效')
    const token = await evaluate(
      `fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) })
        .then(r => r.json()).then(d => { localStorage.setItem('fcdzy_admin_token', d.data.token); return d.data.token })`
    )
    check('后台登录 token 已写入', typeof token === 'string' && token.length > 20)
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 700, deviceScaleFactor: 1, mobile: false })
    await goto(`${BASE}/admin/articles/1/edit`, "!!document.querySelector('.md-editor')")
    const adminTop = await probe()
    check('后台页面已挂载按钮', adminTop.exists)

    // 后台可能是 window 滚动，也可能是 el-main 内部滚动，先探测真正的滚动容器
    const scroller = JSON.parse(
      await evaluate(`(() => {
        const main = document.querySelector('.el-main')
        const winOverflow = Math.round(document.documentElement.scrollHeight - window.innerHeight)
        const mainOverflow = main ? Math.round(main.scrollHeight - main.clientHeight) : 0
        return JSON.stringify({ winOverflow, mainOverflow, use: winOverflow >= mainOverflow ? 'window' : 'el-main' })
      })()`)
    )
    check('后台内容可滚动超过 300px', Math.max(scroller.winOverflow, scroller.mainOverflow) > 300, `window 可滚动 ${scroller.winOverflow}px / el-main 可滚动 ${scroller.mainOverflow}px，使用 ${scroller.use}`)

    const adminScroll = async (y) => {
      if (scroller.use === 'window') {
        await evaluate(`window.scrollTo({ top: ${y}, behavior: 'auto' })`)
      } else {
        await evaluate(`(() => { const m = document.querySelector('.el-main'); if (m) m.scrollTop = ${y} })()`)
      }
      await sleep(500)
      return probe()
    }
    const adminCurrent = () =>
      evaluate(
        scroller.use === 'window'
          ? 'Math.round(window.scrollY)'
          : "Math.round(document.querySelector('.el-main').scrollTop)"
      )

    const adminSmall = await adminScroll(250)
    check('后台滚动 250px 时仍隐藏', adminSmall.display === 'none', `display=${adminSmall.display}`)
    await adminScroll(400)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 10, y: 10, button: 'none', buttons: 0 })
    await sleep(300)
    const adminShown = await probe()
    check('后台滚动 400px 后按钮显示', adminShown.display !== 'none', `display=${adminShown.display}`)
    if (adminShown.center) {
      await click(adminShown.center.x, adminShown.center.y)
      let adminLanded = false
      for (let i = 0; i < 50; i++) {
        await sleep(60)
        if ((await adminCurrent()) === 0) {
          adminLanded = true
          break
        }
      }
      check('后台点击后回到顶部', adminLanded)
      await sleep(600)
      check('后台按钮随之隐藏', (await probe()).display === 'none', (await probe()).display)
    }
    await send('Emulation.clearDeviceMetricsOverride')

    console.log(failures === 0 ? '\n回到顶部按钮检查全部通过 ✅' : `\n共有 ${failures} 项未通过 ❌`)
  } finally {
    proc.kill()
  }
  process.exit(failures === 0 ? 0 : 1)
})().catch((error) => {
  console.error('回到顶部检查失败:', error)
  process.exit(1)
})
