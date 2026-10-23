/**
 * 文章详情页顶部阅读进度条专项检查：
 * 位置（视口最顶端 / 细线 / fixed / 不拦截鼠标）、滚动百分比计算、
 * 平滑过渡、仅文章页出现、末端 100%、内容不足一屏时保持 0。
 *
 * 用法：node scripts/smoke-progress.cjs
 * 可选：SMOKE_SHOT=<路径前缀> 输出截图
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5173'
const DEBUG_PORT = 9681
const VIEW = { width: 1440, height: 900 }
const ARTICLE_SLUG = 'build-personal-site'

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

let failures = 0
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '[OK]  ' : '[MISS]'} ${label}${detail ? `  → ${detail}` : ''}`)
  if (!ok) failures++
}

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

/** scaleX：从 computed transform 的 matrix(a, b, c, d, e, f) 里取 a */
const PROBE = `(() => {
  const cs = (el) => (el ? getComputedStyle(el) : null)
  const wrap = document.querySelector('.reading-progress')
  const bar = document.querySelector('.reading-progress__bar')
  const doc = document.documentElement
  const scrollable = doc.scrollHeight - window.innerHeight
  const scaleOf = (transform) => {
    if (!transform || transform === 'none') return 1
    const m = transform.match(/matrix\\(([^)]+)\\)/)
    if (!m) return 1
    return Number(m[1].split(',')[0])
  }
  const navLinks = Array.from(document.querySelectorAll('.site-header a, .site-header button'))
    .map((el) => Math.round(el.getBoundingClientRect().top))
    .filter((v) => Number.isFinite(v))
  return JSON.stringify({
    hasWrap: !!wrap,
    hasBar: !!bar,
    position: wrap ? cs(wrap).position : '',
    top: wrap ? cs(wrap).top : '',
    height: wrap ? parseFloat(cs(wrap).height) : null,
    zIndex: wrap ? Number(cs(wrap).zIndex) : null,
    pointerEvents: wrap ? cs(wrap).pointerEvents : '',
    wrapperOpacity: wrap ? Number(cs(wrap).opacity) : null,
    barBg: bar ? cs(bar).backgroundColor : '',
    barImage: bar ? cs(bar).backgroundImage : '',
    transitionProperty: bar ? cs(bar).transitionProperty : '',
    transitionDuration: bar ? cs(bar).transitionDuration : '',
    scale: bar ? scaleOf(cs(bar).transform) : null,
    barWidth: bar ? Math.round(bar.getBoundingClientRect().width) : 0,
    viewportWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    scrollHeight: doc.scrollHeight,
    scrollable,
    scrollY: Math.round(window.scrollY),
    navLinkTops: navLinks.slice(0, 6),
    headerZ: (() => {
      const h = document.querySelector('.site-header')
      return h ? Number(getComputedStyle(h).zIndex) || 0 : 0
    })(),
    routerPath: location.pathname
  })
})()`

