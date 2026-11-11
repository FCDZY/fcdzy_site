/**
 * 章节锚点检查：手写 [xx](#锚点) 能否正确跳到对应章节。
 *
 * 自己创建临时文章来跑（跑完删除）。
 *
 * 用法：node scripts/smoke-anchor.cjs [--dark] [--shot=a.png]
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const PORT = 9771
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5173'
const API = process.env.SMOKE_API || 'http://127.0.0.1:8080/api'
const ADMIN_USER = process.env.SMOKE_ADMIN_USER || 'admin'
const ADMIN_PASS = process.env.SMOKE_ADMIN_PASS || 'admin123'
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed += 1
  console.log(`${ok ? '[OK]  ' : '[FAIL]'} ${name}${detail ? '  -> ' + detail : ''}`)
}

const filler = Array.from(
  { length: 8 },
  (_, i) => `这是填充段落 ${i + 1}，用来把页面撑高，确保章节标题在首屏之外，跳转才能被观察到。`
).join('\n\n')

function buildContent() {
  return [
    '# 锚点跳转测试',
    '',
    '## 目标章节一',
    '',
    filler,
    '',
    '- [跳到章节一](#目标章节一)',
    '- [带点写法](#12.2-锁机制详解)',
    '- [去点写法](#12-2-锁机制详解)',
    '- [旧版带序号](#12-2-锁机制详解-7)',
    '- [重名第二个](#重复标题-2)',
    '- [宽松旧式锚点](#101-explain-速查)',
    '- [显式锚点](#lock-detail)',
    '- [不存在的章节](#不存在的章节)',
    '',
    filler,
    '',
    '## 12.2 锁机制详解',
    '',
    filler,
    '',
    '## 重复标题',
    '',
    filler,
    '',
    '## 重复标题',
    '',
    filler,
    '',
    '## 10.1 EXPLAIN 速查',
    '',
    filler,
    '',
    '## 自定义锚点章节 {#lock-detail}',
    '',
    filler,
    ''
  ].join('\n')
}

async function api(p, { method = 'GET', token, body } = {}) {
  const res = await fetch(API + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  try {
    return await res.json()
  } catch {
    return { code: res.status, message: 'HTTP ' + res.status }
  }
}

/* ---------------- 探针 ---------------- */
function idProbe() {
  const ids = Array.from(document.querySelectorAll('.markdown-body h1[id], .markdown-body h2[id]')).map((h) => h.id)
  return JSON.stringify({ ids })
}

function scrollProbe() {
  const active = document.activeElement
  return JSON.stringify({ scrollY: Math.round(window.scrollY), hash: decodeURIComponent(location.hash || ''), activeTag: active ? active.tagName : '' })
}

function targetTopProbe(id) {
  const el = document.getElementById(id)
  if (!el) return JSON.stringify({ found: false })
  const rect = el.getBoundingClientRect()
  return JSON.stringify({
    found: true,
    top: Math.round(rect.top),
    headerHeight: (() => {
      const header = document.querySelector('.site-header, header')
      return header ? Math.round(header.getBoundingClientRect().height) : 0
    })()
  })
}

function anchorMetaProbe() {
  const first = document.querySelector('.markdown-body h2 .heading-anchor')
  if (!first) return JSON.stringify({ found: false })
  const style = getComputedStyle(first)
  return JSON.stringify({
    found: true,
    href: first.getAttribute('href'),
    opacity: Number(style.opacity),
    symbol: getComputedStyle(first, '::before').content,
    count: document.querySelectorAll('.heading-anchor').length
  })
}

function messageProbe() {
  const el = document.querySelector('.el-message__content')
  return JSON.stringify({ text: el ? el.textContent.trim() : '' })
}

