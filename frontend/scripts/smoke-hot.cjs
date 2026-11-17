/**
 * 热门文章：首页已改为「Hero + 个人卡 + 紧凑文章流」，不再渲染热门模块。
 * 本套件改为守两条：
 *   1) 首页确实不再有热门/分类/标签的发现区（防止以后不小心加回来又没人管样式）
 *   2) 后端热门接口仍然可用、按阅读量降序、limit 生效（功能没被删）
 * 用法：node scripts/smoke-hot.cjs
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const PORT = 9861
const BASE = 'http://127.0.0.1:5173'
const API = 'http://127.0.0.1:8080/api'
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const HOT_LIMIT = 5

let failures = 0
function check(label, ok, detail) {
  if (ok) console.log(`  [OK]   ${label}${detail ? '  → ' + detail : ''}`)
  else {
    failures += 1
    console.log(`  [MISS] ${label}${detail ? '  → ' + detail : ''}`)
  }
}

;(async () => {
  console.log('【需求 1】后端热门接口仍然可用')
  const res = await fetch(`${API}/public/articles/hot?limit=${HOT_LIMIT}`)
  const json = await res.json()
  const list = json.data || []
  check('接口返回成功', res.status === 200 && Array.isArray(list), `HTTP ${res.status}`)
  check('返回数量不超过 limit', list.length <= HOT_LIMIT, `${list.length} 篇 / limit=${HOT_LIMIT}`)
  check(
    '按阅读量降序',
    list.every((a, i) => i === 0 || (list[i - 1].viewCount || 0) >= (a.viewCount || 0)),
    list.map((a) => a.viewCount).join(' ≥ ')
  )
  check('每篇都有 slug（可跳详情）', list.every((a) => typeof a.slug === 'string' && a.slug.length > 0), list[0]?.slug || '(空)')

  console.log('\n【需求 2】首页不再渲染发现区（热门 / 分类 / 标签）')
  const profile = path.join(os.tmpdir(), 'dsh-smoke-hot-' + Date.now())
  const proc = spawn(
    chrome,
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--window-size=1440,900',
      '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT, 'about:blank'],
    { stdio: 'ignore' }
  )
  let wsUrl
  for (let i = 0; i < 50 && !wsUrl; i += 1) {
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
  let id = 0
  const pending = new Map()
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m)
      pending.delete(m.id)
    }
  }
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
  await send('Page.enable')
  await send('Runtime.enable')
  const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value

  try {
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
    await send('Page.navigate', { url: BASE + '/' })
    await sleep(1500)
    await evaluate(`localStorage.setItem('fcdzy_theme','light'); location.reload()`)
    await sleep(4200)

    const state = JSON.parse(
      await evaluate(`(() => {
        const hot = document.querySelector('.hot-list, .hot-card, .side-card, .discovery')
        const titles = Array.from(document.querySelectorAll('.side-title')).map((t) => t.textContent.trim())
        return JSON.stringify({
          hasHotModule: !!hot,
          sideTitles: titles,
          cardCount: document.querySelectorAll('.stream .article-card').length,
          profileExists: !!document.querySelector('.profile')
        })
      })()`)
    )
    check('首页没有热门/分类/标签区块', state.hasHotModule === false, state.sideTitles.join(' / ') || '(无)')
    check('左侧个人卡仍在（分类/标签走导航）', state.profileExists === true)
    check('文章流正常渲染', state.cardCount > 0, `${state.cardCount} 张卡片`)
  } finally {
    proc.kill()
  }

  console.log(failures === 0 ? '\n热门文章检查全部通过 ✅' : `\n共有 ${failures} 项未通过 ❌`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((error) => {
  console.error('热门文章检查失败:', error)
  process.exit(1)
})
