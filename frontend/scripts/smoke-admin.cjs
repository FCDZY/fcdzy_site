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
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '[OK]  ' : '[MISS]'} ${label}${detail ? `  → ${detail}` : ''}`)
  if (!ok) failures++
}

/** 判断颜色是否为深色底（Element Plus 深色变量与自定义 token 取值不同，按亮度判定更稳） */
function brightness(value) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value || '')
  if (!m) return -1
  return (Number(m[1]) + Number(m[2]) + Number(m[3])) / 3
}
const isDarkColor = (v) => brightness(v) >= 0 && brightness(v) < 70
const isLightColor = (v) => brightness(v) > 150

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

    // 可选：以深色模式跑一遍后台（SMOKE_THEME=dark）
    const darkMode = process.env.SMOKE_THEME === 'dark'
    if (darkMode) {
      // 先清掉 token，否则 /admin/login 会被路由守卫重定向回仪表盘（读不到登录卡片）
      await evaluate("localStorage.removeItem('fcdzy_admin_token')")
      await evaluate("localStorage.setItem('fcdzy_theme', 'dark')")
      await navigate(`${BASE}/admin/login`, pageReady)
      console.log('\n深色模式后台（SMOKE_THEME=dark）')
      const probe = `JSON.stringify({
        isDark: document.documentElement.classList.contains('dark'),
        bodyBg: getComputedStyle(document.body).backgroundColor,
        cardBg: (() => { const c = document.querySelector('.login-card') || document.querySelector('.el-card'); return c ? getComputedStyle(c).backgroundColor : '' })()
      })`
      const loginDark = JSON.parse(await evaluate(probe))
      check('html.dark 生效', loginDark.isDark)
      check('页面底色为深色', loginDark.bodyBg === 'rgb(15, 17, 21)', loginDark.bodyBg)
      check('登录卡片为深色面板', isDarkColor(loginDark.cardBg), loginDark.cardBg)
      if (process.env.SMOKE_SHOT) {
        const shot = await send('Page.captureScreenshot', { format: 'png' })
        if (shot.result?.data) fs.writeFileSync(`${process.env.SMOKE_SHOT}-admin-login.png`, Buffer.from(shot.result.data, 'base64'))
      }
      // 恢复 token，后面的仪表盘检查需要登录态
      await evaluate(`localStorage.setItem('fcdzy_admin_token', ${JSON.stringify(token)})`)
    }

    // 3) 仪表盘
    await navigate(`${BASE}/admin`, pageReady)
    let dom = await html()
    console.log('\n仪表盘 (/admin)')
    check('侧边菜单渲染', hasText(dom, '文章管理') && hasText(dom, '站点配置'))
    check('统计数字渲染', hasText(dom, String(stats.data.articleCount)))
    check('最近更新表格有条目', hasText(dom, articles.data.list[0].title))
    check('无控制台报错', consoleErrors.length === 0)
    if (consoleErrors.length) console.log('    错误:', consoleErrors.slice(0, 3))

    if (darkMode) {
      const dashDark = JSON.parse(
        await evaluate(
          `JSON.stringify({
            isDark: document.documentElement.classList.contains('dark'),
            asideBg: getComputedStyle(document.querySelector('.aside')).backgroundColor,
            headerBg: getComputedStyle(document.querySelector('.header')).backgroundColor,
            cardBg: (() => { const c = document.querySelector('.panel') || document.querySelector('.el-card'); return c ? getComputedStyle(c).backgroundColor : '' })(),
            tableBg: (() => { const t = document.querySelector('.el-table'); return t ? getComputedStyle(t).backgroundColor : '' })(),
            menuText: (() => { const m = document.querySelector('.el-menu-item'); return m ? getComputedStyle(m).color : '' })()
          })`
        )
      )
      console.log('  深色仪表盘计算样式')
      check('侧边栏为深色', isDarkColor(dashDark.asideBg), dashDark.asideBg)
      check('顶栏为深色面板', isDarkColor(dashDark.headerBg), dashDark.headerBg)
      check('统计卡片为深色', isDarkColor(dashDark.cardBg), dashDark.cardBg)
      check('表格同步深色', isDarkColor(dashDark.tableBg), dashDark.tableBg)
      check('菜单文字为浅色', isLightColor(dashDark.menuText), dashDark.menuText)
      if (process.env.SMOKE_SHOT) {
        await navigate(`${BASE}/admin`, pageReady)
        const shot = await send('Page.captureScreenshot', { format: 'png' })
        if (shot.result?.data) fs.writeFileSync(`${process.env.SMOKE_SHOT}-admin-dashboard.png`, Buffer.from(shot.result.data, 'base64'))
      }
    }

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
    check(
      '三个动作按钮（保存草稿 / 设置定时发布 / 立即发布）',
      hasText(dom, '保存草稿') && hasText(dom, '设置定时发布') && hasText(dom, '立即发布')
    )
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
    check('已移除「站点名称」表单项', !hasText(dom, '站点名称'))
    check('已移除「站点副标题」表单项', !hasText(dom, '站点副标题'))
    check('已移除「站点 Logo」表单项', !hasText(dom, '站点 Logo'))
    check('基本信息从「站点描述」开始', hasText(dom, '站点描述'))
    check('favicon 配置保留', hasText(dom, '站点图标（favicon）'))
    check(
      '接口不再返回 siteName / siteSubtitle / siteLogo',
      !siteConfig.data.siteName && !siteConfig.data.siteSubtitle && !siteConfig.data.siteLogo,
      `keys=${Object.keys(siteConfig.data).join(',')}`
    )
    // 上传器只有在「没有图片」时才显示「点击上传图片」，这里只校验配置项与地址回填
    check('浅色全局背景图配置项', hasText(dom, '全局背景图（浅色）'))
    check('深色全局背景图配置项', hasText(dom, '全局背景图（深色）'))
    check('背景呼吸动画开关', hasText(dom, '背景呼吸动画') && hasText(dom, 'el-switch'))
    check(
      '背景图地址回填',
      !siteConfig.data.homeHeroImage || hasText(dom, siteConfig.data.homeHeroImage)
    )
    check(
      '深色背景图地址回填',
      !siteConfig.data.homeHeroImageDark || hasText(dom, siteConfig.data.homeHeroImageDark)
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
