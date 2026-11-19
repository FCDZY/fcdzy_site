/**
 * 标签检查（首页改版后）：
 *   1) 首页文章卡片上的标签：带 # 前缀、纯文字（无背景/边框）、彩色、同卡相邻不撞色
 *   2) 点标签跳 /tag/*（不能误跳文章详情）
 *   3) 首页不再有标签云（发现区已移除），分类/标签入口走个人卡导航
 * 用法：node scripts/smoke-tags.cjs   可选 SMOKE_SHOT=<前缀>
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const PORT = 9863
const BASE = 'http://127.0.0.1:5173'
const OUT = process.env.SMOKE_SHOT || ''
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const alphaOf = (c) => (c && c.startsWith('rgba') ? Number(c.split(',')[3].replace(')', '').trim()) : 1)

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
  const rows = Array.from(document.querySelectorAll('.stream .article-card'))
  const card = rows.find((r) => r.querySelector('.tag')) || rows[0] || null
  const tags = card ? Array.from(card.querySelectorAll('.tag')) : []
  const first = tags[0] || null
  const r = first ? first.getBoundingClientRect() : null
  return JSON.stringify({
    hasCard: !!card,
    cardTagCount: tags.length,
    cardTagNames: tags.map((t) => t.textContent.trim()),
    cardTagColors: tags.map((t) => cs(t).color),
    tagBg: first ? cs(first).backgroundColor : '',
    tagBorder: first ? cs(first).borderTopWidth : '',
    tagRadius: first ? cs(first).borderTopLeftRadius : '',
    hrefs: Array.from(document.querySelectorAll('.stream .article-card .tag')).map((t) => {
      const a = t.closest('a')
      return a ? a.getAttribute('href') : ''
    }),
    firstTag: r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width) } : null,
    hasCloud: !!document.querySelector('.tag-cloud, .side-card')
  })
})()`

;(async () => {
  const profile = path.join(os.tmpdir(), 'dsh-smoke-tags-' + Date.now())
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
  const moveMouse = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 })
    await sleep(260)
  }
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
    await sleep(1500)
  }
  const shoot = async (name) => {
    const s = await send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(name, Buffer.from(s.result.data, 'base64'))
    console.log('  saved', name)
  }

  try {
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
    await send('Page.navigate', { url: BASE + '/' })
    await sleep(1500)
    await evaluate(`localStorage.setItem('fcdzy_theme','light'); location.reload()`)
    await sleep(4200)

    const light = JSON.parse(await evaluate(PROBE))
    console.log('【需求 1】卡片标签样式')
    check('文章卡片存在', light.hasCard)
    check('卡片底部渲染出小标签', light.cardTagCount >= 1, `${light.cardTagCount} 个：${light.cardTagNames.join(' / ')}`)
    check('保留 # 前缀', light.cardTagNames.every((n) => n.startsWith('#')), light.cardTagNames.join(' / '))
    check('无背景色块', alphaOf(light.tagBg) === 0, light.tagBg)
    check('无边框', light.tagBorder === '0px', light.tagBorder)
    check('无胶囊圆角（纯文字）', parseFloat(light.tagRadius) === 0, light.tagRadius)
    check(
      '标签为彩色（非灰色）',
      light.cardTagColors.every((c) => {
        const [r, g, b] = c.match(/\d+/g).map(Number)
        return Math.max(r, g, b) - Math.min(r, g, b) > 12
      }),
      light.cardTagColors.join(' / ')
    )
    const distinct = new Set(light.cardTagColors)
    check('不同标签颜色不同', distinct.size >= Math.min(2, light.cardTagCount), `${distinct.size} 种`)

    console.log('\n【需求 2】首页不再有标签云（入口走个人卡导航）')
    check('没有侧栏标签云', light.hasCloud === false)

    console.log('\n【需求 3】点标签跳 /tag/*，不误跳文章详情')
    if (light.firstTag) {
      // Hero 占满一屏，标签在视口外：先把它滚进视野再点
      await evaluate(`(() => { const t = document.querySelector('.stream .article-card .tag'); if (t) t.scrollIntoView({ block: 'center' }) })()`)
      await sleep(700)
      const tagRect = JSON.parse(await evaluate(`(() => { const t = document.querySelector('.stream .article-card .tag'); const b = t.getBoundingClientRect(); return JSON.stringify({ x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }) })()`))
      light.firstTag = tagRect
      await moveMouse(light.firstTag.x, light.firstTag.y)
      await click(light.firstTag.x, light.firstTag.y)
      const url = await evaluate('location.pathname')
      check('跳转到标签页', /^\/tag\//.test(url), url)
      const title = await evaluate(`document.querySelector('.page-title, h1, .tag-title')?.textContent?.trim() || ''`)
      check('标签页有标题渲染', title.length > 0, title)
      check('标签页有文章列表', (await evaluate("document.querySelectorAll('.article-card').length")) > 0)
    } else {
      check('首页首篇没有标签（跳过跳转检查）', true)
    }

    if (OUT) await shoot(`${OUT}-tags.png`)
  } finally {
    proc.kill()
  }

  console.log(failures === 0 ? '\n标签检查全部通过 ✅' : `\n共有 ${failures} 项未通过 ❌`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((error) => {
  console.error('标签检查失败:', error)
  process.exit(1)
})
