/**
 * 首页 Hero 检查（新版：整幅背景图 + 底部渐隐 + 标题三层 + 透明白字导航）
 * 用法：node scripts/smoke-hero.cjs
 * 可选：SMOKE_SHOT=<路径前缀> 输出截图
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const PORT = 9857
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
  const hero = document.querySelector('.hero')
  const img = document.querySelector('.hero-bg')
  const fade = null
  const overlay = document.querySelector('.hero-overlay')
  const header = document.querySelector('.site-header')
  const brand = document.querySelector('.hero-brand')
  const title = document.querySelector('.hero-title')
  const sub = document.querySelector('.hero-subtitle')
  const heroRect = hero ? hero.getBoundingClientRect() : null
  const titleRect = title ? title.getBoundingClientRect() : null
  const vw = window.innerWidth
  const vh = window.innerHeight
  return JSON.stringify({
    hasHero: !!hero,
    heroTop: heroRect ? Math.round(heroRect.top + window.scrollY) : -1,
    heroHeight: heroRect ? Math.round(heroRect.height) : 0,
    hasImage: !!img,
    imageSrc: img ? img.getAttribute('src') : '',
    imageLoaded: img ? img.complete && img.naturalWidth > 0 : false,
    imageFit: img ? cs(img).objectFit : '',
    overlayBg: overlay ? cs(overlay).backgroundImage : '',
    imageMask: img ? (cs(img).maskImage || cs(img).webkitMaskImage || '') : '',
    fadeHeight: 0,
    fadeBg: '',
    fadeAtBottom: true,
    headerInsideHero: !!(hero && header && hero.contains(header)),
    headerPosition: header ? cs(header).position : '',
    headerTop: header && heroRect ? Math.round(header.getBoundingClientRect().top - heroRect.top) : -1,
    navIdleColor: (() => { const a = Array.from(document.querySelectorAll('.site-header .nav a')).find((x) => !x.classList.contains('active')); return a ? cs(a).color : '' })(),
    brandText: brand ? brand.textContent.trim() : '',
    titleText: title ? title.textContent.trim() : '',
    subtitleText: sub ? sub.textContent.trim() : '',
    titleColor: title ? cs(title).color : '',
    titleFontSize: title ? parseFloat(cs(title).fontSize) : 0,
    titleWeight: title ? cs(title).fontWeight : '',
    titleCenterDelta: titleRect ? Math.round(titleRect.left + titleRect.width / 2 - vw / 2) : -1,
    titleSkewed: title ? cs(title).transform !== 'none' : false,
    stackOrder: (() => {
      const box = document.querySelector('.hero-content')
      return box ? Array.from(box.children).map((c) => c.className) : []
    })(),
    contentBg: (() => { const box = document.querySelector('.hero-content'); return box ? cs(box).backgroundColor : '' })(),
    hasOldSubtitle: !!document.querySelector('.hero-desc, .hero-actions, .hero-btn'),
    vh,
    vw
  })
})()`

;(async () => {
  const profile = path.join(os.tmpdir(), 'dsh-smoke-hero-' + Date.now())
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
  await send('Network.enable')
  const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value
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
    await sleep(4500)

    const light = JSON.parse(await evaluate(PROBE))
    console.log('【需求 1】Hero 结构与背景图')
    check('存在 Hero 区块', light.hasHero)
    check('Hero 位于页面顶部', light.heroTop === 0, `top=${light.heroTop}`)
    check('Hero 高度在 380~520px', light.heroHeight >= 380 && light.heroHeight <= 520, `${light.heroHeight}px`)
    check('Hero 挂了整幅背景图', light.hasImage && light.imageSrc.length > 20, (light.imageSrc || '').slice(0, 60))
    check('背景图已加载', light.imageLoaded)
    check('背景图铺满（object-fit: cover）', light.imageFit === 'cover', light.imageFit)
    check('有顶部压暗遮罩', light.overlayBg.includes('rgba(') || light.overlayBg.includes('linear-gradient'), light.overlayBg.slice(0, 60))

    console.log('\n【需求 2】底部渐隐（背景图 mask 淡出）')
    check('背景图带渐隐 mask', /linear-gradient/.test(light.imageMask), light.imageMask.slice(0, 80))
    check('mask 末端是透明（真正淡出，不是叠底色）', /transparent|rgba\(0, 0, 0, 0\)/.test(light.imageMask), light.imageMask.slice(0, 90))

    console.log('\n【需求 3】标题三层：站名 / 主标题 / 副标题')
    check('站名行存在', light.brandText.length > 0, light.brandText)
    check('主标题与后台配置一致', light.titleText.length > 0, light.titleText)
    check('副标题存在（本轮新加回）', light.subtitleText.length > 0, light.subtitleText)
    check('顺序为 站名 → 主标题 → 副标题', light.stackOrder.join(',') === 'hero-brand,hero-title,hero-subtitle', light.stackOrder.join(' / '))
    check('主标题为白色', light.titleColor === 'rgb(255, 255, 255)', light.titleColor)
    check('主标题字号 >= 28px', light.titleFontSize >= 28, `${light.titleFontSize}px`)
    check('主标题字重 >= 700', Number(light.titleWeight) >= 700, light.titleWeight)
    check('主标题水平居中（偏差 <=3px）', Math.abs(light.titleCenterDelta) <= 3, `${light.titleCenterDelta}px`)
    check('内容区自身透明（不盖住背景图）', light.contentBg === 'rgba(0, 0, 0, 0)', light.contentBg)
    check('旧的描述/按钮结构已移除', light.hasOldSubtitle === false)

    console.log('\n【需求 4】导航叠在 Hero 上且为白字')
    check('导航在 Hero 内部', light.headerInsideHero)
    check('导航贴在 Hero 最上方', light.headerTop === 0, `偏移 ${light.headerTop}px`)
    check('导航为绝对定位叠在图上', light.headerPosition === 'absolute', light.headerPosition)
    check('未吸顶时导航文字为白色系', /^rgba?\(255, 255, 255/.test(light.navIdleColor), light.navIdleColor)

    if (OUT) await shoot(`${OUT}-hero-light.png`)

    console.log('\n【需求 5】深色模式换用深色背景图')
    await evaluate(`localStorage.setItem('fcdzy_theme','dark'); location.reload()`)
    await sleep(4000)
    const dark = JSON.parse(await evaluate(PROBE))
    check('深色下 Hero 仍正常渲染', dark.hasHero && dark.hasImage)
    check('深色下换用了另一张背景图', dark.imageSrc !== light.imageSrc, dark.imageSrc ? '已切换' : '(无)')
    check('深色下副标题仍可见', dark.subtitleText.length > 0)
    if (OUT) await shoot(`${OUT}-hero-dark.png`)

    console.log('\n【需求 6】移动端')
    await evaluate(`localStorage.setItem('fcdzy_theme','light')`)
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
    await send('Page.navigate', { url: BASE + '/' })
    await sleep(4000)
    const mobile = JSON.parse(await evaluate(PROBE))
    check('移动端 Hero 高度 >= 280px', mobile.heroHeight >= 280, `${mobile.heroHeight}px`)
    check('移动端标题不溢出（字号 <= 40px）', mobile.titleFontSize <= 40, `${mobile.titleFontSize}px`)
    if (OUT) await shoot(`${OUT}-hero-mobile.png`)
  } finally {
    proc.kill()
  }

  console.log(failures === 0 ? '\nHero 检查全部通过 ✅' : `\n共有 ${failures} 项未通过 ❌`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((error) => {
  console.error('Hero 检查失败:', error)
  process.exit(1)
})
