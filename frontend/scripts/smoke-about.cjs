/**
 * 关于页检查（编辑式：无卡片、无玻璃、白纸黑字 + 细线）
 *  - 两块内容区（作者 / 站点信息）透明、无阴影、靠上下细线分区
 *  - 标题墨色、副标题浅灰、正文深灰
 *  - 描述表去边框感，只留横线
 *  - 链接 / 次要按钮不再用白字
 * 用法：node scripts/smoke-about.cjs  可选 SMOKE_SHOT=<前缀>
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const PORT = 9867
const BASE = 'http://127.0.0.1:5173'
const OUT = process.env.SMOKE_SHOT || ''
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const alphaOf = (c) => (c && c.startsWith('rgba') ? Number(c.split(',')[3].replace(')', '').trim()) : 1)
const luminanceOf = (c) => {
  const m = (c || '').match(/\d+/g)
  if (!m) return 255
  return (Number(m[0]) * 299 + Number(m[1]) * 587 + Number(m[2]) * 114) / 1000
}

let failures = 0
function check(label, ok, detail) {
  if (ok) console.log(`  [OK]   ${label}${detail ? '  → ' + detail : ''}`)
  else {
    failures += 1
    console.log(`  [MISS] ${label}${detail ? '  → ' + detail : ''}`)
  }
}

const PROBE = `(() => {
  const cs = (el) => (el ? getComputedStyle(el) : null)
  const blocks = Array.from(document.querySelectorAll('.about-block'))
  const first = blocks[0] || null
  const name = document.querySelector('.author-name')
  const bio = document.querySelector('.author-bio')
  const blockTitle = document.querySelector('.block-title')
  const title = document.querySelector('.page-title')
  const sub = document.querySelector('.page-subtitle')
  const cell = document.querySelector('.el-descriptions__cell')
  const label = document.querySelector('.el-descriptions__label')
  const link = document.querySelector('.about-page .link')
  return JSON.stringify({
    blockCount: blocks.length,
    blockBg: first ? cs(first).backgroundColor : '',
    blockShadow: first ? cs(first).boxShadow : '',
    blockBorderTop: first ? cs(first).borderTopWidth : '',
    pageBg: (() => { const p = document.querySelector('.about-page'); return p ? cs(p).backgroundColor : '' })(),
    titleColor: title ? cs(title).color : '',
    titleShadow: title ? cs(title).textShadow : '',
    subColor: sub ? cs(sub).color : '',
    nameColor: name ? cs(name).color : '',
    bioColor: bio ? cs(bio).color : '',
    blockTitleColor: blockTitle ? cs(blockTitle).color : '',
    cellBg: cell ? cs(cell).backgroundColor : '',
    cellColor: cell ? cs(cell).color : '',
    labelColor: label ? cs(label).color : '',
    linkColor: link ? cs(link).color : '',
    hasGlass: !!document.querySelector('.about-page .card--dark')
  })
})()`

;(async () => {
  const profile = path.join(os.tmpdir(), 'dsh-smoke-about-' + Date.now())
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
    await send('Page.navigate', { url: BASE + '/about' })
    await sleep(1500)
    await evaluate(`localStorage.setItem('fcdzy_theme','light'); location.reload()`)
    await sleep(4000)

    const light = JSON.parse(await evaluate(PROBE))
    console.log('【需求 1】两块内容区：透明 + 细线（不再是深色玻璃卡）')
    check('页面两块内容区', light.blockCount === 2, `${light.blockCount} 块`)
    check('没有深色玻璃卡片残留', light.hasGlass === false)
    check('内容区透明', alphaOf(light.blockBg) === 0, light.blockBg)
    check('内容区无阴影', light.blockShadow === 'none', light.blockShadow)
    check('内容区靠 1px 细线分区', light.blockBorderTop.startsWith('1px'), light.blockBorderTop)

    console.log('\n【需求 2】文字层级：墨色 / 深灰 / 浅灰')
    check('页面标题为墨色（不是白字）', luminanceOf(light.titleColor) < 90, light.titleColor)
    check('标题无深色投影', light.titleShadow === 'none', light.titleShadow)
    check('副标题为浅灰（比正文淡）', luminanceOf(light.subColor) >= 100, light.subColor)
    check('站长名称为墨色', luminanceOf(light.nameColor) < 90, light.nameColor)
    check('简介为深灰（可读）', luminanceOf(light.bioColor) < 170, light.bioColor)
    check('「站点信息」标题为墨色', luminanceOf(light.blockTitleColor) < 90, light.blockTitleColor)

    console.log('\n【需求 3】描述表去边框感')
    check('单元格背景透明', alphaOf(light.cellBg) === 0, light.cellBg)
    check('标签列文字为浅灰', luminanceOf(light.labelColor) >= 100, light.labelColor)
    check('值列文字可读（深色）', luminanceOf(light.cellColor) < 170, light.cellColor)

    console.log('\n【需求 4】链接不再白字')
    check('邮箱/GitHub 链接为深灰', luminanceOf(light.linkColor) < 170, light.linkColor)

    if (OUT) {
      const s = await send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(`${OUT}-about.png`, Buffer.from(s.result.data, 'base64'))
      console.log('  saved', `${OUT}-about.png`)
    }

    console.log('\n【需求 5】深色模式')
    await evaluate(`localStorage.setItem('fcdzy_theme','dark'); location.reload()`)
    await sleep(3500)
    const dark = JSON.parse(await evaluate(PROBE))
    check('深色下标题转为浅色', luminanceOf(dark.titleColor) > 150, dark.titleColor)
    check('深色下内容区仍透明', alphaOf(dark.blockBg) === 0, dark.blockBg)
    check('深色下简介转为浅灰', dark.bioColor !== light.bioColor, `${light.bioColor} → ${dark.bioColor}`)
  } finally {
    proc.kill()
  }

  console.log(failures === 0 ? '\n关于页检查全部通过 ✅' : `\n共有 ${failures} 项未通过 ❌`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((error) => {
  console.error('关于页检查失败:', error)
  process.exit(1)
})
