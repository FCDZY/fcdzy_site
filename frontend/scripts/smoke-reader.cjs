/**
 * 阅读体验四件套检查：图片灯箱 / 阅读时长字数 / 分享 / 阅读设置。
 *
 * 用法：
 *   node scripts/smoke-reader.cjs                 # 浅色 + 桌面
 *   node scripts/smoke-reader.cjs --dark          # 深色
 *   node scripts/smoke-reader.cjs --shot=a.png    # 顺便截图
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const PORT = 9761
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5173'
const API = process.env.SMOKE_API || 'http://127.0.0.1:8080/api'
const ADMIN_USER = process.env.SMOKE_ADMIN_USER || 'admin'
const ADMIN_PASS = process.env.SMOKE_ADMIN_PASS || 'admin123'
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 跑之前由用例自己创建，避免依赖库里已有文章 */
let WITH_CODE = ''
let WITHOUT_CODE = ''

const FILLER = Array.from(
  { length: 12 },
  (_, i) => `这是第 ${i + 1} 段正文，用来凑够字数并验证阅读时长统计逻辑是否正常工作。`
).join('\n\n')

function buildContent(withExtras) {
  const bigCode = [
    '```java',
    'public class Big {',
    ...Array.from({ length: 80 }, (_, i) => `    // 代码第 ${i + 1} 行，不该计入阅读时长`),
    '}',
    '```'
  ].join('\n')
  const images = [
    '![图一](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYkBBhgAAG0kA/2bT6HkAAAAAElFTkSuQmCC)',
    '![图二](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYkBBhgAAG0kA/2bT6HkAAAAAElFTkSuQmCC)',
    '![图三](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYkBBhgAAG0kA/2bT6HkAAAAAElFTkSuQmCC)'
  ].join('\n\n')

  // 两篇的「文字部分」完全一致；只有 A 额外带图片和代码块
  const head = ['# 阅读体验测试', '', FILLER, '', '## 配图区', '', '## 代码区', ''].join('\n')
  return withExtras ? `${head}\n${images}\n\n${bigCode}\n` : `${head}\n`
}

async function api(p, { method = 'GET', token, body } = {}) {
  const res = await fetch(API + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  try {
    return await res.json()
  } catch {
    return { code: res.status, message: 'HTTP ' + res.status }
  }
}

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed += 1
  console.log(`${ok ? '[OK]  ' : '[FAIL]'} ${name}${detail ? '  -> ' + detail : ''}`)
}

/* ---------------- DOM 探针 ---------------- */
function metaProbe() {
  const items = Array.from(document.querySelectorAll('.meta .meta-item')).map((el) => el.textContent.trim())
  const reading = items.find((t) => /分钟/.test(t)) || ''
  const match = reading.match(/(\d+)\s*分钟.*?([\d,]+)\s*字/)
  return JSON.stringify({
    items,
    raw: reading,
    minutes: match ? Number(match[1]) : null,
    chars: match ? Number(match[2].replace(/,/g, '')) : null,
    shareButtons: Array.from(document.querySelectorAll('.share-row .share-btn')).map((b) => b.textContent.trim()),
    hasSettingsBtn: !!document.querySelector('.reading-settings-btn'),
    imageCount: document.querySelectorAll('.markdown-body img').length,
    imageCursor: (() => {
      const img = document.querySelector('.markdown-body img')
      return img ? getComputedStyle(img).cursor : ''
    })()
  })
}

function viewerProbe() {
  const wrapper = document.querySelector('.el-image-viewer__wrapper')
  const counter = document.querySelector('.el-image-viewer__actions__divider')
  const preview = document.querySelector('.el-image-viewer__canvas img')
  return JSON.stringify({
    open: !!wrapper,
    hasCanvas: !!document.querySelector('.el-image-viewer__canvas'),
    hasClose: !!document.querySelector('.el-image-viewer__close'),
    imgSrcLen: preview ? String(preview.getAttribute('src') || '').length : 0,
    hasCounter: !!counter
  })
}

function typographyProbe() {
  const body = document.querySelector('.markdown-body')
  const article = document.querySelector('.article')
  return JSON.stringify({
    fontSize: body ? parseFloat(getComputedStyle(body).fontSize) : 0,
    articleWidth: article ? Math.round(article.getBoundingClientRect().width) : 0,
    sizeAttr: document.documentElement.dataset.readingSize || '',
    widthAttr: document.documentElement.dataset.readingWidth || ''
  })
}

function layoutProbe() {
  const row = document.querySelector('.share-row')
  const btn = document.querySelector('.reading-settings-btn')
  const bodyRect = document.body.getBoundingClientRect()
  return JSON.stringify({
    shareOverflow: row ? Math.round(row.scrollWidth - row.clientWidth) : 0,
    shareRight: row ? Math.round(row.getBoundingClientRect().right) : 0,
    bodyRight: Math.round(bodyRect.right),
    settingsVisible: btn ? btn.getBoundingClientRect().width > 0 : false
  })
}

