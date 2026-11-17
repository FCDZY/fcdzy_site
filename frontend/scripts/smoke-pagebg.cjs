/**
 * 全站背景检查（A 方案统一后）
 *  - body 背景是浅色渐变（浅/深两套），固定、居中、不重复
 *  - 不再把后台 Hero 图当页面底图：html 上没有 has-page-bg / page-bg-breath
 *  - 滚动时背景不跟随（background-attachment: fixed）
 *  - 页脚透明，背景贯穿到底
 * 用法：node scripts/smoke-pagebg.cjs  可选 SMOKE_SHOT=<前缀>
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const PORT = 9869
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
  const b = cs(document.body)
  const footer = document.querySelector('.site-footer')
  const html = document.documentElement
  return JSON.stringify({
    bodyBgImage: b.backgroundImage,
    bodyBgColor: b.backgroundColor,
    bodyBgSize: b.backgroundSize,
    bodyBgPosition: b.backgroundPosition,
    bodyBgRepeat: b.backgroundRepeat,
    bodyBgAttachment: b.backgroundAttachment,
    bgVar: b.getPropertyValue('--page-bg-image').trim(),
    htmlClass: html.className,
    hasPageBgClass: html.classList.contains('has-page-bg'),
    hasBreath: html.classList.contains('page-bg-breath'),
    footerBg: footer ? cs(footer).backgroundColor : '',
    footerBgImage: footer ? cs(footer).backgroundImage : '',
    isDark: html.classList.contains('dark')
  })
})()`

;(async () => {
  const profile = path.join(os.tmpdir(), 'dsh-smoke-pagebg-' + Date.now())
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
    await send('Page.navigate', { url: BASE + '/' })
    await sleep(1500)
    await evaluate(`localStorage.setItem('fcdzy_theme','light'); location.reload()`)
    await sleep(4000)

    const light = JSON.parse(await evaluate(PROBE))
    console.log('【需求 1】首页背景：浅色渐变')
    check('body 背景是渐变（不再用图片）', /gradient/.test(light.bodyBgImage) && !/url\(/.test(light.bodyBgImage), light.bodyBgImage.slice(0, 70))
    check('渐变铺满（cover）', String(light.bodyBgSize).includes('cover'), light.bodyBgSize)
    check('背景居中', /50%/.test(String(light.bodyBgPosition).split(',')[0]), light.bodyBgPosition.slice(0, 40))
    check('背景不重复', String(light.bodyBgRepeat).includes('no-repeat'), light.bodyBgRepeat)
    check('背景固定（fixed）', String(light.bodyBgAttachment).includes('fixed'), light.bodyBgAttachment)

    console.log('\n【需求 2】不再挂后台 Hero 图当底图')
    check('html 上没有 has-page-bg', light.hasPageBgClass === false, light.htmlClass)
    check('html 上没有呼吸动画类', light.hasBreath === false, light.htmlClass)
    check('--page-bg-image 未被图片覆盖', !/url\(/.test(light.bgVar || ''), light.bgVar || '(空)')

    console.log('\n【需求 3】页脚透明，背景贯穿')
    check('页脚底色透明', alphaOf(light.footerBg) === 0, light.footerBg)
    check('页脚无背景图', light.footerBgImage === 'none', light.footerBgImage)

    console.log('\n【需求 4】滚动时背景不跟随')
    const before = JSON.parse(await evaluate(PROBE))
    await evaluate('window.scrollTo({ top: 600, behavior: "auto" })')
    await sleep(500)
    const after = JSON.parse(await evaluate(PROBE))
    check('滚动后 background-attachment 仍为 fixed', String(after.bodyBgAttachment).includes('fixed'), after.bodyBgAttachment)
    check('页面确实滚动了', (await evaluate('Math.round(window.scrollY)')) >= 500, String(await evaluate('Math.round(window.scrollY)')))
    await evaluate('window.scrollTo({ top: 0, behavior: "auto" })')

    console.log('\n【需求 5】内页同样使用渐变背景（不再是图片）')
    await send('Page.navigate', { url: BASE + '/articles' })
    await sleep(3500)
    const inner = JSON.parse(await evaluate(PROBE))
    check('列表页背景也是渐变', /gradient/.test(inner.bodyBgImage) && !/url\(/.test(inner.bodyBgImage), inner.bodyBgImage.slice(0, 60))
    check('列表页同样没有 has-page-bg', inner.hasPageBgClass === false, inner.htmlClass)

    if (OUT) {
      const s = await send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(`${OUT}-pagebg.png`, Buffer.from(s.result.data, 'base64'))
      console.log('  saved', `${OUT}-pagebg.png`)
    }

    console.log('\n【需求 6】深色模式换成深色渐变')
    await evaluate(`localStorage.setItem('fcdzy_theme','dark')`)
    await send('Page.navigate', { url: BASE + '/' })
    await sleep(3500)
    const dark = JSON.parse(await evaluate(PROBE))
    check('深色下仍是渐变', /gradient/.test(dark.bodyBgImage), dark.bodyBgImage.slice(0, 60))
    check('深色渐变与浅色不同', dark.bodyBgImage !== light.bodyBgImage)
    await evaluate(`localStorage.setItem('fcdzy_theme','light')`)
  } finally {
    proc.kill()
  }

  console.log(failures === 0 ? '\n全局背景检查全部通过 ✅' : `\n共有 ${failures} 项未通过 ❌`)
  process.exit(failures === 0 ? 0 : 1)
})().catch((error) => {
  console.error('全局背景检查失败:', error)
  process.exit(1)
})
