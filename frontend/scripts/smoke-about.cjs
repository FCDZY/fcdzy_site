/**
 * 「关于」页毛玻璃专项检查：
 * 外层透明、两块信息卡片深色玻璃、文字浅色带阴影、EP 表格不再是白底、
 * 联系方式/按钮半透明、内容与排版顺序不变、深色模式同样可读。
 *
 * 用法：node scripts/smoke-about.cjs
 * 可选：SMOKE_SHOT=<路径前缀> 输出浅色/深色截图
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5173'
const DEBUG_PORT = 9675
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

/** 只对 rgba(...) 取 alpha；rgb(...) 视为不透明（别把最后一个通道值当成 alpha） */
const alphaOf = (color) => {
  const m = /^rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/.exec(color || '')
  return m ? Number(m[1]) : 1
}
const rgbOf = (color) => (color || '').match(/\d+/g).slice(0, 3).map(Number)
const isDark = (color) => {
  const [r, g, b] = rgbOf(color)
  return (r * 299 + g * 587 + b * 114) / 1000 < 120
}
const isLightText = (color) => {
  const [r, g, b] = rgbOf(color)
  return (r * 299 + g * 587 + b * 114) / 1000 > 150
}

const PROBE = `(() => {
  const cs = (el, pseudo) => (el ? getComputedStyle(el, pseudo || undefined) : null)
  const page = document.querySelector('.about-page')
  const cards = Array.from(document.querySelectorAll('.about-page .card'))
  const authorCard = document.querySelector('.author-card')
  const siteCard = document.querySelector('.site-card')
  const name = document.querySelector('.author-name')
  const bio = document.querySelector('.author-bio')
  const blockTitle = document.querySelector('.block-title')
  const avatar = document.querySelector('.avatar')
  const link = document.querySelector('.link')
  const ghost = document.querySelector('.btn.ghost')
  const label = document.querySelector('.el-descriptions__label')
  const content = document.querySelector('.el-descriptions__content')
  const body = document.querySelector('.el-descriptions__body')
  const actions = document.querySelector('.actions')
  const rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), left: Math.round(b.left), bottom: Math.round(b.bottom) } }
  return JSON.stringify({
    isDarkTheme: document.documentElement.classList.contains('dark'),
    pageBg: cs(page).backgroundColor,
    cardCount: cards.length,
    cardBg: cards[0] ? cs(cards[0]).backgroundColor : '',
    cardBlur: cards[0] ? (cs(cards[0]).backdropFilter || cs(cards[0]).webkitBackdropFilter) : '',
    cardBorder: cards[0] ? cs(cards[0]).borderTopColor : '',
    cardRadius: cards[0] ? cs(cards[0]).borderRadius : '',
    hasDarkModifier: cards.every((c) => c.classList.contains('card--dark')),
    nameColor: cs(name).color,
    nameShadow: cs(name).textShadow,
    bioColor: cs(bio).color,
    bioShadow: cs(bio).textShadow,
    blockTitleColor: cs(blockTitle).color,
    blockTitleShadow: cs(blockTitle).textShadow,
    linkBg: cs(link).backgroundColor,
    linkColor: cs(link).color,
    ghostBg: cs(ghost).backgroundColor,
    ghostColor: cs(ghost).color,
    bodyBg: cs(body).backgroundColor,
    labelBg: cs(label).backgroundColor,
    labelColor: cs(label).color,
    contentBg: cs(content).backgroundColor,
    contentColor: cs(content).color,
    labelBorder: cs(label).borderTopColor,
    labels: Array.from(document.querySelectorAll('.el-descriptions__label')).map((el) => el.textContent.trim()),
    values: Array.from(document.querySelectorAll('.el-descriptions__content')).map((el) => el.textContent.trim()),
    authorName: name ? name.textContent.trim() : '',
    bioText: bio ? bio.textContent.trim() : '',
    linkTexts: Array.from(document.querySelectorAll('.link')).map((el) => el.textContent.trim()),
    linkHrefs: Array.from(document.querySelectorAll('.link')).map((el) => el.getAttribute('href')),
    actionTexts: Array.from(document.querySelectorAll('.actions .btn')).map((el) => el.textContent.trim()),
    cardOrder: cards.map((c) => (c.classList.contains('author-card') ? 'author' : c.classList.contains('site-card') ? 'site' : 'other')),
    authorRect: rect(authorCard),
    siteRect: rect(siteCard),
    avatarRect: rect(avatar),
    nameRect: rect(name),
    actionsRect: rect(actions),
    authorDisplay: cs(authorCard).display,
    sections: Array.from(document.querySelectorAll('.about-page h1, .about-page h2')).map((el) => el.textContent.trim()),
    hasAvatar: !!avatar
  })
})()`

