/**
 * 文章评论模块专项检查：
 * 免登录提交、默认待审核（前台不可见）、审核通过后展示、楼中楼回复、
 * 频率限制提示、后台审核/删除、毛玻璃样式。
 *
 * 需要后端与前端 dev server 都在运行；测试只在自己的临时评论上操作，结束时清理。
 * 用法：node scripts/smoke-comments.cjs
 * 可选：SMOKE_SHOT=<路径前缀> 输出截图
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5173'
const API = process.env.SMOKE_API || 'http://127.0.0.1:8080'
const DEBUG_PORT = 9677
const VIEW = { width: 1440, height: 900 }
const ARTICLE_SLUG = 'build-personal-site'
const MARK = `smoke-${Date.now().toString(36)}`

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
const alphaOf = (color) => {
  const m = /^rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/.exec(color || '')
  return m ? Number(m[1]) : 1
}
const isDark = (color) => {
  const [r, g, b] = (color || '').match(/\d+/g).slice(0, 3).map(Number)
  return (r * 299 + g * 587 + b * 114) / 1000 < 120
}

let failures = 0
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '[OK]  ' : '[MISS]'} ${label}${detail ? `  → ${detail}` : ''}`)
  if (!ok) failures++
}

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

/** 直接调后端（用于快速的造数 / 审核 / 清理）；返回里带 ms，便于验证接口没被 SMTP 拖慢 */
async function apiCall(method, urlPath, { token, body, ip } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (ip) headers['X-Forwarded-For'] = ip
  const startedAt = Date.now()
  const res = await fetch(`${API}/api${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, code: json.code, message: json.message, data: json.data, ms: Date.now() - startedAt }
}

const PROBE = `(() => {
  const cs = (el, pseudo) => (el ? getComputedStyle(el, pseudo || undefined) : null)
  const section = document.querySelector('.comments')
  const title = section ? section.querySelector('.comments-title') : null
  const inputs = section ? Array.from(section.querySelectorAll('.el-input__inner')) : []
  const textarea = section ? section.querySelector('textarea') : null
  const submitBtn = section ? section.querySelector('.el-button--primary') : null
  const items = section ? Array.from(section.querySelectorAll('.comment-item')) : []
  const replies = section ? Array.from(section.querySelectorAll('.reply-item')) : []
  const firstItem = items[0] || null
  const toasts = Array.from(document.querySelectorAll('.el-message')).map((el) => el.textContent.trim())
  const banner = section ? section.querySelector('.reply-banner') : null
  const paragraph = section ? section.querySelector('.comments-empty') : null
  const rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), left: Math.round(b.left), height: Math.round(b.height) } }
  return JSON.stringify({
    hasSection: !!section,
    cardClass: section ? section.className : '',
    cardBg: section ? cs(section).backgroundColor : '',
    cardBlur: section ? (cs(section).backdropFilter || cs(section).webkitBackdropFilter) : '',
    titleText: title ? title.textContent.replace(/\\s+/g, ' ').trim() : '',
    inputCount: inputs.length,
    textareaExists: !!textarea,
    submitText: submitBtn ? submitBtn.textContent.trim() : '',
    itemCount: items.length,
    replyCount: replies.length,
    firstNickname: firstItem && firstItem.querySelector('.comment-nickname') ? firstItem.querySelector('.comment-nickname').textContent.trim() : '',
    firstTime: firstItem && firstItem.querySelector('.comment-time') ? firstItem.querySelector('.comment-time').textContent.trim() : '',
    firstContent: firstItem && firstItem.querySelector('.comment-text') ? firstItem.querySelector('.comment-text').textContent.trim() : '',
    firstAvatar: firstItem && firstItem.querySelector('.avatar') ? {
      text: firstItem.querySelector('.avatar').textContent.trim(),
      bg: cs(firstItem.querySelector('.avatar')).backgroundColor
    } : null,
    firstReplyTo: replies[0] && replies[0].querySelector('.reply-to') ? replies[0].querySelector('.reply-to').textContent.trim() : '',
    firstReplyNick: replies[0] && replies[0].querySelector('.comment-nickname') ? replies[0].querySelector('.comment-nickname').textContent.trim() : '',
    firstReplyText: replies[0] && replies[0].querySelector('.comment-text') ? replies[0].querySelector('.comment-text').textContent.trim() : '',
    replyBtns: section ? section.querySelectorAll('.reply-btn').length : 0,
    bannerText: banner ? banner.textContent.replace(/\\s+/g, ' ').trim() : '',
    placeholder: textarea ? textarea.getAttribute('placeholder') : '',
    emptyText: paragraph ? paragraph.textContent.trim() : '',
    toasts,
    hasPagination: section ? !!section.querySelector('.el-pagination') : false,
    hasCommentsId: !!document.getElementById('comments'),
    jumpBtn: (() => {
      const el = document.querySelector('.jump-comments')
      return el ? { text: el.textContent.replace(/\s+/g, ' ').trim(), bg: cs(el).backgroundColor, rect: rect(el) } : null
    })(),
    titleRect: rect(document.querySelector('.article .title')),
    sectionRect: rect(section),
    inputRects: inputs.map((el) => rect(el)),
    textareaRect: rect(textarea),
    submitRect: rect(submitBtn),
    scrollY: Math.round(window.scrollY),
    maxScroll: Math.round(document.documentElement.scrollHeight - window.innerHeight),
    atBottom: Math.round(window.scrollY) >= Math.round(document.documentElement.scrollHeight - window.innerHeight) - 2,
  })
})()`

;(async () => {
  // ===== 1. 准备：登录拿 token、清掉历史测试评论 =====
  const login = await apiCall('POST', '/auth/login', { body: { username: 'admin', password: 'admin123' } })
  const token = login.data?.token
  if (!token) throw new Error('管理员登录失败，请确认后端已启动')

  const cleanup = async () => {
    const list = await apiCall('GET', `/admin/comments?status=ALL&pageNum=1&pageSize=100`, { token })
    const mine = (list.data?.list || []).filter((c) => c.content.includes(MARK) || c.nickname.includes(MARK))
    for (const c of mine) {
      await apiCall('DELETE', `/admin/comments/${c.id}`, { token })
    }
    return mine.length
  }
  await cleanup()

  const profile = path.join(os.tmpdir(), 'dsh-smoke-comments-profile')
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
    const goto = async (url, ready = "!!document.querySelector('.comments')") => {
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
      await sleep(200)
    }
    const click = async (x, y) => {
      await moveMouse(x, y)
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 })
      await sleep(400)
    }
    const clickEl = async (selector) => {
      const rect = JSON.parse(
        await evaluate(`(() => {
          const el = document.querySelector(${JSON.stringify(selector)})
          if (!el) return 'null'
          el.scrollIntoView({ block: 'center' })
          const b = el.getBoundingClientRect()
          return JSON.stringify({ x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) })
        })()`)
      )
      if (!rect) throw new Error(`找不到元素：${selector}`)
      await sleep(250)
      await click(rect.x, rect.y)
    }
    const typeInto = async (selector, text) => {
      await clickEl(selector)
      await send('Input.insertText', { text })
      await sleep(200)
    }
    const clearToasts = async () => {
      await evaluate("document.querySelectorAll('.el-message').forEach((el) => el.remove())")
      await sleep(150)
    }
    const shoot = async (file) => {
      const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
      if (res.result?.data) fs.writeFileSync(file, Buffer.from(res.result.data, 'base64'))
    }
    const shotPrefix = process.env.SMOKE_SHOT
    const articleUrl = `${BASE}/article/${ARTICLE_SLUG}`

    // ===== 2. 前台上半场：初始状态 =====
    await goto(articleUrl)
    await evaluate("document.querySelector('.comments').scrollIntoView({ block: 'start' })")
    await sleep(400)
    const initial = await probe()

    console.log('【需求 1/5】评论区渲染在文章详情页，深色毛玻璃卡片')
    check('文章页存在评论区', initial.hasSection)
    check('评论区使用首页同款深色玻璃类', initial.cardClass.includes('card--dark'), initial.cardClass)
    check('卡片为深色半透明底', alphaOf(initial.cardBg) > 0 && alphaOf(initial.cardBg) < 1 && isDark(initial.cardBg), `${initial.cardBg}（alpha=${alphaOf(initial.cardBg)}）`)
    check('卡片启用 backdrop-filter 毛玻璃', initial.cardBlur.includes('blur'), initial.cardBlur)
    check('标题显示评论数', /^评论\s*\(\d+\)$/.test(initial.titleText), initial.titleText)

    console.log('\n【需求】标题下方有「直达评论」按钮，点击平滑滚动到评论区')
    check('文章标题下方存在「直达评论」按钮', initial.jumpBtn && initial.jumpBtn.text.includes('直达评论'), initial.jumpBtn ? initial.jumpBtn.text : '(无)')
    check('按钮在标题下方', initial.jumpBtn && initial.titleRect && initial.jumpBtn.rect.top > initial.titleRect.top, `标题 top=${initial.titleRect?.top} 按钮 top=${initial.jumpBtn?.rect.top}`)
    check('评论区有可定位的 id', initial.hasCommentsId)

    // 回到顶部后点按钮：立刻读一次 scrollY（应在起始与终点之间，说明是平滑滚动而不是瞬间跳）
    await evaluate("window.scrollTo({ top: 0, behavior: 'auto' })")
    await sleep(400)
    const scrollBefore = await evaluate('Math.round(window.scrollY)')
    await clickEl('.jump-comments')
    await sleep(120)
    const scrollMid = await evaluate('Math.round(window.scrollY)')
    await sleep(1600)
    const afterJump = await probe()
    const sectionTop = afterJump.sectionRect ? afterJump.sectionRect.top : 9999
    check('点击后确实滚动到了页面下方', scrollBefore < 100 && afterJump.scrollY > scrollBefore + 200, `${scrollBefore} → ${afterJump.scrollY}`)
    check('评论区停在视口顶部附近（或页面已滚到底）', sectionTop >= -2 && (sectionTop <= 60 || afterJump.atBottom), `评论区 top=${sectionTop}，是否到底=${afterJump.atBottom}`)
    check('是平滑滚动（中途位置在起止之间）', scrollMid > scrollBefore && scrollMid < afterJump.scrollY, `起点 ${scrollBefore} / 中途 ${scrollMid} / 终点 ${afterJump.scrollY}`)

    console.log('\n【需求 2】提交表单：昵称 + 邮箱 + 内容')
    check('有昵称与邮箱两个输入框', initial.inputCount === 2, `${initial.inputCount} 个`)
    check('有内容输入框（多行）', initial.textareaExists)
    check('有提交按钮', initial.submitText === '发表评论', initial.submitText)

    console.log('\n【需求 3】初始没有已通过评论')
    check('列表为空且有引导文案', initial.itemCount === 0 && initial.emptyText.includes('还没有评论'), initial.emptyText)

    if (shotPrefix) await shoot(`${shotPrefix}-comments-empty.png`)

    // ===== 3. 访客提交（免登录）=====
    console.log('\n【需求 2/3】访客提交评论 → 提示待审核、前台暂不展示')
    await clearToasts()
    await typeInto('.comments .el-input__inner', `访客${MARK}`)
    // 第二个输入框是邮箱（用位置定位，nth-of-type 在各自 wrapper 里会重复命中第 1 个）
    await evaluate(`(() => {
      const inputs = document.querySelectorAll('.comments .el-input__inner')
      if (inputs[1]) {
        inputs[1].scrollIntoView({ block: 'center' })
        inputs[1].focus()
      }
    })()`)
    await sleep(250)
    await send('Input.insertText', { text: `guest-${MARK}@example.com` })
    await sleep(200)
    await typeInto('.comments textarea', `这是 ${MARK} 的测试评论`)
    await clickEl('.comments .el-button--primary')
    await sleep(900)
    let afterSubmit = await probe()
    // 上一次运行（30 秒内）可能还占着限流窗口：按提示秒数等一等再点一次
    const waitMatch = /请 (\d+) 秒后再试/.exec(afterSubmit.toasts.join(' '))
    if (waitMatch) {
      const waitSeconds = Number(waitMatch[1]) + 2
      console.log(`  （检测到上次运行残留的限流窗口，等待 ${waitSeconds} 秒后重试）`)
      await sleep(waitSeconds * 1000)
      await clearToasts()
      await clickEl('.comments .el-button--primary')
      await sleep(900)
      afterSubmit = await probe()
    }
    const successToast = afterSubmit.toasts.some((t) => t.includes('审核'))
    check('提交后提示「审核通过后展示」', successToast, afterSubmit.toasts.join(' | ') || '(无提示)')
    check('待审核评论未出现在前台列表', afterSubmit.itemCount === 0, `${afterSubmit.itemCount} 条`)
    check('评论数未增加（只统计已通过）', afterSubmit.titleText === initial.titleText, `${initial.titleText} → ${afterSubmit.titleText}`)
    check('有「已提交，等待审核」状态提示', afterSubmit.placeholder !== '' && afterSubmit.toasts.length > 0)

    const pendingList = await apiCall('GET', `/admin/comments?status=PENDING&keyword=${MARK}`, { token })
    const pendingItem = (pendingList.data?.list || [])[0]
    check('后端已落库为待审核', pendingList.data?.total === 1 && pendingItem?.status === 'PENDING', `total=${pendingList.data?.total} status=${pendingItem?.status}`)
    check('后台能看到邮箱', pendingItem?.email === `guest-${MARK}@example.com`, pendingItem?.email)

    // ===== 4. 频率限制 =====
    console.log('\n【需求 7】同一 IP 短时间重复提交被拦下')
    await clearToasts()
    await typeInto('.comments textarea', `重复提交 ${MARK}`)
    await clickEl('.comments .el-button--primary')
    await sleep(900)
    const afterRateLimit = await probe()
    check(
      '第二次提交被限流并给出提示',
      afterRateLimit.toasts.some((t) => t.includes('太频繁') || t.includes('秒后')),
      afterRateLimit.toasts.join(' | ') || '(无提示)'
    )
    const pendingAfter = await apiCall('GET', `/admin/comments?status=PENDING&keyword=${MARK}`, { token })
    check('限流期间没有多写记录', pendingAfter.data?.total === 1, `total=${pendingAfter.data?.total}`)

    // ===== 4.5 邮件为异步发送：接口不等 SMTP =====
    console.log('\n【需求 8】通知邮件异步发送，不拖慢评论接口')
    const mailProbe = await apiCall('POST', `/public/articles/${ARTICLE_SLUG}/comments`, {
      ip: '10.8.8.8',
      body: { nickname: `异步${MARK}`, content: `异步邮件耗时探针 ${MARK}` }
    })
    check('提交接口成功返回', mailProbe.code === 0, `code=${mailProbe.code} id=${mailProbe.data?.id}`)
    // 真实 SMTP 往返约 500~2000ms；接口若同步等邮件，耗时会明显超过 1s
    check('接口耗时远小于 SMTP 往返（异步生效）', mailProbe.ms < 1000, `${mailProbe.ms} ms`)
    await apiCall('DELETE', `/admin/comments/${mailProbe.data.id}`, { token })

    // ===== 5. 审核通过 + 楼中楼 =====
    console.log('\n【需求 3/1】后台通过审核 → 前台展示；回复形成楼中楼')
    await apiCall('PUT', `/admin/comments/${pendingItem.id}/approve`, { token })
    const replyRes = await apiCall('POST', `/public/articles/${ARTICLE_SLUG}/comments`, {
      ip: '10.9.9.9',
      body: { nickname: `回复者${MARK}`, content: `这是 ${MARK} 的回复`, parentId: pendingItem.id }
    })
    check('回复接口可用（不受同一 IP 限流影响）', replyRes.code === 0, `code=${replyRes.code} ${replyRes.message || ''}`)
    await apiCall('PUT', `/admin/comments/${replyRes.data.id}/approve`, { token })

    await goto(articleUrl)
    await evaluate("document.querySelector('.comments').scrollIntoView({ block: 'start' })")
    await sleep(500)
    const withComment = await probe()
    check('一级评论已展示', withComment.itemCount === 1, `${withComment.itemCount} 条`)
    check('显示昵称', withComment.firstNickname.startsWith('访客'), withComment.firstNickname)
    check('显示时间', /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(withComment.firstTime), withComment.firstTime)
    check('显示内容', withComment.firstContent.includes(MARK), withComment.firstContent)
    check('显示头像（首字）', withComment.firstAvatar && withComment.firstAvatar.text.length === 1, JSON.stringify(withComment.firstAvatar))
    check('头像为彩色圆形', withComment.firstAvatar && alphaOf(withComment.firstAvatar.bg) > 0, withComment.firstAvatar?.bg)
    check('评论数已更新为 2（含回复）', withComment.titleText === '评论 (2)', withComment.titleText)
    check('楼中楼回复已展示', withComment.replyCount === 1, `${withComment.replyCount} 条`)
    check('回复显示「回复 @xx」', withComment.firstReplyTo.includes('@'), withComment.firstReplyTo)
    check('回复的昵称与内容正确', withComment.firstReplyNick.startsWith('回复者') && withComment.firstReplyText.includes(MARK), `${withComment.firstReplyNick} / ${withComment.firstReplyText}`)
    check('每条评论都有回复按钮', withComment.replyBtns >= 2, `${withComment.replyBtns} 个`)
    if (shotPrefix) await shoot(`${shotPrefix}-comments-list.png`)

    console.log('\n【需求 4】点击「回复」进入回复态')
    await clickEl('.comments .comment-item .reply-btn')
    await sleep(400)
    const replyState = await probe()
    check('出现「正在回复 @xx」横幅', replyState.bannerText.includes('正在回复') && replyState.bannerText.includes('@'), replyState.bannerText)
    check('输入框占位符切换为回复提示', replyState.placeholder.includes('回复 @'), replyState.placeholder)
    check('提交按钮文案变为「发表回复」', replyState.submitText === '发表回复', replyState.submitText)
    await clickEl('.comments .reply-cancel')
    await sleep(300)
    const cancelled = await probe()
    check('取消回复后恢复常态', !cancelled.bannerText && cancelled.submitText === '发表评论', `banner="${cancelled.bannerText}" / ${cancelled.submitText}`)

    // ===== 6. 后台审核/删除 =====
    console.log('\n【需求 3】后台「评论管理」：查看、通过、删除')
    await goto(`${BASE}/`, "!!document.querySelector('#app')")
    await evaluate(`localStorage.setItem('fcdzy_admin_token', ${JSON.stringify(token)})`)
    await send('Page.navigate', { url: `${BASE}/admin/comments` })
    for (let i = 0; i < 40; i++) {
      await sleep(300)
      if (await evaluate("!!document.querySelector('.el-table__row') || !!document.querySelector('.el-table__empty-text')")) break
    }
    await sleep(1200)
    const adminState = JSON.parse(
      await evaluate(`(() => {
        const rows = Array.from(document.querySelectorAll('.el-table__row'))
        const texts = rows.map((r) => r.textContent.replace(/\\s+/g, ' ').trim())
        const menus = Array.from(document.querySelectorAll('.menu .el-menu-item')).map((el) => el.textContent.trim())
        return JSON.stringify({
          menuHasComments: menus.includes('评论管理'),
          rowCount: rows.length,
          rows: texts.slice(0, 5),
          buttons: Array.from(document.querySelectorAll('.el-table__row .el-button')).map((b) => b.textContent.trim()).slice(0, 8),
          hasTable: !!document.querySelector('.el-table')
        })
      })()`)
    )
    check('后台菜单出现「评论管理」', adminState.menuHasComments)
    check('后台有评论表格', adminState.hasTable)
    check('默认「待审核」筛选下看不到已通过的测试评论', adminState.rows.every((r) => !r.includes(MARK)), `${adminState.rowCount} 行待审核`)
    await evaluate(`(() => {
      const selects = document.querySelectorAll('.toolbar .el-select')
      if (!selects.length) return
      const input = selects[0].querySelector('input')
      if (input) { input.focus(); input.click() }
    })()`)
    await sleep(500)
    // 选择「全部」查看已通过的评论
    const picked = await evaluate(`(() => {
      const items = Array.from(document.querySelectorAll('.el-select-dropdown__item'))
      const all = items.find((el) => el.textContent.trim() === '全部')
      if (all) { all.click(); return true }
      return false
    })()`)
    await sleep(1200)
    const allState = JSON.parse(
      await evaluate(`(() => {
        const rows = Array.from(document.querySelectorAll('.el-table__row'))
        return JSON.stringify({
          rows: rows.map((r) => r.textContent.replace(/\\s+/g, ' ').trim()).slice(0, 5),
          buttons: Array.from(document.querySelectorAll('.el-table__row .el-button')).map((b) => b.textContent.trim())
        })
      })()`)
    )
    check('切换到「全部」后能看到评论', picked && allState.rows.length >= 2, `${allState.rows.length} 行：${allState.rows[0] || ''}`.slice(0, 120))
    check('行内提供「删除」操作', allState.buttons.includes('删除'), allState.buttons.join(' / '))

    if (shotPrefix) await shoot(`${shotPrefix}-comments-admin.png`)

    // 删除一级评论（应连带回复）
    const delRes = await apiCall('DELETE', `/admin/comments/${pendingItem.id}`, { token })
    check('删除一级评论会连带删除其回复', delRes.code === 0 && delRes.data === 2, `删除 ${delRes.data} 条`)
    const left = await apiCall('GET', `/admin/comments?status=ALL&keyword=${MARK}`, { token })
    check('后台已清空该测试评论', left.data?.total === 0, `total=${left.data?.total}`)
    const publicAfter = await apiCall('GET', `/public/articles/${ARTICLE_SLUG}/comments?pageNum=1&pageSize=10`)
    check('前台评论数回到 0', publicAfter.data?.total === 0, `total=${publicAfter.data?.total}`)

    console.log(failures === 0 ? '\n评论模块检查全部通过 ✅' : `\n共有 ${failures} 项未通过 ❌`)
  } finally {
    await cleanup().catch(() => {})
    proc.kill()
  }
  process.exit(failures === 0 ? 0 : 1)
})().catch((error) => {
  console.error('评论模块检查失败:', error)
  process.exit(1)
})
