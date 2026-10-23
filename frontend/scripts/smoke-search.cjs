/**
 * 顶部导航「全站搜索」专项检查：
 * 位置（关于右侧 / 月亮左侧）、收起态只显示图标、hover/点击展开、毛玻璃样式、
 * 回车与点击两种触发方式、标题/简介/正文三处模糊查询、内页与移动端可用。
 *
 * 用法：node scripts/smoke-search.cjs
 * 可选：SMOKE_SHOT=<路径前缀> 输出收起/展开截图
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5173'
const DEBUG_PORT = 9671
const VIEW = { width: 1440, height: 900 }
/** 只出现在文章正文里的关键词（标题、简介都没有），用来证明正文也被检索 */
const CONTENT_ONLY = 'RestController'

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

const alphaOf = (color) => {
  const m = /rgba?\([^)]*,\s*([\d.]+)\s*\)/.exec(color || '')
  return m ? Number(m[1]) : 1
}

const PROBE = `(() => {
  const cs = (el, pseudo) => (el ? getComputedStyle(el, pseudo || undefined) : null)
  const search = document.querySelector('.site-search')
  const pill = document.querySelector('.site-search .search-pill')
  const input = document.querySelector('.site-search .search-input')
  const btn = document.querySelector('.site-search .search-btn')
  const toggle = document.querySelector('.theme-toggle')
  const navLinks = Array.from(document.querySelectorAll('.site-header .nav a'))
  const about = navLinks.find((a) => a.textContent.trim() === '关于') || null
  const rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom), width: Math.round(b.width), height: Math.round(b.height), cx: Math.round(b.left + b.width / 2), cy: Math.round(b.top + b.height / 2) } }
  const titles = Array.from(document.querySelectorAll('.article-card .title')).map((el) => el.textContent.trim())
  return JSON.stringify({
    path: location.pathname + location.search,
    keywordParam: new URLSearchParams(location.search).get('keyword'),
    hasSearch: !!search,
    hasInput: !!input,
    pill: rect(pill),
    about: rect(about),
    toggle: rect(toggle),
    iconRect: rect(btn),
    pillBg: pill ? cs(pill).backgroundColor : '',
    pillBorderColor: pill ? cs(pill).borderTopColor : '',
    pillBorderWidth: pill ? cs(pill).borderTopWidth : '',
    pillBlur: pill ? (cs(pill).backdropFilter || cs(pill).webkitBackdropFilter) : '',
    pillRadius: pill ? cs(pill).borderRadius : '',
    inputOpacity: input ? cs(input).opacity : '',
    inputPointer: input ? cs(input).pointerEvents : '',
    inputColor: input ? cs(input).color : '',
    inputFontSize: input ? cs(input).fontSize : '',
    inputPlaceholder: input ? input.getAttribute('placeholder') : '',
    iconColor: btn ? cs(btn).color : '',
    focusTag: document.activeElement ? document.activeElement.tagName.toLowerCase() : '',
    focusIsInput: !!(input && document.activeElement === input),
    cardCount: document.querySelectorAll('.article-card').length,
    titles,
    totalText: (() => { const el = document.querySelector('.page-subtitle'); return el ? el.textContent.trim() : '' })(),
    emptyText: (() => { const el = document.querySelector('.empty'); return el ? el.textContent.trim() : '' })()
  })
})()`