;(async () => {
  const profile = path.join(os.tmpdir(), 'dsh-smoke-progress-profile')
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
    await send('Network.enable')
    await send('Network.setCacheDisabled', { cacheDisabled: true })
    await send('Emulation.setDeviceMetricsOverride', { width: VIEW.width, height: VIEW.height, deviceScaleFactor: 1, mobile: false })

    const evaluate = async (expression) => {
      const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (res.result?.exceptionDetails) throw new Error(res.result.exceptionDetails.exception?.description || 'evaluate failed')
      return res.result?.result?.value
    }
    const probe = async () => JSON.parse(await evaluate(PROBE))
    const goto = async (url, ready = "!!document.querySelector('.article .title')") => {
      await send('Page.navigate', { url })
      for (let i = 0; i < 40; i++) {
        await sleep(300)
        if (await evaluate(ready).catch(() => false)) {
          await sleep(800)
          return
        }
      }
    }
    const shoot = async (file) => {
      const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
      if (res.result?.data) fs.writeFileSync(file, Buffer.from(res.result.data, 'base64'))
    }
    const shotPrefix = process.env.SMOKE_SHOT
    const articleUrl = `${BASE}/article/${ARTICLE_SLUG}`

    // ===== 1. 文章页顶部初始状态 =====
    await goto(articleUrl)
    await evaluate("window.scrollTo({ top: 0, behavior: 'auto' })")
    await sleep(500)
    const atTop = await probe()

    console.log('【需求 1/5】位置与样式：视口最顶端、纤细、半透明、不拦截鼠标')
    check('文章页存在进度条容器', atTop.hasWrap && atTop.hasBar)
    check('固定在视口最顶端', atTop.position === 'fixed' && atTop.top === '0px', `${atTop.position} / top=${atTop.top}`)
    check('线条纤细（≤4px）', atTop.height !== null && atTop.height <= 4, `${atTop.height}px`)
    check('不拦截鼠标事件', atTop.pointerEvents === 'none', atTop.pointerEvents)
    check('层级高于页面内容与吸顶元素（header/目录/回到顶部）', atTop.zIndex >= 300 && atTop.zIndex > atTop.headerZ, `z-index=${atTop.zIndex}，header=${atTop.headerZ}`)
    check('配色为半透明（alpha < 1）', /rgba\([^)]*,\s*0\.\d+\)/.test(atTop.barImage || ''), (atTop.barImage || '').slice(0, 90))
    check('不遮挡导航文字（导航元素都在进度条下方）', atTop.navLinkTops.every((y) => y > atTop.height), `导航 top=${atTop.navLinkTops.join(',')}`)

    console.log('\n【需求 6】顶部时进度为 0 且不可见')
    check('页面确实可滚动', atTop.scrollable > 0, `可滚动 ${atTop.scrollable}px`)
    check('scaleX 为 0', Math.abs(atTop.scale) < 0.001, String(atTop.scale))
    check('整条隐藏（opacity 0）', atTop.wrapperOpacity === 0, String(atTop.wrapperOpacity))

    // ===== 2. 滚动到一半 =====
    console.log('\n【需求 2】百分比 = 已滚动 / (可滚动高度 - 视口高度)')
    await evaluate(`window.scrollTo({ top: Math.round((document.documentElement.scrollHeight - window.innerHeight) * 0.5), behavior: 'auto' })`)
    await sleep(500)
    const atHalf = await probe()
    const halfExpected = atHalf.scrollY / atHalf.scrollable
    check('滚动到中部后进度约为 50%', Math.abs(atHalf.scale - halfExpected) <= 0.02, `实际 scaleX=${atHalf.scale.toFixed(3)}，公式值=${halfExpected.toFixed(3)}`)
    check('滚动后进度条可见', atHalf.wrapperOpacity === 1)
    check('条宽与比例一致', Math.abs(atHalf.barWidth - atHalf.viewportWidth * atHalf.scale) <= 2, `条宽 ${atHalf.barWidth}px / 视口 ${atHalf.viewportWidth}px`)
    if (shotPrefix) await shoot(`${shotPrefix}-progress-half.png`)

    // ===== 3. 平滑过渡 =====
    console.log('\n【需求 3】进度变化是平滑过渡，不是突兀跳变')
    check('声明了 transform 过渡', atHalf.transitionProperty.includes('transform') && parseFloat(atHalf.transitionDuration) > 0, `${atHalf.transitionProperty} / ${atHalf.transitionDuration}`)
    const beforeJump = await probe()
    await evaluate(`window.scrollTo({ top: Math.round((document.documentElement.scrollHeight - window.innerHeight) * 0.9), behavior: 'auto' })`)
    // 过渡只有 0.12s，单点采样容易错过；连续密集采样，只要有一帧落在中间即证明是渐变
    const samples = []
    for (let i = 0; i < 10; i++) {
      await sleep(25)
      samples.push((await probe()).scale)
    }
    await sleep(400)
    const afterJump = await probe()
    const midSamples = samples.filter((s) => s > beforeJump.scale + 0.002 && s < afterJump.scale - 0.002)
    check(
      '跳转过程中出现中间值（说明是过渡而非瞬间跳变）',
      midSamples.length > 0,
      `起点 ${beforeJump.scale.toFixed(3)} → 采样 [${samples.map((s) => s.toFixed(2)).join(', ')}] → 稳定 ${afterJump.scale.toFixed(3)}`
    )
    check(
      '最终值与滚动位置匹配',
      Math.abs(afterJump.scale - afterJump.scrollY / afterJump.scrollable) <= 0.02,
      `scaleX=${afterJump.scale.toFixed(3)} / 公式=${(afterJump.scrollY / afterJump.scrollable).toFixed(3)}`
    )

    // ===== 4. 滚到底部 =====
    console.log('\n【需求 6】滚到文章末尾进度为 100%')
    await evaluate("window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' })")
    await sleep(600)
    const atBottom = await probe()
    check('底部时 scaleX 为 1', Math.abs(atBottom.scale - 1) < 0.005, String(atBottom.scale))
    check('条宽等于视口宽度', Math.abs(atBottom.barWidth - atBottom.viewportWidth) <= 2, `${atBottom.barWidth}px / ${atBottom.viewportWidth}px`)
    if (shotPrefix) await shoot(`${shotPrefix}-progress-full.png`)

    // ===== 5. 其它页面不显示 =====
    console.log('\n【需求 4】只在文章详情页出现')
    const otherRoutes = ['/', '/articles', '/about', '/tags', '/topics', '/categories']
    for (const route of otherRoutes) {
      await goto(`${BASE}${route}`, "!!document.querySelector('#app') && document.querySelectorAll('.container').length > 0")
      await evaluate("window.scrollTo({ top: 600, behavior: 'auto' })")
      await sleep(350)
      const other = await probe()
      check(`${route} 页面没有进度条`, !other.hasWrap, `path=${other.routerPath}`)
    }

    // ===== 6. 内容不足一屏时保持 0 =====
    console.log('\n【需求 6】内容高度小于屏幕高度时保持 0')
    await send('Emulation.setDeviceMetricsOverride', { width: VIEW.width, height: 6000, deviceScaleFactor: 1, mobile: false })
    await goto(articleUrl)
    await evaluate("window.scrollTo({ top: 0, behavior: 'auto' })")
    await sleep(600)
    const tall = await probe()
    check('该视口下页面已无滚动空间', tall.scrollable <= 0, `可滚动 ${tall.scrollable}px（文档 ${tall.scrollHeight} / 视口 ${tall.innerHeight}）`)
    check('进度保持 0（不显示满条）', Math.abs(tall.scale) < 0.001 && tall.wrapperOpacity === 0, `scaleX=${tall.scale}，opacity=${tall.wrapperOpacity}`)
    await send('Emulation.setDeviceMetricsOverride', { width: VIEW.width, height: VIEW.height, deviceScaleFactor: 1, mobile: false })

    console.log(failures === 0 ? '\n阅读进度条检查全部通过 ✅' : `\n共有 ${failures} 项未通过 ❌`)
  } finally {
    proc.kill()
  }
  process.exit(failures === 0 ? 0 : 1)
})().catch((error) => {
  console.error('阅读进度条检查失败:', error)
  process.exit(1)
})
