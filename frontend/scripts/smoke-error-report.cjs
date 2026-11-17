/**
 * 前端错误上报检查：页面里抛出异常后，后台能查到这条错误。
 *
 * 用法：node scripts/smoke-error-report.cjs
 */
const { spawn } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')

const PORT = 9791
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5173'
const API = process.env.SMOKE_API || 'http://127.0.0.1:8080/api'
const USER = process.env.SMOKE_ADMIN_USER || 'admin'
const PASS = process.env.SMOKE_ADMIN_PASS || 'admin123'
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed += 1
  console.log(`${ok ? '[OK]  ' : '[FAIL]'} ${name}${detail ? '  -> ' + detail : ''}`)
}

;(async () => {
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS })
  }).then((r) => r.json())
  if (login.code !== 0) throw new Error('管理员登录失败')
  const token = login.data.token
  const auth = { Authorization: `Bearer ${token}` }

  // 先清空历史，避免旧数据干扰断言
  await fetch(`${API}/admin/client-errors`, { method: 'DELETE', headers: auth })
  const before = await fetch(`${API}/admin/client-errors/count`, { headers: auth }).then((r) => r.json())
  check('清空后 24 小时错误数为 0', Number(before.data) === 0, String(before.data))

  const marker = `smoke-error-${Date.now().toString(36)}`

  const profile = path.join(os.tmpdir(), 'dsh-error-report')
  const proc = spawn(
    chrome,
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT, 'about:blank'],
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
  const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value

  // 打开任意前台页面，然后在页面里抛两个异常（一个同步、一个 Promise）
  await send('Page.navigate', { url: BASE + '/' })
  await sleep(3000)

  await evaluate(`(() => {
    window.dispatchEvent(new ErrorEvent('error', {
      message: '${marker}-sync',
      error: new Error('${marker}-sync'),
      filename: location.href,
      lineno: 1
    }))
    Promise.reject(new Error('${marker}-promise'))
    return true
  })()`)
  await sleep(2500)

  const list = await fetch(`${API}/admin/client-errors?limit=20`, { headers: auth }).then((r) => r.json())
  const rows = list.data || []
  console.log('后台收到:', rows.slice(0, 3).map((r) => r.message).join(' | '))

  check('后台收到了前端错误', rows.length > 0, `${rows.length} 条`)
  check('同步异常被记录（含标记）', rows.some((r) => String(r.message).includes(marker + '-sync')))
  check('未处理的 Promise 异常被记录', rows.some((r) => String(r.message).includes(marker + '-promise')))
  check(
    '记录了出错页面路径',
    rows.some((r) => String(r.url || '').startsWith('/')),
    rows[0] ? String(rows[0].url) : ''
  )

  const count = await fetch(`${API}/admin/client-errors/count`, { headers: auth }).then((r) => r.json())
  check('24 小时计数增加了', Number(count.data) >= 2, String(count.data))

  // 收尾：清空，避免污染后台仪表盘
  const cleared = await fetch(`${API}/admin/client-errors`, { method: 'DELETE', headers: auth }).then((r) => r.json())
  check('可以一键清空', cleared.code === 0, `code=${cleared.code}`)

  console.log(failed === 0 ? '\n前端错误上报检查全部通过 ✅' : '\n共有 ' + failed + ' 项未通过 ❌')
  proc.kill()
  process.exit(failed === 0 ? 0 : 1)
})()
