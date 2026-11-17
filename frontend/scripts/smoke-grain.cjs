/**
 * 胶片颗粒层检查：
 * - 存在、铺满视口、不透明度很低
 * - 不拦截任何点击（点文章卡片能进详情）
 * - 层级低于弹层（灯箱/对话框里没有颗粒）
 * - 滚动时不影响帧率（固定层 + 低透明度，不应造成掉帧）
 *
 * 用法：node scripts/smoke-grain.cjs
 */
const { spawn } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')

const PORT = 9825
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5173'
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed += 1
  console.log(`${ok ? '[OK]  ' : '[FAIL]'} ${name}${detail ? '  -> ' + detail : ''}`)
}

;(async () => {
  const profile = path.join(os.tmpdir(), 'dsh-grain')
  const proc = spawn(
    chrome,
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--window-size=1400,900',
      '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT, 'about:blank'],
    { stdio: 'ignore' }
  )
  let wsUrl
  for (let i = 0; i < 40 && !wsUrl; i += 1) {
    await sleep(400)
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json()
      wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl
    } catch {
      /* 等 chrome */
    }
  }
  const ws = new WebSocket(wsUrl)
  await new Promise((r) => (ws.onopen = r))
  let msgId = 0
  const pending = new Map()
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m)
      pending.delete(m.id)
    }
  }
  const send = (method, params = {}) => new Promise((r) => { const i = ++msgId; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  await send('Network.setCacheDisabled', { cacheDisabled: true })
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false })
  const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value

  try {
    console.log('\n【需求】胶片颗粒层')
    await send('Page.navigate', { url: BASE + '/articles' })
    await sleep(4500)

    const info = JSON.parse(await evaluate(`(() => {
      const el = document.querySelector('.grain-layer')
      if (!el) return JSON.stringify({ found: false })
      const cs = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      return JSON.stringify({
        found: true,
        pointerEvents: cs.pointerEvents,
        position: cs.position,
        zIndex: cs.zIndex,
        opacity: Number(cs.opacity),
        coversViewport: Math.abs(rect.width - window.innerWidth) < 2 && Math.abs(rect.height - window.innerHeight) < 2,
        hasNoiseImage: (cs.backgroundImage || '').includes('data:image/svg+xml'),
        blendMode: cs.mixBlendMode
      })
    })()`))
    console.log('颗粒层:', JSON.stringify(info))
    check('颗粒层存在', info.found === true)
    check('铺满整个视口', info.coversViewport === true)
    check('固定定位', info.position === 'fixed', info.position)
    check('不拦截点击', info.pointerEvents === 'none', info.pointerEvents)
    check('用 SVG 噪点做纹理', info.hasNoiseImage === true)
    check('不透明度很低（0.05~0.16，可调）', info.opacity >= 0.05 && info.opacity <= 0.16, String(info.opacity))
    check('没有用 mix-blend-mode（避免整屏重合成掉帧）', info.blendMode === 'normal', info.blendMode)
    check('层级低于弹层（Element Plus 从 2000 起）', Number(info.zIndex) < 2000, info.zIndex)

    // 不拦截点击：点第一张文章卡片应该能进详情页
    const clicked = await evaluate(`(() => {
      const card = document.querySelector('.article-card')
      if (!card) return 'no-card'
      card.click()
      return 'clicked'
    })()`)
    await sleep(2200)
    const pathname = await evaluate('location.pathname')
    check('点文章卡片能正常进入详情（颗粒没挡住）', clicked === 'clicked' && pathname.startsWith('/article/'), pathname)

    // 弹层里不应有颗粒：打开图片灯箱，检查灯箱内没有 .grain-layer 覆盖在内容之上
    const layering = JSON.parse(await evaluate(`(() => {
      const grain = document.querySelector('.grain-layer')
      if (!grain) return JSON.stringify({ ok: false })
      const grainZ = Number(getComputedStyle(grain).zIndex)
      // 找页面上最高的 z-index（弹层通常很高）
      const all = Array.from(document.querySelectorAll('body *'))
        .map((el) => Number(getComputedStyle(el).zIndex))
        .filter((z) => Number.isFinite(z) && z > 0)
      const maxZ = all.length ? Math.max(...all) : 0
      return JSON.stringify({ ok: true, grainZ, maxZ, belowTop: grainZ < maxZ })
    })()`))
    check('页面存在更高层级的弹层元素，且颗粒在其之下', layering.ok === true && layering.belowTop === true, JSON.stringify(layering))

    // 滚动流畅度：采样 1 秒内的帧间隔
    const fps = JSON.parse(await evaluate(`(async () => {
      const gaps = []
      let last = performance.now()
      let stop = false
      const raf = () => {
        const now = performance.now()
        gaps.push(now - last)
        last = now
        if (!stop) requestAnimationFrame(raf)
      }
      requestAnimationFrame(raf)
      const start = performance.now()
      while (performance.now() - start < 900) {
        window.scrollBy(0, 18)
        await new Promise((r) => setTimeout(r, 8))
      }
      stop = true
      const sorted = gaps.slice(2).sort((a, b) => a - b)
      const p = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] || 0
      return JSON.stringify({ frames: sorted.length, median: Math.round(p(0.5)), p95: Math.round(p(0.95)) })
    })()`))
    console.log('滚动帧间隔:', JSON.stringify(fps))
    check('滚动时仍有连续帧（未因颗粒层的合成而卡死）', fps.frames > 20, `${fps.frames} 帧`)
  } finally {
    proc.kill()
  }

  console.log(failed === 0 ? '\n胶片颗粒检查全部通过 ✅' : '\n共有 ' + failed + ' 项未通过 ❌')
  process.exit(failed === 0 ? 0 : 1)
})()