;(async () => {
  const dark = process.argv.includes('--dark')
  const mobile = process.argv.includes('--mobile')
  const shotArg = process.argv.find((a) => a.startsWith('--shot='))
  const shotPath = shotArg ? shotArg.slice('--shot='.length) : ''

  // ---------- 自备数据：登录 → 建两篇临时文章 ----------
  const login = await api('/auth/login', { method: 'POST', body: { username: ADMIN_USER, password: ADMIN_PASS } })
  if (![0, '0'].includes(login.code)) {
    throw new Error('管理员登录失败（' + (login.message || login.code) + '），可用 SMOKE_ADMIN_USER / SMOKE_ADMIN_PASS 指定')
  }
  const token = login.data.token
  const createArticle = async (title, withExtras) => {
    const res = await api('/admin/articles', {
      method: 'POST',
      token,
      body: { title, content: buildContent(withExtras), status: 'PUBLISHED', categoryId: 1, tagIds: [], topped: false }
    })
    if (!res.data?.slug) throw new Error('创建临时文章失败：' + (res.message || ''))
    return res.data
  }
  const withCode = await createArticle('阅读体验测试（有代码·临时）', true)
  const withoutCode = await createArticle('阅读体验测试（无代码·临时）', false)
  WITH_CODE = withCode.slug
  WITHOUT_CODE = withoutCode.slug
  console.log('临时文章: ' + WITH_CODE + ' / ' + WITHOUT_CODE)

  const cleanup = async () => {
    await api('/admin/articles/' + withCode.id, { method: 'DELETE', token }).catch(() => {})
    await api('/admin/articles/' + withoutCode.id, { method: 'DELETE', token }).catch(() => {})
  }

  const profile = path.join(os.tmpdir(), 'dsh-reader-' + (dark ? 'dark' : 'light') + (mobile ? '-m' : ''))
  const proc = spawn(
    chrome,
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--window-size=1440,1800',
      '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT, 'about:blank'],
    { stdio: 'ignore' }
  )

  let wsUrl
  for (let i = 0; i < 40 && !wsUrl; i += 1) {
    await sleep(400)
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json()
      wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl
    } catch {
      /* 等 chrome */
    }
  }

  const ws = new WebSocket(wsUrl)
  await new Promise((resolve) => {
    ws.onopen = resolve
  })

  let msgId = 0
  const pending = new Map()
  const consoleLogs = []
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.method === 'Runtime.consoleAPICalled') {
      consoleLogs.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '))
    }
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
  try {
    await send('Browser.grantPermissions', {
      origin: BASE,
      permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite']
    })
  } catch {
    /* 老版本 chrome 没这个权限名，忽略 */
  }
  await send('Emulation.setDeviceMetricsOverride', {
    width: mobile ? 375 : 1440,
    height: mobile ? 812 : 1800,
    deviceScaleFactor: 1,
    mobile
  })

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (res.result?.exceptionDetails) {
      throw new Error(res.result.exceptionDetails.exception?.description || 'evaluate failed')
    }
    return res.result?.result?.value
  }
  const runProbe = async (fn) => JSON.parse(await evaluate('(' + fn.toString() + ')()'))
  const open = async (slug) => {
    await send('Page.navigate', { url: BASE + '/article/' + slug })
    await sleep(4500)
  }

  // 清掉上一轮遗留的阅读偏好，保证初始是默认值
  await send('Page.navigate', { url: BASE + '/' })
  await sleep(1500)
  await evaluate("localStorage.removeItem('fcdzy_reading_prefs')")
  if (dark) await evaluate("localStorage.setItem('fcdzy_theme','dark')")

  // ---------- 1. meta：字数 / 时长 / 分享 / 设置入口 ----------
  await open(WITH_CODE)
  const meta = await runProbe(metaProbe)
  console.log('meta:', JSON.stringify(meta))
  check('显示「约 N 分钟 · M 字」', meta.minutes !== null && meta.chars !== null, meta.raw)
  check('时长至少 1 分钟', (meta.minutes || 0) >= 1, String(meta.minutes))
  check('字数大于 0', (meta.chars || 0) > 0, String(meta.chars))
  check('有复制链接按钮', meta.shareButtons.some((t) => t.includes('复制链接')), JSON.stringify(meta.shareButtons))
  check('有微博分享按钮', meta.shareButtons.some((t) => t.includes('微博')))
  check('有阅读设置入口', meta.hasSettingsBtn === true)
  check('正文图片可点击（cursor: zoom-in）', meta.imageCursor === 'zoom-in', meta.imageCursor)

  // ---------- 2. 图片灯箱 ----------
  check('正文有 3 张图片', meta.imageCount === 3, String(meta.imageCount))
  await evaluate("document.querySelector('.markdown-body img').click()")
  await sleep(900)
  const viewer = await runProbe(viewerProbe)
  console.log('灯箱:', JSON.stringify(viewer))
  check('点击图片打开灯箱', viewer.open === true)
  check('灯箱有关闭按钮', viewer.hasClose === true)
  check('灯箱渲染了图片画布', viewer.hasCanvas === true)

  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await sleep(700)
  const closed = await runProbe(viewerProbe)
  check('Esc 可关闭灯箱', closed.open === false)

  // ---------- 3. 复制链接 ----------
  await evaluate("document.querySelector('.share-row .share-btn').click()")
  await sleep(600)
  const copyState = await evaluate(`(() => {
    const btn = document.querySelector('.share-row .share-btn')
    return JSON.stringify({ text: btn.textContent.trim(), copied: btn.classList.contains('is-copied') })
  })()`)
  const copyParsed = JSON.parse(copyState)
  check('复制后按钮变成「已复制」', copyParsed.copied === true && copyParsed.text.includes('已复制'), copyParsed.text)

  // ---------- 4. 阅读时长不受代码块影响 ----------
  await open(WITHOUT_CODE)
  const metaB = await runProbe(metaProbe)
  console.log('无代码文章 meta:', JSON.stringify({ minutes: metaB.minutes, chars: metaB.chars }))
  check(
    '代码块不计入字数（两篇字数一致）',
    metaB.chars === meta.chars,
    `有代码 ${meta.chars} / 无代码 ${metaB.chars}`
  )
  check(
    '代码块不计入时长（两篇时长一致）',
    metaB.minutes === meta.minutes,
    `有代码 ${meta.minutes} / 无代码 ${metaB.minutes}`
  )

  // ---------- 5. 阅读设置：字号 / 行宽 ----------
  await open(WITH_CODE)
  const before = await runProbe(typographyProbe)
  console.log('默认排版:', JSON.stringify(before))
  check('默认字号 16px', Math.abs(before.fontSize - 16) < 0.6, String(before.fontSize))

  await evaluate(`(() => {
    const btn = document.querySelector('.reading-settings-btn')
    btn.click()
  })()`)
  await sleep(600)
  const popoverOpen = await evaluate("!!document.querySelector('.reading-settings-popover, .el-popover')")
  check('点击齿轮打开阅读设置面板', popoverOpen === true)

  // 选「大」
  await evaluate(`(() => {
    const groups = Array.from(document.querySelectorAll('.rs-row'))
    const sizeRow = groups.find((r) => r.textContent.includes('字号'))
    const labels = Array.from(sizeRow.querySelectorAll('.el-radio-button'))
    const target = labels.find((l) => l.textContent.trim() === '大')
    if (target) target.querySelector('input').click()
  })()`)
  await sleep(700)
  const bigger = await runProbe(typographyProbe)
  check('字号切「大」后正文字号变大', bigger.fontSize > before.fontSize, `${before.fontSize} → ${bigger.fontSize}`)

  // 选「宽」
  await evaluate(`(() => {
    const groups = Array.from(document.querySelectorAll('.rs-row'))
    const widthRow = groups.find((r) => r.textContent.includes('行宽'))
    const labels = Array.from(widthRow.querySelectorAll('.el-radio-button'))
    const target = labels.find((l) => l.textContent.trim() === '宽')
    if (target) target.querySelector('input').click()
  })()`)
  await sleep(800)
  const wider = await runProbe(typographyProbe)
  check('行宽切「宽」后正文容器变宽', wider.articleWidth > before.articleWidth, `${before.articleWidth} → ${wider.articleWidth}`)

  // ---------- 6. 刷新后保留 ----------
  await open(WITH_CODE)
  const persisted = await runProbe(typographyProbe)
  check(
    '刷新后仍保留字号/行宽设置',
    persisted.sizeAttr === 'lg' && persisted.widthAttr === 'wide',
    `${persisted.sizeAttr}/${persisted.widthAttr}`
  )
  check('刷新后字号仍是放大值', persisted.fontSize > before.fontSize, String(persisted.fontSize))

  // ---------- 7. 移动端不溢出 ----------
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true })
  await open(WITH_CODE)
  const layout = await runProbe(layoutProbe)
  console.log('移动端布局:', JSON.stringify(layout))
  check('分享按钮行不溢出', layout.shareOverflow <= 1, `溢出 ${layout.shareOverflow}px`)
  check('移动端字号设置仍生效', (await runProbe(typographyProbe)).fontSize > 16, 'lg 生效')
  check('设置入口可见', layout.settingsVisible === true)

  // ---------- 8. 无报错 + 截图 ----------
  const errors = consoleLogs.filter((l) => /error/i.test(l))
  check('无控制台报错', errors.length === 0, errors.slice(0, 2).join(' | '))

  if (shotPath) {
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1800, deviceScaleFactor: 1, mobile: false })
    await open(WITH_CODE)
    await evaluate('window.scrollTo(0, 0)')
    await sleep(400)
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    if (shot.result?.data) {
      fs.writeFileSync(shotPath, Buffer.from(shot.result.data, 'base64'))
      console.log('截图已保存:', shotPath)
    }
  }

  console.log(failed === 0 ? '\n阅读体验检查全部通过 ✅' : '\n共有 ' + failed + ' 项未通过 ❌')
  await cleanup()
  proc.kill()
  process.exit(failed === 0 ? 0 : 1)
})()
