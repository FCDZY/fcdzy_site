/**
 * 首页侧边栏「热门文章」专项检查：
 * 位置、标题、按阅读量降序、最多 5 篇、点击跳转、深浅主题适配。
 * 用法：node scripts/smoke-hot.cjs
 * 可选：SMOKE_SHOT=<路径前缀> 输出侧边栏浅色/深色截图
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5173'
const API = process.env.SMOKE_API || 'http://127.0.0.1:8080'
const DEBUG_PORT = 9888
const VIEW = { width: 1440, height: 1400 }
const HOT_LIMIT = 5

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
  const cs = (el, pseudo) => (el ? getComputedStyle(el, pseudo || undefined) : null)
  const cards = Array.from(document.querySelectorAll('.side-col .side-card'))
  const hotCard = document.querySelector('.hot-card')
  const topicCard = cards.find((c) => c.querySelector('.side-title') && c.querySelector('.side-title').textContent.trim() === '专题')
  const items = Array.from(document.querySelectorAll('.hot-card .hot-item'))
  const firstLink = document.querySelector('.hot-card .hot-link')
  const firstRank = document.querySelector('.hot-card .hot-rank')
  const firstTitle = document.querySelector('.hot-card .hot-title')
  const linkRect = firstLink ? firstLink.getBoundingClientRect() : null
  const titleRect = firstTitle ? firstTitle.getBoundingClientRect() : null
  return JSON.stringify({
    htmlClass: document.documentElement.className,
    isDark: document.documentElement.classList.contains('dark'),
    sideCardCount: cards.length,
    sideTitles: cards.map((c) => (c.querySelector('.side-title') ? c.querySelector('.side-title').textContent.trim() : '')),
    hasHotCard: !!hotCard,
    hotTitleText: hotCard && hotCard.querySelector('.side-title') ? hotCard.querySelector('.side-title').textContent.trim() : '',
    hotCount: items.length,
    hotTitles: items.map((li) => (li.querySelector('.hot-title') ? li.querySelector('.hot-title').textContent.trim() : '')),
    hotSlugs: Array.from(document.querySelectorAll('.hot-card .hot-link')).map((a) => a.getAttribute('href')),
    hotCardTop: hotCard ? Math.round(hotCard.getBoundingClientRect().top) : -1,
    hotCardHeight: hotCard ? Math.round(hotCard.getBoundingClientRect().height) : 0,
    /** 文档坐标（CDP 的 clip 用的是文档坐标，不能直接用 rect.top） */
    hotCardPageTop: hotCard ? Math.round(hotCard.getBoundingClientRect().top + window.scrollY) : -1,
    scrollY: Math.round(window.scrollY),
    topicCardTop: topicCard ? Math.round(topicCard.getBoundingClientRect().top) : -1,
    hotCardBg: hotCard ? cs(hotCard).backgroundColor : '',
    hotCardBorder: hotCard ? cs(hotCard).borderColor : '',
    hotCardTransition: hotCard ? cs(hotCard).transitionProperty : '',
    rankBg: firstRank ? cs(firstRank).backgroundColor : '',
    rankColor: firstRank ? cs(firstRank).color : '',
    /* ---- 序号与阅读数排版 ---- */
    rankSize: firstRank ? Math.round(firstRank.getBoundingClientRect().width) + 'x' + Math.round(firstRank.getBoundingClientRect().height) : '',
    rankCenterY: firstRank ? Math.round(firstRank.getBoundingClientRect().top + firstRank.getBoundingClientRect().height / 2) : -1,
    rankTabular: firstRank ? cs(firstRank).fontVariantNumeric : '',
    firstLineCenterY: firstTitle ? Math.round(firstTitle.getBoundingClientRect().top + parseFloat(cs(firstTitle).lineHeight) / 2) : -1,
    viewsCenterY: (() => {
      const v = document.querySelector('.hot-card .hot-views')
      if (!v) return -1
      const r = v.getBoundingClientRect()
      return Math.round(r.top + r.height / 2)
    })(),
    viewsTabular: (() => {
      const v = document.querySelector('.hot-card .hot-views')
      return v ? cs(v).fontVariantNumeric : ''
    })(),
    viewsTextAlign: (() => {
      const v = document.querySelector('.hot-card .hot-views')
      return v ? cs(v).textAlign : ''
    })(),
    viewsMinWidth: (() => {
      const v = document.querySelector('.hot-card .hot-views')
      return v ? cs(v).minWidth : ''
    })(),
    rankToTitleGap: (() => {
      const v = document.querySelector('.hot-card .hot-views')
      if (!firstRank || !firstTitle) return -1
      return Math.round(firstTitle.getBoundingClientRect().left - firstRank.getBoundingClientRect().right)
    })(),
    titleToViewsGap: (() => {
      const v = document.querySelector('.hot-card .hot-views')
      if (!v || !firstTitle) return -1
      return Math.round(v.getBoundingClientRect().left - firstTitle.getBoundingClientRect().right)
    })(),
    titleColor: firstTitle ? cs(firstTitle).color : '',
    linkHoverDeclared: (() => {
      for (const sheet of Array.from(document.styleSheets)) {
        let rules = []
        try { rules = Array.from(sheet.cssRules) } catch { continue }
        for (const rule of rules) {
          const t = rule.cssText || ''
          if (t.includes('.hot-link') && t.includes(':hover') && t.includes('--surface-hover')) return true
        }
      }
      return false
    })(),
    titleCenter: titleRect ? { x: Math.round(titleRect.left + titleRect.width / 2), y: Math.round(titleRect.top + titleRect.height / 2) } : null,
    linkCenter: linkRect ? { x: Math.round(linkRect.left + linkRect.width / 2), y: Math.round(linkRect.top + linkRect.height / 2) } : null,
    pathname: location.pathname
  })
})()`

;(async () => {
  const profile = path.join(os.tmpdir(), 'dsh-smoke-hot-profile')
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
    let requestedHotUrl = ''
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.method === 'Network.requestWillBeSent') {
        const url = msg.params?.request?.url || ''
        if (url.includes('/articles/hot')) requestedHotUrl = url
      }
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
    const shoot = async (file, clip) => {
      // 侧边栏可能超出视口，需要 captureBeyondViewport 才能把折叠线以下的内容画出来
      const params = clip
        ? { format: 'png', clip: { ...clip, scale: 1 }, captureBeyondViewport: true }
        : { format: 'png', captureBeyondViewport: true }
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

    const homeReady = "!!document.querySelector('.hot-card .hot-item') || !!document.querySelector('.hot-card .side-empty')"
    const shotPrefix = process.env.SMOKE_SHOT

    // 浅色
    await evaluate("localStorage.removeItem('fcdzy_theme')").catch(() => {})
    await goto(`${BASE}/`, homeReady)
    await evaluate("localStorage.removeItem('fcdzy_theme'); document.documentElement.classList.remove('dark')")
    await send('Page.navigate', { url: `${BASE}/` })
    await sleep(1500)
    requestedHotUrl = ''
    await goto(`${BASE}/`, homeReady)

    const api = await (await fetch(`${API}/api/public/articles/hot?limit=${HOT_LIMIT}`)).json()
    const expected = api.data
    const light = await probe()
    if (shotPrefix) {
      await shoot(`${shotPrefix}-hot-light.png`, {
        x: 940,
        y: Math.max(0, light.hotCardPageTop - 30),
        width: 500,
        height: light.hotCardHeight + 60
      })
    }

    console.log(`首页侧边栏（${BASE}/），后端返回热门文章 ${expected.length} 篇\n`)

    console.log('【需求 1】侧边栏专题模块下方新增「热门文章」')
    check('侧边栏共有 4 个模块', light.sideCardCount === 4, light.sideTitles.join(' / '))
    check('存在热门文章板块', light.hasHotCard)
    check('标题为「热门文章」', light.hotTitleText === '热门文章', light.hotTitleText)
    check('位置在专题模块下方', light.hotCardTop > light.topicCardTop, `专题 top=${light.topicCardTop} < 热门 top=${light.hotCardTop}`)
    check('原有分类/标签/专题仍在', light.sideTitles.includes('分类') && light.sideTitles.includes('标签') && light.sideTitles.includes('专题'), light.sideTitles.join(' / '))

    console.log('\n【需求 2】按阅读量降序、最多 5 篇')
    check('前端按 limit=5 请求后端', requestedHotUrl.includes('/articles/hot') && requestedHotUrl.includes('limit=5'), requestedHotUrl.replace(BASE, ''))
    check('列表数量等于后端返回（不超过 5 篇）', light.hotCount === Math.min(expected.length, HOT_LIMIT), `${light.hotCount} 篇 / 后端 ${expected.length} 篇`)
    check('后端返回按阅读量降序', expected.every((a, i) => i === 0 || expected[i - 1].viewCount >= a.viewCount), expected.map((a) => `${a.title.slice(0, 6)}…=${a.viewCount}`).join(', '))
    check('渲染顺序与后端一致', light.hotTitles.join('|') === expected.map((a) => a.title).join('|'))

    console.log('\n【排版】热门条目序号与阅读数')
    check('序号为等宽方形徽标', light.rankSize === '21x21', light.rankSize)
    check('序号与标题首行垂直居中', Math.abs(light.rankCenterY - light.firstLineCenterY) <= 2, `序号中心 ${light.rankCenterY} / 首行中心 ${light.firstLineCenterY}`)
    check('阅读数与首行对齐', Math.abs(light.viewsCenterY - light.firstLineCenterY) <= 2, `阅读数中心 ${light.viewsCenterY} / 首行中心 ${light.firstLineCenterY}`)
    check('序号使用等宽数字', light.rankTabular.includes('tabular-nums'), light.rankTabular)
    check('阅读数等宽 + 右对齐 + 定宽', light.viewsTabular.includes('tabular-nums') && light.viewsTextAlign === 'right' && light.viewsMinWidth === '26px', `${light.viewsTabular} / ${light.viewsTextAlign} / ${light.viewsMinWidth}`)
    check('序号与标题、标题与阅读数的间距', light.rankToTitleGap >= 8 && light.titleToViewsGap >= 8, `序号→标题 ${light.rankToTitleGap}px / 标题→阅读数 ${light.titleToViewsGap}px`)

    console.log('\n【需求 3】点击标题跳转文章详情')
    check('每篇都有详情链接', light.hotSlugs.length === light.hotCount && light.hotSlugs.every((h) => h && h.startsWith('/article/')), light.hotSlugs[0])
    // 侧边栏位于折叠线以下时要先滚入可视区，否则鼠标事件会落在视口外
    await evaluate("document.querySelector('.hot-card .hot-title').scrollIntoView({ block: 'center' })")
    await sleep(600)
    const clickable = await probe()
    if (clickable.titleCenter) {
      await click(clickable.titleCenter.x, clickable.titleCenter.y)
      await sleep(1300)
      const after = await probe()
      const heading = await evaluate("document.querySelector('.article-title') ? document.querySelector('.article-title').textContent.trim() : (document.querySelector('h1') ? document.querySelector('h1').textContent.trim() : '')")
      check('跳转到对应文章详情页', after.pathname === light.hotSlugs[0], after.pathname)
      check('详情页标题与所点文章一致', heading.includes(expected[0].title.slice(0, 8)), `${heading.slice(0, 24)}`)
    }

    console.log('\n【需求 4】样式跟随全局主题')
    await goto(`${BASE}/`, homeReady)
    const lightCard = await probe()
    check('浅色下卡片为白色面板', lightCard.hotCardBg === 'rgb(255, 255, 255)', lightCard.hotCardBg)
    check('浅色下序号底色为主题变量', lightCard.rankBg === 'rgb(59, 130, 246)' || lightCard.rankBg === 'rgb(243, 244, 246)', `第 1 名 ${lightCard.rankBg}`)
    check('浅色下标题为主题文字色', lightCard.titleColor === 'rgb(75, 85, 99)', lightCard.titleColor)
    check('hover 使用主题变量（非写死色值）', lightCard.linkHoverDeclared)
    check('卡片声明了主题过渡', lightCard.hotCardTransition.includes('background-color'), lightCard.hotCardTransition)

    // 切换深色
    const toggle = JSON.parse(await evaluate(`(() => {
      const el = document.querySelector('.theme-toggle')
      const r = el ? el.getBoundingClientRect() : null
      return JSON.stringify(r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null)
    })()`))
    if (toggle) {
      await click(toggle.x, toggle.y)
      await sleep(800)
    }
    const dark = await probe()
    if (shotPrefix) {
      await shoot(`${shotPrefix}-hot-dark.png`, {
        x: 940,
        y: Math.max(0, dark.hotCardPageTop - 30),
        width: 500,
        height: dark.hotCardHeight + 60
      })
    }

    check('深色模式已生效', dark.isDark)
    check('深色下卡片为深色面板', dark.hotCardBg === 'rgb(23, 26, 33)', dark.hotCardBg)
    check('深色下边框跟随主题', dark.hotCardBorder === 'rgb(42, 48, 57)', dark.hotCardBorder)
    check('深色下标题为浅色文字', dark.titleColor === 'rgb(178, 185, 197)', dark.titleColor)
    check('深色下列表内容不变', dark.hotCount === light.hotCount && dark.hotTitles.join('|') === light.hotTitles.join('|'))

    console.log(failures === 0 ? '\n热门文章模块检查全部通过 ✅' : `\n共有 ${failures} 项未通过 ❌`)
  } finally {
    proc.kill()
  }
  process.exit(failures === 0 ? 0 : 1)
})().catch((error) => {
  console.error('热门文章检查失败:', error)
  process.exit(1)
})
