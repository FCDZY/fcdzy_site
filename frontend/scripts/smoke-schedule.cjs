/**
 * 定时发布专项检查：
 * 服务器时间口径、定时文章前台不可见、到点自动发布（@Scheduled 轮询）、
 * 取消定时回到草稿、后台编辑器三个动作、列表页定时标签与取消、仪表盘「定时发布」卡片。
 *
 * 用法：node scripts/smoke-schedule.cjs
 * 可选：SMOKE_SHOT=<路径前缀> 输出截图
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5173'
const API = process.env.SMOKE_API || 'http://127.0.0.1:8080'
const DEBUG_PORT = 9695
const VIEW = { width: 1440, height: 1000 }

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

let failures = 0
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '[OK]  ' : '[MISS]'} ${label}${detail ? `  → ${detail}` : ''}`)
  if (!ok) failures++
}

let token = ''

async function api(method, urlPath, body) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const started = Date.now()
  const res = await fetch(`${API}/api${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, code: json.code, message: json.message, data: json.data, ms: Date.now() - started }
}

/** 服务器时间（yyyy-MM-dd HH:mm:ss） */
async function serverNow() {
  const res = await fetch(`${API}/api/public/server-info`).then((r) => r.json())
  return res.data.now
}

function shift(text, seconds) {
  const d = new Date(text.replace(' ', 'T'))
  d.setSeconds(d.getSeconds() + seconds)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function createArticle(payload) {
  return api('POST', '/admin/articles', {
    title: payload.title,
    content: payload.content || '# 定时测试\n\n自动发布测试内容。',
    status: payload.status,
    schedulePublishTime: payload.schedulePublishTime,
    categoryId: 1,
    tagIds: [],
    topped: false
  })
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

const PROBE_EDITOR = `(() => {
  const footer = Array.from(document.querySelectorAll('.footer-bar .el-button')).map((b) => b.textContent.trim())
  const statusText = (document.querySelector('.status-line') || {}).innerText || ''
  const pop = document.querySelector('.el-popover')
  const picker = document.querySelector('.el-popover .el-date-editor input')
  return JSON.stringify({
    footer,
    statusText: statusText.replace(/\\s+/g, ' ').trim(),
    popoverText: pop ? pop.innerText.replace(/\\s+/g, ' ').trim() : '',
    pickerValue: picker ? picker.value : ''
  })
})()`

;(async () => {
  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  }).then((r) => r.json())
  token = login?.data?.token
  if (!token) throw new Error('管理员登录失败，请确认后端已启动')

  const stamp = Date.now().toString(36)
  const created = []
  const cleanup = async () => {
    for (const id of created) {
      await api('DELETE', `/admin/articles/${id}`).catch(() => {})
    }
    created.length = 0
  }

  try {
    // ===== 1. 接口层：到点自动发布 =====
    console.log('【需求 2/1】设置定时 → 到点自动发布（服务器时间口径）')
    const now = await serverNow()
    check('服务器时间接口可用', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(now), now)

    const due = shift(now, 3)
    const created1 = await createArticle({ title: `定时A-${stamp}`, status: 'SCHEDULED', schedulePublishTime: due })
    created.push(created1.data.id)
    check('创建定时文章成功', created1.code === 0 && created1.data.status === 'SCHEDULED', `status=${created1.data?.status} 定时=${created1.data?.schedulePublishTime}`)
    check('定时时间按服务器墙钟保存', (created1.data.schedulePublishTime || '').replace('T', ' ').slice(0, 19) === due, `${created1.data.schedulePublishTime} vs ${due}`)

    const hidden = await fetch(`${API}/api/public/articles/${created1.data.slug}`)
    check('定时文章前台不可见（404）', hidden.status === 404, `HTTP ${hidden.status}`)

    console.log('  等待定时任务轮询（最多 45 秒）…')
    let published = null
    for (let i = 0; i < 45; i++) {
      await sleep(1000)
      const detail = await api('GET', `/admin/articles/${created1.data.id}`)
      if (detail.data?.status === 'PUBLISHED') {
        published = detail.data
        break
      }
    }
    check('到点后自动变为已发布', published?.status === 'PUBLISHED', `status=${published?.status}`)
    check(
      'publishedAt 使用计划时间',
      published && published.publishedAt.replace('T', ' ').slice(0, 19) === due,
      `${published?.publishedAt} vs ${due}`
    )
    check('定时字段保留作记录', !!published?.schedulePublishTime, `${published?.schedulePublishTime}`)
    const visible = await fetch(`${API}/api/public/articles/${created1.data.slug}`)
    check('发布后前台可访问（200）', visible.status === 200, `HTTP ${visible.status}`)

    // ===== 2. 校验 =====
    console.log('\n【校验】时间必须晚于服务器当前时间')
    const past = await createArticle({ title: `定时过去-${stamp}`, status: 'SCHEDULED', schedulePublishTime: shift(now, -300) })
    check('过去时间被拒绝', past.code === 400 && past.message.includes('晚于'), `${past.code} ${past.message}`)
    const missing = await createArticle({ title: `定时缺时间-${stamp}`, status: 'SCHEDULED' })
    check('缺少时间被拒绝', missing.code === 400 && missing.message.includes('请选择'), `${missing.code} ${missing.message}`)

    // ===== 3. 取消定时 =====
    console.log('\n【需求 4】取消定时 → 恢复草稿')
    const created2 = await createArticle({ title: `定时B-${stamp}`, status: 'SCHEDULED', schedulePublishTime: shift(now, 600) })
    created.push(created2.data.id)
    const cancelled = await api('PUT', `/admin/articles/${created2.data.id}/cancel-schedule`)
    check('取消后状态为草稿', cancelled.data?.status === 'DRAFT', `status=${cancelled.data?.status}`)
    check('取消后清空定时时间', !cancelled.data?.schedulePublishTime, `${cancelled.data?.schedulePublishTime}`)
    const cancelAgain = await api('PUT', `/admin/articles/${created2.data.id}/cancel-schedule`)
    check('非定时文章再次取消会报错', cancelAgain.code === 400, `${cancelAgain.code} ${cancelAgain.message}`)

    // ===== 4. 后台 UI =====
    const profile = path.join(os.tmpdir(), 'dsh-smoke-schedule-profile')
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
      const shoot = async (file) => {
        const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
        if (res.result?.data) fs.writeFileSync(file, Buffer.from(res.result.data, 'base64'))
      }
      const clickByText = async (text, scope = '.el-message-box') => {
        const box = JSON.parse(
          await evaluate(`(() => {
            const root = document.querySelector(${JSON.stringify(scope)}) || document
            const btn = Array.from(root.querySelectorAll('button')).find((b) => b.textContent.trim() === ${JSON.stringify(text)})
            if (!btn) return 'null'
            btn.scrollIntoView({ block: 'center' })
            const r = btn.getBoundingClientRect()
            return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) })
          })()`)
        )
        if (!box) throw new Error(`找不到按钮：${text}`)
        await sleep(200)
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: 1 })
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: 0 })
        await sleep(600)
      }

      await send('Page.navigate', { url: `${BASE}/` })
      await sleep(1200)
      await evaluate(`localStorage.setItem('fcdzy_admin_token', ${JSON.stringify(token)})`)

      // --- 编辑器 ---
      await send('Page.navigate', { url: `${BASE}/admin/articles/new` })
      for (let i = 0; i < 40; i++) {
        await sleep(400)
        if (await evaluate("!!document.querySelector('.footer-bar')")) break
      }
      await sleep(2000)
      const editor = JSON.parse(await evaluate(PROBE_EDITOR))

      console.log('\n【需求 3】编辑器三个动作')
      check('有「保存草稿」按钮', editor.footer.includes('保存草稿'), editor.footer.join(' / '))
      check('有「设置定时发布」按钮', editor.footer.some((t) => t.includes('设置定时发布')), editor.footer.join(' / '))
      check('有「立即发布」主按钮', editor.footer.some((t) => t.includes('立即发布')), editor.footer.join(' / '))
      check('状态区显示当前状态与操作提示', editor.statusText.includes('草稿'), editor.statusText)

      await evaluate(`(() => {
        const btn = Array.from(document.querySelectorAll('.footer-bar .el-button')).find((b) => b.textContent.includes('定时'))
        if (btn) btn.click()
      })()`)
      await sleep(1200)
      const popover = JSON.parse(await evaluate(PROBE_EDITOR))
      check('定时弹层显示「服务器时间」', popover.popoverText.includes('服务器时间'), popover.popoverText)
      check('弹层内有时区标注', popover.popoverText.includes('Asia/Shanghai'), popover.popoverText)
      check('弹层内默认填入候选时间', /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(popover.pickerValue), popover.pickerValue)
      check('弹层有「确定定时」按钮', popover.popoverText.includes('确定定时'), popover.popoverText)
      if (process.env.SMOKE_SHOT) await shoot(`${process.env.SMOKE_SHOT}-schedule-editor.png`)

      // --- 点击穿透回归：日期面板必须在弹层内部，点日期不能把弹层关掉 ---
      console.log('\n【回归】定时弹层点击穿透')
      const clickAt = async (selector) => {
        const pos = JSON.parse(
          await evaluate(`(() => {
            const el = document.querySelector(${JSON.stringify(selector)})
            if (!el) return 'null'
            const b = el.getBoundingClientRect()
            if (b.width <= 0) return 'null'
            return JSON.stringify({ x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) })
          })()`)
        )
        if (!pos) throw new Error(`找不到可点击元素：${selector}`)
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1, buttons: 1 })
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1, buttons: 0 })
        await sleep(600)
      }

      // 先把底部按钮滚进视口，避免点到视口外
      await evaluate("document.querySelector('.footer-bar').scrollIntoView({ block: 'center' })")
      await sleep(500)
      await clickAt('.schedule-panel .el-date-editor')
      await sleep(600)
      const panelState = JSON.parse(
        await evaluate(`(() => {
          const panels = Array.from(document.querySelectorAll('.el-picker-panel'))
          const inPopover = panels.some((p) => !!p.closest('.el-popover'))
          const rect = panels.length ? panels[0].getBoundingClientRect() : null
          return JSON.stringify({
            count: panels.length,
            inPopover,
            onScreen: rect ? rect.top >= -2 && rect.bottom <= window.innerHeight + 2 : false
          })
        })()`)
      )
      check('日期面板渲染在弹层内部（不再 teleport 到 body）', panelState.inPopover, `panels=${panelState.count} inPopover=${panelState.inPopover}`)
      check('日期面板完整落在视口内', panelState.onScreen, `onScreen=${panelState.onScreen}`)

      const urlBefore = await evaluate('location.pathname')
      await clickAt('.el-picker-panel .el-date-table td.available')
      await sleep(700)
      const afterPick = JSON.parse(
        await evaluate(`(() => {
          const pop = Array.from(document.querySelectorAll('.el-popover')).find((p) => p.getBoundingClientRect().width > 0)
          return JSON.stringify({
            popoverOpen: !!pop,
            url: location.pathname,
            toasts: Array.from(document.querySelectorAll('.el-message')).map((el) => el.textContent.trim())
          })
        })()`)
      )
      check('点日期后弹层仍然打开（不再被判定为外部点击）', afterPick.popoverOpen, `open=${afterPick.popoverOpen}`)
      check('点日期不会误触发提交/跳转', afterPick.url === urlBefore, `${urlBefore} → ${afterPick.url}`)
      check('点日期不会弹出保存成功提示', !afterPick.toasts.some((t) => t.includes('已') || t.includes('成功')), afterPick.toasts.join(' | ') || '(无)')

      // 收尾：关掉弹层，避免影响后面的列表页检查
      await evaluate(`(() => {
        const btn = Array.from(document.querySelectorAll('.footer-bar .el-button')).find((b) => b.textContent.includes('定时'))
        if (btn) btn.click()
      })()`)
      await sleep(600)

      // --- 列表页：定时标签 + 取消定时 ---
      const listScheduled = await createArticle({ title: `定时UI-${stamp}`, status: 'SCHEDULED', schedulePublishTime: shift(now, 900) })
      created.push(listScheduled.data.id)
      await send('Page.navigate', { url: `${BASE}/admin/articles` })
      for (let i = 0; i < 40; i++) {
        await sleep(400)
        if (await evaluate("!!document.querySelector('.el-table__row')")) break
      }
      await sleep(1500)
      const listState = JSON.parse(
        await evaluate(`(() => {
          const rows = Array.from(document.querySelectorAll('.el-table__row'))
          const target = rows.find((r) => r.textContent.includes('定时UI-'))
          const tag = target ? (target.querySelector('.el-tag') || {}).textContent : ''
          const timeText = target && target.querySelector('.schedule-time') ? target.querySelector('.schedule-time').textContent.trim() : ''
          const cancelBtn = target ? Array.from(target.querySelectorAll('button')).find((b) => b.textContent.includes('取消定时')) : null
          return JSON.stringify({
            found: !!target,
            tag: (tag || '').trim(),
            timeText,
            hasCancel: !!cancelBtn,
            statusOptions: Array.from(document.querySelectorAll('.el-select-dropdown__item')).map((el) => el.textContent.trim())
          })
        })()`)
      )
      console.log('\n【列表页】定时状态展示与取消')
      check('列表出现定时文章', listState.found)
      check('状态标签显示「定时」', listState.tag === '定时', listState.tag)
      check('显示定时时间', /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(listState.timeText), listState.timeText)
      check('行内提供「取消定时」', listState.hasCancel)
      if (process.env.SMOKE_SHOT) await shoot(`${process.env.SMOKE_SHOT}-schedule-list.png`)

      // 点击取消定时 → 确认
      await evaluate(`(() => {
        const rows = Array.from(document.querySelectorAll('.el-table__row'))
        const target = rows.find((r) => r.textContent.includes('定时UI-'))
        const btn = target && Array.from(target.querySelectorAll('button')).find((b) => b.textContent.includes('取消定时'))
        if (btn) btn.click()
      })()`)
      await sleep(900)
      await clickByText('取消定时')
      await sleep(1200)
      const afterCancel = await api('GET', `/admin/articles/${listScheduled.data.id}`)
      check('UI 取消定时后状态回到草稿', afterCancel.data?.status === 'DRAFT', `status=${afterCancel.data?.status}`)
      check('UI 取消定时后清空时间', !afterCancel.data?.schedulePublishTime, `${afterCancel.data?.schedulePublishTime}`)

      // --- 仪表盘 ---
      await send('Page.navigate', { url: `${BASE}/admin` })
      for (let i = 0; i < 40; i++) {
        await sleep(400)
        if (await evaluate("!!document.querySelector('.stat-value')")) break
      }
      await sleep(1500)
      const dash = JSON.parse(
        await evaluate(`(() => {
          const cards = Array.from(document.querySelectorAll('.stat')).map((el) => ({
            label: (el.querySelector('.stat-label') || {}).textContent || '',
            value: (el.querySelector('.stat-value') || {}).textContent || ''
          }))
          return JSON.stringify({ count: cards.length, cards })
        })()`)
      )
      const statsApi = await api('GET', '/admin/stats')
      const scheduledCard = dash.cards.find((c) => c.label.includes('定时'))
      console.log('\n【仪表盘】定时发布卡片')
      check('统计卡共 8 张', dash.count === 8, `${dash.count} 张`)
      check('存在「定时发布」卡片', !!scheduledCard, dash.cards.map((c) => c.label).join(' / '))
      check(
        '定时数与接口一致',
        scheduledCard && Number(scheduledCard.value) === statsApi.data.scheduledCount,
        `卡片=${scheduledCard?.value} 接口=${statsApi.data.scheduledCount}`
      )
    } finally {
      proc.kill()
    }

    console.log(failures === 0 ? '\n定时发布检查全部通过 ✅' : `\n共有 ${failures} 项未通过 ❌`)
  } finally {
    await cleanup()
  }
  process.exit(failures === 0 ? 0 : 1)
})().catch((error) => {
  console.error('定时发布检查失败:', error)
  process.exit(1)
})
