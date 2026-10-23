/**
 * 全局固定背景专项检查：
 * 背景图画到 body、cover/居中/不重复/fixed、滚动不动、卡片半透明、深浅色自动切换、Hero 不再自带背景。
 * 用法：node scripts/smoke-pagebg.cjs
 * 可选：SMOKE_SHOT=<路径前缀> 输出浅色/深色截图
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5173'
const API = process.env.SMOKE_API || 'http://127.0.0.1:8080'
const DEBUG_PORT = 9669
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

/** 解析 rgba(...) 的 alpha，返回 1 表示不透明 */
function alphaOf(color) {
  const m = /rgba?\([^)]*,\s*([\d.]+)\s*\)/.exec(color || '')
  return m ? Number(m[1]) : 1
}

const PROBE = `(() => {
  const cs = (el, pseudo) => (el ? getComputedStyle(el, pseudo || undefined) : null)
  const body = document.body
  const bodyStyle = cs(body)
  const hero = document.querySelector('.hero')
  const heroStyle = hero ? cs(hero) : null
  const overlay = document.querySelector('.hero-overlay')
  const card = document.querySelector('.article-card') || document.querySelector('.card')
  const side = document.querySelector('.side-card')
  const footer = document.querySelector('.site-footer')
  const root = document.documentElement
  const veil = cs(body, '::before')
  const heroFade = document.querySelector('.hero-fade')
  const home = document.querySelector('.home')
  const main = document.querySelector('.site-main')
  return JSON.stringify({
    htmlClass: root.className,
    isDark: root.classList.contains('dark'),
    bodyBgImage: bodyStyle.backgroundImage.slice(0, 160),
    bodyBgSize: bodyStyle.backgroundSize,
    bodyBgPosition: bodyStyle.backgroundPosition,
    bodyBgRepeat: bodyStyle.backgroundRepeat,
    bodyBgAttachment: bodyStyle.backgroundAttachment,
    bodyBgColor: bodyStyle.backgroundColor,
    bodyAnimName: bodyStyle.animationName,
    bodyAnimDuration: bodyStyle.animationDuration,
    rootBgImageVar: root.style.getPropertyValue('--page-bg-image').slice(0, 120),
    rootBgImageDarkVar: root.style.getPropertyValue('--page-bg-image-dark').slice(0, 120),
    hasPageBgClass: root.classList.contains('has-page-bg'),
    breathClass: root.classList.contains('page-bg-breath'),
    /* 全局白纱是否已移除 */
    veilContent: veil.content,
    veilBg: veil.backgroundColor,
    hrCount: document.querySelectorAll('hr').length,
    wideJunction: (() => {
      const vw = window.innerWidth
      const heroEl = document.querySelector('.hero')
      const base = heroEl ? heroEl.getBoundingClientRect().bottom : 0
      const out = []
      document.querySelectorAll('*').forEach((el) => {
        const b = el.getBoundingClientRect()
        if (b.width < vw * 0.9 || b.height > 200) return
        if (Math.abs(b.top - base) >= 80 && Math.abs(b.bottom - base) >= 80) return
        const cls = el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').join('.') : ''
        out.push(el.tagName.toLowerCase() + cls)
      })
      return out
    })(),
    heroFadeHeight: heroFade ? Math.round(heroFade.getBoundingClientRect().height) : 0,
    heroFadeBg: heroFade ? cs(heroFade).backgroundImage.slice(0, 130) : '',
    contentFadeHeight: (() => {
      const el = document.querySelector('.home-body')
      if (!el) return 0
      const h = cs(el, '::before').height
      return h.endsWith('px') ? Math.round(parseFloat(h)) : 0
    })(),
    contentFadeBg: (() => {
      const el = document.querySelector('.home-body')
      return el ? cs(el, '::before').backgroundImage.slice(0, 130) : ''
    })(),
    heroBgImage: heroStyle ? heroStyle.backgroundImage : '',
    heroBgColor: heroStyle ? heroStyle.backgroundColor : '',
    heroHeight: hero ? Math.round(hero.getBoundingClientRect().height) : 0,
    overlayBgImage: overlay ? cs(overlay).backgroundImage : '',
    overlayTop: overlay ? cs(overlay).backgroundColor : '',
    cardBg: card ? cs(card).backgroundColor : '',
    cardBorderColor: card ? cs(card).borderLeftColor : '',
    cardBorderWidth: card ? cs(card).borderLeftWidth : '',
    cardBlur: card ? cs(card).backdropFilter || cs(card).webkitBackdropFilter : '',
    cardRadius: card ? cs(card).borderRadius : '',
    cardShadow: card ? cs(card).boxShadow.slice(0, 40) : '',
    sideBg: side ? cs(side).backgroundColor : '',
    sideBlur: side ? cs(side).backdropFilter || cs(side).webkitBackdropFilter : '',
    footerBg: footer ? cs(footer).backgroundColor : '',
    footerBgImg: footer ? cs(footer).backgroundImage : '',
    footerBorderTop: footer ? cs(footer).borderTopWidth + ' ' + cs(footer).borderTopStyle : '',
    footerShadow: footer ? cs(footer).boxShadow : '',
    footerBlur: footer ? cs(footer).backdropFilter || cs(footer).webkitBackdropFilter : '',
    footerAlign: footer ? cs(footer).textAlign : '',
    footerText: footer ? footer.textContent.replace(/\s+/g, ' ').trim().slice(0, 200) : '',
    footerColor: footer ? cs(footer).color : '',
    footerHeight: footer ? Math.round(footer.getBoundingClientRect().height) : 0,
    footerTextShadow: footer ? cs(footer).textShadow.slice(0, 60) : '',
    homeBg: home ? cs(home).backgroundColor : '',
    homeBodyBg: document.querySelector('.home-body') ? cs(document.querySelector('.home-body')).backgroundColor : '',
    mainBg: main ? cs(main).backgroundColor : '',
    scrollY: Math.round(window.scrollY)
  })
})()`

