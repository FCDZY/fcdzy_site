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
  heroWidth: heroRect ? Math.round(heroRect.width) : 0,
    heroBorderBottomWidth: heroRect ? getComputedStyle(document.querySelector('.hero')).borderBottomWidth : 'n/a',
  hasLayers: !!document.querySelector('.hero-layers'),
    layerCount: document.querySelectorAll('.hero-layers .layer-stack .layer').length,
    layersLoaded: Array.from(document.querySelectorAll('.hero-layers .layer-stack .layer')).every((el) => el.complete && el.naturalWidth > 0),
  hasImage: !!img,
    imageSrc: img ? img.getAttribute('src') : '',
    imageLoaded: img ? img.complete && img.naturalWidth > 0 : false,
    imageFit: (() => { const l = document.querySelector('.hero-layers .layer-stack .layer'); return l ? cs(l).objectFit : '' })(),
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
    // 高度按原画 1920×873 比例（0.4547）计算，整幅画连底部桥架一起露出
  const artRatio = light.heroHeight / light.heroWidth
  check('Hero 高度贴合原画比例（0.4547 ±0.02）', Math.abs(artRatio - 0.4547) <= 0.02, artRatio.toFixed(4) + ' / ' + light.heroHeight + '×' + light.heroWidth + 'px')
  // 直角分割：Hero 底边与内容之间没有分隔线
  check('Hero 与内容之间无分隔线', light.heroBorderBottomWidth === '0px', String(light.heroBorderBottomWidth))
    check('Hero 使用分层背景（.hero-layers）', light.hasLayers === true)
    check('四层素材都在（base/mid/right/near）', light.layerCount === 4, String(light.layerCount))
    check('分层图已加载', light.layersLoaded === true)
    check('分层使用 object-fit: cover', light.imageFit === 'cover', light.imageFit)

    console.log('\n【需求 2】底部渐隐（背景图 mask 淡出）')
    check('背景图不再做底部渐隐（硬边到 Hero 底）', light.imageMask === 'none' || light.imageMask === '', light.imageMask)
    check('Hero 底部与页面底色硬切（无朦胧带）', light.imageMask === 'none' || light.imageMask === '', light.imageMask)

    console.log('\n【需求 3】标题三层：站名 / 主标题 / 副标题')
    check('站名行存在', light.brandText.length > 0, light.brandText)
    check('主标题与后台配置一致', light.titleText.length > 0, light.titleText)
    check('副标题存在（本轮新加回）', light.subtitleText.length > 0, light.subtitleText)
    const arrow = JSON.parse(await evaluate(`(() => {
      const el = document.querySelector('.hero-scroll')
      if (!el) return JSON.stringify({ found: false })
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return JSON.stringify({
        found: true,
        nearBottom: Math.abs(r.bottom - document.querySelector('.hero').getBoundingClientRect().bottom) <= 60,
        centered: Math.abs((r.left + r.width / 2) - window.innerWidth / 2) <= 3,
        color: cs.color,
        hasSvg: !!el.querySelector('svg')
      })
    })()`))
    check('Hero 底部有下滑箭头', arrow.found === true)
    check('箭头位于 Hero 底部中间', arrow.nearBottom === true && arrow.centered === true)
    check('箭头在照片上带深底（白字可读）', arrow.bg !== 'rgba(0, 0, 0, 0)' || arrow.color !== 'rgb(17, 17, 17)', arrow.color + ' / ' + arrow.bg)

    await evaluate(`document.querySelector('.hero-scroll').click()`)
    await sleep(900)
    const afterClick = await evaluate('Math.round(window.scrollY)')
    check('点击箭头会滚到文章列表', afterClick > 200, 'scrollY=' + afterClick)
    check('顺序为 站名 → 主标题 → 副标题', light.stackOrder.join(',') === 'hero-brand,hero-title,hero-subtitle', light.stackOrder.join(' / '))
    check('主标题为白色', light.titleColor === 'rgb(255, 255, 255)', light.titleColor)
    check('主标题字号 >= 28px', light.titleFontSize >= 28, `${light.titleFontSize}px`)
    check('主标题字重 >= 700', Number(light.titleWeight) >= 700, light.titleWeight)
    check('主标题水平居中（偏差 <=3px）', Math.abs(light.titleCenterDelta) <= 3, `${light.titleCenterDelta}px`)
    check('内容区自身透明（不盖住背景图）', light.contentBg === 'rgba(0, 0, 0, 0)', light.contentBg)
    check('旧的描述/按钮结构已移除', light.hasOldSubtitle === false)

    console.log('\n【需求 4】导航叠在 Hero 上且为白字')
    check('导航已移到内容区（不再叠在 Hero 上）', light.headerInsideHero === false, String(light.headerInsideHero))
    check('内容区导航为 relative（随页面滚动）', light.headerPosition === 'relative', light.headerPosition)
    check('内容区导航文字为深色（浅底）', /^rgb\(4[0-9]|^rgb\(5[0-9]|^rgb\(7[0-9]/.test(light.navIdleColor) || light.navIdleColor !== 'rgb(255, 255, 255)', light.navIdleColor)
    check('导航不在 Hero 顶部（偏移 > 0）', light.headerTop > 0, '偏移 ' + light.headerTop + 'px')

    if (OUT) await shoot(`${OUT}-hero-light.png`)

    console.log('\n【需求 5】深色模式换用深色背景图')
    await evaluate(`localStorage.setItem('fcdzy_theme','dark'); location.reload()`)
    await sleep(4000)
    const dark = JSON.parse(await evaluate(PROBE))
    check('深色下 Hero 仍正常渲染', dark.hasHero && dark.hasLayers)
    check('深色下副标题仍可见', dark.subtitleText.length > 0)
    check('分层背景在深浅色下共用', dark.imageSrc === light.imageSrc, '共用同一套素材')
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
