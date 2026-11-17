/**
 * 发布前自检检查：正文有问题时点保存会弹提示，可以「返回修改」或「仍然保存」。
 *
 * 用法：node scripts/smoke-preflight.cjs
 */
const { spawn } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')

const PORT = 9793
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

const content = [
  '# 自检测试（临时）',
  '',
  '- [坏锚点](#一个根本不存在的章节)',
  '',
  '```',
  'int noLanguage = 1;',
  '```',
  ''
].join('\n')

;(async () => {
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS })
  }).then((r) => r.json())
  if (login.code !== 0) throw new Error('管理员登录失败')
  const token = login.data.token
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const created = await fetch(`${API}/admin/articles`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ title: '自检测试（临时）', content, status: 'DRAFT', categoryId: 1, tagIds: [], topped: false })
  }).then((r) => r.json())
  const id = created.data.id
  const cleanup = async () => {
    await fetch(`${API}/admin/articles/${id}`, { method: 'DELETE', headers: auth }).catch(() => {})
    await fetch(`${API}/admin/articles/${id}/purge`, { method: 'DELETE', headers: auth }).catch(() => {})
  }

  const profile = path.join(os.tmpdir(), 'dsh-preflight')
  const proc = spawn(
    chrome,
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--window-size=1600,1100',
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
  const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value

  await send('Page.navigate', { url: BASE + '/' })
  await sleep(2000)
  await evaluate(`localStorage.setItem('fcdzy_admin_token', '${token}'); localStorage.removeItem('fcdzy_skip_preflight')`)
  await send('Page.navigate', { url: `${BASE}/yzdcf/articles/${id}/edit` })
  await sleep(5500)

  // 点「保存草稿」→ 应弹出检查结果
  await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').includes('保存草稿'))
    if (btn) btn.click()
  })()`)
  await sleep(2500)

  const box = JSON.parse(await evaluate(`(() => {
    const dialog = document.querySelector('.el-message-box, .el-overlay-message-box')
    if (!dialog) return JSON.stringify({ open: false })
    const body = dialog.querySelector('.el-message-box__message, .el-message-box__content')
    return JSON.stringify({
      open: true,
      title: (dialog.querySelector('.el-message-box__title') || {}).textContent || '',
      text: body ? body.textContent.replace(/\\s+/g, ' ').trim() : ''
    })
  })()`))
  console.log('弹窗:', JSON.stringify(box).slice(0, 200))

  check('保存前弹出检查结果', box.open === true)
  check('标题说明了问题数量', /发布前检查发现 \d+ 个问题/.test(box.title), box.title)
  check('列出了失效锚点', box.text.includes('找不到对应标题'), box.text.slice(0, 80))
  check('列出了没写语言的代码块', box.text.includes('代码块没写语言'), box.text.slice(0, 80))

  // 点「返回修改」→ 停在编辑页
  await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('.el-message-box__btns button'))
      .find((b) => (b.textContent || '').includes('返回修改'))
    if (btn) btn.click()
  })()`)
  await sleep(900)
  check('点「返回修改」不会保存', (await evaluate('location.pathname')).includes('/edit'), await evaluate('location.pathname'))
  check('弹窗已关闭', (await evaluate("!!document.querySelector('.el-message-box')")) === false)

  // 设置跳过标记后再保存 → 正常提交
  await evaluate("localStorage.setItem('fcdzy_skip_preflight', '1')")
  await evaluate(`(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').includes('保存草稿'))
    if (btn) btn.click()
  })()`)
  await sleep(3500)
  const currentPath = await evaluate('location.pathname')
  check('跳过检查后能正常保存并返回列表', currentPath === '/yzdcf/articles', currentPath)

  await cleanup()
  console.log(failed === 0 ? '\n发布前自检检查全部通过 ✅' : '\n共有 ' + failed + ' 项未通过 ❌')
  proc.kill()
  process.exit(failed === 0 ? 0 : 1)
})()
