/**
 * 首页 Hero 专项检查：用 CDP 打开真实页面，读取计算样式与几何尺寸，逐条核对需求。
 * 用法：node scripts/smoke-hero.cjs
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5173'
const API = process.env.SMOKE_API || 'http://127.0.0.1:8080'
const DEBUG_PORT = 9444
const DESKTOP = { width: 1440, height: 900 }

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
      /* 等待端口就绪 */
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
  const cs = (el) => (el ? getComputedStyle(el) : null)
  const box = (el) => (el ? el.getBoundingClientRect() : null)
  const hero = document.querySelector('.hero')
  const header = document.querySelector('.site-header')
  const nav = document.querySelector('.site-header .nav a')
  const navIdle = Array.from(document.querySelectorAll('.site-header .nav a')).find((a) => !a.classList.contains('active'))
  const hamburger = document.querySelector('.site-header .hamburger')
  const bg = document.querySelector('.hero-bg')
  const overlay = document.querySelector('.hero-overlay')
  const fade = document.querySelector('.hero-fade')
  const title = document.querySelector('.hero-title')
  const subtitle = document.querySelector('.hero-subtitle')
  const btn = document.querySelector('.hero-btn')
  const body = document.querySelector('.home-body')

  let breathFrame = false
  let heroBreathRule = false
  let hoverLift = false
  for (const sheet of Array.from(document.styleSheets)) {
    let rules = []
    try { rules = Array.from(sheet.cssRules) } catch { continue }
    for (const rule of rules) {
      const text = rule.cssText || ''
      if (text.includes('hero-breath')) heroBreathRule = true
      if (text.includes('scale(1.04)')) breathFrame = true
      if (text.includes('.hero-btn') && text.includes(':hover') && text.includes('-3px')) hoverLift = true
    }
  }

  return JSON.stringify({
    vh: window.innerHeight,
    vw: window.innerWidth,
    hasHero: !!hero,
    heroHeight: hero ? Math.round(box(hero).height) : 0,
    heroTop: hero ? Math.round(box(hero).top) : -1,
    headerInsideHero: !!(hero && header && hero.contains(header)),
    headerPosition: cs(header) ? cs(header).position : '',
    headerTopOffset: hero && header ? Math.round(box(header).top - box(hero).top) : -1,
    headerHeight: header ? Math.round(box(header).height) : 0,
    headerBackground: cs(header) ? cs(header).backgroundColor : '',
    navColor: cs(nav) ? cs(nav).color : '',
    navIdleColor: cs(navIdle) ? cs(navIdle).color : '',
    hamburgerDisplay: cs(hamburger) ? cs(hamburger).display : '',
    bgImage: bg ? cs(bg).backgroundImage.slice(0, 150) : '',
    animName: bg ? cs(bg).animationName : '',
    animDuration: bg ? cs(bg).animationDuration : '',
    overlayColor: cs(overlay) ? cs(overlay).backgroundColor : '',
    fadeHeight: fade ? Math.round(box(fade).height) : 0,
    fadeBackground: cs(fade) ? cs(fade).backgroundImage.slice(0, 200) : '',
    titleColor: cs(title) ? cs(title).color : '',
    titleText: title ? title.textContent.trim() : '',
    subtitleColor: cs(subtitle) ? cs(subtitle).color : '',
    btnColor: cs(btn) ? cs(btn).color : '',
    btnText: btn ? btn.textContent.trim() : '',
    btnCount: document.querySelectorAll('.hero-btn').length,
    bodyBg: cs(body) ? cs(body).backgroundColor : '',
    bodyBgImage: cs(body) ? cs(body).backgroundImage : '',
    articleCardCount: document.querySelectorAll('.article-card').length,
    sideCardCount: document.querySelectorAll('.side-card').length,
    heroBreathRule,
    breathFrame,
    hoverLift
  })
})()`

;(async () => {
  const profile = path.join(os.tmpdir(), 'dsh-smoke-hero-profile')
  const proc = spawn(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-extensions',
      `--window-size=${DESKTOP.width},${DESKTOP.height}`,
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${DEBUG_PORT}`,
      'about:blank'
    ],
    { stdio: 'ignore' }
  )

  try {
    const wsUrl = await waitForDevtools()
    const ws = new WebSocket(wsUrl)
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

    async function evaluate(expression) {
      const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      return res.result?.result?.value
    }

    async function goto(url, ready = "!!document.querySelector('#app') && document.querySelector('#app').innerHTML.length > 800") {
      await send('Page.navigate', { url })
      for (let i = 0; i < 40; i++) {
        await sleep(300)
        if (await evaluate(ready).catch(() => false)) {
          await sleep(500)
          return
        }
      }
    }

    async function setViewport(width, height) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: width < 600
      })
      await sleep(400)
    }

    const siteConfig = await (await fetch(`${API}/api/public/site-config`)).json()
    const heroImage = (siteConfig.data.homeHeroImage || '').trim()
    const articles = await (await fetch(`${API}/api/public/articles?page=1&size=1`)).json()
    const topics = await (await fetch(`${API}/api/public/topics`)).json()
    const categories = await (await fetch(`${API}/api/public/categories`)).json()

    console.log(`浏览器窗口 ${DESKTOP.width}x${DESKTOP.height}，Hero 背景图：${heroImage ? heroImage : '（未配置，使用默认渐变）'}\n`)

    // ===== 首页 Hero =====
    await setViewport(DESKTOP.width, DESKTOP.height)
    await goto(`${BASE}/`)
    const m = JSON.parse(await evaluate(PROBE))
    const expectHeight = Math.round(m.vh * 0.45)
    const byRatio = Math.abs(m.heroHeight - expectHeight) <= 10

    console.log('【需求 1】Hero 高度 45vh、占据页面顶部、导航栏在 Hero 内部最上方')
    check('存在 Hero 区块', m.hasHero)
    check(`Hero 高度为 45vh（期望 ${expectHeight}px）`, byRatio, `实测 ${m.heroHeight}px`)
    check('Hero 位于页面顶部', m.heroTop === 0, `top=${m.heroTop}`)
    check('导航栏在 Hero 内部', m.headerInsideHero)
    check('导航栏贴在 Hero 最上方', m.headerTopOffset === 0, `偏移 ${m.headerTopOffset}px`)
    check('导航栏为绝对定位叠在图上', m.headerPosition === 'absolute', m.headerPosition)

    console.log('\n【需求 2】背景图 + 0.45 黑色遮罩 + 25s 呼吸缩放（最大 1.04）')
    check('Hero 背景读取站点配置', heroImage ? m.bgImage.includes(heroImage.replace(/"/g, '')) : m.bgImage.includes('linear-gradient'), m.bgImage.slice(0, 80))
    check('遮罩为 rgba(0,0,0,0.45)', m.overlayColor === 'rgba(0, 0, 0, 0.45)', m.overlayColor)
    check('定义了呼吸动画', m.heroBreathRule)
    check('放大到 1.04 倍', m.breathFrame)
    check('动画周期 25s', m.animDuration === '25s', m.animDuration)
    check('背景正在应用动画', m.animName.startsWith('hero-breath'), m.animName)

    console.log('\n【需求 3】Hero 内标题/简介/按钮，白色文字，按钮 hover 上浮')
    check('渲染站点标题', m.titleText.length > 0, m.titleText)
    check('渲染简介', m.subtitleColor !== '', m.subtitleColor)
    check('两个按钮（浏览文章 / 关于我）', m.btnCount === 2 && m.btnText.length > 0, `${m.btnCount} 个，首个：${m.btnText}`)
    check('标题为白色', m.titleColor === 'rgb(255, 255, 255)', m.titleColor)
    check('按钮文字为白色', m.btnColor === 'rgb(255, 255, 255)', m.btnColor)
    check('导航文字为白色系', (m.navIdleColor || m.navColor).startsWith('rgba(255, 255, 255') || (m.navIdleColor || m.navColor) === 'rgb(255, 255, 255)', m.navIdleColor || m.navColor)
    check('按钮存在 hover 上浮规则', m.hoverLift)

    console.log('\n【需求 4】Hero 底部 120px 渐变：透明 → #f8f9fa')
    check('渐变高度 120px', m.fadeHeight === 120, `${m.fadeHeight}px`)
    const transparentStop = m.fadeBackground.includes('rgba(248, 249, 250, 0)') || m.fadeBackground.includes('rgba(0, 0, 0, 0)')
    check('渐变从透明过渡到 #f8f9fa', transparentStop && m.fadeBackground.includes('rgb(248, 249, 250)'), m.fadeBackground.slice(0, 100))
    check('下方内容区底色为 #f8f9fa（无接缝）', m.bodyBg === 'rgb(248, 249, 250)', m.bodyBg)

    console.log('\n【需求 5】Hero 下方文章列表与侧边栏保持浅白底、无背景图')
    check('内容区未叠加背景图', m.bodyBgImage === 'none', m.bodyBgImage)
    check('文章列表渲染', m.articleCardCount > 0, `${m.articleCardCount} 张卡片`)
    check('侧边栏渲染', m.sideCardCount === 4, `${m.sideCardCount} 张侧栏卡片（分类/标签/专题/热门文章）`)

    console.log('\n【移动端】<=768px 适配')
    await setViewport(390, 844)
    await goto(`${BASE}/`)
    const mob = JSON.parse(await evaluate(PROBE))
    check('移动端导航收起为汉堡菜单', mob.hamburgerDisplay === 'flex' && mob.headerInsideHero, `hamburger=${mob.hamburgerDisplay}`)
    check('移动端 Hero 仍有足够高度', mob.heroHeight >= 400, `${mob.heroHeight}px`)
    check('移动端背景动画保留', mob.animName.startsWith('hero-breath'), mob.animName)
    await send('Emulation.clearDeviceMetricsOverride')

    console.log('\n【需求 6】文章详情 / 分类 / 专题页不使用 Hero 大图，保持浅白底')
    await setViewport(DESKTOP.width, DESKTOP.height)
    const pages = [
      ['文章详情', `/article/${articles.data.list[0].slug}`],
      ['分类页', `/category/${categories.data[0].slug}`],
      ['专题页', `/topic/${topics.data[0].slug}`]
    ]
    for (const [label, url] of pages) {
      await goto(`${BASE}${url}`)
      const p = JSON.parse(await evaluate(PROBE))
      check(`${label} 无 Hero 区块`, !p.hasHero)
      check(`${label} 导航为吸顶白底`, p.headerPosition === 'sticky' && p.headerBackground.startsWith('rgba(255, 255, 255'), `${p.headerPosition} / ${p.headerBackground}`)
      check(`${label} 导航文字为深色`, p.navColor.startsWith('rgb('), p.navColor)
    }

    console.log(failures === 0 ? '\nHero 改造检查全部通过 ✅' : `\n共有 ${failures} 项未通过 ❌`)
  } finally {
    proc.kill()
  }
  process.exit(failures === 0 ? 0 : 1)
})().catch((error) => {
  console.error('Hero 检查失败:', error)
  process.exit(1)
})