;(async () => {
  const profile = path.join(os.tmpdir(), 'dsh-smoke-search-profile')
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
    const goto = async (url, ready = "!!document.querySelector('.site-search')") => {
      await send('Page.navigate', { url })
      for (let i = 0; i < 40; i++) {
        await sleep(300)
        if (await evaluate(ready).catch(() => false)) {
          await sleep(700)
          return
        }
      }
    }
    const moveMouse = async (x, y) => {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 })
      await sleep(350)
    }
    const click = async (x, y) => {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 })
      await sleep(120)
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 })
      await sleep(350)
    }
    const pressEnter = async () => {
      for (const type of ['rawKeyDown', 'char', 'keyUp']) {
        await send('Input.dispatchKeyEvent', {
          type,
          key: 'Enter',
          code: 'Enter',
          windowsVirtualKeyCode: 13,
          nativeVirtualKeyCode: 13,
          text: type === 'char' ? '\r' : undefined
        })
      }
      await sleep(900)
    }
    const pressEsc = async () => {
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
      await sleep(400)
    }
    const typeText = async (text) => {
      await send('Input.insertText', { text })
      await sleep(250)
    }
    const shoot = async (file) => {
      const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
      if (res.result?.data) fs.writeFileSync(file, Buffer.from(res.result.data, 'base64'))
    }

    const shotPrefix = process.env.SMOKE_SHOT

    // ================= 首页：位置与收起态 =================
    await goto(`${BASE}/`)
    const collapsed = await probe()
    console.log('【需求 1】位置：导航行内、【关于】右侧、主题切换按钮左侧')
    check('搜索框已渲染在导航栏内', collapsed.hasSearch && collapsed.hasInput)
    check(
      '位于【关于】右侧',
      collapsed.about && collapsed.pill && collapsed.pill.left >= collapsed.about.right,
      `关于 right=${collapsed.about ? collapsed.about.right : 'n/a'} / 搜索 left=${collapsed.pill ? collapsed.pill.left : 'n/a'}`
    )
    check(
      '位于主题切换按钮左侧',
      collapsed.toggle && collapsed.pill && collapsed.pill.right <= collapsed.toggle.left,
      `搜索 right=${collapsed.pill ? collapsed.pill.right : 'n/a'} / 月亮 left=${collapsed.toggle ? collapsed.toggle.left : 'n/a'}`
    )

    console.log('\n【需求 2】收起态只显示放大镜图标')
    check('胶囊宽度等于图标尺寸（38px）', collapsed.pill && collapsed.pill.width === 38, `${collapsed.pill ? collapsed.pill.width : 'n/a'}px`)
    check('输入框不可见且不可点击', collapsed.inputOpacity === '0' && collapsed.inputPointer === 'none', `opacity=${collapsed.inputOpacity} / pointer=${collapsed.inputPointer}`)
    check('图标为白色（与导航一致）', collapsed.iconColor === 'rgb(255, 255, 255)', collapsed.iconColor)
    if (shotPrefix) await shoot(`${shotPrefix}-search-collapsed.png`)

    console.log('\n【需求 2】毛玻璃半透明样式')
    check('使用 backdrop-filter 模糊', collapsed.pillBlur.includes('blur'), collapsed.pillBlur)
    check('半透明浅色底（非白色实底）', alphaOf(collapsed.pillBg) > 0 && alphaOf(collapsed.pillBg) < 1, `${collapsed.pillBg}（alpha=${alphaOf(collapsed.pillBg)}）`)
    check('边框为柔和半透明（非白色硬边框）', collapsed.pillBorderWidth === '1px' && alphaOf(collapsed.pillBorderColor) < 0.6, `${collapsed.pillBorderWidth} / ${collapsed.pillBorderColor}`)
    check('圆角为胶囊形', parseFloat(collapsed.pillRadius) >= 18, collapsed.pillRadius)
    check('输入文字为浅色', collapsed.inputColor === 'rgb(255, 255, 255)', collapsed.inputColor)

    // ================= hover 展开 =================
    console.log('\n【需求 2】hover 展开输入框')
    await moveMouse(collapsed.pill.cx, collapsed.pill.cy)
    const hovered = await probe()
    check('hover 后胶囊展开', hovered.pill.width > 150, `${hovered.pill.width}px`)
    check('hover 后输入框可见可点击', hovered.inputOpacity === '1' && hovered.inputPointer === 'auto', `opacity=${hovered.inputOpacity} / pointer=${hovered.inputPointer}`)
    check('展开后仍位于月亮左侧（未挤动导航）', hovered.pill.right <= hovered.toggle.left, `搜索 right=${hovered.pill.right} / 月亮 left=${hovered.toggle.left}`)
    check('展开后【关于】位置未被挤动', hovered.about.left === collapsed.about.left, `展开前 ${collapsed.about.left} / 展开后 ${hovered.about.left}`)
    if (shotPrefix) await shoot(`${shotPrefix}-search-open.png`)

    // ================= 点击展开 + 回车触发 =================
    console.log('\n【需求 3】点击图标展开并聚焦，回车触发搜索（正文关键词）')
    await moveMouse(5, 5)
    await sleep(300)
    const beforeClick = await probe()
    check('移开鼠标后自动收起', beforeClick.pill.width === 38, `${beforeClick.pill.width}px`)
    await click(beforeClick.iconRect.cx, beforeClick.iconRect.cy)
    const afterClick = await probe()
    check('点击后展开', afterClick.pill.width > 150, `${afterClick.pill.width}px`)
    check('点击后输入框获得焦点', afterClick.focusIsInput, afterClick.focusTag)
    await typeText(CONTENT_ONLY)
    const typed = await probe()
    check('输入内容已进入输入框', (await evaluate("document.querySelector('.site-search .search-input').value")) === CONTENT_ONLY, CONTENT_ONLY)
    await pressEnter()
    const afterEnter = await probe()
    check('回车后跳转到文章列表并带上关键词', afterEnter.path === `/articles?keyword=${CONTENT_ONLY}` && afterEnter.keywordParam === CONTENT_ONLY, `${afterEnter.path}（keyword=${afterEnter.keywordParam}）`)
    check('结果为正文命中的文章（证明正文参与检索）', afterEnter.cardCount >= 1, `${afterEnter.cardCount} 条：${afterEnter.titles.join(' / ')}`)

    // ================= 点击图标触发 =================
    console.log('\n【需求 3】点击搜索图标触发（标题/简介关键词）')
    await goto(`${BASE}/`)
    const home2 = await probe()
    await moveMouse(home2.iconRect.cx, home2.iconRect.cy)
    await click(home2.iconRect.cx, home2.iconRect.cy)
    await typeText('索引')
    const typed2 = await evaluate("document.querySelector('.site-search .search-input').value")
    await click((await probe()).iconRect.cx, (await probe()).iconRect.cy)
    const afterClickSearch = await probe()
    check('输入中文关键词', typed2 === '索引', typed2)
    check(
      '点击图标后跳转到文章列表并带上关键词',
      afterClickSearch.path.startsWith('/articles?keyword=') && afterClickSearch.keywordParam === '索引',
      `${afterClickSearch.path}（解码后 keyword=${afterClickSearch.keywordParam}）`
    )
    check('返回匹配结果', afterClickSearch.cardCount >= 1, `${afterClickSearch.cardCount} 条`)

    // ================= 空输入与 ESC =================
    console.log('\n【需求 3】空关键词不跳转、ESC 收起')
    await goto(`${BASE}/`)
    const home3 = await probe()
    await click(home3.iconRect.cx, home3.iconRect.cy)
    await pressEnter()
    const afterEmptyEnter = await probe()
    check('空关键词回车不跳转', afterEmptyEnter.path === '/', afterEmptyEnter.path)
    await typeText('abc')
    await pressEsc()
    await moveMouse(5, 5)
    await sleep(300)
    const afterEsc = await probe()
    check('ESC 后收起', afterEsc.pill.width === 38 && afterEsc.inputOpacity === '0', `${afterEsc.pill.width}px / opacity=${afterEsc.inputOpacity}`)
    const escValue = await evaluate("document.querySelector('.site-search .search-input').value")
    check('ESC 后输入框已清空', escValue === '', `"${escValue}"`)

    // ================= 内页也有搜索 =================
    console.log('\n【需求 1】内页同样可用')
    await goto(`${BASE}/articles`, "!!document.querySelector('.article-card') && !!document.querySelector('.site-search')")
    const inner = await probe()
    check('内页导航同样带搜索框', inner.hasSearch && inner.pill.width === 38, `${inner.pill ? inner.pill.width : 'n/a'}px`)
    check('内页搜索同样在【关于】右侧', inner.pill.left >= inner.about.right, `关于 right=${inner.about.right} / 搜索 left=${inner.pill.left}`)

    // ================= 移动端 =================
    console.log('\n【移动端】搜索图标保留且不溢出')
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    await goto(`${BASE}/`)
    const mob = await probe()
    check('移动端搜索图标可见', mob.hasSearch && mob.pill.width === 38, `${mob.pill ? mob.pill.width : 'n/a'}px`)
    check('移动端搜索框未溢出视口', mob.pill.right <= 390, `right=${mob.pill.right}`)
    await moveMouse(mob.pill.cx, mob.pill.cy)
    const mobOpen = await probe()
    check('移动端展开后仍不溢出', mobOpen.pill.width > 120 && mobOpen.pill.left >= 0, `left=${mobOpen.pill.left} / width=${mobOpen.pill.width}`)
    await send('Emulation.clearDeviceMetricsOverride')

    console.log(failures === 0 ? '\n全站搜索检查全部通过 ✅' : `\n共有 ${failures} 项未通过 ❌`)
  } finally {
    proc.kill()
  }
  process.exit(failures === 0 ? 0 : 1)
})().catch((error) => {
  console.error('全站搜索检查失败:', error)
  process.exit(1)
})