;(async () => {
  const profile = path.join(os.tmpdir(), 'dsh-smoke-about-profile')
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
    const goto = async () => {
      await send('Page.navigate', { url: `${BASE}/about` })
      for (let i = 0; i < 40; i++) {
        await sleep(300)
        if (await evaluate("!!document.querySelector('.el-descriptions__label')")) {
          await sleep(700)
          return
        }
      }
    }
    const shoot = async (file) => {
      const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
      if (res.result?.data) fs.writeFileSync(file, Buffer.from(res.result.data, 'base64'))
    }

    const shotPrefix = process.env.SMOKE_SHOT

    // 先导航到页面再写主题偏好（about:blank 上访问 localStorage 会被拒绝）
    await goto()
    await evaluate("localStorage.setItem('fcdzy_theme','light')")
    await goto()
    const light = await probe()

    console.log('【需求 1】外层容器没有白色底板')
    check('关于页外层容器透明', alphaOf(light.pageBg) === 0, light.pageBg)

    console.log('\n【需求 2/3】两块信息卡片为同款深色毛玻璃')
    check('页面共两块 card', light.cardCount === 2, `${light.cardCount} 块`)
    check('两块卡片都带深色玻璃类', light.hasDarkModifier)
    check('卡片底色为深色半透明（非白底）', alphaOf(light.cardBg) > 0 && alphaOf(light.cardBg) < 1 && isDark(light.cardBg), `${light.cardBg}（alpha=${alphaOf(light.cardBg)}）`)
    check('卡片启用 backdrop-filter 模糊', light.cardBlur.includes('blur'), light.cardBlur)
    check('边框为极淡白色描边', alphaOf(light.cardBorder) > 0 && alphaOf(light.cardBorder) < 0.5, `${light.cardBorder}（alpha=${alphaOf(light.cardBorder)}）`)
    check('保留原有圆角', parseFloat(light.cardRadius) >= 8, light.cardRadius)

    console.log('\n【需求 4】文字转浅色并带阴影')
    check('站长名称为白色', isLightText(light.nameColor) && alphaOf(light.nameColor) === 1, light.nameColor)
    check('站长名称有 text-shadow', light.nameShadow !== 'none', light.nameShadow.slice(0, 48))
    check('简介为浅白（不透明度 ≥ 0.8）', isLightText(light.bioColor) && alphaOf(light.bioColor) >= 0.8, light.bioColor)
    check('简介有 text-shadow', light.bioShadow !== 'none', light.bioShadow.slice(0, 48))
    check('「站点信息」标题为白色且有阴影', isLightText(light.blockTitleColor) && light.blockTitleShadow !== 'none', `${light.blockTitleColor} / ${light.blockTitleShadow.slice(0, 32)}`)

    console.log('\n【需求 2】EP 表格不再是白底')
    check('表格容器无白色底', alphaOf(light.bodyBg) === 0, light.bodyBg)
    check('标签单元格为半透明浅色（不发白）', alphaOf(light.labelBg) > 0 && alphaOf(light.labelBg) < 0.3, `${light.labelBg}（alpha=${alphaOf(light.labelBg)}）`)
    check('标签单元格文字为浅色', isLightText(light.labelColor), light.labelColor)
    check('值单元格文字为白色', isLightText(light.contentColor), light.contentColor)
    check('表格边框为半透明描边', alphaOf(light.labelBorder) < 0.4, light.labelBorder)

    console.log('\n【需求 4】联系方式与按钮为半透明浅色')
    check('邮箱/GitHub 胶囊半透明', alphaOf(light.linkBg) > 0 && alphaOf(light.linkBg) < 0.5, `${light.linkBg}（alpha=${alphaOf(light.linkBg)}）`)
    check('胶囊文字为白色', isLightText(light.linkColor), light.linkColor)
    check('「查看专题」按钮半透明（非白底）', alphaOf(light.ghostBg) > 0 && alphaOf(light.ghostBg) < 0.5 && isLightText(light.ghostColor), `${light.ghostBg} / ${light.ghostColor}`)

    console.log('\n【需求 5】原有内容与图标保留')
    check('站长信息仍在', light.authorName.length > 0 && light.bioText.length > 0, `${light.authorName} / ${light.bioText}`)
    check('头像/占位头像存在', light.hasAvatar)
    check('联系方式链接保留', light.linkTexts.length >= 1 && light.linkHrefs.every(Boolean), light.linkTexts.join(' / '))
    // 站点副标题已移除（前端常量为空），该行不再渲染，故为 7 项
    check(
      '站点信息字段齐全（7 项）',
      light.labels.length === 7 && light.values.length === 7,
      light.labels.join(' / ')
    )
    check('站点名称行仍显示前端常量', light.labels.includes('站点名称'), light.labels.join(' / '))
    check('已不显示站点副标题行', !light.labels.includes('站点副标题'), light.labels.join(' / '))
    check('两个操作按钮保留', light.actionTexts.length === 2, light.actionTexts.join(' / '))
    check('版块标题保留（关于 / 站点信息）', light.sections.includes('关于') && light.sections.includes('站点信息'), light.sections.join(' / '))

    console.log('\n【需求 6】布局与顺序不变')
    check('站长卡仍为横向 flex 布局（头像在左）', light.authorDisplay === 'flex' && light.avatarRect.left < light.nameRect.left, `${light.authorDisplay}：头像 left=${light.avatarRect.left} / 名称 left=${light.nameRect.left}`)
    check('顺序：站长信息 → 站点信息 → 按钮', light.cardOrder.join(',') === 'author,site' && light.authorRect.top < light.siteRect.top && light.siteRect.bottom <= light.actionsRect.top + 2, light.cardOrder.join(' / '))

    if (shotPrefix) await shoot(`${shotPrefix}-about-light.png`)

    console.log('\n【深色模式】同样可读')
    await evaluate(`(() => { const b = document.querySelector('.theme-toggle'); if (b) b.click() })()`)
    await sleep(900)
    const dark = await probe()
    check('深色模式已生效', dark.isDarkTheme)
    check('深色下卡片仍为深色玻璃', alphaOf(dark.cardBg) > 0 && alphaOf(dark.cardBg) < 1 && isDark(dark.cardBg), dark.cardBg)
    check('深色下标题仍为白色', isLightText(dark.nameColor), dark.nameColor)
    check('深色下表格标签为浅色文字', isLightText(dark.labelColor), dark.labelColor)
    check('深色下表格无白色底', alphaOf(dark.bodyBg) === 0, dark.bodyBg)
    if (shotPrefix) await shoot(`${shotPrefix}-about-dark.png`)
    await evaluate(`(() => { const b = document.querySelector('.theme-toggle'); if (b) b.click() })()`)
    await sleep(600)
    check('可切回浅色', (await probe()).isDarkTheme === false)

    console.log(failures === 0 ? '\n关于页毛玻璃检查全部通过 ✅' : `\n共有 ${failures} 项未通过 ❌`)
  } finally {
    proc.kill()
  }
  process.exit(failures === 0 ? 0 : 1)
})().catch((error) => {
  console.error('关于页毛玻璃检查失败:', error)
  process.exit(1)
})
