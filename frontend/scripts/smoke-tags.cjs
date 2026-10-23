/**
 * 侧边栏「标签」模块专项检查：
 * 图标标题、流式换行、彩色纯文字（无背景/无边框）、hover 放大变色、点击跳转、毛玻璃卡片、深浅色适配。
 *
 * 用法：node scripts/smoke-tags.cjs
 * 可选：SMOKE_SHOT=<路径前缀> 输出浅色/深色截图
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5173'
const DEBUG_PORT = 9673
const VIEW = { width: 1440, height: 900 }

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

const alphaOf = (color) => {
  const m = /rgba?\([^)]*,\s*([\d.]+)\s*\)/.exec(color || '')
  return m ? Number(m[1]) : 1
}

const PROBE = `(() => {
  const cs = (el, pseudo) => (el ? getComputedStyle(el, pseudo || undefined) : null)
  const card = Array.from(document.querySelectorAll('.side-card')).find(
    (c) => c.querySelector('.side-title') && c.querySelector('.side-title').textContent.includes('标签')
  )
  const title = card ? card.querySelector('.side-title') : null
  const cloud = card ? card.querySelector('.tag-cloud') : null
  const tags = card ? Array.from(card.querySelectorAll('.tag')) : []
  const rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { left: Math.round(b.left), top: Math.round(b.top), right: Math.round(b.right), bottom: Math.round(b.bottom), width: Math.round(b.width), height: Math.round(b.height), cx: Math.round(b.left + b.width / 2), cy: Math.round(b.top + b.height / 2) } }
  const rows = {}
  tags.forEach((t) => { const top = Math.round(t.getBoundingClientRect().top); rows[top] = (rows[top] || 0) + 1 })
  return JSON.stringify({
    isDark: document.documentElement.classList.contains('dark'),
    hasCard: !!card,
    cardBg: card ? cs(card).backgroundColor : '',
    cardBlur: card ? (cs(card).backdropFilter || cs(card).webkitBackdropFilter) : '',
    cardBorderWidth: card ? cs(card).borderTopWidth : '',
    titleText: title ? title.textContent.replace(/\\s+/g, ' ').trim() : '',
    titleHasIcon: !!(title && title.querySelector('.el-icon svg')),
    titleIconTag: title && title.querySelector('.el-icon svg') ? title.querySelector('.el-icon svg').tagName.toLowerCase() : '',
    titleDisplay: title ? cs(title).display : '',
    cloudDisplay: cloud ? cs(cloud).display : '',
    cloudWrap: cloud ? cs(cloud).flexWrap : '',
    tagCount: tags.length,
    tagNames: tags.map((t) => t.textContent.trim()),
    tagColors: tags.map((t) => cs(t).color),
    tagBg: tags.length ? cs(tags[0]).backgroundColor : '',
    tagBorderWidth: tags.length ? cs(tags[0]).borderTopWidth : '',
    tagRadius: tags.length ? cs(tags[0]).borderRadius : '',
    tagPadding: tags.length ? cs(tags[0]).padding : '',
    tagFontSize: tags.length ? cs(tags[0]).fontSize : '',
    tagTransform: tags.length ? cs(tags[0]).transform : '',
    tagFilter: tags.length ? cs(tags[0]).filter : '',
    firstTag: rect(tags[0]),
    secondTag: rect(tags[1]),
    rowCount: Object.keys(rows).length,
    rowsPerLine: Object.values(rows),
    hrefs: tags.map((t) => t.getAttribute('href')),
    /* 文章卡片底部的小标签 */
    cardTagCount: document.querySelectorAll('.article-card .tag').length,
    cardTagNames: Array.from(document.querySelectorAll('.article-card .tag')).map((t) => t.textContent.trim()),
    cardTagColors: Array.from(document.querySelectorAll('.article-card .tag')).map((t) => cs(t).color),
    /* 按卡片分组，用于校验「同一张卡片内相邻不撞色」 */
    cardTagGroups: Array.from(document.querySelectorAll('.article-card')).map((c) =>
      Array.from(c.querySelectorAll('.tag')).map((t) => cs(t).color)
    ),
    cardTagBg: document.querySelector('.article-card .tag') ? cs(document.querySelector('.article-card .tag')).backgroundColor : '',
    cardTagBorder: document.querySelector('.article-card .tag') ? cs(document.querySelector('.article-card .tag')).borderTopWidth : '',
    cardTagRadius: document.querySelector('.article-card .tag') ? cs(document.querySelector('.article-card .tag')).borderRadius : '',
    path: location.pathname + location.search
  })
})()`

;(async () => {
  const profile = path.join(os.tmpdir(), 'dsh-smoke-tags-profile')
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
    const goto = async (url, ready = "!!document.querySelector('.tag-cloud .tag')") => {
      await send('Page.navigate', { url })
      for (let i = 0; i < 40; i++) {
        await sleep(300)
        if (await evaluate(ready).catch(() => false)) {
          await sleep(700)
          return
        }
      }
    }
    const moveMouse = async (x, y) => {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 })
      await sleep(420)
    }
    const click = async (x, y) => {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 })
      await sleep(120)
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 })
      await sleep(900)
    }
    const shoot = async (file) => {
      const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
      if (res.result?.data) fs.writeFileSync(file, Buffer.from(res.result.data, 'base64'))
    }

    const shotPrefix = process.env.SMOKE_SHOT

    await goto(`${BASE}/`)
    const light = await probe()

    console.log('【需求 1】标题：标签图标 + 「标签」')
    check('找到标签模块卡片', light.hasCard)
    check('标题含「标签」文字', light.titleText === '标签', light.titleText)
    check('标题前有标签图标（svg）', light.titleHasIcon, light.titleIconTag || '(无图标)')
    check('标题为 flex 行内排布（图标与文字同一行）', light.titleDisplay === 'flex', light.titleDisplay)

    console.log('\n【需求 2】流式换行排布')
    check('标签容器为 flex', light.cloudDisplay === 'flex', light.cloudDisplay)
    check('允许自动换行', light.cloudWrap === 'wrap', light.cloudWrap)
    check('至少渲染 4 个标签', light.tagCount >= 4, `${light.tagCount} 个：${light.tagNames.join(' / ')}`)
    check('默认同一行能放多个标签', light.rowsPerLine.some((n) => n >= 2), `每行个数 ${light.rowsPerLine.join(' / ')}`)
    // 把容器压窄，验证空间不足时确实换行
    await evaluate(`(() => { const el = document.querySelector('.side-card .tag-cloud'); if (el) { el.dataset.prevWidth = el.style.width; el.style.width = '110px' } })()`)
    await sleep(300)
    const narrow = await probe()
    await evaluate(`(() => { const el = document.querySelector('.side-card .tag-cloud'); if (el) { el.style.width = el.dataset.prevWidth || '' } })()`)
    await sleep(300)
    check('容器变窄时标签换到下一行', narrow.rowCount >= 2, `压窄后占 ${narrow.rowCount} 行`)

    console.log('\n【需求 3】彩色纯文字：无背景、无边框、颜色分散')
    check('标签无背景色块', alphaOf(light.tagBg) === 0, light.tagBg)
    check('标签无边框', light.tagBorderWidth === '0px', light.tagBorderWidth)
    check('标签无胶囊圆角（纯文字）', parseFloat(light.tagRadius) === 0, light.tagRadius)
    check('标签无内边距（不是按钮）', light.tagPadding === '0px', light.tagPadding)
    const distinct = new Set(light.tagColors)
    check('不同标签颜色不同（至少 3 种）', distinct.size >= 3, `${distinct.size} 种：${light.tagColors.join(' / ')}`)
    const adjacentDup = light.tagColors.some((c, i) => i > 0 && c === light.tagColors[i - 1])
    check('相邻标签不会撞色', !adjacentDup, light.tagColors.join(' → '))
    console.log('\n【文章卡片小标签】同样是随机彩色纯文字')
    check('卡片底部渲染出小标签', light.cardTagCount >= 1, `${light.cardTagCount} 个：${light.cardTagNames.join(' / ')}`)
    check('保留 # 前缀', light.cardTagNames.every((n) => n.startsWith('#')), light.cardTagNames.join(' / '))
    check('小标签无背景色块', alphaOf(light.cardTagBg) === 0, light.cardTagBg)
    check('小标签无边框', light.cardTagBorder === '0px', light.cardTagBorder)
    const cardDistinct = new Set(light.cardTagColors)
    check('小标签为彩色（非灰色）', light.cardTagColors.every((c) => { const [r, g, b] = c.match(/\d+/g).map(Number); return Math.max(r, g, b) - Math.min(r, g, b) > 12 }), light.cardTagColors.join(' / '))
    check('小标签之间颜色不同', cardDistinct.size >= Math.min(2, light.cardTagCount), `${cardDistinct.size} 种：${light.cardTagColors.join(' / ')}`)
    const cardAdjacentDup = light.cardTagGroups.some((group) => group.some((c, i) => i > 0 && c === group[i - 1]))
    check('小标签在同一卡片内相邻不撞色', !cardAdjacentDup, light.cardTagGroups.map((g) => g.length).join(' / ') + ' 个/卡片')

    console.log('\n【需求 5】毛玻璃卡片、无白色硬框')
    check('卡片为半透明底（非白色实底）', alphaOf(light.cardBg) > 0 && alphaOf(light.cardBg) < 1, `${light.cardBg}（alpha=${alphaOf(light.cardBg)}）`)
    check('卡片启用毛玻璃', light.cardBlur.includes('blur'), light.cardBlur)

    if (shotPrefix) await shoot(`${shotPrefix}-tags-light.png`)

    console.log('\n【需求 4】hover 轻微放大并变色')
    // 标签卡片在首屏之外，先滚入视口再派发真实鼠标事件
    await evaluate("document.querySelector('.side-card .tag-cloud').scrollIntoView({ block: 'center' })")
    await sleep(700)
    const before = await probe()
    await moveMouse(before.firstTag.cx, before.firstTag.cy)
    const hovered = await probe()
    const scaleOf = (t) => {
      const m = /matrix\(([\d.]+)/.exec(t || '')
      return m ? Number(m[1]) : 1
    }
    check('hover 后文字放大（scale > 1）', scaleOf(hovered.tagTransform) > 1.02, `${hovered.tagTransform}（scale≈${scaleOf(hovered.tagTransform).toFixed(2)}）`)
    check('hover 后颜色/亮度发生变化', hovered.tagFilter !== 'none' && hovered.tagFilter !== before.tagFilter, `${before.tagFilter} → ${hovered.tagFilter}`)
    await moveMouse(5, 5)
    const restored = await probe()
    check('移开鼠标后恢复原样', scaleOf(restored.tagTransform) <= 1.02, restored.tagTransform)

    console.log('\n【需求 4】点击标签跳转到对应标签的文章列表')
    check('标签链接指向 /tag/*', light.hrefs.every((h) => h && h.startsWith('/tag/')), light.hrefs.join(' / '))
    // 用滚动之后的坐标（滚动会改变元素位置）
    const target = restored.firstTag
    const expectPath = light.hrefs[0]
    await click(target.cx, target.cy)
    const afterClick = await probe()
    check(
      '点击后进入对应标签页',
      afterClick.path.startsWith(expectPath),
      `${afterClick.path}（期望以 ${expectPath} 开头）`
    )

    console.log('\n【需求 5】深色模式下颜色自动适配')
    await goto(`${BASE}/`)
    await evaluate(`(() => { const b = document.querySelector('.theme-toggle'); if (b) b.click() })()`)
    await sleep(900)
    const dark = await probe()
    check('深色模式已生效', dark.isDark)
    check('深色下标签仍为彩色纯文字', alphaOf(dark.tagBg) === 0 && dark.tagBorderWidth === '0px', `${dark.tagBg} / ${dark.tagBorderWidth}`)
    check(
      '深色下标签仍为同一套亮色调色板',
      dark.tagColors.length > 0 && dark.tagColors.every((c) => {
        const [r, g, b] = c.match(/\d+/g).map(Number)
        return Math.max(r, g, b) - Math.min(r, g, b) > 12
      }),
      `${dark.tagColors.join(' / ')}`
    )
    if (shotPrefix) {
      await shoot(`${shotPrefix}-tags-dark.png`)
    }
    await evaluate(`(() => { const b = document.querySelector('.theme-toggle'); if (b) b.click() })()`)
    await sleep(700)
    check('可切回浅色', (await probe()).isDark === false)

    console.log(failures === 0 ? '\n标签模块检查全部通过 ✅' : `\n共有 ${failures} 项未通过 ❌`)
  } finally {
    proc.kill()
  }
  process.exit(failures === 0 ? 0 : 1)
})().catch((error) => {
  console.error('标签模块检查失败:', error)
  process.exit(1)
})
