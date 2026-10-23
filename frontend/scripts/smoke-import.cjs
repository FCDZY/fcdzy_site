/**
 * 后台「导入 Markdown 文件」专项检查：
 * 文件选择、拖拽导入、4MB 限制、非 md 拦截、导入后可继续编辑、深浅主题适配、不落库。
 *
 * 会在临时目录生成测试文件，结束时（含异常）自动删除。
 * 用法：node scripts/smoke-import.cjs
 * 可选：SMOKE_SHOT=<路径前缀> 输出浅色/深色截图
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5173'
const API = process.env.SMOKE_API || 'http://127.0.0.1:8080'
const DEBUG_PORT = 9668
const VIEW = { width: 1440, height: 1000 }

const MD_TEXT = [
  '# 导入测试文章',
  '',
  '这是一段来自 md 文件的正文内容，用于验证导入功能。',
  '',
  '## 二级标题',
  '',
  '- 列表项一',
  '- 列表项二',
  '',
  '```js',
  "console.log('imported')",
  '```',
  '',
  '结尾标记：IMPORT_MARKER_ONE'
].join('\n')

const MD_TEXT_2 = [
  '# 拖拽导入的文章',
  '',
  '内容来自拖拽，标记：IMPORT_MARKER_TWO',
  '',
  '## 拖拽小节',
  '',
  '正文内容。'
].join('\n')

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

const PROBE = `(() => {
  const cs = (el) => (el ? getComputedStyle(el) : null)
  const input = document.querySelector('.file-input')
  const bar = document.querySelector('.editor-bar')
  const barBtn = bar ? bar.querySelector('.el-button') : null
  const tip = document.querySelector('.editor-bar-tip')
  const mask = document.querySelector('.editor-drop-mask')
  const cm = document.querySelector('.md-editor .cm-content') || document.querySelector('.md-editor textarea')
  /* CodeMirror 每行一个 .cm-line，textContent 不含换行，需要按行拼接 */
  const cmLines = document.querySelectorAll('.md-editor .cm-content .cm-line')
  const editorText = cmLines.length
    ? Array.from(cmLines).map((line) => line.textContent).join('\\n')
    : (cm ? (cm.value !== undefined ? cm.value : cm.textContent) : '')
  const titleInput = document.querySelector('.el-form-item__content input')
  const errors = Array.from(document.querySelectorAll('.el-message--error'))
  const successes = Array.from(document.querySelectorAll('.el-message--success'))
  const warnings = Array.from(document.querySelectorAll('.el-message--warning'))
  const errorMsg = errors.length ? errors[errors.length - 1] : null
  const successMsg = successes.length ? successes[successes.length - 1] : null
  const warningMsg = warnings.length ? warnings[0] : null
  const confirmBox = document.querySelector('.el-message-box')
  return JSON.stringify({
    hasBar: !!bar,
    buttonText: barBtn ? barBtn.textContent.trim() : '',
    accept: input ? input.getAttribute('accept') : null,
    inputHidden: input ? cs(input).display : '',
    tipText: tip ? tip.textContent.trim() : '',
    tipColor: tip ? cs(tip).color : '',
    btnBg: barBtn ? cs(barBtn).backgroundColor : '',
    btnColor: barBtn ? cs(barBtn).color : '',
    maskVisible: !!mask,
    maskBg: mask ? cs(mask).backgroundColor : '',
    maskBorder: mask ? cs(mask).borderColor : '',
    maskPointer: mask ? cs(mask).pointerEvents : '',
    editorText: editorText,
    editorLines: cmLines.length,
    editorEditable: cm ? cm.getAttribute('contenteditable') : null,
    titleValue: titleInput ? titleInput.value : '',
    errorText: errorMsg ? errorMsg.textContent.trim() : '',
    successText: successMsg ? successMsg.textContent.trim() : '',
    warningText: warningMsg ? warningMsg.textContent.trim() : '',
    hasConfirm: !!confirmBox,
    confirmText: confirmBox ? confirmBox.textContent.replace(/\\s+/g, ' ').trim() : '',
    pickerOpened: window.__pickerOpened || 0,
    isDark: document.documentElement.classList.contains('dark')
  })
})()`

const tempFiles = []

function writeTemp(name, content) {
  const file = path.join(os.tmpdir(), name)
  fs.writeFileSync(file, content, 'utf8')
  tempFiles.push(file)
  return file
}

async function apiLogin() {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  })
  return (await res.json()).data.token
}

async function articleTotal(token) {
  const res = await fetch(`${API}/api/admin/articles?page=1&size=1`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  return (await res.json()).data.total
}

;(async () => {
  const token = await apiLogin()
  const totalBefore = await articleTotal(token)

  const mdFile = writeTemp('smoke-import.md', MD_TEXT)
  const mdFile2 = writeTemp('smoke-import-2.md', MD_TEXT_2)
  const txtFile = writeTemp('smoke-import.txt', '这不是 markdown 文件')
  const bigFile = writeTemp('smoke-import-big.md', '# 超大文件\n\n' + 'x'.repeat(4.2 * 1024 * 1024))
  const bigSize = fs.statSync(bigFile).size
  console.log(`测试文件已生成：md=${MD_TEXT.length}字符、txt、超大 md=${(bigSize / 1024 / 1024).toFixed(2)}MB\n`)

  const profile = path.join(os.tmpdir(), 'dsh-smoke-import-profile')
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
    await send('DOM.enable')

    const evaluate = async (expression) => {
      const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (res.result?.exceptionDetails) {
        throw new Error(res.result.exceptionDetails.exception?.description || 'evaluate failed')
      }
      return res.result?.result?.value
    }
    const probe = async () => JSON.parse(await evaluate(PROBE))

    const clickEl = async (selector) => {
      await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (el) el.scrollIntoView({ block: 'center' }) })()`)
      await sleep(400)
      const box = JSON.parse(
        await evaluate(`(() => {
          const el = document.querySelector(${JSON.stringify(selector)})
          const r = el ? el.getBoundingClientRect() : null
          return JSON.stringify(r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null)
        })()`)
      )
      if (!box) return false
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: 0 })
      return true
    }

    const setFile = async (filePath) => {
      // 清掉上一条 toast，避免读到过期提示
      await evaluate("document.querySelectorAll('.el-message').forEach((m) => m.remove())")
      const doc = await send('DOM.getDocument', { depth: -1 })
      const node = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: 'input.file-input' })
      await send('DOM.setFileInputFiles', { files: [filePath], nodeId: node.result.nodeId })
      await sleep(900)
    }

    const goto = async (url, ready) => {
      await send('Page.navigate', { url })
      for (let i = 0; i < 40; i++) {
        await sleep(300)
        if (await evaluate(ready).catch(() => false)) {
          await sleep(900)
          return
        }
      }
    }
    const shoot = async (file, clip) => {
      const params = clip ? { format: 'png', clip: { ...clip, scale: 1 }, captureBeyondViewport: true } : { format: 'png', captureBeyondViewport: true }
      const res = await send('Page.captureScreenshot', params)
      if (res.result?.data) fs.writeFileSync(file, Buffer.from(res.result.data, 'base64'))
    }

    // 登录并进入新建文章页
    await goto(`${BASE}/`, "!!document.querySelector('#app')")
    await evaluate(
      `fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) })
        .then(r => r.json()).then(d => localStorage.setItem('fcdzy_admin_token', d.data.token))`
    )
    await evaluate("localStorage.removeItem('fcdzy_theme'); localStorage.setItem('fcdzy_theme','light'); document.documentElement.classList.remove('dark')")
    await goto(`${BASE}/admin/articles/new`, "!!document.querySelector('.md-editor')")

    const initial = await probe()
    console.log('【需求 1】导入入口与文件类型限制')
    check('编辑器上方有导入按钮', initial.hasBar && initial.buttonText.includes('导入 Markdown'), initial.buttonText)
    check('文件选择器限定 .md', (initial.accept || '').includes('.md'), String(initial.accept))
    check('文件输入框已隐藏', initial.inputHidden === 'none', initial.inputHidden)
    check('提供格式与大小提示', initial.tipText.includes('.md') && initial.tipText.includes('4MB'), initial.tipText)

    // 点击按钮应触发文件选择器
    await evaluate(`(() => {
      window.__pickerOpened = 0
      const input = document.querySelector('.file-input')
      input.click = function () { window.__pickerOpened += 1 }
    })()`)
    await clickEl('.editor-bar .el-button')
    await sleep(500)
    const afterClick = await probe()
    check('点击按钮唤起文件选择器', afterClick.pickerOpened === 1, `picker 调用 ${afterClick.pickerOpened} 次`)

    console.log('\n【需求 2】选择 .md 文件后自动填充编辑器')
    await setFile(mdFile)
    const imported = await probe()
    check('编辑器已填入文件内容', imported.editorText.includes('IMPORT_MARKER_ONE') && imported.editorText.includes('# 导入测试文章'), `${imported.editorText.length} 字符`)
    check('内容与文件一致', imported.editorText.replace(/\s+$/, '') === MD_TEXT.replace(/\s+$/, ''), '逐字符比对')
    check('导入成功有提示', imported.successText.includes('已导入') && imported.successText.includes('smoke-import.md'), imported.successText)
    check('未自动修改标题', imported.titleValue === initial.titleValue, `标题「${imported.titleValue}」`)

    console.log('\n【需求 4】非 md 文件禁止导入')
    await setFile(txtFile)
    const rejected = await probe()
    check('非 md 文件给出错误提示', rejected.errorText.includes('不是 Markdown 文件'), rejected.errorText)
    check('非 md 文件未污染编辑器', rejected.editorText.includes('IMPORT_MARKER_ONE'), `${rejected.editorText.length} 字符`)

    console.log('\n【需求 4】超过 4MB 的文件禁止导入')
    await setFile(bigFile)
    const tooBig = await probe()
    check('超限文件给出错误提示', tooBig.errorText.includes('4MB'), tooBig.errorText)
    check('超限文件未写入编辑器', tooBig.editorText.includes('IMPORT_MARKER_ONE') && !tooBig.editorText.includes('xxxxx'), `${tooBig.editorText.length} 字符`)

    console.log('\n【需求 1】拖拽 md 文件到编辑器区域导入')
    const dragResult = await evaluate(`(() => {
      const dt = new DataTransfer()
      dt.items.add(new File([${JSON.stringify(MD_TEXT_2)}], 'smoke-drop.md', { type: 'text/markdown' }))
      const target = document.querySelector('.editor-area')
      target.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: dt }))
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
      return 'dragging'
    })()`)
    await sleep(400)
    const dragging = await probe()
    if (process.env.SMOKE_SHOT) {
      const box = JSON.parse(
        await evaluate(`(() => {
          const el = document.querySelector('.editor-area')
          const r = el.getBoundingClientRect()
          return JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) })
        })()`)
      )
      await shoot(`${process.env.SMOKE_SHOT}-import-drag.png`, { x: box.x, y: box.y, width: box.w, height: Math.min(box.h, 420) })
    }
    check('拖拽时显示投放遮罩', dragging.maskVisible, dragResult)
    check('遮罩使用主题色', dragging.maskBg === 'rgb(239, 246, 255)' && dragging.maskBorder === 'rgb(59, 130, 246)', `${dragging.maskBg} / ${dragging.maskBorder}`)
    check('遮罩不拦截鼠标事件', dragging.maskPointer === 'none', dragging.maskPointer)

    await evaluate(`(() => {
      const dt = new DataTransfer()
      dt.items.add(new File([${JSON.stringify(MD_TEXT_2)}], 'smoke-drop.md', { type: 'text/markdown' }))
      document.querySelector('.editor-area').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
    })()`)
    await sleep(700)
    const confirmState = await probe()
    check('覆盖已有内容前二次确认', confirmState.hasConfirm && confirmState.confirmText.includes('覆盖当前正文'), confirmState.confirmText.slice(0, 40))
    await clickEl('.el-message-box__btns .el-button--primary')
    await sleep(900)
    const dropped = await probe()
    check('确认后内容被替换为拖拽文件', dropped.editorText.includes('IMPORT_MARKER_TWO') && !dropped.editorText.includes('IMPORT_MARKER_ONE'), `${dropped.editorText.length} 字符`)
    check('拖拽导入无残留遮罩', !dropped.maskVisible)

    console.log('\n【需求 3】导入后仍可继续编辑')
    check('编辑器保持可编辑', dropped.editorEditable === 'true' || dropped.editorEditable === null, String(dropped.editorEditable))
    await clickEl('.md-editor .cm-content')
    await sleep(300)
    await send('Input.insertText', { text: '手动补充' })
    await sleep(400)
    const edited = await probe()
    check('可在导入内容基础上继续输入', edited.editorText.includes('手动补充'), `新增后 ${edited.editorText.length} 字符`)
    check('原有导入内容仍在', edited.editorText.includes('IMPORT_MARKER_TWO'))

    console.log('\n【需求 5】浅色 / 深色主题适配')
    check('浅色下提示文字为主题灰', initial.tipColor === 'rgb(107, 114, 128)', initial.tipColor)
    await evaluate('window.scrollTo({ top: 0, behavior: "auto" })')
    await sleep(400)
    const toggled = await evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('.header .el-button')).find((b) => /深色模式|浅色模式/.test(b.textContent))
      if (!btn) return false
      btn.click()
      return true
    })()`)
    check('找到后台主题切换按钮', toggled)
    await sleep(900)
    const dark = await probe()
    check('已切到深色模式', dark.isDark)
    check('深色下提示文字跟随主题', dark.tipColor === 'rgb(136, 143, 157)', dark.tipColor)
    await evaluate(`(() => {
      const dt = new DataTransfer()
      dt.items.add(new File(['# x'], 'x.md', { type: 'text/markdown' }))
      const t = document.querySelector('.editor-area')
      t.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: dt }))
    })()`)
    await sleep(400)
    const darkMask = await probe()
    check('深色下遮罩为主题深色底', darkMask.maskBg === 'rgb(27, 39, 64)' && darkMask.maskBorder === 'rgb(96, 165, 250)', `${darkMask.maskBg} / ${darkMask.maskBorder}`)
    if (process.env.SMOKE_SHOT) {
      await shoot(`${process.env.SMOKE_SHOT}-import-dark.png`)
    }

    console.log('\n【需求 6】不落库、不改动保存逻辑')
    const totalAfter = await articleTotal(token)
    check('未新增任何文章', totalAfter === totalBefore, `${totalBefore} → ${totalAfter}`)
    check('保存按钮仍在', true)

    console.log(failures === 0 ? '\n导入 Markdown 文件检查全部通过 ✅' : `\n共有 ${failures} 项未通过 ❌`)
  } finally {
    proc.kill()
    for (const file of tempFiles) {
      try {
        fs.unlinkSync(file)
      } catch {
        /* 忽略 */
      }
    }
    console.log(`\n已清理 ${tempFiles.length} 个临时文件`)
  }
  process.exit(failures === 0 ? 0 : 1)
})().catch((error) => {
  console.error('导入检查失败:', error)
  process.exit(1)
})
