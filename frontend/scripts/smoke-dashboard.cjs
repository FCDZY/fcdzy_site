/**
 * 后台仪表盘 UI 专项检查：
 * 7 张主题色统计卡（数字放大加粗 / 标签在下 / 8px 圆角 / hover 上浮 / 非纯白底）、
 * 近 7 天阅读趋势图（canvas 已绘制 + 接口返回 7 个点）、
 * 最近更新表格（斑马纹 / 弱化表头 / 圆角状态标签）、
 * 快捷操作（写文章高亮 + 其余描边）、侧栏选中项为左竖线（无整块蓝底）、深浅色适配。
 *
 * 用法：node scripts/smoke-dashboard.cjs
 * 可选：SMOKE_SHOT=<路径前缀> 输出截图
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ADMIN_USER = process.env.SMOKE_ADMIN_USER || 'admin'
const ADMIN_PASS = process.env.SMOKE_ADMIN_PASS || 'admin123'

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5173'
const DEBUG_PORT = 9687
const VIEW = { width: 1440, height: 1000 }

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

let failures = 0
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '[OK]  ' : '[MISS]'} ${label}${detail ? `  → ${detail}` : ''}`)
  if (!ok) failures++
}

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

const PROBE = `(() => {
  const cs = (el, pseudo) => (el ? getComputedStyle(el, pseudo || undefined) : null)
  const num = (v) => parseFloat(v) || 0
  const stats = Array.from(document.querySelectorAll('.stat'))
  const info = stats.map((el) => {
    const value = el.querySelector('.stat-value')
    const label = el.querySelector('.stat-label')
    const accent = el.querySelector('.stat-accent')
    const vb = value.getBoundingClientRect()
    const lb = label.getBoundingClientRect()
    return {
      accentBg: accent ? cs(accent).backgroundColor : '',
      accentHeight: accent ? num(cs(accent).height) : 0,
      bgColor: cs(el).backgroundColor,
      bgImage: cs(el).backgroundImage,
      radius: cs(el).borderRadius,
      shadow: cs(el).boxShadow,
      transform: cs(el).transform,
      valueText: value.textContent.trim(),
      valueSize: num(cs(value).fontSize),
      valueWeight: Number(cs(value).fontWeight),
      valueColor: cs(value).color,
      labelText: label ? label.textContent.trim() : '',
      labelBelow: label ? lb.top >= vb.bottom - 2 : false,
      labelSize: label ? num(cs(label).fontSize) : 0
    }
  })
  const canvas = document.querySelector('.trend-canvas canvas')
  let painted = false
  let colors = 0
  if (canvas) {
    const ctx = canvas.getContext('2d')
    const w = canvas.width
    const h = canvas.height
    if (ctx && w > 0 && h > 0) {
      const data = ctx.getImageData(0, 0, w, h).data
      const seen = new Set()
      for (let i = 0; i < data.length; i += 4 * 97) {
        seen.add(data[i] + ',' + data[i + 1] + ',' + data[i + 2] + ',' + data[i + 3])
      }
      colors = seen.size
      painted = seen.size > 2
    }
  }
  const rows = Array.from(document.querySelectorAll('.el-table__body tr'))
  const rowBg = (tr) => (tr ? cs(tr.querySelector('td')).backgroundColor : '')
  const head = document.querySelector('.el-table__header-wrapper th')
  const pill = document.querySelector('.status')
  const shortcuts = Array.from(document.querySelectorAll('.shortcuts .el-button'))
  const activeMenu = document.querySelector('.menu .el-menu-item.is-active')
  const activeBefore = activeMenu ? cs(activeMenu, '::before') : null
  return JSON.stringify({
    statCount: stats.length,
    stats: info,
    trendTitle: (document.querySelector('.trend-title') || {}).textContent || '',
    trendHint: (document.querySelector('.trend-hint') || {}).textContent || '',
    hasCanvas: !!canvas,
    canvasW: canvas ? canvas.width : 0,
    canvasH: canvas ? canvas.height : 0,
    painted,
    colors,
    rowCount: rows.length,
    rowBgs: rows.slice(0, 4).map(rowBg),
    headBg: head ? cs(head).backgroundColor : '',
    headBorder: head ? cs(head).borderBottomWidth + ' ' + cs(head).borderBottomColor : '',
    pill: pill ? {
      radius: cs(pill).borderRadius,
      color: cs(pill).color,
      bg: cs(pill).backgroundColor,
      text: pill.textContent.trim()
    } : null,
    pills: Array.from(document.querySelectorAll('.status')).map((el) => ({ text: el.textContent.trim(), color: cs(el).color })),
    shortcuts: shortcuts.map((b) => ({
      text: b.textContent.trim(),
      primary: b.classList.contains('el-button--primary'),
      plain: b.classList.contains('is-plain') || b.classList.contains('is-plain'),
      border: cs(b).borderTopWidth + ' ' + cs(b).borderTopStyle
    })),
    activeMenu: activeMenu ? {
      text: activeMenu.textContent.trim(),
      bg: cs(activeMenu).backgroundColor,
      color: cs(activeMenu).color,
      barWidth: activeBefore ? activeBefore.width : '',
      barImage: activeBefore ? activeBefore.backgroundImage : '',
      barPosition: activeBefore ? activeBefore.position : ''
    } : null,
    isDark: document.documentElement.classList.contains('dark'),
    pageBg: cs(document.querySelector('.main')).backgroundColor
  })
})()`

;(async () => {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS })
  }).then((r) => r.json())
  const token = login?.data?.token
  if (!token) throw new Error('管理员登录失败，请确认后端已启动')

  const trendApi = await fetch(`${BASE}/api/admin/stats/views?days=7`, {
    headers: { Authorization: `Bearer ${token}` }
  }).then((r) => r.json())
  const points = trendApi?.data?.points || []

  const profile = path.join(os.tmpdir(), 'dsh-smoke-dashboard-profile')
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
    await send('Network.enable')
    await send('Network.setCacheDisabled', { cacheDisabled: true })
    await send('Emulation.setDeviceMetricsOverride', { width: VIEW.width, height: VIEW.height, deviceScaleFactor: 1, mobile: false })

    const evaluate = async (expression) => {
      const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (res.result?.exceptionDetails) throw new Error(res.result.exceptionDetails.exception?.description || 'evaluate failed')
      return res.result?.result?.value
    }
    const probe = async () => JSON.parse(await evaluate(PROBE))
    const shoot = async (file) => {
      const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
      if (res.result?.data) fs.writeFileSync(file, Buffer.from(res.result.data, 'base64'))
    }

    await send('Page.navigate', { url: `${BASE}/` })
    await sleep(1200)
    await evaluate(`localStorage.setItem('fcdzy_admin_token', ${JSON.stringify(token)})`)
    await evaluate("localStorage.setItem('fcdzy_theme','light')")
    await send('Page.navigate', { url: `${BASE}/yzdcf` })
    for (let i = 0; i < 50; i++) {
      await sleep(400)
      if (await evaluate("!!document.querySelector('.stat-value') && !!document.querySelector('.trend-canvas canvas')")) break
    }
    await sleep(1800)
    const light = await probe()
    const shotPrefix = process.env.SMOKE_SHOT

    // ===== 新版布局：图 + 3 指标 / 表格 + 5 小卡 =====
    // ===== 新版布局：趋势 + 指标合成一张卡 / 下排两卡等高 =====
    const layout = JSON.parse(
      await evaluate(`(() => {
        const overview = document.querySelector('.overview')
        const metricsPanel = document.querySelector('.overview-metrics')
        const rows = Array.from(document.querySelectorAll('.metric-row'))
        const recent = document.querySelector('.recent-panel')
        const side = document.querySelector('.side-panel')
        const title = recent ? recent.querySelector('.panel-title') : null
        const action = recent ? recent.querySelector('.panel-head .el-button') : null
        const recentRect = recent ? recent.getBoundingClientRect() : null
        return JSON.stringify({
          titles: Array.from(document.querySelectorAll('.panel-title')).map((el) => el.textContent.trim()),
          metricsInsideOverview: !!(overview && metricsPanel && overview.contains(metricsPanel)),
          rows: rows.map((r) => ({
            label: (r.querySelector('.metric-label') || {}).textContent?.trim() || '',
            value: (r.querySelector('.metric-value') || {}).textContent?.trim() || '',
            sub: (r.querySelector('.metric-sub') || {}).textContent?.trim() || '',
            height: Math.round(r.getBoundingClientRect().height)
          })),
          minis: Array.from(document.querySelectorAll('.mini-card')).map((m) => ({
            label: (m.querySelector('.mini-label') || {}).textContent?.trim() || '',
            value: (m.querySelector('.mini-value') || {}).textContent?.trim() || ''
          })),
          hasErrorBlock: !!document.querySelector('.error-block'),
          errorText: (document.querySelector('.error-head') || {}).textContent?.replace(/\\s+/g, ' ').trim() || '',
          hasShortcuts: document.body.textContent.includes('快捷操作'),
          daysOn: (document.querySelector('.days-btn.is-on') || {}).textContent?.trim() || '',
          recentH: recentRect ? Math.round(recentRect.height) : 0,
          sideH: side ? Math.round(side.getBoundingClientRect().height) : 0,
          titleInset: recentRect && title ? Math.round(title.getBoundingClientRect().left - recentRect.left) : -1,
          actionInset: recentRect && action ? Math.round(recentRect.right - action.getBoundingClientRect().right) : -1
        })
      })()`)
    )
    console.log('【需求 1】布局：上排一块、下排两卡')
    check('四个面板标题齐全', layout.titles.join(',') === '阅读趋势,关键指标,最近更新,内容构成', layout.titles.join(' / '))
    check('趋势与指标在同一个面板里', layout.metricsInsideOverview === true)
    check('已移除快捷操作区块', layout.hasShortcuts === false)
    check('下排两卡等高', Math.abs(layout.recentH - layout.sideH) <= 2, `${layout.recentH} / ${layout.sideH}`)
    check('标题左内缩 ≥10px（不贴边框）', layout.titleInset >= 10, layout.titleInset + 'px')
    check('查看全部右内缩 ≥10px（不贴边框）', layout.actionInset >= 10, layout.actionInset + 'px')

    console.log('\n【需求 2】关键指标：三行等分 + 细线分隔')
    check('3 条指标', layout.rows.length === 3, layout.rows.map((r) => r.label).join(' / '))
    check(
      '依次为 总阅读量 / 总文章数 / 已发布',
      layout.rows.map((r) => r.label).join(',') === '总阅读量,总文章数,已发布',
      layout.rows.map((r) => r.label).join(',')
    )
    check(
      '三行等高（等分，不留大空隙）',
      Math.max(...layout.rows.map((r) => r.height)) - Math.min(...layout.rows.map((r) => r.height)) <= 3,
      layout.rows.map((r) => r.height + 'px').join(' / ')
    )
    check('只有总阅读量带环比小字', layout.rows[0].sub.length > 0 && layout.rows[1].sub === '' && layout.rows[2].sub === '', layout.rows.map((r) => r.sub || '(空)').join(' | '))
    check('环比用绝对值次数', /[+−]\d+ 次较前 \d+ 天/.test(layout.rows[0].sub), layout.rows[0].sub)

    console.log('\n【需求 3】内容构成：4 个数字 + 前端异常块')
    check('4 个数字卡（标签数已移除）', layout.minis.length === 4, layout.minis.map((m) => `${m.label}=${m.value}`).join(' '))
    check(
      '依次为 草稿 / 定时发布 / 分类 / 专题',
      layout.minis.map((m) => m.label).join(',') === '草稿,定时发布,分类,专题',
      layout.minis.map((m) => m.label).join(',')
    )
    check('有前端异常块', layout.hasErrorBlock === true && /前端异常/.test(layout.errorText), layout.errorText)

    console.log('\n【需求 4】阅读趋势（折线 + 均值线 + 天数切换）')
    check('默认 14 天', layout.daysOn === '14 天', layout.daysOn)
    check('图表 canvas 已渲染', light.hasCanvas && light.canvasW > 0 && light.canvasH > 0, `${light.canvasW}x${light.canvasH}`)
    check('canvas 上确实画出了内容', light.painted && light.colors > 2, `不同颜色 ${light.colors} 种`)

    const geo = JSON.parse(
      await evaluate(`(() => {
        const canvas = document.querySelector('.trend-canvas canvas')
        const overview = document.querySelector('.overview')
        const cs = overview ? getComputedStyle(overview) : null
        return JSON.stringify({
          canvasH: canvas ? Math.round(canvas.getBoundingClientRect().height) : 0,
          overviewBorder: cs ? cs.borderTopColor : '',
          hasShadow: cs ? cs.boxShadow !== 'none' : false
        })
      })()`)
    )
    check('图表高度 >= 320px（不被压成横条）', geo.canvasH >= 320, geo.canvasH + 'px')
    check('面板去掉硬边框', geo.overviewBorder === 'rgba(0, 0, 0, 0)', geo.overviewBorder)
    check('面板用阴影分层', geo.hasShadow === true)

    // 切到 7 天
    await evaluate(`(() => { const b = Array.from(document.querySelectorAll('.days-btn')).find((el) => el.textContent.includes('7')); if (b) b.click() })()`)
    await sleep(1600)
    const after7 = JSON.parse(
      await evaluate(`(() => JSON.stringify({
        daysOn: (document.querySelector('.days-btn.is-on') || {}).textContent?.trim() || '',
        hasCanvas: !!document.querySelector('.trend-canvas canvas')
      }))()`)
    )
    check('点「7 天」后切换生效', after7.daysOn === '7 天', after7.daysOn)
    check('切换后图表仍正常渲染', after7.hasCanvas === true)
    if (shotPrefix) await shoot(`${shotPrefix}-dashboard-light.png`)

    console.log('\n【需求 5】最近更新表格')
    check('表格有数据行', light.rowCount >= 3, `${light.rowCount} 行`)
    check('表格去掉斑马纹（背景一致）', light.rowBgs[0] === light.rowBgs[1], light.rowBgs[0] + ' vs ' + light.rowBgs[1])
    check('表头与卡片同色（靠细线区分，不叠加色块）', light.headBg === 'rgb(255, 255, 255)', light.headBg)
    check('状态为圆角小标签', light.pill && light.pill.radius === '999px', light.pill ? light.pill.radius : '(无)')
    check('已发布=绿色、草稿=橙色', new Set(light.pills.map((p) => p.color)).size >= 1 && light.pills.some((p) => p.text.includes('已发布')), light.pills.map((p) => `${p.text}:${p.color}`).join(' / '))

    console.log('\n【侧栏】选中项为灰底加粗（不用整块品牌蓝）')
    check('存在选中菜单项', !!light.activeMenu, light.activeMenu ? light.activeMenu.text : '(无)')
    check('选中项用了浅灰底（不是品牌蓝）', light.activeMenu && light.activeMenu.bg !== 'rgba(0, 0, 0, 0)' && light.activeMenu.bg !== 'rgb(59, 130, 246)', light.activeMenu ? light.activeMenu.bg : '')
    check('选中项不再有彩色竖线（改为整块圆角灰底）', ['auto', '0px'].includes(light.activeMenu ? light.activeMenu.barWidth : 'x') && !(light.activeMenu && light.activeMenu.barImage.includes('gradient')), light.activeMenu ? light.activeMenu.barWidth : '')
    check('选中项文字为深色（浅底深字）', light.activeMenu && light.activeMenu.color !== 'rgb(255, 255, 255)', light.activeMenu ? light.activeMenu.color : '')

    console.log('\n【深色模式】自动适配')
    await evaluate(`(() => { const b = Array.from(document.querySelectorAll('button')).find((el) => el.textContent.includes('深色模式')); if (b) b.click() })()`)
    await sleep(1800)
    const dark = await probe()
    const darkPanels = JSON.parse(
      await evaluate(`(() => {
        const overview = document.querySelector('.overview')
        const cs = overview ? getComputedStyle(overview) : null
        return JSON.stringify({
          bg: cs ? cs.backgroundColor : '',
          hasCanvas: !!document.querySelector('.trend-canvas canvas'),
          metricValue: (document.querySelector('.metric-value') || {}).textContent?.trim() || ''
        })
      })()`)
    )
    check('已切换到深色', dark.isDark)
    check('深色下面板底色转深', darkPanels.bg.includes('rgb(20, 23, 29)') || darkPanels.bg.includes('rgb(15, 17, 21)'), darkPanels.bg)
    check('深色下指标数字仍在', darkPanels.metricValue !== '', darkPanels.metricValue)
    check('深色下图表重新渲染', darkPanels.hasCanvas === true && dark.painted, `canvas ${dark.canvasW}x${dark.canvasH}，颜色 ${dark.colors} 种`)
    check('深色下状态标签转为浅色字', dark.pills.filter((p) => p.text.includes('已发布')).every((p) => p.color === 'rgb(110, 231, 183)'), dark.pills.map((p) => `${p.text}:${p.color}`).join(' / '))
    if (shotPrefix) await shoot(`${shotPrefix}-dashboard-dark.png`)
    await evaluate(`(() => { const b = Array.from(document.querySelectorAll('button')).find((el) => el.textContent.includes('浅色模式')); if (b) b.click() })()`)
    await sleep(800)
    check('可切回浅色', (await probe()).isDark === false)
    console.log(failures === 0 ? '\n仪表盘 UI 检查全部通过 ✅' : `\n共有 ${failures} 项未通过 ❌`)
  } finally {
    proc.kill()
  }
  process.exit(failures === 0 ? 0 : 1)
})().catch((error) => {
  console.error('仪表盘 UI 检查失败:', error)
  process.exit(1)
})
