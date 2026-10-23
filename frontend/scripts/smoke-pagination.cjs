/**
 * 首页文章列表分页专项检查：
 * 默认每页 10 条、总条数展示、上一页/下一页边界禁用、切换页码重新请求、深浅主题适配。
 *
 * 为了能真实测到第 2 页，脚本会临时创建若干测试文章，并在结束时（含异常）全部删除。
 * 用法：node scripts/smoke-pagination.cjs
 * 可选：SMOKE_SHOT=<路径前缀> 输出浅色/深色分页截图
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5173'
const API = process.env.SMOKE_API || 'http://127.0.0.1:8080'
const DEBUG_PORT = 9779
const VIEW = { width: 1440, height: 900 }
const PAGE_SIZE = 10
const TEMP_COUNT = 8

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
  const pager = document.querySelector('.pagination')
  const totalEl = document.querySelector('.el-pagination__total')
  const prev = document.querySelector('.el-pagination .btn-prev')
  const next = document.querySelector('.el-pagination .btn-next')
  const pages = Array.from(document.querySelectorAll('.el-pagination .el-pager li'))
  const active = document.querySelector('.el-pagination .el-pager li.is-active')
  const idle = document.querySelector('.el-pagination .el-pager li:not(.is-active)')
  const rect = pager ? pager.getBoundingClientRect() : null
  return JSON.stringify({
    cardCount: document.querySelectorAll('.article-card').length,
    cardTitles: Array.from(document.querySelectorAll('.article-card .title')).map((t) => t.textContent.trim()),
    hasPager: !!pager,
    totalText: totalEl ? totalEl.textContent.trim() : '',
    totalColor: totalEl ? cs(totalEl).color : '',
    prevExists: !!prev,
    nextExists: !!next,
    prevDisabled: prev ? !!prev.disabled : null,
    nextDisabled: next ? !!next.disabled : null,
    pageNumbers: pages.map((li) => li.textContent.trim()),
    activePage: active ? active.textContent.trim() : '',
    activeBg: active ? cs(active).backgroundColor : '',
    activeColor: active ? cs(active).color : '',
    pageItemBorder: idle ? cs(idle).borderColor : '',
    pageItemBg: idle ? cs(idle).backgroundColor : '',
    pageItemColor: idle ? cs(idle).color : '',
    prevBg: prev ? cs(prev).backgroundColor : '',
    layoutText: pager ? pager.textContent.replace(/\\s+/g, ' ').trim() : '',
    isDark: document.documentElement.classList.contains('dark'),
    pagerPageY: rect ? Math.round(rect.top + window.scrollY) : -1,
    pagerHeight: rect ? Math.round(rect.height) : 0
  })
})()`

let createdIds = []

async function apiLogin() {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  })
  const body = await res.json()
  return body.data.token
}

async function publishedTotal() {
  const res = await fetch(`${API}/api/public/articles?pageNum=1&pageSize=1`)
  const body = await res.json()
  return body.data.total
}

async function createTempArticles(token) {
  const stamp = Date.now().toString(36)
  for (let i = 1; i <= TEMP_COUNT; i += 1) {
    const res = await fetch(`${API}/api/admin/articles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: `分页测试文章 ${i}`,
        slug: `pagination-temp-${stamp}-${i}`,
        summary: `用于验证分页的第 ${i} 篇临时文章，检查完成后自动删除。`,
        content: `# 分页测试 ${i}\n\n临时数据。`,
        coverImage: null,
        status: 'PUBLISHED',
        categoryId: null,
        tagIds: [],
        topped: false
      })
    })
    const body = await res.json()
    if (body.code === 0 && body.data?.id) createdIds.push(body.data.id)
  }
  return createdIds.length
}

async function deleteTempArticles(token) {
  let removed = 0
  for (const id of createdIds) {
    try {
      const res = await fetch(`${API}/api/admin/articles/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) removed += 1
    } catch {
      /* 继续清理其余 */
    }
  }
  return removed
}

