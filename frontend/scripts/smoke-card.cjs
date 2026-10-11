/**
 * 文章卡片 hover 交互检查：用 CDP 派发真实鼠标移动事件，读取 hover 前后的计算样式。
 * 用法：node scripts/smoke-card.cjs
 * 可选：SMOKE_SHOT=<路径前缀> 时额外输出 before/after 截图
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5173'
const API = process.env.SMOKE_API || 'http://127.0.0.1:8080'
const DEBUG_PORT = 9555
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
      /* 等待端口 */
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
  const card = document.querySelector('.article-card')
  const media = card ? card.querySelector('.card-media') : null
  const side = document.querySelector('.side-card')
  const heroBg = document.querySelector('.hero-bg')
  const rect = card ? card.getBoundingClientRect() : null
  const sideRect = side ? side.getBoundingClientRect() : null
  return JSON.stringify({
    cardCount: document.querySelectorAll('.article-card').length,
    transform: cs(card) ? cs(card).transform : '',
    boxShadow: cs(card) ? cs(card).boxShadow : '',
    borderColor: cs(card) ? cs(card).borderColor : '',
    display: cs(card) ? cs(card).display : '',
    padding: cs(card) ? cs(card).padding : '',
    gap: cs(card) ? cs(card).gap : '',
    transitionProperty: cs(card) ? cs(card).transitionProperty : '',
    transitionDuration: cs(card) ? cs(card).transitionDuration : '',
    transitionTiming: cs(card) ? cs(card).transitionTimingFunction : '',
    cardWidth: rect ? Math.round(rect.width) : 0,
    cardHeight: rect ? Math.round(rect.height) : 0,
    bodyWidth: card && card.querySelector('.body') ? Math.round(card.querySelector('.body').getBoundingClientRect().width) : 0,
    center: rect ? { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) } : null,
    clip: rect ? { x: Math.max(0, Math.round(rect.left) - 24), y: Math.max(0, Math.round(rect.top) - 30), width: Math.round(rect.width) + 48, height: Math.round(rect.height) + 60 } : null,
    mediaSlots: document.querySelectorAll('.article-card .card-media').length,
    mediaDisplay: cs(media) ? cs(media).display : '',
    mediaWidth: media ? Math.round(media.getBoundingClientRect().width) : 0,
    titleText: card && card.querySelector('.title') ? card.querySelector('.title').textContent.trim() : '',
    summaryText: card && card.querySelector('.summary') ? card.querySelector('.summary').textContent.trim() : '',
    tagText: card && card.querySelector('.tags') ? card.querySelector('.tags').textContent.replace(/\\s+/g, ' ').trim() : '',
    categoryText: card && card.querySelector('.category') ? card.querySelector('.category').textContent.trim() : '',
    /* ---- 日期 / 标签 / 阅读量的排版与间距 ---- */
    metaGap: card && card.querySelector('.meta') ? cs(card.querySelector('.meta')).columnGap : '',
    dateTabular: card && card.querySelector('.date') ? cs(card.querySelector('.date')).fontVariantNumeric : '',
    chipToDateGap: (() => {
      const date = card && card.querySelector('.date')
      if (!date) return -1
      // 取日期前一个兄弟节点（可能是分类或置顶标签），量两者之间的真实间距
      const prev = date.previousElementSibling
      if (!prev) return -1
      return Math.round(date.getBoundingClientRect().left - prev.getBoundingClientRect().right)
    })(),
    footerGap: card && card.querySelector('.footer') ? cs(card.querySelector('.footer')).gap : '',
    footerPaddingTop: card && card.querySelector('.footer') ? cs(card.querySelector('.footer')).paddingTop : '',
    tagsGap: card && card.querySelector('.tags') ? cs(card.querySelector('.tags')).gap : '',
    tagToViewsGap: (() => {
      const tags = card && card.querySelector('.tags')
      const views = card && card.querySelector('.views')
      if (!tags || !views) return -1
      return Math.round(views.getBoundingClientRect().left - tags.getBoundingClientRect().right)
    })(),
    viewsTabular: card && card.querySelector('.views') ? cs(card.querySelector('.views')).fontVariantNumeric : '',
    viewsTextAlign: card && card.querySelector('.views') ? cs(card.querySelector('.views')).textAlign : '',
    running: card ? card.getAnimations().map((a) => ({
      prop: a.transitionProperty,
      duration: a.effect.getTiming().duration,
      easing: a.effect.getTiming().easing,
      progress: a.effect.getComputedTiming().progress
    })) : [],
    sideTransform: cs(side) ? cs(side).transform : '',
    sideShadow: cs(side) ? cs(side).boxShadow : '',
    sideCenter: sideRect ? { x: Math.round(sideRect.left + sideRect.width / 2), y: Math.round(sideRect.top + 60) } : null,
    heroAnim: cs(heroBg) ? cs(heroBg).animationName : '',
    heroImage: heroBg ? cs(heroBg).backgroundImage.slice(0, 70) : ''
  })
})()`

function translateYOf(transform) {
  const m = /matrix\(([^)]+)\)/.exec(transform || '')
  if (!m) return 0
  const parts = m[1].split(',').map((v) => Number(v.trim()))
  return parts.length === 6 ? parts[5] : 0
}

function blurOf(shadow) {
  const value = (shadow || '').split('),')[0] || shadow || ''
  const nums = (shadow || '').match(/-?\d+(\.\d+)?px/g) || []
  return nums.length >= 3 ? parseFloat(nums[2]) : 0
}

function alphaOf(shadow) {
  const m = /rgba?\([^)]*?([\d.]+)\)/.exec(shadow || '')
  return m ? parseFloat(m[1]) : 1
}

;(async () => {
  const profile = path.join(os.tmpdir(), 'dsh-smoke-card-profile')
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

    const evaluate = async (expression) => {
      const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      return res.result?.result?.value
    }
    const probe = async () => JSON.parse(await evaluate(PROBE))
    const moveMouse = (x, y) =>
      send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 })
    const shoot = async (file, clip) => {
      const params = clip ? { format: 'png', clip: { ...clip, scale: 1 } } : { format: 'png' }
      const res = await send('Page.captureScreenshot', params)
      if (!res.result?.data) {
        console.error('captureScreenshot 返回异常:', JSON.stringify(res).slice(0, 300), 'params=', JSON.stringify(params))
        return false
      }
      fs.writeFileSync(file, Buffer.from(res.result.data, 'base64'))
      return true
    }

    await send('Page.navigate', { url: `${BASE}/` })
    for (let i = 0; i < 40; i++) {
      await sleep(300)
      if (await evaluate("!!document.querySelector('.article-card')").catch(() => false)) break
    }
    await sleep(600)

    const list = await (await fetch(`${API}/api/public/articles?page=1&size=8`)).json()
    const first = list.data.list[0]
    const shotPrefix = process.env.SMOKE_SHOT

    // 鼠标先移开，保证处于默认态
    await moveMouse(4, 4)
    await sleep(500)
    const before = await probe()
    if (shotPrefix) await shoot(`${shotPrefix}-before.png`, before.clip)

    console.log(`页面：${BASE}/ ，卡片数量 ${before.cardCount}\n`)

    console.log('【需求 1】悬浮上浮 translateY(-4px)')
    check('默认态无位移', translateYOf(before.transform) === 0, before.transform)

    await moveMouse(before.center.x, before.center.y)
    await sleep(110)
    const mid = await probe()
    const midY = translateYOf(mid.transform)
    const transitioning = mid.running.filter((a) => a.prop === 'transform' || a.prop === 'box-shadow')
    check(
      '过渡进行中（不是瞬间跳变）',
      (midY < 0 && midY > -4) || transitioning.some((a) => a.progress !== null && a.progress < 1),
      `采样位移 ${midY}px；进行中的过渡 ${JSON.stringify(transitioning)}`
    )

    await sleep(500)
    const hover = await probe()
    if (shotPrefix) await shoot(`${shotPrefix}-hover.png`, hover.clip)
    check('hover 位移为 -4px', translateYOf(hover.transform) === -4, hover.transform)
    check('位移方向向上', translateYOf(hover.transform) < 0)

    console.log('\n【需求 2】默认柔和浅阴影，hover 阴影扩大且颜色加深')
    check('默认有浅阴影', before.boxShadow !== 'none' && before.boxShadow.length > 0, before.boxShadow)
    check(
      'hover 阴影更大（模糊半径变大）',
      blurOf(hover.boxShadow) > blurOf(before.boxShadow),
      `${blurOf(before.boxShadow)}px → ${blurOf(hover.boxShadow)}px`
    )
    check(
      'hover 阴影颜色更深（alpha 变大）',
      alphaOf(hover.boxShadow) > alphaOf(before.boxShadow),
      `${alphaOf(before.boxShadow)} → ${alphaOf(hover.boxShadow)}`
    )
    check('hover 阴影上下偏移拉开层次', /0px 12px 28px/.test(hover.boxShadow), hover.boxShadow.slice(0, 60))

    console.log('\n【需求 3】transition 过渡平滑不突兀')
    check('声明了 transform / box-shadow 过渡', /transform/.test(hover.transitionProperty) && /box-shadow/.test(hover.transitionProperty), hover.transitionProperty)
    check('过渡时长 0.28s', hover.transitionDuration.split(',')[0].trim() === '0.28s', hover.transitionDuration)
    check('使用缓动曲线而非 linear', /cubic-bezier/.test(hover.transitionTiming), hover.transitionTiming)

    // 移开鼠标应回到默认态
    await moveMouse(4, 4)
    await sleep(600)
    const after = await probe()
    check('移开鼠标后回到默认态', translateYOf(after.transform) === 0, after.transform)

    console.log('\n【需求 4】侧边栏 / Hero 不受影响')
    if (before.sideCenter) {
      await moveMouse(before.sideCenter.x, before.sideCenter.y)
      await sleep(400)
      const sideHover = await probe()
      check('侧边栏卡片无上浮位移', translateYOf(sideHover.sideTransform) === 0, sideHover.sideTransform)
      check('侧边栏阴影未变化', sideHover.sideShadow === before.sideShadow, sideHover.sideShadow.slice(0, 46))
    }
    await moveMouse(4, 4)
    await sleep(300)
    const hero = await probe()
    check('Hero 背景动画仍在', hero.heroAnim.startsWith('hero-breath'), hero.heroAnim)
    check('Hero 背景图未被改动', hero.heroImage === before.heroImage, hero.heroImage.slice(0, 46))

    console.log('\n【布局与文字】保持原样，同时预留左侧缩略图位')
    check('卡片仍为 flex 布局且内边距未变', hover.display === 'flex' && hover.padding === '16px', `${hover.display} / ${hover.padding}`)
    check(
      '正文区宽度约占满卡片（缩略图位不占空间）',
      Math.abs(hover.bodyWidth - (hover.cardWidth - 32)) <= 2,
      `body=${hover.bodyWidth}px, card=${hover.cardWidth}px`
    )
    check('预留了缩略图槽位（每张卡片一个）', before.mediaSlots === before.cardCount, `${before.mediaSlots} / ${before.cardCount}`)
    check('无缩略图时槽位隐藏且宽度为 0', before.mediaDisplay === 'none' && before.mediaWidth === 0, `${before.mediaDisplay} / ${before.mediaWidth}px`)
    check('标题文字与接口一致', before.titleText === first.title, before.titleText)
    check('摘要文字与接口一致', !first.summary || before.summaryText.startsWith(first.summary.slice(0, 20)), before.summaryText.slice(0, 40))
    check('分类 / 标签仍在渲染', before.categoryText.length > 0 && before.tagText.length > 0, `${before.categoryText} | ${before.tagText}`)

    console.log('\n【排版】日期 / 标签 / 阅读量间距微调')
    check('日期与分类之间留出间距', before.chipToDateGap >= 8 && before.chipToDateGap <= 14, `${before.chipToDateGap}px（meta column-gap=${before.metaGap}）`)
    check('标签与阅读量之间留出间距', before.tagToViewsGap >= 12, `${before.tagToViewsGap}px（footer gap=${before.footerGap}）`)
    check('标签之间间距统一', before.tagsGap === '8px', before.tagsGap)
    check('正文与底部信息栏留白', before.footerPaddingTop === '12px', before.footerPaddingTop)
    check('日期使用等宽数字', before.dateTabular.includes('tabular-nums'), before.dateTabular)
    check('阅读量等宽且右对齐', before.viewsTabular.includes('tabular-nums') && before.viewsTextAlign === 'right', `${before.viewsTabular} / ${before.viewsTextAlign}`)

    console.log(failures === 0 ? '\n文章卡片 hover 检查全部通过 ✅' : `\n共有 ${failures} 项未通过 ❌`)
    if (shotPrefix) console.log(`截图：${shotPrefix}-before.png / ${shotPrefix}-hover.png`)
  } finally {
    proc.kill()
  }
  process.exit(failures === 0 ? 0 : 1)
})().catch((error) => {
  console.error('卡片检查失败:', error)
  process.exit(1)
})
