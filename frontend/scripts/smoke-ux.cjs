/**
 * 两个体验小项：
 * ① 阅读位置记忆（长文读到一半，回来自动提示「上次读到 N%」）
 * ② 搜索快捷键（/ 与 Ctrl+K 聚焦搜索，Esc 关闭；输入框里按 / 不抢键）
 *
 * 用法：node scripts/smoke-ux.cjs
 */
const { spawn } = require('node:child_process')
const os = require('node:os')
const path = require('node:path')

const PORT = 9805
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

/** 造一篇够长的文章（多屏），用于测阅读位置 */
function longContent() {
  const blocks = []
  for (let i = 1; i <= 26; i += 1) {
    blocks.push(`## 第 ${i} 节 · 阅读位置测试`)
    blocks.push('')
    blocks.push(`这是第 ${i} 节的正文段落。用来把页面撑到足够长，验证「读到一半离开再回来」的提示逻辑。`.repeat(6))
    blocks.push('')
  }
  return ['# 阅读位置记忆测试（临时）', '', ...blocks].join('\n')
}

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
    body: JSON.stringify({ title: '阅读位置记忆测试（临时）', content: longContent(), status: 'PUBLISHED', categoryId: 1, tagIds: [], topped: false })
  }).then((r) => r.json())
  const slug = created.data.slug
  console.log('临时文章:', slug)

  const tiny = await fetch(`${API}/admin/articles`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ title: '短文测试（临时）', content: '# 短文\n\n只有一小段。\n', status: 'PUBLISHED', categoryId: 1, tagIds: [], topped: false })
  }).then((r) => r.json())
  const tinySlug = tiny.data.slug

  const profile = path.join(os.tmpdir(), 'dsh-ux')
  const proc = spawn(
    chrome,
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--window-size=1400,900',
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
  await send('Network.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false })
  const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value
  const key = async (opts) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', ...opts })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...opts })
  }

  const openArticle = async (targetSlug, waitMs = 4500) => {
    await send('Page.navigate', { url: `${BASE}/article/${targetSlug}` })
    await sleep(waitMs)
  }

  try {
    // ================= ① 阅读位置记忆 =================
    console.log('\n【需求 1】阅读位置记忆')
    await openArticle(slug)
    const bodyHeight = await evaluate(`(() => {
      const el = document.querySelector('.markdown-body')
      return el ? Math.round(el.getBoundingClientRect().height) : 0
    })()`)
    check('长文正文高度足够（可测）', bodyHeight > 2000, bodyHeight + 'px')

    // 滚到大约 60%
    const scrolled = await evaluate(`(() => {
      const el = document.querySelector('.markdown-body')
      const rect = el.getBoundingClientRect()
      const top = rect.top + window.scrollY
      const y = top + rect.height * 0.6 - window.innerHeight / 2
      window.scrollTo(0, Math.max(0, Math.round(y)))
      const readingLine = window.scrollY + window.innerHeight / 2
      return Math.round(((readingLine - top) / rect.height) * 100)
    })()`)
    console.log('滚动后进度:', scrolled + '%')
    check('已滚动到约 60%', scrolled > 50 && scrolled < 75, scrolled + '%')

    await sleep(1500) // 等节流保存
    const stored = await evaluate(`localStorage.getItem('fcdzy_read_pos')`)
    check('进度已写入 localStorage', Boolean(stored && stored.includes(slug)), String(stored).slice(0, 80))

    // 离开再回来
    await send('Page.navigate', { url: BASE + '/' })
    await sleep(1500)
    await openArticle(slug)

    const banner = JSON.parse(await evaluate(`(() => {
      const bar = document.querySelector('.resume-bar')
      return JSON.stringify({
        exists: !!bar,
        text: bar ? bar.textContent.replace(/\\s+/g, ' ').trim() : '',
        scrollY: Math.round(window.scrollY)
      })
    })()`))
    console.log('提示条:', JSON.stringify(banner).slice(0, 160))
    check('回来后有「上次读到」提示', banner.exists === true)
    check('提示里带百分比', /上次读到 \d+%/.test(banner.text), banner.text)
    check('百分比接近 60%', (() => {
      const m = /上次读到 (\d+)%/.exec(banner.text)
      return m ? Number(m[1]) > 50 && Number(m[1]) < 75 : false
    })(), banner.text)
    check('没有自动跳走（仍停在顶部）', banner.scrollY < 50, String(banner.scrollY))

    // 点「继续阅读」
    await evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('.resume-btn')).find((b) => b.textContent.includes('继续阅读'))
      if (btn) btn.click()
    })()`)
    await sleep(1800)
    const afterResume = JSON.parse(await evaluate(`(() => {
      const el = document.querySelector('.markdown-body')
      const rect = el.getBoundingClientRect()
      const top = rect.top + window.scrollY
      const readingLine = window.scrollY + window.innerHeight / 2
      return JSON.stringify({
        percent: Math.round(((readingLine - top) / rect.height) * 100),
        bannerGone: !document.querySelector('.resume-bar')
      })
    })()`))
    console.log('继续阅读后:', JSON.stringify(afterResume))
    check('点「继续阅读」确实跳到了上次位置', afterResume.percent > 45 && afterResume.percent < 80, afterResume.percent + '%')
    check('提示条点击后消失', afterResume.bannerGone === true)

    // 短文不该提示
    await openArticle(tinySlug, 3000)
    await evaluate('window.scrollTo(0, 200)')
    await sleep(1200)
    await send('Page.navigate', { url: BASE + '/' })
    await sleep(1200)
    await openArticle(tinySlug, 3000)
    const tinyBanner = await evaluate(`!!document.querySelector('.resume-bar')`)
    check('短文不显示「上次读到」（不到一屏半不打扰）', tinyBanner === false)

    // ================= ② 搜索快捷键 =================
    console.log('\n【需求 2】搜索快捷键')
    await send('Page.navigate', { url: BASE + '/' })
    await sleep(2500)

    await key({ key: '/', code: 'Slash', text: '/', windowsVirtualKeyCode: 191, nativeVirtualKeyCode: 191 })
    await sleep(600)
    const bySlash = JSON.parse(await evaluate(`(() => {
      const input = document.querySelector('.search-input')
      return JSON.stringify({
        open: !!document.querySelector('.site-search.is-open'),
        focused: !!input && document.activeElement === input
      })
    })()`))
    console.log('按 / 之后:', JSON.stringify(bySlash))
    check('按 / 展开并聚焦搜索框', bySlash.focused === true, JSON.stringify(bySlash))

    // 输入关键字 + 回车 → 跳搜索结果（回车要发 rawKeyDown/char/keyUp 三连，否则不触发表单提交）
    await send('Input.insertText', { text: 'java' })
    await sleep(300)
    const typedValue = await evaluate("document.querySelector('.search-input').value")
    check('关键字已输入搜索框', typedValue === 'java', String(typedValue))
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
    await sleep(2200)
    const searchUrl = await evaluate('location.pathname + location.search')
    check('回车后跳到搜索结果页', searchUrl.includes('/articles') && searchUrl.includes('java'), searchUrl)

    // Ctrl+K 也能唤起
    await send('Page.navigate', { url: BASE + '/' })
    await sleep(2200)
    await key({ key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75, nativeVirtualKeyCode: 75, modifiers: 2 })
    await sleep(600)
    const byCtrlK = await evaluate(`(() => {
      const input = document.querySelector('.search-input')
      return JSON.stringify({ focused: !!input && document.activeElement === input })
    })()`)
    check('Ctrl+K 也能聚焦搜索框', byCtrlK.includes('true'), byCtrlK)

    // Esc 关闭
    await key({ key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
    await sleep(500)
    const afterEsc = await evaluate(`!!document.querySelector('.site-search.is-open')`)
    check('Esc 收起搜索', afterEsc === false)

    // 在输入框里按 / 不应该抢键（评论框场景）
    await openArticle(tinySlug, 3200)
    const typingCase = JSON.parse(await evaluate(`(() => {
      const area = document.querySelector('textarea')
      if (!area) return JSON.stringify({ skipped: true })
      area.focus()
      area.value = ''
      return JSON.stringify({ skipped: false, focused: document.activeElement === area })
    })()`))
    if (!typingCase.skipped) {
      await key({ key: '/', code: 'Slash', text: '/', windowsVirtualKeyCode: 191, nativeVirtualKeyCode: 191 })
      await sleep(400)
      const stillTextarea = await evaluate(`(() => {
        const area = document.querySelector('textarea')
        const input = document.querySelector('.search-input')
        return JSON.stringify({
          textareaFocused: document.activeElement === area,
          searchFocused: !!input && document.activeElement === input,
          textareaValue: area ? area.value : ''
        })
      })()`)
      check('在评论框里按 / 不会抢焦点', stillTextarea.includes('"searchFocused":false'), stillTextarea)
    } else {
      console.log('  （页面没有 textarea，跳过该检查）')
    }
  } finally {
    // 清理临时文章
    for (const item of [created.data, tiny.data]) {
      await fetch(`${API}/admin/articles/${item.id}`, { method: 'DELETE', headers: auth }).catch(() => {})
      await fetch(`${API}/admin/articles/${item.id}/purge`, { method: 'DELETE', headers: auth }).catch(() => {})
    }
    proc.kill()
  }

  console.log(failed === 0 ? '\n体验小项检查全部通过 ✅' : '\n共有 ' + failed + ' 项未通过 ❌')
  process.exit(failed === 0 ? 0 : 1)
})()
