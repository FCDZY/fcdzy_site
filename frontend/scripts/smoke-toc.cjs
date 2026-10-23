/**
 * 文章详情页悬浮目录专项检查：
 * h1/h2/h3 自动提取、悬浮定位、滚动高亮、点击跳转、收起展开、深浅主题适配。
 *
 * 脚本会临时创建一篇带 h1/h2/h3 的长文章用于验证，结束时（含异常）自动删除。
 * 用法：node scripts/smoke-toc.cjs
 * 可选：SMOKE_SHOT=<路径前缀> 输出浅色/深色截图
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5173'
const API = process.env.SMOKE_API || 'http://127.0.0.1:8080'
const DEBUG_PORT = 9667
const WIDE = { width: 1600, height: 900 }
const NARROW = { width: 1280, height: 860 }

const HEADINGS = [
  { level: 1, text: '目录测试文章' },
  { level: 2, text: '第一节 背景说明' },
  { level: 3, text: '1.1 约束条件' },
  { level: 3, text: '1.2 设计目标' },
  { level: 2, text: '第二节 实现细节' },
  { level: 3, text: '2.1 数据结构' },
  { level: 2, text: '第三节 验证方式' }
]

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
  const cs = (el) => (el ? getComputedStyle(el) : null)
  const toc = document.querySelector('.article-toc')
  const panel = document.querySelector('.toc-panel')
  const pill = document.querySelector('.toc-pill')
  const list = document.querySelector('.toc-list')
  const items = Array.from(document.querySelectorAll('.toc-item'))
  const active = document.querySelector('.toc-item.active')
  const article = document.querySelector('.markdown-body')
  const card = article ? article.closest('.card') : null
  const panelRect = panel ? panel.getBoundingClientRect() : null
  const pillRect = pill ? pill.getBoundingClientRect() : null
  const articleRect = article ? article.getBoundingClientRect() : null
  return JSON.stringify({
    hasToc: !!toc,
    tocPosition: toc ? cs(toc).position : '',
    expanded: !!panel,
    collapsed: !!pill,
    tocLeft: panelRect ? Math.round(panelRect.left) : (pillRect ? Math.round(pillRect.left) : -1),
    tocRight: panelRect ? Math.round(panelRect.right) : (pillRect ? Math.round(pillRect.right) : -1),
    articleLeft: articleRect ? Math.round(articleRect.left) : -1,
    articleWidth: articleRect ? Math.round(articleRect.width) : -1,
    cardWidth: card ? Math.round(card.getBoundingClientRect().width) : -1,
    itemCount: items.length,
    itemTexts: items.map((li) => (li.querySelector('a') ? li.querySelector('a').textContent.trim() : '')),
    itemLevels: items.map((li) => (li.className.match(/level-(\\d)/) || [])[1] || ''),
    itemIndent: items.map((li) => {
      const a = li.querySelector('a')
      return a ? Math.round(parseFloat(cs(a).paddingLeft)) : -1
    }),
    activeText: active ? active.textContent.trim() : '',
    activeColor: active ? cs(active.querySelector('a')).color : '',
    activeBg: active ? cs(active.querySelector('a')).backgroundColor : '',
    idleColor: items.length && items[0] !== active && items[0].querySelector('a') ? cs(items[0].querySelector('a')).color : '',
    panelBg: panel ? cs(panel).backgroundColor : '',
    panelBorder: panel ? cs(panel).borderColor : '',
    panelShadow: panel ? cs(panel).boxShadow.slice(0, 30) : '',
    pillText: pill ? pill.textContent.trim() : '',
    scrollY: Math.round(window.scrollY),
    docHeight: document.documentElement.scrollHeight,
    viewH: window.innerHeight,
    isDark: document.documentElement.classList.contains('dark'),
    headingTops: Array.from(document.querySelectorAll('.markdown-body h1, .markdown-body h2, .markdown-body h3'))
      .map((h) => ({ id: h.id, top: Math.round(h.getBoundingClientRect().top + window.scrollY), text: h.textContent.trim() }))
  })
})()`

let tempArticleId = null

async function apiLogin() {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  })
  return (await res.json()).data.token
}

async function createTempArticle(token) {
  const content = HEADINGS.map(
    (h) => `${'#'.repeat(h.level)} ${h.text}\n\n` + '这里是一段用于撑开页面的正文内容，方便验证目录的滚动高亮与点击跳转。'.repeat(6) + '\n'
  ).join('\n')
  const res = await fetch(`${API}/api/admin/articles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      title: '目录功能测试文章',
      slug: `toc-test-${Date.now().toString(36)}`,
      summary: '用于验证悬浮目录的临时文章，检查完成后自动删除。',
      content,
      coverImage: null,
      status: 'PUBLISHED',
      categoryId: null,
      tagIds: [],
      topped: false
    })
  })
  const body = await res.json()
  return body.data
}

async function deleteArticle(token, id) {
  if (!id) return
  await fetch(`${API}/api/admin/articles/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
}

;(async () => {
  const token = await apiLogin()
  const article = await createTempArticle(token)
  tempArticleId = article.id
  console.log(`已创建测试文章 #${tempArticleId}（含 ${HEADINGS.length} 个 h1/h2/h3 标题）\n`)

  const profile = path.join(os.tmpdir(), 'dsh-smoke-toc-profile')
  const proc = spawn(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-extensions',
      '--hide-scrollbars',
      `--window-size=${WIDE.width},${WIDE.height}`,
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
    const clickEl = async (selector) => {
      const box = JSON.parse(
        await evaluate(`(() => {
          const el = document.querySelector(${JSON.stringify(selector)})
          const r = el ? el.getBoundingClientRect() : null
          return JSON.stringify(r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null)
        })()`)
      )
      if (!box) return false
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: 0 })
      return true
    }
    const shoot = async (file, clip) => {
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
          await sleep(800)
          return
        }
      }
    }
    const scrollToY = async (y) => {
      await evaluate(`window.scrollTo({ top: ${y}, behavior: 'auto' })`)
      await sleep(500)
    }

    const artReady = "!!document.querySelector('.markdown-body h1') && !!document.querySelector('.article-toc')"
    const shotPrefix = process.env.SMOKE_SHOT

    await goto(`${BASE}/`, "!!document.querySelector('#app')")
    await evaluate("localStorage.removeItem('fcdzy_theme'); localStorage.removeItem('fcdzy_toc_collapsed')")
    await goto(`${BASE}/article/${article.slug}`, artReady)

    const wide = await probe()
    console.log(`宽屏 ${WIDE.width}×${WIDE.height}，文章正文宽 ${wide.articleWidth}px\n`)

    console.log('【需求】自动提取 h1/h2/h3')
    check('目录已渲染', wide.hasToc)
    check('目录项数量与标题一致', wide.itemCount === HEADINGS.length, `${wide.itemCount} 项 / 应为 ${HEADINGS.length}`)
    check('顺序与层级正确', wide.itemTexts.join('|') === HEADINGS.map((h) => h.text).join('|') && wide.itemLevels.join('') === HEADINGS.map((h) => h.level).join(''), `${wide.itemTexts.join(' / ')}`)
    check('按层级缩进', wide.itemIndent[0] < wide.itemIndent[1] && wide.itemIndent[1] < wide.itemIndent[2], `h1=${wide.itemIndent[0]} h2=${wide.itemIndent[1]} h3=${wide.itemIndent[2]}px`)

    console.log('\n【需求】悬浮目录（不占正文栅格）')
    check('目录为 fixed 悬浮', wide.tocPosition === 'fixed', wide.tocPosition)
    check('位于正文左侧留白处', wide.tocRight < wide.articleLeft, `目录右边 ${wide.tocRight} < 正文左边 ${wide.articleLeft}`)
    check('正文占满卡片宽度（不再被目录挤占）', Math.abs(wide.articleWidth - (wide.cardWidth - 2)) <= 70, `正文 ${wide.articleWidth}px / 卡片 ${wide.cardWidth}px`)
    check('宽屏默认展开', wide.expanded && !wide.collapsed, `panel=${wide.expanded} pill=${wide.collapsed}`)
    if (shotPrefix) await shoot(`${shotPrefix}-toc-light.png`, { x: Math.max(0, wide.tocLeft - 20), y: 60, width: wide.articleWidth + 300, height: 520 })

    console.log('\n【需求】滚动时高亮当前阅读章节')
    const targets = wide.headingTops
    // 依次滚到第 3、5、7 个标题，检查高亮是否跟随
    for (const [idx, label] of [[2, '第 3 个标题'], [4, '第 5 个标题'], [6, '第 7 个标题']]) {
      await scrollToY(Math.max(0, targets[idx].top - 90))
      const p = await probe()
      check(`滚动到${label}时高亮跟随`, p.activeText === targets[idx].text, `高亮「${p.activeText}」/ 期望「${targets[idx].text}」`)
    }
    const scrolled = await probe()
    check('高亮项有主题色样式', scrolled.activeBg !== 'rgba(0, 0, 0, 0)' && scrolled.activeColor !== scrolled.idleColor, `${scrolled.activeColor} / ${scrolled.activeBg}`)

    console.log('\n【需求】点击目录跳转到对应章节')
    await scrollToY(0)
    await clickEl('.toc-item:nth-child(5) a')
    await sleep(1500)
    const jumped = await probe()
    const targetTop = jumped.headingTops[4].top
    check('点击后滚动到该章节', Math.abs(jumped.scrollY - (targetTop - 80)) <= 40, `scrollY=${jumped.scrollY}，标题位置=${targetTop}`)
    check('点击后该项高亮', jumped.activeText === HEADINGS[4].text, jumped.activeText)

    console.log('\n【需求】目录可收起')
    await clickEl('.toc-collapse')
    await sleep(600)
    const afterCollapse = await probe()
    check('收起后隐藏目录列表', !afterCollapse.expanded && afterCollapse.collapsed, `panel=${afterCollapse.expanded} pill=${afterCollapse.collapsed}`)
    check('收起后显示「目录」胶囊', afterCollapse.pillText.includes('目录'), afterCollapse.pillText)
    await clickEl('.toc-pill')
    await sleep(600)
    const afterExpand = await probe()
    check('再次点击可展开', afterExpand.expanded && !afterExpand.collapsed)
    check('展开后保留在 localStorage', (await evaluate("localStorage.getItem('fcdzy_toc_collapsed')")) === '0', String(await evaluate("localStorage.getItem('fcdzy_toc_collapsed')")))

    console.log('\n【需求】深浅色适配')
    const light = await probe()
    check('浅色下目录为白色面板', light.panelBg === 'rgb(255, 255, 255)', light.panelBg)
    check('浅色下描边跟随主题', light.panelBorder === 'rgb(229, 231, 235)', light.panelBorder)
    check('浅色下高亮项为主题色', light.activeColor === 'rgb(37, 99, 235)', light.activeColor)

    await scrollToY(0)
    await clickEl('.theme-toggle')
    await sleep(900)
    const dark = await probe()
    if (shotPrefix) await shoot(`${shotPrefix}-toc-dark.png`, { x: Math.max(0, dark.tocLeft - 20), y: 60, width: dark.articleWidth + 300, height: 520 })
    check('深色模式已生效', dark.isDark)
    check('深色下目录为深色面板', dark.panelBg === 'rgb(23, 26, 33)', dark.panelBg)
    check('深色下描边跟随主题', dark.panelBorder === 'rgb(42, 48, 57)', dark.panelBorder)
    check('深色下高亮项为主题色', dark.activeColor === 'rgb(147, 197, 253)', dark.activeColor)
    check('深色下目录项仍完整', dark.itemCount === HEADINGS.length)

    console.log('\n【需求】窄屏与其它页面')
    await send('Emulation.setDeviceMetricsOverride', { width: NARROW.width, height: NARROW.height, deviceScaleFactor: 1, mobile: false })
    await evaluate("localStorage.removeItem('fcdzy_toc_collapsed')")
    await send('Page.navigate', { url: `${BASE}/article/${article.slug}` })
    await sleep(3000)
    const narrow = await probe()
    check('窄屏默认收起为胶囊', narrow.collapsed && !narrow.expanded, `pill=${narrow.collapsed}`)
    await clickEl('.toc-pill')
    await sleep(600)
    const narrowOpen = await probe()
    check('窄屏点开后可悬浮查看', narrowOpen.expanded && narrowOpen.tocLeft >= 0, `left=${narrowOpen.tocLeft}`)
    await send('Emulation.clearDeviceMetricsOverride')

    for (const [name, url, ready] of [
      ['首页', `${BASE}/`, "!!document.querySelector('.article-card')"],
      ['文章列表页', `${BASE}/articles`, "!!document.querySelector('.article-card')"]
    ]) {
      await goto(url, ready)
      const p = JSON.parse(await evaluate("JSON.stringify({ hasToc: !!document.querySelector('.article-toc') })"))
      check(`${name}不出现目录组件`, !p.hasToc)
    }

    console.log(failures === 0 ? '\n悬浮目录检查全部通过 ✅' : `\n共有 ${failures} 项未通过 ❌`)
  } finally {
    proc.kill()
    await deleteArticle(token, tempArticleId)
    const res = await fetch(`${API}/api/public/articles?pageNum=1&pageSize=1`)
    const total = (await res.json()).data.total
    console.log(`\n已删除测试文章 #${tempArticleId}，当前已发布 ${total} 篇`)
  }
  process.exit(failures === 0 ? 0 : 1)
})().catch((error) => {
  console.error('悬浮目录检查失败:', error)
  process.exit(1)
})