;(async () => {
  const siteConfig = (await (await fetch(`${API}/api/public/site-config`)).json()).data
  const configuredImage = (siteConfig.homeHeroImage || '').trim()
  const configuredDark = (siteConfig.homeHeroImageDark || '').trim()
  const hasImage = Boolean(configuredImage || configuredDark)
  const hasDarkImage = Boolean(configuredDark || configuredImage)

  const profile = path.join(os.tmpdir(), 'dsh-smoke-pagebg-profile')
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
      if (res.result?.exceptionDetails) {
        throw new Error(res.result.exceptionDetails.exception?.description || 'evaluate failed')
      }
      return res.result?.result?.value
    }
    const probe = async () => JSON.parse(await evaluate(PROBE))
    const goto = async (url, ready) => {
      await send('Page.navigate', { url })
      for (let i = 0; i < 40; i++) {
        await sleep(300)
        if (await evaluate(ready).catch(() => false)) {
          await sleep(800)
          return
        }
      }
    }
    const shoot = async (file, clip) => {
      const params = clip
        ? { format: 'png', clip: { ...clip, scale: 1 }, captureBeyondViewport: true }
        : { format: 'png', captureBeyondViewport: true }
      const res = await send('Page.captureScreenshot', params)
      if (res.result?.data) fs.writeFileSync(file, Buffer.from(res.result.data, 'base64'))
    }
    /** 采样视口内固定一点的像素颜色，用于验证背景是否随滚动移动 */
    const samplePixel = async (x, y) => {
      const shot = await send('Page.captureScreenshot', { format: 'png' })
      const dataUrl = 'data:image/png;base64,' + shot.result.data
      return JSON.parse(
        await evaluate(`(async () => {
          const img = new Image()
          img.src = ${JSON.stringify(dataUrl)}
          await img.decode()
          const canvas = document.createElement('canvas')
          canvas.width = img.width
          canvas.height = img.height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0)
          const dpr = img.width / window.innerWidth
          const d = ctx.getImageData(Math.round(${x} * dpr), Math.round(${y} * dpr), 1, 1).data
          return JSON.stringify([d[0], d[1], d[2]])
        })()`)
      )
    }

    const homeReady = "!!document.querySelector('.article-card') && !!document.querySelector('.hero')"
    const shotPrefix = process.env.SMOKE_SHOT

    await goto(`${BASE}/`, "!!document.querySelector('#app')")
    await evaluate("localStorage.removeItem('fcdzy_theme'); localStorage.setItem('fcdzy_theme','light')")
    await goto(`${BASE}/`, homeReady)
    const light = await probe()

    console.log(`站点配置背景图：浅色 ${configuredImage || '(未配置，用默认渐变)'} / 深色 ${configuredDark || '(未配置，沿用浅色)'}\n`)

    console.log('【需求 1】背景图挂在 body 上，而不是 Hero')
    check('body 有背景图', light.bodyBgImage.includes('url(') || light.bodyBgImage.includes('linear-gradient'), light.bodyBgImage.slice(0, 80))
    if (configuredImage) {
      check('body 背景取自后台配置的图片', light.bodyBgImage.includes(configuredImage), light.bodyBgImage.slice(0, 100))
    }
    check('Hero 自身不再有背景图', light.heroBgImage === 'none' && (light.heroBgColor === 'rgba(0, 0, 0, 0)' || light.heroBgColor === 'transparent'), `${light.heroBgImage} / ${light.heroBgColor}`)
    check('html 标记与实际配置一致', light.hasPageBgClass === hasImage, `has-page-bg=${light.hasPageBgClass} / 已配置图=${hasImage}`)

    console.log('\n【需求 2】cover / 居中 / 不重复 / fixed')
    check('background-size: cover', light.bodyBgSize === 'cover', light.bodyBgSize)
    // 呼吸动画运行时会取到 50% 47%~50% 之间的中间值，允许 3% 内的偏差
    const posParts = String(light.bodyBgPosition).split(' ').map((v) => parseFloat(v))
    check(
      '背景居中',
      posParts.length === 2 && Math.abs(posParts[0] - 50) <= 3 && Math.abs(posParts[1] - 50) <= 3,
      light.bodyBgPosition
    )
    check('背景不重复', light.bodyBgRepeat === 'no-repeat', light.bodyBgRepeat)
    check('固定背景（fixed）', light.bodyBgAttachment === 'fixed', light.bodyBgAttachment)

    console.log('\n【需求 2】滚动时背景不跟随移动')
    // 呼吸动画会让背景缓慢位移，测量期间先关掉
    await evaluate("document.body.style.animation = 'none'")
    await sleep(300)
    // 取容器之外、吸顶导航与回到顶部按钮之外的点，确保采到的是纯背景
    const sampleX = VIEW.width - 40
    const sampleY = 600
    const beforeScroll = await samplePixel(sampleX, sampleY)
    await evaluate('window.scrollTo({ top: 500, behavior: "auto" })')
    await sleep(500)
    const afterScroll = await samplePixel(sampleX, sampleY)
    await evaluate('window.scrollTo({ top: 0, behavior: "auto" })')
    await sleep(400)
    await evaluate("document.body.style.animation = ''")
    const drift = Math.max(
      Math.abs(beforeScroll[0] - afterScroll[0]),
      Math.abs(beforeScroll[1] - afterScroll[1]),
      Math.abs(beforeScroll[2] - afterScroll[2])
    )
    check('滚动 500px 后同一视口位置像素不变', drift <= 6, `rgb(${beforeScroll.join(',')}) → rgb(${afterScroll.join(',')})，差 ${drift}`)
    await evaluate('window.scrollTo({ top: 0, behavior: "auto" })')
    await sleep(400)

    console.log('\n【需求 4】卡片 / 侧边栏半透明 + 毛玻璃 + 圆角阴影')
    check('文章卡片为深色半透明玻璃底（非实底非纯白）', /^rgba\(/.test(light.cardBg) && alphaOf(light.cardBg) > 0 && alphaOf(light.cardBg) <= 0.6, `${light.cardBg}（alpha=${alphaOf(light.cardBg)}）`)
    check('毛玻璃为 blur(6px)（含亮度归一化）', light.cardBlur.includes('blur(6px)'), light.cardBlur)
    check('边框为极淡白色描边（非实线）', light.cardBorderWidth === '1px' && alphaOf(light.cardBorderColor) < 0.5, `${light.cardBorderWidth} / ${light.cardBorderColor}（alpha=${alphaOf(light.cardBorderColor)}）`)
    check('卡片有圆角', parseFloat(light.cardRadius) >= 8, light.cardRadius)
    check('卡片有轻微阴影', light.cardShadow !== 'none' && light.cardShadow.length > 5, light.cardShadow)
    check('侧边栏容器同为半透明', light.sideBg === light.cardBg, `${light.sideBg} / ${light.cardBg}`)
    check('侧边栏容器同样毛玻璃', light.sideBlur.includes('blur(6px)'), light.sideBlur)
    check('页脚完全透明（无底色）', alphaOf(light.footerBg) === 0 && light.footerBgImg === 'none', `${light.footerBg} / ${light.footerBgImg}`)
    check('页脚无边框', light.footerBorderTop === '0px none', light.footerBorderTop)
    check('页脚无阴影', light.footerShadow === 'none', light.footerShadow)
    check('页脚无毛玻璃', light.footerBlur === 'none' || !light.footerBlur, light.footerBlur || 'none')
    check('页脚文字居中', light.footerAlign === 'center', light.footerAlign)
    check(
      '页脚文字颜色随主题（浅色为深灰）',
      light.footerColor.startsWith('rgb('),
      light.footerColor
    )
    check('页脚内容保留（版权 + 备案）', /©/.test(light.footerText) && light.footerText.length > 10, light.footerText)

    // 背景图穿透页脚：页脚内一点应与「同一视口坐标的纯背景」一致
    // 呼吸动画会让背景缓慢位移，测量期间先关掉
    await evaluate("document.body.style.animation = 'none'")
    await evaluate('window.scrollTo({ top: document.body.scrollHeight, behavior: "auto" })')
    await sleep(600)
    const footerPointY = await evaluate(`(() => {
      const f = document.querySelector('.site-footer')
      if (!f) return -1
      const b = f.getBoundingClientRect()
      return Math.round(b.top + b.height / 2)
    })()`)
    const inFooter = await samplePixel(40, footerPointY)
    await evaluate('window.scrollTo({ top: Math.max(0, window.scrollY - 300), behavior: "auto" })')
    await sleep(600)
    const inContent = await samplePixel(40, footerPointY)
    await evaluate('window.scrollTo({ top: 0, behavior: "auto" })')
    await sleep(400)
    await evaluate("document.body.style.animation = ''")
    const footerDiff = Math.max(
      Math.abs(inFooter[0] - inContent[0]),
      Math.abs(inFooter[1] - inContent[1]),
      Math.abs(inFooter[2] - inContent[2])
    )
    check(
      '背景图穿透页脚（页脚内像素等于纯背景）',
      footerDiff <= 6,
      `页脚内 rgb(${inFooter.join(',')}) vs 纯背景 rgb(${inContent.join(',')})，差 ${footerDiff}`
    )

    console.log('\n【需求 2】全局白色渐变遮罩已移除，背景全程完整可见')
    check('不再有全局薄纱层', light.veilContent === 'none' || alphaOf(light.veilBg) === 0, `content=${light.veilContent} / ${light.veilBg}`)
    check('主内容容器无白色底色', light.homeBg === 'rgba(0, 0, 0, 0)' && light.mainBg === 'rgba(0, 0, 0, 0)', `home=${light.homeBg} / main=${light.mainBg}`)
    check('首页内容区无底色（背景贯穿）', light.homeBodyBg === 'rgba(0, 0, 0, 0)', light.homeBodyBg)

    console.log('\n【需求 2/3】Hero 底部 40px 极短渐变 + 内容区无白色覆盖')
    check('渐变层高度 40px（结构保留）', light.heroFadeHeight === 40, `${light.heroFadeHeight}px`)
    check(
      '渐变层 alpha 全为 0（不叠加任何遮盖）',
      (light.heroFadeBg.match(/rgba\([^)]*\)/g) || []).every((c) => /,\s*0\)$/.test(c)),
      light.heroFadeBg.slice(0, 130)
    )
    check(
      '渐变两端均归零（不会形成白条或硬线）',
      (light.heroFadeBg.match(/rgba\(255, 255, 255, 0\)/g) || []).length >= 2,
      light.heroFadeBg.slice(0, 120)
    )
    check(
      '内容区顶部没有承接白色层',
      light.contentFadeHeight === 0 || light.contentFadeBg === 'none',
      `${light.contentFadeHeight}px / ${light.contentFadeBg || 'none'}`
    )
    check('页面无 <hr> 元素', light.hrCount === 0, String(light.hrCount))
    check(
      '衔接区没有其它贯穿整屏的元素',
      light.wideJunction.every((s) => s.includes('hero-fade')),
      light.wideJunction.join(' / ') || '(无)'
    )
    check('Hero 顶部遮罩仍为 0.45 起', light.overlayBgImage.includes('rgba(0, 0, 0, 0.45)'), light.overlayBgImage.slice(0, 90))
    check('Hero 标题浮在全局背景上（Hero 高度正常）', light.heroHeight >= 380, `${light.heroHeight}px`)

    console.log('\n【需求 4】深色模式自动切换背景图与卡片底色')
    if (shotPrefix) await shoot(`${shotPrefix}-pagebg-light.png`)
    await evaluate(`(() => { const b = document.querySelector('.theme-toggle'); if (b) b.click() })()`)
    await sleep(900)
    const dark = await probe()
    if (shotPrefix) await shoot(`${shotPrefix}-pagebg-dark.png`)
    check('深色模式已生效', dark.isDark)
    check('深色背景变量已写入', dark.rootBgImageDarkVar.includes('url(') || dark.rootBgImageDarkVar.includes('linear-gradient') || !hasImage, dark.rootBgImageDarkVar.slice(0, 90) || '(未配置图，走默认渐变)')
    if (configuredDark) {
      check('深色背景取自深色配置图', dark.bodyBgImage.includes(configuredDark), dark.bodyBgImage.slice(0, 100))
    } else if (configuredImage) {
      check('未配置深色图时自动沿用浅色图', dark.bodyBgImage.includes(configuredImage), dark.bodyBgImage.slice(0, 100))
    } else {
      check('未配置背景图时使用深色默认渐变', dark.bodyBgImage.includes('linear-gradient'), dark.bodyBgImage.slice(0, 90))
    }
    check('卡片底色自动切换为深色半透明', dark.cardBg !== light.cardBg && /^rgba\(/.test(dark.cardBg), `${light.cardBg} → ${dark.cardBg}`)
    check(
      '深色下渐变层同为全透明',
      (dark.heroFadeBg.match(/rgba\([^)]*\)/g) || []).every((c) => /,\s*0\)$/.test(c)),
      dark.heroFadeBg.slice(0, 130)
    )
    check('深色下 Hero 遮罩提升到 0.5', dark.overlayBgImage.includes('rgba(0, 0, 0, 0.5)'), dark.overlayBgImage.slice(0, 90))
    check('深色下背景仍然固定', dark.bodyBgAttachment === 'fixed', dark.bodyBgAttachment)
    check('深色下页脚同样完全透明', alphaOf(dark.footerBg) === 0 && dark.footerBorderTop === '0px none', `${dark.footerBg} / ${dark.footerBorderTop}`)
    check('深色下页脚文字转为浅色', dark.footerColor !== light.footerColor && dark.footerColor.startsWith('rgb('), `${light.footerColor} → ${dark.footerColor}`)
    check('深色下页脚内容不变', dark.footerText === light.footerText, dark.footerText.slice(0, 60))

    console.log('\n【开关】背景呼吸动画')
    check('呼吸动画类已开启', dark.breathClass === true, String(dark.breathClass))
    if (hasImage) {
      check('固定背景以 25s 缓慢起伏', dark.bodyAnimName.includes('page-bg-breath') && dark.bodyAnimDuration === '25s', `${dark.bodyAnimName} / ${dark.bodyAnimDuration}`)
    } else {
      check('未配置背景图时不启用呼吸', dark.bodyAnimName === 'none', dark.bodyAnimName)
    }

    await evaluate(`(() => { const b = document.querySelector('.theme-toggle'); if (b) b.click() })()`)
    await sleep(700)
    check('可切回浅色', (await probe()).isDark === false)

    console.log(failures === 0 ? '\n全局背景检查全部通过 ✅' : `\n共有 ${failures} 项未通过 ❌`)
  } finally {
    proc.kill()
  }
  process.exit(failures === 0 ? 0 : 1)
})().catch((error) => {
  console.error('全局背景检查失败:', error)
  process.exit(1)
})
