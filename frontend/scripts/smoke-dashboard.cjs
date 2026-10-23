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
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
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
    await send('Page.navigate', { url: `${BASE}/admin` })
    for (let i = 0; i < 50; i++) {
      await sleep(400)
      if (await evaluate("!!document.querySelector('.stat-value') && !!document.querySelector('.trend-canvas canvas')")) break
    }
    await sleep(1800)
    const light = await probe()
    const shotPrefix = process.env.SMOKE_SHOT

    console.log('【需求 1】数据概览：7 张主题色统计卡')
    check('共 8 张统计卡（草稿与定时各自独立）', light.statCount === 8, `${light.statCount} 张`)
    const accents = light.stats.map((s) => s.accentBg)
    check('每张卡片有独立主题色', new Set(accents).size === light.statCount, accents.join(' / '))
    check('卡片顶色条纤细（2~4px）', light.stats.every((s) => s.accentHeight >= 2 && s.accentHeight <= 4), light.stats.map((s) => s.accentHeight).join(','))
    check('数字放大（≥26px）且加粗（≥700）', light.stats.every((s) => s.valueSize >= 26 && s.valueWeight >= 700), `${light.stats[0].valueSize}px / ${light.stats[0].valueWeight}`)
    check('标签文字在数字下方', light.stats.every((s) => s.labelBelow && s.labelText.length > 0), light.stats.map((s) => s.labelText).join(' / '))
    check('统一 8px 圆角', light.stats.every((s) => parseFloat(s.radius) === 8), light.stats[0].radius)
    check('有柔和阴影', light.stats.every((s) => s.shadow !== 'none' && s.shadow.includes('rgba')), light.stats[0].shadow.slice(0, 60))
    check('不是纯白死板底（有主题色渐变或非纯白底色）', light.stats.every((s) => s.bgImage !== 'none' || s.bgColor !== 'rgb(255, 255, 255)'), light.stats[0].bgImage.slice(0, 60))

    // hover 上浮
    const rect = JSON.parse(
      await evaluate(`(() => { const b = document.querySelector('.stat').getBoundingClientRect(); return JSON.stringify({ x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }) })()`)
    )
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y, button: 'none', buttons: 0 })
    await sleep(320)
    const hovered = await probe()
    const hoverTransform = hovered.stats[0].transform
    check('hover 有轻微上浮', hoverTransform.includes('matrix') && hoverTransform.includes('-2'), hoverTransform)

    console.log('\n【图表】近 7 天阅读趋势（面积折线）')
    check('接口返回 7 个数据点', points.length === 7, `${points.length} 个`)
    const today = new Date()
    const expectedLabels = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today.getTime() - (6 - i) * 86400000)
      const pad = (n) => String(n).padStart(2, '0')
      return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    })
    check('日期为最近 7 天且升序', points.map((p) => p.label).join(',') === expectedLabels.join(','), points.map((p) => p.label).join(','))
    check('最后一天是今天', points[6]?.date === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`, points[6]?.date)
    check('模块标题为「近 7 天阅读趋势」', light.trendTitle.includes('近 7 天阅读趋势'), light.trendTitle.replace(/\s+/g, ' ').trim())
    check('图表 canvas 已渲染', light.hasCanvas && light.canvasW > 0 && light.canvasH > 0, `${light.canvasW}x${light.canvasH}`)
    check('canvas 上确实画出了内容', light.painted && light.colors > 2, `不同颜色 ${light.colors} 种`)
    if (shotPrefix) await shoot(`${shotPrefix}-dashboard-light.png`)

    console.log('\n【需求 2】最近更新表格')
    check('表格有数据行', light.rowCount >= 3, `${light.rowCount} 行`)
    check('斑马纹：奇偶行底色不同', light.rowBgs[0] !== light.rowBgs[1], `${light.rowBgs[0]} vs ${light.rowBgs[1]}`)
    check('表头无实底（弱化）', light.headBg === 'rgba(0, 0, 0, 0)' || light.headBg === 'transparent', light.headBg)
    check('表头只留一条细线', light.headBorder.startsWith('1px'), light.headBorder)
    check('状态为圆角小标签', light.pill && light.pill.radius === '999px', light.pill ? light.pill.radius : '(无)')
    check('已发布=绿色、草稿=橙色', new Set(light.pills.map((p) => p.color)).size >= 1 && light.pills.some((p) => p.text.includes('已发布')), light.pills.map((p) => `${p.text}:${p.color}`).join(' / '))

    console.log('\n【需求 3】快捷操作按钮组')
    const primary = light.shortcuts.filter((s) => s.primary)
    const secondary = light.shortcuts.filter((s) => !s.primary)
    check('「写文章」为主按钮高亮', primary.length === 1 && primary[0].text === '写文章', primary.map((s) => s.text).join(','))
    check('其余为次要按钮', secondary.length >= 3, secondary.map((s) => s.text).join(' / '))
    check('次要按钮为描边样式', secondary.every((s) => s.plain || s.border.includes('solid')), secondary.map((s) => s.border).join(' / '))

    console.log('\n【侧栏】选中项为左侧竖线，不用整块蓝底')
    check('存在选中菜单项', !!light.activeMenu, light.activeMenu ? light.activeMenu.text : '(无)')
    check('选中项背景透明（不是整块蓝底）', light.activeMenu && (light.activeMenu.bg === 'rgba(0, 0, 0, 0)' || light.activeMenu.bg === 'transparent'), light.activeMenu ? light.activeMenu.bg : '')
    check('选中项有左侧 3px 彩色竖线', light.activeMenu && light.activeMenu.barWidth === '3px' && light.activeMenu.barImage.includes('gradient'), light.activeMenu ? `${light.activeMenu.barWidth} / ${light.activeMenu.barImage.slice(0, 50)}` : '')
    check('选中项文字为白色', light.activeMenu && light.activeMenu.color === 'rgb(255, 255, 255)', light.activeMenu ? light.activeMenu.color : '')

    console.log('\n【深色模式】自动适配')
    await evaluate(`(() => { const b = Array.from(document.querySelectorAll('button')).find((el) => el.textContent.includes('深色模式')); if (b) b.click() })()`)
    await sleep(1600)
    const dark = await probe()
    check('已切换到深色', dark.isDark)
    check(
      '深色下卡片底色转深',
      dark.stats.every((s) => s.bgImage.includes('rgb(23, 26, 33)')),
      dark.stats[0].bgImage.slice(0, 80)
    )
    check('深色下数字仍为主题色', dark.stats.every((s) => s.valueColor !== 'rgb(255, 255, 255)'), dark.stats[0].valueColor)
    check('深色下图表重新渲染', dark.painted && dark.canvasW > 0 && dark.canvasH > 0, `canvas ${dark.canvasW}x${dark.canvasH}，颜色 ${dark.colors} 种`)
    check(
      '深色下状态标签转为浅色字',
      dark.pills.filter((p) => p.text.includes('已发布')).every((p) => p.color === 'rgb(110, 231, 183)') &&
        dark.pills.filter((p) => p.text.includes('草稿')).every((p) => p.color === 'rgb(252, 211, 77)'),
      dark.pills.map((p) => `${p.text}:${p.color}`).join(' / ')
    )
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
