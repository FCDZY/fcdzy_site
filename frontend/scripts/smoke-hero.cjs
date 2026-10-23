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
  const themeToggle = document.querySelector('.theme-toggle')

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
    headerBorderWidth: header ? cs(header).borderBottomWidth : '',
    headerBorderStyle: header ? cs(header).borderBottomStyle : '',
    headerBorderColor: header ? cs(header).borderBottomColor : '',
    headerBackground: cs(header) ? cs(header).backgroundColor : '',
    headerBorderWidth: header ? cs(header).borderBottomWidth : '',
    headerBorderStyle: header ? cs(header).borderBottomStyle : '',
    firstBlockTop: (() => {
      const el = document.querySelector('.page-title') || document.querySelector('.page .card') || document.querySelector('.site-main > *')
      return el ? Math.round(el.getBoundingClientRect().top) : -1
    })(),
    navColor: cs(nav) ? cs(nav).color : '',
    navIdleColor: cs(navIdle) ? cs(navIdle).color : '',
    hamburgerDisplay: cs(hamburger) ? cs(hamburger).display : '',
    bgImage: bg ? cs(bg).backgroundImage.slice(0, 150) : '',
    animName: bg ? cs(bg).animationName : '',
    animDuration: bg ? cs(bg).animationDuration : '',
    overlayColor: cs(overlay) ? cs(overlay).backgroundColor : '',
    overlayBgImage: cs(overlay) ? cs(overlay).backgroundImage.slice(0, 130) : '',
    heroOwnBgImage: cs(hero) ? cs(hero).backgroundImage : '',
    fadeHeight: fade ? Math.round(box(fade).height) : 0,
    fadeBackground: cs(fade) ? cs(fade).backgroundImage.slice(0, 200) : '',
    titleColor: cs(title) ? cs(title).color : '',
    titleText: title ? title.textContent.trim() : '',
    eyebrowCount: document.querySelectorAll('.hero-eyebrow').length,
    navLayout: (() => {
      const nav = document.querySelector('.nav.desktop')
      const inner = document.querySelector('.header-inner')
      const actions = document.querySelector('.header-actions')
      if (!nav || !inner) return null
      const nb = nav.getBoundingClientRect()
      const ib = inner.getBoundingClientRect()
      const ab = actions ? actions.getBoundingClientRect() : null
      const links = Array.from(nav.querySelectorAll('a'))
      const gaps = links.slice(1).map((a, i) => Math.round(a.getBoundingClientRect().left - links[i].getBoundingClientRect().right))
      return {
        navCenter: Math.round(nb.left + nb.width / 2),
        innerCenter: Math.round(ib.left + ib.width / 2),
        viewportCenter: Math.round(window.innerWidth / 2),
        actionRight: ab ? Math.round(ab.right) : 0,
        // 容器有左右内边距，按钮应贴住内容区右缘（而不是容器边框右缘）
        contentRight: Math.round(ib.right - (parseFloat(cs(inner).paddingRight) || 0)),
        // clientWidth 不含滚动条宽度，才是真正的布局视口中心
        docCenter: Math.round(document.documentElement.clientWidth / 2),
        gaps,
        items: links.map((a) => a.textContent.trim())
      }
    })(),
    brand: (() => {
      const header = document.querySelector('.site-header')
      const text = document.querySelector('.site-header .brand-text')
      const logo = document.querySelector('.site-header .logo, .site-header .logo-letter')
      const brand = document.querySelector('.site-header .brand')
      return {
        isTransparent: header ? header.classList.contains('is-transparent') : false,
        hasBrand: !!brand,
        textVisible: text ? cs(text).display !== 'none' && text.getBoundingClientRect().width > 0 : false,
        logoVisible: logo ? logo.getBoundingClientRect().width > 0 : false
      }
    })(),
    heroContentFirstTag: (() => {
      const el = document.querySelector('.hero-content')
      const first = el && el.firstElementChild
      return first ? first.tagName.toLowerCase() + '.' + String(first.className).split(' ')[0] : ''
    })(),
    subtitleColor: cs(subtitle) ? cs(subtitle).color : '',
    btnColor: cs(btn) ? cs(btn).color : '',
    btnText: btn ? btn.textContent.trim() : '',
    btnCount: document.querySelectorAll('.hero-btn').length,
    bodyBg: cs(body) ? cs(body).backgroundColor : '',
    bodyBgImage: cs(body) ? cs(body).backgroundImage : '',
    bodyBgSize: cs(body) ? cs(body).backgroundSize : '',
    bodyBgRepeat: cs(body) ? cs(body).backgroundRepeat : '',
    heroBottom: hero ? Math.round(box(hero).bottom) : -1,
    isDark: document.documentElement.classList.contains('dark'),
    toggleCenter: themeToggle
      ? { x: Math.round(box(themeToggle).left + box(themeToggle).width / 2), y: Math.round(box(themeToggle).top + box(themeToggle).height / 2) }
      : null,
    articleCardCount: document.querySelectorAll('.article-card').length,
    sideCardCount: document.querySelectorAll('.side-card').length,
    sideTitles: Array.from(document.querySelectorAll('.side-card .side-title')).map((el) => el.textContent.trim()),
    firstCardTop: (() => {
      const el = document.querySelector('.main-col .article-card')
      return el ? Math.round(el.getBoundingClientRect().top) : -1
    })(),
    firstSideTop: (() => {
      const el = document.querySelector('.side-col .side-card')
      return el ? Math.round(el.getBoundingClientRect().top) : -1
    })(),
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

    const probe = async () => JSON.parse(await evaluate(PROBE))

    const click = async (x, y) => {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 })
    }

    const shotPrefix = process.env.SMOKE_SHOT
    const shoot = async (file, clip) => {
      const params = clip
        ? { format: 'png', clip: { ...clip, scale: 1 }, captureBeyondViewport: true }
        : { format: 'png', captureBeyondViewport: true }
      const res = await send('Page.captureScreenshot', params)
      if (res.result?.data) fs.writeFileSync(file, Buffer.from(res.result.data, 'base64'))
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

    console.log('\n【需求 2】Hero 不再自带背景，标题浮在全局背景上')
    const bodyBg = await evaluate("getComputedStyle(document.body).backgroundImage.slice(0, 120)")
    check('背景图挂在 body 上', bodyBg.includes('url(') || bodyBg.includes('linear-gradient'), String(bodyBg).slice(0, 80))
    check('Hero 自身无背景图', m.heroOwnBgImage === 'none', m.heroOwnBgImage || '(空)')
    check('Hero 顶部遮罩为 0.45 并向下淡出', m.overlayBgImage.includes('rgba(0, 0, 0, 0.45)') && m.overlayBgImage.includes('rgba(0, 0, 0, 0)'), m.overlayBgImage.slice(0, 90))
    check('底部渐变层高度 40px（结构保留）', m.fadeHeight === 40, `${m.fadeHeight}px`)
    check(
      '底部渐变层 alpha 全为 0（不叠加任何遮盖）',
      (m.fadeBackground.match(/rgba\([^)]*\)/g) || []).every((c) => /,\s*0\)$/.test(c)),
      m.fadeBackground.slice(0, 130)
    )
    check('底部渐变两端均归零（不会形成白条）', (m.fadeBackground.match(/rgba\(255, 255, 255, 0\)/g) || []).length >= 2, m.fadeBackground.slice(0, 120))

    console.log('\n【需求 3】Hero 内标题/简介/按钮，白色文字，按钮 hover 上浮')
    check('渲染站点标题', m.titleText.length > 0, m.titleText)
    check('渲染简介', m.subtitleColor !== '', m.subtitleColor)
    check('两个按钮（浏览文章 / 关于我）', m.btnCount === 2 && m.btnText.length > 0, `${m.btnCount} 个，首个：${m.btnText}`)
    check('标题为白色', m.titleColor === 'rgb(255, 255, 255)', m.titleColor)
    check('按钮文字为白色', m.btnColor === 'rgb(255, 255, 255)', m.btnColor)
    check('导航文字为白色系', (m.navIdleColor || m.navColor).startsWith('rgba(255, 255, 255') || (m.navIdleColor || m.navColor) === 'rgb(255, 255, 255)', m.navIdleColor || m.navColor)
    check('按钮存在 hover 上浮规则', m.hoverLift)
    check('Banner 标题上方已无站点名称行', m.eyebrowCount === 0, `eyebrow 元素 ${m.eyebrowCount} 个`)
    check('Hero 内容首元素即 Banner 标题', m.heroContentFirstTag === 'h1.hero-title', m.heroContentFirstTag)
    check('导航整体水平居中（与容器中心偏差 ≤1px）', Math.abs(m.navLayout.navCenter - m.navLayout.innerCenter) <= 1, `导航中心 ${m.navLayout.navCenter} / 容器中心 ${m.navLayout.innerCenter}`)
    check('导航位于视口中心（不偏左也不偏右）', Math.abs(m.navLayout.navCenter - m.navLayout.docCenter) <= 1, `导航中心 ${m.navLayout.navCenter} / 布局视口中心 ${m.navLayout.docCenter}`)
    check('导航项顺序不变', m.navLayout.items.join(',') === '首页,文章,分类,专题,关于', m.navLayout.items.join(' / '))
    check('导航项间距均匀', new Set(m.navLayout.gaps).size === 1, `间距 ${m.navLayout.gaps.join(',')}`)
    check('右侧按钮组仍靠右', Math.abs(m.navLayout.actionRight - m.navLayout.contentRight) <= 1, `按钮右缘 ${m.navLayout.actionRight} / 内容区右缘 ${m.navLayout.contentRight}`)
    check('首页头部为透明变体', m.brand.isTransparent)
    check('页头左上角已无品牌区（logo/站名/副标题都不存在）', !m.brand.hasBrand && !m.brand.textVisible && !m.brand.logoVisible, `logo=${m.brand.logoVisible} 文字=${m.brand.textVisible}`)

    console.log('\n【需求 5】Hero 下方文章列表与侧边栏')
    check('内容区完全透明（露出全局背景）', m.bodyBg === 'rgba(0, 0, 0, 0)' && m.bodyBgImage === 'none', `${m.bodyBg} / ${m.bodyBgImage}`)
    check('文章列表渲染', m.articleCardCount > 0, `${m.articleCardCount} 张卡片`)
    check('侧边栏渲染', m.sideCardCount === 3, `${m.sideCardCount} 张侧栏卡片（热门文章/分类/标签）`)
    check('热门文章在侧栏第一位', m.sideTitles[0] === '热门文章', m.sideTitles.join(' / '))
    check('专题侧栏已移除', !m.sideTitles.includes('专题'), m.sideTitles.join(' / '))
    check(
      '侧栏顶部与第一张文章卡片顶部对齐',
      m.firstCardTop > 0 && Math.abs(m.firstSideTop - m.firstCardTop) <= 1,
      `首卡 top=${m.firstCardTop} / 侧栏首个模块 top=${m.firstSideTop}（差 ${Math.abs(m.firstSideTop - m.firstCardTop)}px）`
    )

    console.log('\n【需求 5】边界像素采样：Hero 遮罩淡出无硬切割')
    /** 把截图回灌进浏览器，沿 Hero 下边界取一条垂直像素带 */
    const sampleProfile = async (boundary) => {
      const shot = await send('Page.captureScreenshot', { format: 'png' })
      const dataUrl = 'data:image/png;base64,' + shot.result.data
      const expr = `(async () => {
        const img = new Image()
        img.src = ${JSON.stringify(dataUrl)}
        await img.decode()
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        const dpr = img.width / window.innerWidth
        const x = Math.min(img.width - 1, Math.round(window.innerWidth * 0.96 * dpr))
        const from = Math.max(0, Math.round((${boundary} - 100) * dpr))
        const to = Math.min(img.height - 1, Math.round((${boundary} + 120) * dpr))
        const step = Math.max(1, Math.round(dpr))
        const out = []
        for (let y = from; y <= to; y += step) {
          const d = ctx.getImageData(x, y, 1, 1).data
          out.push([d[0], d[1], d[2]])
        }
        return JSON.stringify(out)
      })()`
      const rows = JSON.parse(await evaluate(expr))
      let maxDelta = 0
      let maxAt = -1
      for (let i = 1; i < rows.length; i += 1) {
        const delta = Math.max(
          Math.abs(rows[i][0] - rows[i - 1][0]),
          Math.abs(rows[i][1] - rows[i - 1][1]),
          Math.abs(rows[i][2] - rows[i - 1][2])
        )
        if (delta > maxDelta) {
          maxDelta = delta
          maxAt = i
        }
      }
      return { rows, maxDelta, maxAt }
    }

    const lightProfile = await sampleProfile(m.heroBottom)
    check('导航栏不再有横向分隔线', m.headerBorderWidth === '0px', `${m.headerBorderWidth} ${m.headerBorderStyle} ${m.headerBorderColor}`)

    /** 采样视口内某一点像素（x 取容器之外，避开设了毛玻璃的卡片） */
    const samplePoint = async (y) => {
      const shot = await send('Page.captureScreenshot', { format: 'png' })
      const dataUrl = 'data:image/png;base64,' + shot.result.data
      return JSON.parse(
        await evaluate(`(async () => {
          const img = new Image()
          img.src = ${JSON.stringify(dataUrl)}
          await img.decode()
          const canvas = document.createElement('canvas')
          canvas.width = img.width
          canvas.height = img.height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0)
          const dpr = img.width / window.innerWidth
          const x = Math.round(window.innerWidth * 0.96 * dpr)
          const d = ctx.getImageData(x, Math.round(${y} * dpr), 1, 1).data
          return JSON.stringify([d[0], d[1], d[2]])
        })()`)
      )
    }
    const diffOf = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]))

    /*
     * 衔接处是否还有白色横条 / 硬分割线的客观判定：
     * 背景是 fixed 的，同一视口坐标的背景像素不随滚动变化，
     * 所以把「Hero 边界上下几个点」与「滚动 600px 后同坐标的纯背景像素」逐一对比：
     * 只要边界两侧都等于纯背景，就说明既没有硬边、内容区也没有被任何白色覆盖。
     * 背景呼吸动画期间像素会位移，测量时先关掉。
     */
    const junction = {}
    const offsets = [-3, 3, 18, 45]
    await evaluate("document.body.style.animation = 'none'")
    await sleep(300)
    for (const off of offsets) junction[off] = await samplePoint(m.heroBottom + off)
    await evaluate('window.scrollTo({ top: 600, behavior: "auto" })')
    await sleep(500)
    const reference = {}
    for (const off of offsets) reference[off] = await samplePoint(m.heroBottom + off)
    await evaluate('window.scrollTo({ top: 0, behavior: "auto" })')
    await sleep(400)
    await evaluate("document.body.style.animation = ''")

    const aboveDiff = diffOf(junction[-3], reference[-3])
    const belowDiff = diffOf(junction[3], reference[3])
    const nearDiff = diffOf(junction[18], reference[18])
    const deepDiff = diffOf(junction[45], reference[45])
    check(
      'Hero 最后一行即纯背景（无残留白色遮罩）',
      aboveDiff <= 6,
      `rgb(${junction[-3].join(',')}) vs 纯背景 rgb(${reference[-3].join(',')})，差 ${aboveDiff}`
    )
    check(
      '内容区首行即纯背景（无白色横条/分割线）',
      belowDiff <= 6,
      `rgb(${junction[3].join(',')}) vs 纯背景 rgb(${reference[3].join(',')})，差 ${belowDiff}`
    )
    check(
      '内容区 18px 处仍是纯背景（无 1px 亮线）',
      nearDiff <= 6,
      `rgb(${junction[18].join(',')}) vs 纯背景 rgb(${reference[18].join(',')})，差 ${nearDiff}`
    )
    check(
      'Hero 下方 45px 处仍是纯背景（无延伸白雾）',
      deepDiff <= 6,
      `rgb(${junction[45].join(',')}) vs 纯背景 rgb(${reference[45].join(',')})，差 ${deepDiff}`
    )
    // 边界上下紧邻像素：两侧都与「纯背景」比对（上面已有 above/below 两项），
    // 这里不再直接比较两侧像素——背景图自身可有明暗过渡，直接比较会误报

    check(
      '边界像素相邻跳变（仅记录，背景图自身纹理会影响该值）',
      true,
      `最大 ${lightProfile.maxDelta}，位于边界 ${lightProfile.maxAt - 100}px 处`
    )
    if (shotPrefix) {
      await shoot(`${shotPrefix}-hero-junction.png`, {
        x: 0,
        y: Math.max(0, m.heroBottom - 120),
        width: m.vw,
        height: 240
      })
    }

    // 切到深色再采一次
    const toggleTheme = async () =>
      evaluate(`(() => { const btn = document.querySelector('.theme-toggle'); if (btn) { btn.click(); return true } return false })()`)
    await toggleTheme()
    await sleep(900)
    const darkHero = await probe()
    const darkProfile = await sampleProfile(darkHero.heroBottom)
    check('深色：Hero 遮罩自动提升到 0.5', darkHero.overlayBgImage.includes('rgba(0, 0, 0, 0.5)'), darkHero.overlayBgImage.slice(0, 90))
    check('深色：底部渐变层 alpha 全为 0', (darkHero.fadeBackground.match(/rgba\([^)]*\)/g) || []).every((c) => /,\s*0\)$/.test(c)), darkHero.fadeBackground.slice(0, 130))
    // 深色下同样确认边界没有硬线
    await evaluate("document.body.style.animation = 'none'")
    await sleep(300)
    const darkAbove = await samplePoint(darkHero.heroBottom - 3)
    const darkBelow = await samplePoint(darkHero.heroBottom + 3)
    await evaluate("document.body.style.animation = ''")
    const darkGap = diffOf(darkAbove, darkBelow)
    check(
      '深色：边界上下紧邻像素无跳变（无硬分割线）',
      darkGap <= 10,
      `rgb(${darkAbove.join(',')}) → rgb(${darkBelow.join(',')})，差 ${darkGap}`
    )
    check(
      '深色：边界像素相邻跳变（仅记录）',
      true,
      `最大 ${darkProfile.maxDelta}，位于边界 ${darkProfile.maxAt - 100}px 处`
    )
    if (shotPrefix) await shoot(`${shotPrefix}-hero-fade-dark.png`)
    // 还原浅色，避免影响后续用例与下次运行
    await evaluate('window.scrollTo({ top: 0, behavior: "auto" })')
    await sleep(400)
    await toggleTheme()
    await sleep(900)
    const restored = await probe()
    check('已还原为浅色模式', restored.isDark === false, `isDark=${restored.isDark}`)

    console.log('\n【移动端】<=768px 适配')
    await setViewport(390, 844)
    await goto(`${BASE}/`)
    const mob = JSON.parse(await evaluate(PROBE))
    check('移动端导航收起为汉堡菜单', mob.hamburgerDisplay === 'flex' && mob.headerInsideHero, `hamburger=${mob.hamburgerDisplay}`)
    check('移动端 Hero 仍有足够高度', mob.heroHeight >= 400, `${mob.heroHeight}px`)
    check('移动端全局背景仍为固定', (await evaluate('getComputedStyle(document.body).backgroundAttachment')) === 'fixed')
    await send('Emulation.clearDeviceMetricsOverride')

    console.log('\n【需求 6】文章详情 / 分类 / 专题页不使用 Hero 大图')
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
      check(`${label} 导航为透明叠图（无白底无边框）`, p.headerPosition === 'relative' && p.headerBackground === 'rgba(0, 0, 0, 0)' && p.headerBorderWidth === '0px', `${p.headerPosition} / ${p.headerBackground} / ${p.headerBorderWidth} ${p.headerBorderStyle}`)
      check(`${label} 导航文字为白色（与首页一致）`, (p.navColor || '').startsWith('rgba(255, 255, 255'), p.navColor)
      check(`${label} 内容从导航下方开始（结构上不可能重叠）`, p.firstBlockTop >= p.headerHeight, `首个内容块 top=${p.firstBlockTop} / 导航高 ${p.headerHeight}`)
      check(`${label} 同样使用全局固定背景`, (await evaluate('getComputedStyle(document.body).backgroundAttachment')) === 'fixed')
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
