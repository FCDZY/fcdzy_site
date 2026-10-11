/**
 * 后台渲染冒烟测试：通过 CDP 驱动无头 Chrome 完成登录，并逐个检查后台页面真实渲染结果，
 * 同时收集页面控制台错误。
 * 用法：先启动后端(8080)与前端(5173)，然后 node scripts/smoke-admin.cjs
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5173'
const API = process.env.SMOKE_API || 'http://127.0.0.1:8080'
const DEBUG_PORT = 9333

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
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)
      const targets = await res.json()
      const page = targets.find((t) => t.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch {
      /* 还没起来 */
    }
    await sleep(500)
  }
  throw new Error('DevTools 端口未就绪')
}

let failures = 0
function check(label, ok) {
  console.log(`  ${ok ? '[OK]  ' : '[MISS]'} ${label}`)
  if (!ok) failures++
}

;(async () => {
  const profile = path.join(os.tmpdir(), 'dsh-smoke-admin-profile')
  const proc = spawn(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-extensions',
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${DEBUG_PORT}`,
      'about:blank'
    ],
    { stdio: 'ignore' }
  )

  try {
    const wsUrl = await waitForDevtools()
    const ws = new WebSocket(wsUrl)
    await new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = reject
    })

    let msgId = 0
    const pending = new Map()
    let consoleErrors = []
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg)
        pending.delete(msg.id)
        return
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        consoleErrors.push(msg.params.exceptionDetails?.exception?.description || 'exception')
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        consoleErrors.push((msg.params.args || []).map((a) => a.value || a.description).join(' '))
      }
      if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
        consoleErrors.push(msg.params.entry.text)
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
    await send('Log.enable')

    async function evaluate(expression, awaitPromise = false) {
      const res = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true })
      if (res.result?.exceptionDetails) {
        throw new Error(res.result.exceptionDetails.exception?.description || 'evaluate failed')
      }
      return res.result?.result?.value
    }

    async function navigate(url, readyExpression) {
      consoleErrors = []
      await send('Page.navigate', { url })
      for (let i = 0; i < 40; i++) {
        await sleep(400)
        const ready = await evaluate(readyExpression).catch(() => false)
        if (ready) {
          await sleep(700)
          return
        }
      }
    }

    const html = () => evaluate('document.documentElement.outerHTML')
    const hasText = (h, text) => h.includes(text)
    const pageReady = "!!document.querySelector('#app') && document.querySelector('#app').innerHTML.length > 800"

    // 1) 登录页（先清掉上次运行残留的 token，保证看到真正的登录页）
    await navigate(`${BASE}/admin/login`, "!!document.querySelector('#app')")
    await evaluate('localStorage.clear()')
    await navigate(`${BASE}/admin/login`, pageReady)
    const loginHtml = await html()
    console.log('后台登录页 (/admin/login)')
    check('渲染登录表单', loginHtml.includes('type="password"'))
    check('提示默认账号', loginHtml.includes('admin123'))

    // 2) 通过接口登录并把 JWT 写入 localStorage（与前端同一 key）
    const token = await evaluate(
      `fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) })
        .then(r => r.json()).then(d => { localStorage.setItem('fcdzy_admin_token', d.data.token); return d.data.token })`,
      true
    )
    check('接口登录成功并写入 token', typeof token === 'string' && token.length > 20)

    const stats = await (await fetch(`${API}/api/admin/stats`, { headers: { Authorization: `Bearer ${token}` } })).json()
    const articles = await (
      await fetch(`${API}/api/admin/articles?page=1&size=10`, { headers: { Authorization: `Bearer ${token}` } })
    ).json()
    const siteConfig = await (
      await fetch(`${API}/api/admin/site-config`, { headers: { Authorization: `Bearer ${token}` } })
    ).json()
    const topicDetail = await (
      await fetch(`${API}/api/admin/topics/1`, { headers: { Authorization: `Bearer ${token}` } })
    ).json()

    // 3) 仪表盘
    await navigate(`${BASE}/admin`, pageReady)
    let dom = await html()
    console.log('\n仪表盘 (/admin)')
    check('侧边菜单渲染', hasText(dom, '文章管理') && hasText(dom, '站点配置'))
    check('统计数字渲染', hasText(dom, String(stats.data.articleCount)))
    check('最近更新表格有条目', hasText(dom, articles.data.list[0].title))
    check('无控制台报错', consoleErrors.length === 0)
    if (consoleErrors.length) console.log('    错误:', consoleErrors.slice(0, 3))

    // 4) 文章管理
    await navigate(`${BASE}/admin/articles`, pageReady)
    dom = await html()
    console.log('\n文章管理 (/admin/articles)')
    check('表格渲染文章标题', hasText(dom, articles.data.list[0].title))
    check('显示状态标签', hasText(dom, '已发布') || hasText(dom, '草稿'))
    check('写文章入口', hasText(dom, '写文章'))
    check('无控制台报错', consoleErrors.length === 0)
    if (consoleErrors.length) console.log('    错误:', consoleErrors.slice(0, 3))

    // 5) 文章编辑（Markdown 编辑器）
    await navigate(`${BASE}/admin/articles/1/edit`, "!!document.querySelector('.md-editor')")
    dom = await html()
    console.log('\n文章编辑 (/admin/articles/1/edit)')
    check('Markdown 编辑器挂载', hasText(dom, 'md-editor'))
    check('标题回填', hasText(dom, articles.data.list.find((a) => a.id === 1)?.title || '###'))
    check('保存/发布按钮', hasText(dom, '保存草稿') && hasText(dom, '发布文章'))
    check('无控制台报错', consoleErrors.length === 0)
    if (consoleErrors.length) console.log('    错误:', consoleErrors.slice(0, 3))

    // 6) 专题排序
    await navigate(`${BASE}/admin/topics/1`, pageReady)
    dom = await html()
    console.log('\n专题排序 (/admin/topics/1)')
    check('专题名回填', hasText(dom, topicDetail.data.topic.name))
    check('已选文章按序显示', hasText(dom, topicDetail.data.articles[0].title))
    check('保存排序按钮', hasText(dom, '保存排序'))
    check('无控制台报错', consoleErrors.length === 0)
    if (consoleErrors.length) console.log('    错误:', consoleErrors.slice(0, 3))

    // 7) 分类 / 标签 / 站点配置 / 账号设置
    await navigate(`${BASE}/admin/categories`, pageReady)
    dom = await html()
    console.log('\n分类管理 (/admin/categories)')
    check('分类列表渲染', hasText(dom, '技术笔记'))
    check('无控制台报错', consoleErrors.length === 0)

    await navigate(`${BASE}/admin/tags`, pageReady)
    dom = await html()
    console.log('\n标签管理 (/admin/tags)')
    check('标签列表渲染', hasText(dom, 'SpringBoot'))
    check('无控制台报错', consoleErrors.length === 0)

    await navigate(`${BASE}/admin/settings`, pageReady)
    dom = await html()
    console.log('\n站点配置 (/admin/settings)')
    check('站点名称回填', hasText(dom, siteConfig.data.siteName))
    check('保留 Logo 上传', hasText(dom, '站点 Logo'))
    check('Hero 背景图上传', hasText(dom, 'Hero 背景图') && hasText(dom, '点击上传图片'))
    check('背景呼吸动画开关', hasText(dom, '背景呼吸动画') && hasText(dom, 'el-switch'))
    check(
      'Hero 背景图地址回填',
      !siteConfig.data.homeHeroImage || hasText(dom, siteConfig.data.homeHeroImage)
    )
    check('无控制台报错', consoleErrors.length === 0)

    await navigate(`${BASE}/admin/profile`, pageReady)
    dom = await html()
    console.log('\n账号设置 (/admin/profile)')
    check('显示管理员用户名', hasText(dom, 'admin'))
    check('改密表单', hasText(dom, '新密码'))
    check('无控制台报错', consoleErrors.length === 0)

    console.log(failures === 0 ? '\n后台渲染检查全部通过 ✅' : `\n共有 ${failures} 项未通过 ❌`)
  } finally {
    proc.kill()
  }
  process.exit(failures === 0 ? 0 : 1)
})().catch((error) => {
  console.error('后台冒烟测试失败:', error)
  process.exit(1)
})
