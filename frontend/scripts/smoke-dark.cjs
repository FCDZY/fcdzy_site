/**
 * 深色模式专项检查：浅色基线 / 切换 / 持久化 / Hero 遮罩 / 代码块暗色主题 + 行号 + 复制。
 * 用法：node scripts/smoke-dark.cjs
 * 可选：SMOKE_SHOT=<路径前缀> 输出 light/dark 截图
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5173'
const API = process.env.SMOKE_API || 'http://127.0.0.1:8080'
const DEBUG_PORT = 9777
const VIEW = { width: 1440, height: 900 }
const ARTICLE_SLUG = process.env.SMOKE_ARTICLE || 'build-personal-site'

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

const PAGE_PROBE = `(() => {
  const cs = (el, pseudo) => (el ? getComputedStyle(el, pseudo || undefined) : null)
  const body = document.body
  const card = document.querySelector('.article-card') || document.querySelector('.card')
  const side = document.querySelector('.side-card')
  const hero = document.querySelector('.hero')
  const overlay = document.querySelector('.hero-overlay')
  const homeBody = document.querySelector('.home-body')
  const header = document.querySelector('.site-header')
  const navLink = document.querySelector('.site-header .nav a')
  const toggle = document.querySelector('.theme-toggle')
  const rect = toggle ? toggle.getBoundingClientRect() : null
  return JSON.stringify({
    htmlClass: document.documentElement.className,
    isDark: document.documentElement.classList.contains('dark'),
    bodyBg: cs(body).backgroundColor,
    bodyColor: cs(body).color,
    bodyTransition: cs(body).transitionProperty,
    cardBg: card ? cs(card).backgroundColor : '',
    cardBorder: card ? cs(card).borderColor : '',
    cardShadow: card ? cs(card).boxShadow.slice(0, 40) : '',
    cardTitleColor: card && card.querySelector('.title') ? cs(card.querySelector('.title')).color : '',
    sideBg: side ? cs(side).backgroundColor : '',
    bodyBgImage: cs(body).backgroundImage.slice(0, 120),
    bodyBgAttachment: cs(body).backgroundAttachment,
    heroBgImage: hero ? cs(hero).backgroundImage : '',
    heroOverlay: overlay ? cs(overlay).backgroundImage.slice(0, 90) : '',
    homeBodyBg: homeBody ? cs(homeBody).backgroundColor : '',
    headerBg: header ? cs(header).backgroundColor : '',
    headerBorderWidth: header ? cs(header).borderBottomWidth : '',
    navColor: navLink ? cs(navLink).color : '',
    toggleExists: !!toggle,
    toggleCenter: rect ? { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) } : null,
    storedTheme: (() => { try { return localStorage.getItem('fcdzy_theme') } catch { return null } })()
  })
})()`

const CODE_PROBE = `(() => {
  const cs = (el, pseudo) => (el ? getComputedStyle(el, pseudo || undefined) : null)
  const pre = document.querySelector('.markdown-body pre.hljs')
  const code = pre ? pre.querySelector('code') : null
  const lines = pre ? Array.from(pre.querySelectorAll('.code-line')) : []
  const button = pre ? pre.querySelector('.code-copy') : null
  const keyword = pre ? pre.querySelector('.hljs-keyword, .hljs-string, .hljs-title, .hljs-attr') : null
  const rect = button ? button.getBoundingClientRect() : null
  return JSON.stringify({
    hasPre: !!pre,
    preBg: pre ? cs(pre).backgroundColor : '',
    preBorder: pre ? cs(pre).borderColor : '',
    preColor: pre ? cs(pre).color : '',
    lineCount: lines.length,
    firstLineNumber: lines.length ? cs(lines[0], '::before').content : '',
    secondLineNumber: lines.length > 1 ? cs(lines[1], '::before').content : '',
    counterReset: code ? cs(code).counterReset : '',
    counterIncrement: lines.length ? cs(lines[0]).counterIncrement : '',
    gutterWidth: lines.length ? cs(lines[0], '::before').width : '',
    lineNumberColor: lines.length ? cs(lines[0], '::before').color : '',
    langLabel: pre ? cs(pre, '::before').content : '',
    dataLang: pre ? pre.getAttribute('data-lang') : null,
    hasButton: !!button,
    buttonText: button ? button.textContent.trim() : '',
    buttonCenter: rect ? { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) } : null,
    tokenColor: keyword ? cs(keyword).color : '',
    copied: window.__copiedText || null,
    bodyBg: cs(document.body).backgroundColor,
    cardBg: (() => { const c = document.querySelector('.card'); return c ? cs(c).backgroundColor : '' })()
  })
})()`

;(async () => {
  const profile = path.join(os.tmpdir(), 'dsh-smoke-dark-profile')
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
    const probe = async (expr) => JSON.parse(await evaluate(expr))
    const click = async (x, y) => {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 })
    }
    const goto = async (url, ready) => {
      await send('Page.navigate', { url })
      for (let i = 0; i < 40; i++) {
        await sleep(300)
        if (await evaluate(ready).catch(() => false)) {
          await sleep(600)
          return
        }
      }
    }
    const shoot = async (file) => {
      const res = await send('Page.captureScreenshot', { format: 'png' })
      if (res.result?.data) fs.writeFileSync(file, Buffer.from(res.result.data, 'base64'))
    }
    const homeReady = "!!document.querySelector('.hero') && !!document.querySelector('.theme-toggle')"
    const articleReady = "!!document.querySelector('.markdown-body pre.hljs')"
    const shotPrefix = process.env.SMOKE_SHOT

    // ================= 浅色模式基线 =================
    await goto(`${BASE}/`, homeReady)
    // 确保从浅色开始
    await evaluate("localStorage.removeItem('fcdzy_theme'); document.documentElement.classList.remove('dark')")
    await send('Page.navigate', { url: `${BASE}/` })
    await sleep(2500)
    await goto(`${BASE}/`, homeReady)
    const light = await probe(PAGE_PROBE)
    if (shotPrefix) await shoot(`${shotPrefix}-light-home.png`)

    console.log(`浅色基线（${BASE}/）`)
    console.log('【需求 4】浅色模式原有样式保持不变')
    check('html 未带 dark 类', !light.isDark, light.htmlClass || '(空)')
    check('正文文字仍为 #1f2937', light.bodyColor === 'rgb(31, 41, 55)', light.bodyColor)
    check('卡片仍为半透明玻璃底', /^rgba\(/.test(light.cardBg) && light.cardBg !== 'rgba(0, 0, 0, 0)', light.cardBg)
    check('Hero 顶部遮罩仍为 0.45', light.heroOverlay.includes('rgba(0, 0, 0, 0.45)'), light.heroOverlay)

    console.log('\n【需求 1】全局背景展示正常')
    check('body 上有背景图', light.bodyBgImage.includes('url(') || light.bodyBgImage.includes('linear-gradient'), light.bodyBgImage.slice(0, 70))
    check('Hero 自身不再带背景', light.heroBgImage === 'none', light.heroBgImage)
    check('背景为固定定位', light.bodyBgAttachment === 'fixed', light.bodyBgAttachment)

    console.log('\n【需求 3】存在主题切换入口与过渡声明')
    check('导航栏有主题切换按钮', light.toggleExists)
    check('body 声明了颜色过渡', /background-color/.test(light.bodyTransition), light.bodyTransition)

    // ================= 切换到深色 =================
    console.log('\n切换深色（真实点击主题按钮）')
    await click(light.toggleCenter.x, light.toggleCenter.y)
    const during = await probe(PAGE_PROBE)
    check('切换瞬间挂上全局过渡类', during.htmlClass.includes('theme-transition'), during.htmlClass)
    check('已写入 localStorage 偏好', during.storedTheme === 'dark', String(during.storedTheme))

    await sleep(700)
    const dark = await probe(PAGE_PROBE)
    if (shotPrefix) await shoot(`${shotPrefix}-dark-home.png`)

    console.log('\n【需求 3】深色模式全局适配')
    check('html.dark 已生效', dark.isDark)
    check('页面底色转为深色', dark.bodyBg === 'rgb(15, 17, 21)', dark.bodyBg)
    check('正文颜色转为浅色', dark.bodyColor === 'rgb(232, 235, 240)', dark.bodyColor)
    check('卡片底色转深（半透明）', dark.cardBg.startsWith('rgba(23, 26, 33'), dark.cardBg)
    check('卡片文字为白色（深色玻璃上的标题）', dark.cardTitleColor === 'rgb(255, 255, 255)', dark.cardTitleColor)
    check('侧边栏卡片同步转深', dark.sideBg.startsWith('rgba(23, 26, 33'), dark.sideBg)
    check('首页 Hero 内导航保持白字（透明变体）', dark.navColor === 'rgb(255, 255, 255)', dark.navColor)
    check('首页内容区透明、露出全局背景', dark.homeBodyBg === 'rgba(0, 0, 0, 0)', dark.homeBodyBg)

    console.log('\n【需求 3】内页导航栏与首页统一为透明')
    await goto(`${BASE}/articles`, "!!document.querySelector('.article-card')")
    const darkInner = await probe(PAGE_PROBE)
    check('内页导航无底色（透出背景图）', darkInner.headerBg === 'rgba(0, 0, 0, 0)', darkInner.headerBg)
    check('内页导航文字为白色（不随主题变深）', (darkInner.navColor || '').startsWith('rgba(255, 255, 255'), darkInner.navColor)
    check('内页卡片同步转深（半透明）', darkInner.cardBg.startsWith('rgba(23, 26, 33'), darkInner.cardBg)

    console.log('\n【需求 1】深色模式全局背景')
    check('深色下仍有全局背景图', dark.bodyBgImage.includes('url(') || dark.bodyBgImage.includes('linear-gradient'), dark.bodyBgImage.slice(0, 70))
    check('深色下 Hero 遮罩提升到 0.5', dark.heroOverlay.includes('rgba(0, 0, 0, 0.5)'), dark.heroOverlay)
    check('深色下卡片为深色半透明', dark.cardBg.startsWith('rgba(23, 26, 33'), dark.cardBg)

    console.log('\n刷新后主题保持')
    await goto(`${BASE}/`, homeReady)
    const reloaded = await probe(PAGE_PROBE)
    check('刷新后仍为深色', reloaded.isDark && reloaded.bodyBg === 'rgb(15, 17, 21)', reloaded.bodyBg)

    // ================= 文章详情 + 代码块 =================
    await goto(`${BASE}/article/${ARTICLE_SLUG}`, articleReady)
    // 打桩剪贴板，便于断言复制内容
    await evaluate(`
      window.__copiedText = null
      const stub = {
        writeText: (t) => { window.__copiedText = t; return Promise.resolve() },
        readText: () => Promise.resolve(window.__copiedText || '')
      }
      try { Object.defineProperty(navigator, 'clipboard', { value: stub, configurable: true, writable: true }) }
      catch (e) { window.__clipboardStubError = String(e) }
    `)
    // 代码块通常在折叠线以下，先滚动到可视区域再点击
    await evaluate("document.querySelector('.markdown-body pre.hljs .code-copy').scrollIntoView({ block: 'center' })")
    await sleep(500)
    const darkCode = await probe(CODE_PROBE)

    console.log('\n【需求 2】深色模式代码块（暗色主题）')
    check('代码块存在', darkCode.hasPre)
    check('代码块背景为暗色 #0d1117', darkCode.preBg === 'rgb(13, 17, 23)', darkCode.preBg)
    check('代码块边框为暗色', darkCode.preBorder === 'rgb(33, 38, 45)', darkCode.preBorder)
    check('代码文字为浅色 #c9d1d9', darkCode.preColor === 'rgb(201, 209, 217)', darkCode.preColor)
    check('语法高亮使用暗色配色', darkCode.tokenColor !== '' && darkCode.tokenColor !== darkCode.preColor, darkCode.tokenColor)

    console.log('\n【需求 2】保留行号')
    // Chrome 对 ::before 的 content 返回未解析的 counter()，因此用「计数器声明 + 每行递增 + 槽位宽度」来验证
    check(
      '每行都挂了行号计数器',
      darkCode.lineCount > 1 && darkCode.counterReset.startsWith('code-line') &&
        darkCode.counterIncrement.startsWith('code-line') && darkCode.firstLineNumber.includes('counter('),
      `${darkCode.lineCount} 行；reset=${darkCode.counterReset}；increment=${darkCode.counterIncrement}`
    )
    check('行号槽位固定宽度', darkCode.gutterWidth === '40px', darkCode.gutterWidth)
    check('行号颜色适配暗色', darkCode.lineNumberColor === 'rgb(110, 118, 129)', darkCode.lineNumberColor)
    check('显示语言标签', darkCode.langLabel.length > 2 && darkCode.dataLang !== null, `${darkCode.langLabel} / ${darkCode.dataLang}`)
    if (shotPrefix) await shoot(`${shotPrefix}-dark-article.png`)

    console.log('\n【需求 2】保留一键复制')
    check('复制按钮存在', darkCode.hasButton && darkCode.buttonText === '复制', darkCode.buttonText)

    if (darkCode.buttonCenter) {
      await click(darkCode.buttonCenter.x, darkCode.buttonCenter.y)
      await sleep(400)
      const afterCopy = await probe(CODE_PROBE)
      const copied = afterCopy.copied || ''
      check('点击后复制到剪贴板', copied.length > 20 && copied.includes('\n'), `${copied.length} 字符 / ${copied.split('\n').length} 行`)
      check('复制内容不含行号', copied.startsWith('import') || !/^\s*1\s*\n/.test(copied), JSON.stringify(copied.slice(0, 20)))
      check('按钮给出已复制反馈', afterCopy.buttonText === '已复制', afterCopy.buttonText)
    }

    // ================= 切回浅色复核未被污染 =================
    // 导航栏已改为非吸顶（随页面滚走），切换主题前先回到顶部
    await evaluate('window.scrollTo({ top: 0, behavior: "auto" })')
    await sleep(400)
    const darkToggle = await probe(PAGE_PROBE)
    if (darkToggle.toggleCenter) {
      await click(darkToggle.toggleCenter.x, darkToggle.toggleCenter.y)
      await sleep(700)
    }
    const backLight = await probe(CODE_PROBE)
    console.log('\n【需求 4】切回浅色后代码块恢复原样')
    check('页面回到底色 #f7f8fa', backLight.bodyBg === 'rgb(247, 248, 250)', backLight.bodyBg)
    check('代码块恢复浅色背景 #f6f8fa', backLight.preBg === 'rgb(246, 248, 250)', backLight.preBg)
    check('行号与复制按钮依然存在', backLight.lineCount > 1 && backLight.hasButton)
    if (shotPrefix) {
      await shoot(`${shotPrefix}-light-article.png`)
      await goto(`${BASE}/`, homeReady)
    }

    console.log(failures === 0 ? '\n深色模式检查全部通过 ✅' : `\n共有 ${failures} 项未通过 ❌`)
  } finally {
    proc.kill()
  }
  process.exit(failures === 0 ? 0 : 1)
})().catch((error) => {
  console.error('深色模式检查失败:', error)
  process.exit(1)
})
