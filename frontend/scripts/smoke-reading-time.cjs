/**
 * 阅读时长检查：
 * - 列表接口返回 readingMinutes / wordCount
 * - 列表值 === 详情值（同一篇文章不能出现两个数字）
 * - 后端算法 === 前端算法（用同一套规则独立算一遍，比对）
 * - 卡片上显示「约 N 分钟」，详情页显示「约 N 分钟 · M 字」
 *
 * 用法：node scripts/smoke-reading-time.cjs
 */
const { spawn } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')

const PORT = 9839
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5173'
const API = process.env.SMOKE_API || 'http://127.0.0.1:8080/api'
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed += 1
  console.log(`${ok ? '[OK]  ' : '[FAIL]'} ${name}${detail ? '  -> ' + detail : ''}`)
}

/** 与前端 src/utils/reading.ts 完全一致的规则（用于独立验算后端结果） */
function expectedReading(markdown) {
  if (!markdown) return { chars: 0, minutes: 0 }
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, ' ')
    .replace(/^\s{0,3}>\s?/gm, ' ')
    .replace(/^\s*[-*+]\s+/gm, ' ')
    .replace(/^\s*\d+\.\s+/gm, ' ')
    .replace(/^\s*\|.*\|\s*$/gm, ' ')
    .replace(/[-*_~|>#]/g, ' ')
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  const latin = (text.match(/[A-Za-z][A-Za-z0-9'_-]*/g) || []).length
  const chars = cjk + latin
  if (chars === 0) return { chars: 0, minutes: 0 }
  return { chars, minutes: Math.max(1, Math.round((cjk + latin * 1.5) / 400)) }
}

;(async () => {
  // ============ 接口层 ============
  console.log('\n【需求 1】列表接口返回阅读时长')
  const list = await fetch(`${API}/public/articles?pageNum=1&pageSize=10`).then((r) => r.json())
  const items = list.data.list || []
  check('列表有文章', items.length > 0, `${items.length} 篇`)
  check(
    '每条都有 readingMinutes > 0',
    items.every((a) => Number(a.readingMinutes) > 0),
    items.map((a) => a.readingMinutes).join(',')
  )
  check(
    '每条都有 wordCount > 0',
    items.every((a) => Number(a.wordCount) > 0),
    items.map((a) => a.wordCount).join(',')
  )
  check('列表项没有返回正文（体积没变）', items.every((a) => !a.content), 'content 字段为空')

  console.log('\n【需求 2】列表值 === 详情值')
  let compared = 0
  let mismatched = []
  for (const item of items.slice(0, 4)) {
    const detail = await fetch(`${API}/public/articles/${item.slug}`).then((r) => r.json())
    const d = detail.data || {}
    compared += 1
    if (Number(d.readingMinutes) !== Number(item.readingMinutes) || Number(d.wordCount) !== Number(item.wordCount)) {
      mismatched.push(`${item.slug}: 列表 ${item.readingMinutes}/${item.wordCount} vs 详情 ${d.readingMinutes}/${d.wordCount}`)
    }
  }
  check(`比对了 ${compared} 篇，列表与详情完全一致`, mismatched.length === 0, mismatched.join(' | '))

  console.log('\n【需求 3】后端算法 === 前端算法（独立验算）')
  let algorithmMismatch = []
  for (const item of items.slice(0, 4)) {
    const detail = await fetch(`${API}/public/articles/${item.slug}`).then((r) => r.json())
    const expected = expectedReading(detail.data.content)
    if (expected.minutes !== Number(detail.data.readingMinutes) || expected.chars !== Number(detail.data.wordCount)) {
      algorithmMismatch.push(`${item.slug}: 后端 ${detail.data.readingMinutes}/${detail.data.wordCount} vs 前端规则 ${expected.minutes}/${expected.chars}`)
    }
  }
  check('后端返回的分钟数与字数 = 前端同规则计算值', algorithmMismatch.length === 0, algorithmMismatch.join(' | '))

  console.log('\n【需求 4】代码块不计入字数')
  const codeHeavy = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: process.env.SMOKE_ADMIN_USER || 'admin',
      password: process.env.SMOKE_ADMIN_PASS || 'admin123'
    })
  }).then((r) => r.json())
  const token = codeHeavy.data.token
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const code = Array.from({ length: 60 }, (_, i) => `int value${i} = ${i};`).join('\n')
  const created = await fetch(`${API}/admin/articles`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      title: '阅读时长测试（临时）',
      content: `# 阅读时长测试\n\n正文只有这一句话。\n\n\`\`\`java\n${code}\n\`\`\`\n`,
      status: 'PUBLISHED',
      categoryId: 1,
      tagIds: [],
      topped: false
    })
  }).then((r) => r.json())
  const createdItem = created.data
  console.log('临时文章:', createdItem.slug, '字数=', createdItem.wordCount, '分钟=', createdItem.readingMinutes)
  check('60 行代码没有被算进字数（< 40 字）', Number(createdItem.wordCount) < 40, String(createdItem.wordCount))
  check('阅读时长至少 1 分钟', Number(createdItem.readingMinutes) >= 1, String(createdItem.readingMinutes))

  // ============ 页面层 ============
  const profile = path.join(os.tmpdir(), 'dsh-reading-time')
  const proc = spawn(
    chrome,
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--window-size=1500,1000',
      '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT, 'about:blank'],
    { stdio: 'ignore' }
  )
  try {
    let wsUrl
    for (let i = 0; i < 40 && !wsUrl; i += 1) {
      await sleep(400)
      try {
        const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json()
        wsUrl = l.find((t) => t.type === 'page')?.webSocketDebuggerUrl
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
    await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1000, deviceScaleFactor: 1, mobile: false })
    const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value

    console.log('\n【需求 5】卡片与详情页展示')
    await send('Page.navigate', { url: BASE + '/articles' })
    await sleep(4500)
    const cardStats = JSON.parse(await evaluate(`(() => {
      const row = document.querySelector('.article-card')
      if (!row) return JSON.stringify({ found: false })
      const meta = row.querySelector('.row-meta')
      return JSON.stringify({
        found: true,
        text: meta ? meta.textContent.replace(/\s+/g, ' ').trim() : '',
        hasTitle: !!row.querySelector('.row-title')
      })
    })()`))
    console.log('列表行:', JSON.stringify(cardStats))
    check('列表行注脚显示「N 分钟」', /\d+ 分钟/.test(cardStats.text), cardStats.text)
    check('行骨架完整（有标题）', cardStats.hasTitle === true)

    await send('Page.navigate', { url: `${BASE}/article/${items[0].slug}` })
    await sleep(4000)
    const detailText = await evaluate(`(() => {
      const meta = document.querySelector('.article-meta') || document.querySelector('article')
      const text = meta ? meta.textContent.replace(/\\s+/g, ' ') : ''
      const m = text.match(/约 (\\d+) 分钟 · ([\\d,.]+) 字/)
      return m ? m[0] : ''
    })()`)
    console.log('详情页:', detailText)
    check('详情页显示「约 N 分钟 · M 字」', Boolean(detailText), detailText)
    check(
      '详情页分钟数与列表一致',
      detailText.includes(`约 ${items[0].readingMinutes} 分钟`),
      `详情「${detailText}」 vs 列表 ${items[0].readingMinutes}`
    )
  } finally {
    proc.kill()
    await fetch(`${API}/admin/articles/${createdItem.id}`, { method: 'DELETE', headers: auth }).catch(() => {})
    await fetch(`${API}/admin/articles/${createdItem.id}/purge`, { method: 'DELETE', headers: auth }).catch(() => {})
  }

  console.log(failed === 0 ? '\n阅读时长检查全部通过 ✅' : '\n共有 ' + failed + ' 项未通过 ❌')
  process.exit(failed === 0 ? 0 : 1)
})()