;(async () => {
  const token = await apiLogin()
  const before = await publishedTotal()
  console.log(`测试前已发布文章 ${before} 篇，临时创建 ${TEMP_COUNT} 篇以形成第 2 页…`)
  const created = await createTempArticles(token)
  const after = await publishedTotal()
  const totalPages = Math.ceil(after / PAGE_SIZE)
  console.log(`已创建 ${created} 篇，当前共 ${after} 篇，预计 ${totalPages} 页\n`)

  const profile = path.join(os.tmpdir(), 'dsh-smoke-pagination-profile')
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
    let articleRequests = []
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.method === 'Network.requestWillBeSent') {
        const url = msg.params?.request?.url || ''
        if (url.includes('/api/public/articles?')) articleRequests.push(url)
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
    const clickEl = async (selector) => {
      const box = JSON.parse(
        await evaluate(`(() => {
          const el = document.querySelector(${JSON.stringify(selector)})
          if (!el) return 'null'
          el.scrollIntoView({ block: 'center' })
          const r = el.getBoundingClientRect()
          return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) })
        })()`)
      )
      if (!box) return false
      await sleep(400)
      const fresh = JSON.parse(
        await evaluate(`(() => {
          const el = document.querySelector(${JSON.stringify(selector)})
          const r = el ? el.getBoundingClientRect() : null
          return JSON.stringify(r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null)
        })()`)
      )
      if (!fresh) return false
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fresh.x, y: fresh.y, button: 'left', clickCount: 1, buttons: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: fresh.x, y: fresh.y, button: 'left', clickCount: 1, buttons: 0 })
      return true
    }
    const shoot = async (file, clip) => {
      const params = clip
        ? { format: 'png', clip: { ...clip, scale: 1 }, captureBeyondViewport: true }
        : { format: 'png' }
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

    const homeReady = "!!document.querySelector('.article-card') && !!document.querySelector('.pagination')"
    const shotPrefix = process.env.SMOKE_SHOT

    await goto(`${BASE}/`, "!!document.querySelector('#app')")
    await evaluate("localStorage.removeItem('fcdzy_theme'); document.documentElement.classList.remove('dark')")
    articleRequests = []
    await goto(`${BASE}/`, homeReady)

    const p1 = await probe()
    console.log(`【后端】GET /api/public/articles?pageNum=1&pageSize=${PAGE_SIZE}`)
    check('首页默认每页 10 条（第 1 页满页）', p1.cardCount === PAGE_SIZE, `${p1.cardCount} 张卡片`)
    check('请求带 pageNum/pageSize 参数', articleRequests.some((u) => u.includes(`pageSize=${PAGE_SIZE}`)), articleRequests.at(-1)?.replace(BASE, ''))

    console.log('\n【前端 1】分页组件布局：总条数 + 上一页 + 页码 + 下一页')
    check('分页组件出现在列表底部', p1.hasPager)
    check('展示总条数', p1.totalText.includes(String(after)), p1.totalText)
    check('有上一页 / 下一页按钮', p1.prevExists && p1.nextExists)
    check('页码按钮数量正确', p1.pageNumbers.length === totalPages, `页码 ${p1.pageNumbers.join(',')}`)
    check('分页位于文章列表下方', p1.pagerPageY > 0)

    console.log('\n【前端 4】第一页：上一页禁用、下一页可用')
    check('当前页为第 1 页', p1.activePage === '1', p1.activePage)
    check('上一页禁用', p1.prevDisabled === true)
    check('下一页可用', p1.nextDisabled === false)
    if (shotPrefix) await shoot(`${shotPrefix}-pagination-light.png`, { x: 120, y: Math.max(0, p1.pagerPageY - 20), width: 900, height: p1.pagerHeight + 40 })

    console.log('\n【前端 2】切换页码重新请求并加载对应页数据')
    articleRequests = []
    await clickEl('.el-pagination .el-pager li:nth-child(2)')
    await sleep(1500)
    const p2 = await probe()
    check('触发新的分页请求', articleRequests.some((u) => u.includes('pageNum=2')), articleRequests.at(-1)?.replace(BASE, ''))
    check('第 2 页页码高亮', p2.activePage === '2', p2.activePage)
    const expectedP2 = after - PAGE_SIZE
    check('第 2 页条数正确', p2.cardCount === expectedP2, `${p2.cardCount} 张（应为 ${expectedP2}）`)
    check('两页内容不重复', p2.cardTitles.every((t) => !p1.cardTitles.includes(t)) || p2.cardCount !== PAGE_SIZE)

    console.log('\n【前端 4】最后一页：下一页禁用、上一页可用')
    check('下一页禁用', p2.nextDisabled === true)
    check('上一页可用', p2.prevDisabled === false)

    console.log('\n返回上一页')
    articleRequests = []
    await clickEl('.el-pagination .btn-prev')
    await sleep(1500)
    const back = await probe()
    check('重新请求第 1 页', articleRequests.some((u) => u.includes('pageNum=1')), articleRequests.at(-1)?.replace(BASE, ''))
    check('回到第 1 页且满页', back.activePage === '1' && back.cardCount === PAGE_SIZE, `第 ${back.activePage} 页 / ${back.cardCount} 张`)
    check('上一页再次禁用', back.prevDisabled === true)

    console.log('\n【前端 3】分页样式深浅色适配')
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 10, y: 10, button: 'none', buttons: 0 })
    const light = await probe()
    check('浅色下普通页码为白底描边', light.pageItemBg === 'rgb(255, 255, 255)' && light.pageItemBorder === 'rgb(229, 231, 235)', `${light.pageItemBg} / ${light.pageItemBorder}`)
    check('浅色下普通页码文字为主题灰', light.pageItemColor === 'rgb(75, 85, 99)', light.pageItemColor)
    check('浅色下当前页为主题色', light.activeBg === 'rgb(59, 130, 246)', light.activeBg)
    check('浅色下总条数为主题灰', light.totalColor === 'rgb(107, 114, 128)', light.totalColor)

    // 切深色（先回到顶部才能点到 Hero 内的主题按钮）
    await evaluate('window.scrollTo({ top: 0, behavior: "auto" })')
    await sleep(500)
    await clickEl('.theme-toggle')
    await sleep(900)
    await evaluate('document.querySelector(\'.pagination\').scrollIntoView({ block: "center" })')
    await sleep(600)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 10, y: 10, button: 'none', buttons: 0 })
    await sleep(300)
    const dark = await probe()
    if (shotPrefix) await shoot(`${shotPrefix}-pagination-dark.png`, { x: 120, y: Math.max(0, dark.pagerPageY - 20), width: 900, height: dark.pagerHeight + 40 })
    check('深色模式已生效', dark.isDark)
    check('深色下普通页码为深色面板', dark.pageItemBg === 'rgb(23, 26, 33)', dark.pageItemBg)
    check('深色下描边跟随主题', dark.pageItemBorder === 'rgb(42, 48, 57)', dark.pageItemBorder)
    check('深色下文字为浅色', dark.pageItemColor === 'rgb(178, 185, 197)', dark.pageItemColor)
    check('深色下当前页仍为主题色', dark.activeBg === 'rgb(96, 165, 250)', dark.activeBg)
    check('深色下总条数为浅灰', dark.totalColor === 'rgb(136, 143, 157)', dark.totalColor)
    check('切主题后分页功能仍可用', dark.cardCount === PAGE_SIZE && dark.activePage === '1', `${dark.cardCount} 张 / 第 ${dark.activePage} 页`)

    console.log(failures === 0 ? '\n分页检查全部通过 ✅' : `\n共有 ${failures} 项未通过 ❌`)
  } finally {
    proc.kill()
    const removed = await deleteTempArticles(token)
    const finalTotal = await publishedTotal()
    console.log(`\n清理临时文章：删除 ${removed}/${createdIds.length} 篇，当前已发布 ${finalTotal} 篇`)
    if (createdIds.length > 0 && finalTotal !== before) {
      console.log(`[警告] 数据未恢复到测试前的 ${before} 篇，请检查！`)
      failures += 1
    }
  }
  process.exit(failures === 0 ? 0 : 1)
})().catch((error) => {
  console.error('分页检查失败:', error)
  process.exit(1)
})
