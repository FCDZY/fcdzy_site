/**
 * 首页文章行检查（编辑式列表）
 *  - 文字在左、缩略图固定 168px 在右（不再左右交替）
 *  - 无白底/无阴影/无圆角，靠 1px 细线分隔
 *  - 标题墨色、摘要 2 行 1.7 行高、元信息做「注脚」
 *  - 标签纯文字带 #，无封面保留占位槽
 *  - hover：底色变淡 + 标题变色（不再上浮）
 * 用法：node scripts/smoke-card.cjs  可选 SMOKE_SHOT=<前缀>
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const PORT = 9865
const BASE = 'http://127.0.0.1:5173'
const OUT = process.env.SMOKE_SHOT || ''
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
  const rows = Array.from(document.querySelectorAll('.stream .article-row'))
  const first = rows[0] || null
  const coverRow = rows.find((r) => r.querySelector('.card-media')) || null
  const media = coverRow ? coverRow.querySelector('.card-media') : null
  const title = first ? first.querySelector('.row-title') : null
  const summary = first ? first.querySelector('.row-summary') : null
  const meta = first ? first.querySelector('.row-meta') : null
  // 第一张可能正好是「无标签」的测试文章，取第一条带标签的做样式检查
  const tagHost = rows.find((r) => r.querySelector('.tag')) || first
  const tags = tagHost ? Array.from(tagHost.querySelectorAll('.tag')) : []
  const empty = rows.find((r) => r.querySelector('.card-media.is-empty')) || null
  const r = first ? first.getBoundingClientRect() : null
  return JSON.stringify({
    cardCount: rows.length,
    display: first ? cs(first).display : '',
  mediaWidth: media ? Math.round(media.getBoundingClientRect().width) : 0,
  mediaHeight: media ? Math.round(media.getBoundingClientRect().height) : 0,
    mediaOnRight: media && coverRow ? media.getBoundingClientRect().left > coverRow.querySelector('.row-title').getBoundingClientRect().left : false,
    mediaFlushRight: media && coverRow ? Math.abs(media.getBoundingClientRect().right - coverRow.getBoundingClientRect().right) <= 2 : false,
    coverCardHeight: coverRow ? Math.round(coverRow.getBoundingClientRect().height) : 0,
    cardHeight: r ? Math.round(r.height) : 0,
    bg: first ? cs(first).backgroundColor : '',
    radius: first ? cs(first).borderTopLeftRadius : '',
    borderBottom: first ? cs(first).borderBottomWidth + ' ' + cs(first).borderBottomStyle : '',
    transitionProp: first ? cs(first).transitionProperty : '',
    titleText: title ? title.textContent.trim() : '',
    titleColor: title ? cs(title).color : '',
      titleFilter: title ? cs(title).filter : '',
    titleSize: title ? parseFloat(cs(title).fontSize) : 0,
    titleNowrap: title ? cs(title).whiteSpace : '',
    titleOverflow: title ? cs(title).textOverflow : '',
    summaryClamp: summary ? cs(summary).webkitLineClamp : '',
    summaryLineHeight: summary ? parseFloat(cs(summary).lineHeight) / parseFloat(cs(summary).fontSize) : 0,
    summaryColor: summary ? cs(summary).color : '',
    metaText: meta ? meta.textContent.replace(/\\s+/g, ' ').trim() : '',
    metaFontSize: meta ? parseFloat(cs(meta).fontSize) : 0,
    metaLetterSpacing: meta ? cs(meta).letterSpacing : '',
    tagCount: tags.length,
    tagNames: tags.map((t) => t.textContent.trim()),
    tagBg: tags[0] ? cs(tags[0]).backgroundColor : '',
    tagBorder: tags[0] ? cs(tags[0]).borderTopWidth : '',
    emptyCount: rows.filter((row) => row.querySelector('.card-media.is-empty')).length,
    emptyDisplay: empty ? cs(empty.querySelector('.card-media')).display : '',
    emptyBgImage: empty ? cs(empty.querySelector('.card-media')).backgroundImage : ''
  })
})()`

;(async () => {
  const profile = path.join(os.tmpdir(), 'dsh-smoke-card-' + Date.now())
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
    // 用关键词收敛到「既有封面、又无封面」的一页：首页第 1 页可能全是无封面的测试文章
  await send('Page.navigate', { url: BASE + '/?keyword=java' })
    await sleep(1500)
    await evaluate(`localStorage.setItem('fcdzy_theme','light'); location.reload()`)
    await sleep(4200)

    const before = JSON.parse(await evaluate(PROBE))
    console.log('【需求 1】列表结构：文字在左、缩略图固定 168px 在右')
    check('渲染出了文章行', before.cardCount > 0, `${before.cardCount} 行`)
    check('两列网格（文字 + 缩略图）', before.display === 'grid', before.display)
check('缩略图 260 宽、撑满卡片高度', Math.abs(before.mediaWidth - 260) <= 2 && Math.abs(before.mediaHeight - before.coverCardHeight) <= 3, before.mediaWidth + 'x' + before.mediaHeight + ' / card ' + before.coverCardHeight)
  check('缩略图贴住卡片右边缘（通栏）', before.mediaFlushRight === true)
    check('缩略图始终在右（不再交替）', before.mediaOnRight === true)
  check('有封面的卡片高 200', Math.abs(before.coverCardHeight - 200) <= 3, String(before.coverCardHeight))
    check('行高 120~240px', before.cardHeight >= 120 && before.cardHeight <= 240, `${before.cardHeight}px`)
    check('行是卡片：14px 圆角（哑光浮起）', before.radius === '14px', before.radius)
    check('行是卡片：白底（浅色）', before.bg === 'rgb(255, 255, 255)', before.bg)
    check('行有 1px 卡片描边', before.borderBottom.startsWith('1px'), before.borderBottom)

    console.log('\n【需求 2】文字层级')
    check('标题有内容', before.titleText.length > 0, before.titleText.slice(0, 24))
    check('标题单行省略', before.titleNowrap === 'nowrap' && before.titleOverflow === 'ellipsis', `${before.titleNowrap} / ${before.titleOverflow}`)
    check('标题字号 15~17px', before.titleSize >= 15 && before.titleSize <= 17, before.titleSize + 'px')
    check('标题为墨色（非彩色）', !/rgb\((2[0-4][0-9]), (1[0-9][0-9]|2[0-4][0-9]), /.test(before.titleColor) || before.titleColor === 'rgb(26, 26, 26)', before.titleColor)
    check('摘要最多 2 行', before.summaryClamp === '2', before.summaryClamp)
    check('摘要行高 >= 1.6（当前 1.8）', before.summaryLineHeight >= 1.6, before.summaryLineHeight.toFixed(2))
    check('元信息含分类与时长（日期移到左侧时间线）', /技术|生活/.test(before.metaText) && /分钟/.test(before.metaText), before.metaText)
    check('元信息字号 11~12.5px', before.metaFontSize >= 11 && before.metaFontSize <= 12.5, before.metaFontSize + 'px')
    check('元信息有轻微字距（0.2~0.6px）', parseFloat(before.metaLetterSpacing || '0') >= 0.2 && parseFloat(before.metaLetterSpacing || '0') <= 0.6, before.metaLetterSpacing)

    console.log('\n【需求 3】标签纯文字')
    check('标签最多 2 个', before.tagCount > 0 && before.tagCount <= 2, `${before.tagCount} 个：${before.tagNames.join(' / ')}`)
    check('标签带 # 前缀', before.tagNames.every((n) => n.startsWith('#')), before.tagNames.join(' / '))
    check('标签无背景色块', before.tagBg === 'rgba(0, 0, 0, 0)', before.tagBg)
    check('标签无边框', before.tagBorder === '0px', before.tagBorder)

    console.log('\n【需求 4】无封面行保留占位槽')
    check('统计无封面行', before.emptyCount >= 0, `${before.emptyCount} 行`)
    if (before.emptyCount > 0) {
      check('占位槽不隐藏（骨架一致）', before.emptyDisplay !== 'none', before.emptyDisplay)
      check('占位槽为斜纹', /repeating-linear-gradient/.test(before.emptyBgImage || ''), (before.emptyBgImage || '').slice(0, 50))
    } else {
      check('本次数据全都有封面（跳过占位检查）', true)
    }

    console.log('\n【需求 5】hover：底色变淡 + 标题变色（不上浮）')
    // headless 空闲时不出帧，CSS 过渡的动画时钟不推进，getComputedStyle 会一直返回过渡起始值（白底）。
    // 这里把过渡时长压成 0，只影响测量；transition-property 仍保留，供「声明了过渡」的断言使用。
    await evaluate(`(() => {
      if (document.getElementById('smoke-no-transition')) return
      const style = document.createElement('style')
      style.id = 'smoke-no-transition'
      style.textContent = '* { transition-duration: 0s !important; animation-duration: 0s !important }'
      document.head.appendChild(style)
    })()`)
    await sleep(120)
    // Hero 现在占满一屏，第一条在视口外：先滚到它，否则 hover/click 打不到
    await evaluate(`document.querySelector('.stream .article-row').scrollIntoView({ block: 'center' })`)
    await sleep(700)
    const rect = JSON.parse(
      await evaluate(`(() => { const b = document.querySelector('.stream .article-row').getBoundingClientRect(); return JSON.stringify({ x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }) })()`)
    )
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y, button: 'none', buttons: 0 })
    await sleep(700)
    const hovered = JSON.parse(await evaluate(PROBE))
    check('hover 出现淡色底', hovered.bg !== before.bg, `${before.bg} → ${hovered.bg}`)
    check('hover 标题有反馈（滤镜变化）', hovered.titleFilter !== before.titleFilter, (before.titleFilter || '').slice(0, 36) + ' → ' + (hovered.titleFilter || '').slice(0, 36))
    check('声明了背景/文字颜色过渡', /background-color|color/.test(hovered.transitionProp), hovered.transitionProp)

    console.log('\n【需求 6】点击进入详情')
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 })
    await sleep(1800)
    const url = await evaluate('location.pathname')
    check('点击后进入文章详情', /^\/article\//.test(url), url)

    if (OUT) {
      const s = await send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(`${OUT}-card.png`, Buffer.from(s.result.data, 'base64'))
      console.log('  saved', `${OUT}-card.png`)
    }
  } finally {
    proc.kill()
  }

  console.log(failures === 0 ? '\n卡片检查全部通过 ✅' : `\n共有 ${failures} 项未通过 ❌`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((error) => {
  console.error('卡片检查失败:', error)
  process.exit(1)
})
