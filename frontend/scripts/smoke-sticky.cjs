/**
 * 导航「不吸顶」检查（按用户要求：滚动时导航随页面一起滚走）
 *  - 顶部时导航贴顶、透明、正文从它下方开始
 *  - 滚动 700px 后导航不再固定在顶部（top < 0），且不出现 is-stuck 玻璃态
 *  - 内页（/articles）同样不吸顶
 *  - 移动端同样不吸顶
 * 用法：node scripts/smoke-sticky.cjs  可选 SMOKE_SHOT=<前缀>
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const PORT = 9871
const BASE = 'http://127.0.0.1:5173'
const OUT = process.env.SMOKE_SHOT || ''
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failures = 0
function check(label, ok, detail) {
  if (ok) console.log(`  [OK]   ${label}${detail ? '  → ' + detail : ''}`)
  else {
    failures += 1
    console.log(`  [MISS] ${label}${detail ? '  → ' + detail : ''}`)
  }
}

const PROBE = `(() => {
  const h = document.querySelector('.site-header')
  if (!h) return JSON.stringify({ found: false })
  const cs = getComputedStyle(h)
  const r = h.getBoundingClientRect()
  return JSON.stringify({
    found: true,
    top: Math.round(r.top),
    height: Math.round(r.height),
    position: cs.position,
    stuck: h.classList.contains('is-stuck'),
    background: cs.backgroundColor,
    blur: cs.backdropFilter,
    scrollY: Math.round(window.scrollY)
  })
})()`

;(async () => {
  const profile = path.join(os.tmpdir(), 'dsh-smoke-sticky-' + Date.now())
  const proc = spawn(
    chrome,
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--window-size=1440,900',
      '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT, 'about:blank'],
    { stdio: 'ignore' }
  )
  let wsUrl
  for (let i = 0; i < 50 && !wsUrl; i += 1) {
    await sleep(400)
    try {
      const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json()
      wsUrl = l.find((t) => t.type === 'page')?.webSocketDebuggerUrl
    } catch {
      /* 等 */
    }
  }
  const ws = new WebSocket(wsUrl)
  await new Promise((r) => (ws.onopen = r))
  let id = 0
  const pending = new Map()
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m)
      pending.delete(m.id)
    }
  }
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
  await send('Page.enable')
  await send('Runtime.enable')
  const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value
  const scrollTo = async (y) => {
    await evaluate(`window.scrollTo({ top: ${y}, behavior: 'auto' })`)
    await sleep(500)
  }

  try {
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
    await send('Page.navigate', { url: BASE + '/' })
    await sleep(1500)
    await evaluate(`localStorage.setItem('fcdzy_theme','light'); location.reload()`)
    await sleep(4000)

    const top = JSON.parse(await evaluate(PROBE))
    console.log('【需求 1】顶部时导航正常')
    check('导航存在', top.found)
    check('顶部时贴在最上方', top.top === 0, `top=${top.top}`)
    check('顶部时未进入 is-stuck', top.stuck === false)
    check(
      '正文从导航下方开始（不被遮挡）',
      Number(await evaluate("Math.round((document.querySelector('.hero-content')||{getBoundingClientRect:()=>({top:999})}).getBoundingClientRect().top)")) >= top.height - 2
    )

    console.log('\n【需求 2】首页滚动 700px 后导航滚走（不吸顶）')
    await scrollTo(700)
    const scrolled = JSON.parse(await evaluate(PROBE))
    check('页面确实滚动了', scrolled.scrollY >= 600, String(scrolled.scrollY))
    check('导航已滚出视口（top < 0）', scrolled.top < 0, `top=${scrolled.top}`)
    check('未出现 is-stuck 玻璃态', scrolled.stuck === false)
    check('定位仍是 absolute（首页叠在 Hero 上）', scrolled.position === 'absolute', scrolled.position)

    console.log('\n【需求 3】回到顶部后恢复正常')
    await scrollTo(0)
    const back = JSON.parse(await evaluate(PROBE))
    check('回到顶部导航贴顶', back.top === 0, `top=${back.top}`)
    check('仍未进入 is-stuck', back.stuck === false)

    console.log('\n【需求 4】内页也不吸顶')
    await send('Page.navigate', { url: BASE + '/articles' })
    await sleep(3500)
    const innerTop = JSON.parse(await evaluate(PROBE))
    check('内页导航为 relative（占文档流、不固定）', innerTop.position === 'relative', innerTop.position)
    await scrollTo(700)
    const innerScrolled = JSON.parse(await evaluate(PROBE))
    check('内页滚动后导航同样滚走', innerScrolled.top < 0, `top=${innerScrolled.top}`)

    console.log('\n【需求 5】移动端也不吸顶')
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
    await send('Page.navigate', { url: BASE + '/' })
    await sleep(3500)
    await scrollTo(600)
    const mobile = JSON.parse(await evaluate(PROBE))
    check('移动端滚动后导航滚走', mobile.top < 0, `top=${mobile.top}`)
    check('移动端无 is-stuck', mobile.stuck === false)

    if (OUT) {
      const s = await send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(`${OUT}-sticky.png`, Buffer.from(s.result.data, 'base64'))
      console.log('  saved', `${OUT}-sticky.png`)
    }
  } finally {
    proc.kill()
  }

  console.log(failures === 0 ? '\n吸顶导航检查全部通过 ✅' : `\n共有 ${failures} 项未通过 ❌`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((error) => {
  console.error('吸顶导航检查失败:', error)
  process.exit(1)
})