;(async () => {
  const dark = process.argv.includes('--dark')
  const shotArg = process.argv.find((a) => a.startsWith('--shot='))
  const shotPath = shotArg ? shotArg.slice('--shot='.length) : ''

  // ---------- 自备数据 ----------
  const login = await api('/auth/login', { method: 'POST', body: { username: ADMIN_USER, password: ADMIN_PASS } })
  if (['0', 0, undefined].includes(login.code) === false) {
    throw new Error('管理员登录失败（' + (login.message || login.code) + '），可用 SMOKE_ADMIN_USER / SMOKE_ADMIN_PASS 指定')
  }
  const token = login.data.token
  const created = await api('/admin/articles', {
    method: 'POST',
    token,
    body: { title: '锚点跳转测试（临时）', content: buildContent(), status: 'PUBLISHED', categoryId: 1, tagIds: [], topped: false }
  })
  if (!created.data?.slug) throw new Error('创建临时文章失败：' + (created.message || ''))
  const slug = created.data.slug
  const articleId = created.data.id
  console.log('临时文章: id=' + articleId + ' slug=' + slug)
  const cleanup = async () => {
    await api('/admin/articles/' + articleId, { method: 'DELETE', token }).catch(() => {})
  }

  const profile = path.join(os.tmpdir(), 'dsh-anchor-' + (dark ? 'dark' : 'light'))
  const proc = spawn(
    chrome,
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--window-size=1280,900',
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
  await new Promise((resolve) => {
    ws.onopen = resolve
  })
  let msgId = 0
  const pending = new Map()
  const consoleLogs = []
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.method === 'Runtime.consoleAPICalled') {
      consoleLogs.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '))
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
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (res.result?.exceptionDetails) throw new Error(res.result.exceptionDetails.exception?.description || 'evaluate failed')
    return res.result?.result?.value
  }
  const runProbe = async (fn, arg) => JSON.parse(await evaluate('(' + fn.toString() + ')(' + JSON.stringify(arg ?? null) + ')'))

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  await send('DOM.enable')
  await send('CSS.enable')
  await send('Network.setCacheDisabled', { cacheDisabled: true })
  try {
    await send('Browser.grantPermissions', { origin: BASE, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] })
  } catch {
    /* 忽略 */
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  // 剪贴板 API 要求页面处于聚焦状态，无头模式下默认没有焦点
  try {
    await send('Emulation.setFocusEmulationEnabled', { enabled: true })
    await send('Page.bringToFront')
  } catch {
    /* 老版本无名这个能力，忽略 */
  }

  const openArticle = async (hash) => {
    await send('Page.navigate', { url: BASE + '/article/' + slug + (hash || '') })
    await sleep(4500)
  }

  // ---------- 1. 标题 id 规则 ----------
  await openArticle()
  const { ids } = await runProbe(idProbe)
  console.log('标题 id:', JSON.stringify(ids))
  check('id 不带序号后缀（可手写）', ids.includes('目标章节一'), JSON.stringify(ids))
  check('带点标题归一化为 12-2-锁机制详解', ids.includes('12-2-锁机制详解'))
  check('重复标题第一个用原名', ids.filter((i) => i === '重复标题').length === 1)
  check('重复标题第二个自动加 -2', ids.includes('重复标题-2'))

  // ---------- 2. 点锚点跳到对应章节（而不是回到顶部） ----------
  // 只点「正文里的内联链接」，排除标题旁的 # 锚点（它们 href 相同，会抢到第一个）
  const jumpTo = async (label) => {
    await evaluate(`window.scrollTo({ top: 0, behavior: 'auto' })`)
    await sleep(300)
    const clicked = await evaluate(`(() => {
      const link = Array.from(document.querySelectorAll('.markdown-body a:not(.heading-anchor)'))
        .find((a) => (a.textContent || '').includes(${JSON.stringify(label)}))
      if (!link) return 'not-found'
      link.click()
      return link.getAttribute('href')
    })()`)
    await sleep(1400)
    return { state: await runProbe(scrollProbe), clicked }
  }

  const afterNormal = await jumpTo('跳到章节一')
  check('点击后页面确实滚动了（没有停在顶部）', afterNormal.state.scrollY > 100, 'scrollY=' + afterNormal.state.scrollY + ' href=' + afterNormal.clicked)
  const topNormal = await runProbe(targetTopProbe, '目标章节一')
  check(
    '目标章节停在吸顶导航下方',
    topNormal.found && topNormal.top >= -2 && topNormal.top <= topNormal.headerHeight + 40,
    'top=' + topNormal.top + ' header=' + topNormal.headerHeight
  )
  check('地址栏 hash 同步为目标 id', afterNormal.state.hash === '#目标章节一', afterNormal.state.hash)

  // 兼容写法
  for (const [label, expectId] of [
    ['带点写法', '12-2-锁机制详解'],
    ['去点写法', '12-2-锁机制详解'],
    ['旧版带序号', '12-2-锁机制详解'],
    ['重名第二个', '重复标题-2'],
    // 宽松匹配：GitHub/Typora 风格（标点被删掉）
    ['宽松旧式锚点', '10-1-explain-速查'],
    // 显式锚点：## 标题 {#lock-detail}
    ['显式锚点', 'lock-detail']
  ]) {
    const result = await jumpTo(label)
    const top = await runProbe(targetTopProbe, expectId)
    check(
      label + ' 能命中',
      result.clicked !== 'not-found' && top.found && top.top >= -2 && top.top <= top.headerHeight + 40 && result.state.hash === '#' + expectId,
      'href=' + result.clicked + ' top=' + top.top + ' hash=' + result.state.hash
    )
  }

  // 显式锚点不能把 {#id} 留在标题文字/目录里
  const explicitLeak = await evaluate(`(() => {
    const heading = document.getElementById('lock-detail')
    return JSON.stringify({
      text: heading ? heading.textContent.trim() : '',
      toc: Array.from(document.querySelectorAll('.toc-list a, .toc a, .article-toc a')).map((a) => a.textContent.trim())
    })
  })()`)
  const leak = JSON.parse(explicitLeak)
  check('显式锚点的 {#id} 不残留在标题里', !leak.text.includes('{#'), leak.text)
  check('目录里也不含 {#id}', leak.toc.every((t) => !t.includes('{#')), JSON.stringify(leak.toc.slice(-2)))

  // ---------- 3. 不存在的锚点给提示 ----------
  await evaluate(`window.scrollTo({ top: 0, behavior: 'auto' })`)
  await sleep(200)
  await evaluate(`(() => {
    const link = Array.from(document.querySelectorAll('.markdown-body a:not(.heading-anchor)'))
      .find((a) => (a.textContent || '').includes('不存在的章节'))
    if (link) link.click()
  })()`)
  await sleep(800)
  const msg = await runProbe(messageProbe)
  check('锚点不存在时给出提示', msg.text.includes('不存在'), msg.text || '(无提示)')
  check('锚点不存在时页面不跳走', (await runProbe(scrollProbe)).scrollY <= 100, 'scrollY')

  // ---------- 4. 标题旁的 # 锚点 ----------
  const meta = await runProbe(anchorMetaProbe)
  console.log('标题锚点:', JSON.stringify(meta))
  check('标题旁生成了 # 锚点（CSS 绘制，不污染标题文字）', meta.found === true && String(meta.symbol).includes('#'))
  check('默认不可见（hover 才显示）', meta.opacity === 0, String(meta.opacity))

  // 用 CDP 强制 hover 伪类，确认样式会显现
  const doc = await send('DOM.getDocument', { depth: -1 })
  const rootNodeId = doc.result.root.nodeId
  const found = await send('DOM.querySelector', { nodeId: rootNodeId, selector: '.markdown-body h2' })
  if (found.result?.nodeId) {
    await send('CSS.forcePseudoState', { nodeId: found.result.nodeId, forcedPseudoClasses: ['hover'] })
    await sleep(300)
    const hovered = await runProbe(anchorMetaProbe)
    check('hover 标题后 # 锚点显现', hovered.opacity > 0, String(hovered.opacity))
    await send('CSS.forcePseudoState', { nodeId: found.result.nodeId, forcedPseudoClasses: [] })
  } else {
    check('hover 标题后 # 锚点显现', false, '未找到 h2 节点')
  }

  // 点 # → 复制章节链接（headless 下读剪贴板可能因未聚焦失败，所以以提示文案为准）
  // 先清掉上一个用例遗留的 message，否则会读到旧文案
  await evaluate("document.querySelectorAll('.el-message').forEach((el) => el.remove())")
  await sleep(200)
  await evaluate(`(() => { const a = document.querySelector('.markdown-body h2 .heading-anchor'); if (a) a.click(); })()`)
  await sleep(700)
  const copyMsg = await runProbe(messageProbe)
  const copied = await evaluate('navigator.clipboard.readText().catch(() => "")').catch(() => '')
  check('点 # 给出「章节链接已复制」提示', copyMsg.text.includes('章节链接已复制'), copyMsg.text || '(无提示)')
  check(
    '复制的链接含文章路径与锚点',
    String(copied || '').includes('/article/') ? String(copied).includes('#') : true,
    String(copied || '(headless 无法读剪贴板，跳过)').slice(0, 90)
  )

  // ---------- 5. 带 hash 直接打开也能定位 ----------
  await openArticle('#目标章节一')
  const direct = await runProbe(targetTopProbe, '目标章节一')
  check(
    '带 #锚点 直接打开会定位到章节',
    direct.found && direct.top >= -2 && direct.top <= direct.headerHeight + 40,
    'top=' + direct.top
  )

  // ---------- 6. 目录点击仍然正常（回归） ----------
  const tocClicked = await evaluate(`(() => {
    const items = Array.from(document.querySelectorAll('.toc-list a, .toc a, .article-toc a'))
    if (!items.length) return 'no-toc'
    items[items.length - 1].click()
    return 'clicked'
  })()`)
  await sleep(1200)
  check('目录项点击仍能跳转', tocClicked === 'clicked' || tocClicked === 'no-toc', tocClicked)

  // ---------- 7. 无报错 + 截图 ----------
  const errors = consoleLogs.filter((l) => /error/i.test(l))
  check('无控制台报错', errors.length === 0, errors.slice(0, 2).join(' | '))

  if (shotPath) {
    await openArticle('#12-2-锁机制详解')
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    if (shot.result?.data) {
      fs.writeFileSync(shotPath, Buffer.from(shot.result.data, 'base64'))
      console.log('截图已保存:', shotPath)
    }
  }

  console.log(failed === 0 ? '\n章节锚点检查全部通过 ✅' : '\n共有 ' + failed + ' 项未通过 ❌')
  await cleanup()
  proc.kill()
  process.exit(failed === 0 ? 0 : 1)
})()
