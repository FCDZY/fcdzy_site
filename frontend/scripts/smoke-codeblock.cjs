/**
 * 代码块特性检查：行内高亮（```java {2,5-7}）+ 长代码折叠（>30 行默认折叠）。
 *
 * 自己创建一篇临时文章来跑（跑完删除），不依赖库里已有的数据。
 *
 * 用法：
 *   node scripts/smoke-codeblock.cjs                 # 浅色
 *   node scripts/smoke-codeblock.cjs --dark          # 深色
 *   node scripts/smoke-codeblock.cjs --shot=a.png    # 顺便截图
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const PORT = 9751
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5173'
const API = process.env.SMOKE_API || 'http://127.0.0.1:8080/api'
const ADMIN_USER = process.env.SMOKE_ADMIN_USER || 'admin'
const ADMIN_PASS = process.env.SMOKE_ADMIN_PASS || 'admin123'
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed += 1
  console.log(`${ok ? '[OK]  ' : '[FAIL]'} ${name}${detail ? '  -> ' + detail : ''}`)
}

/** 生成测试内容：短块+高亮 / 40 行长块 / 普通短块 / mermaid */
function buildContent() {
  const longLines = ['public class LongDemo {']
  for (let i = 1; i <= 38; i += 1) longLines.push(`    // 第 ${i} 行注释`)
  longLines.push('}')
  return [
    '# 代码块特性测试',
    '',
    '## 1. 短代码块 + 行内高亮 {2,5-7}',
    '',
    '```java {2,5-7}',
    'public class Demo {',
    '    private int count;',
    '',
    '    public void hello() {',
    '        System.out.println("hi");',
    '    }',
    '}',
    '```',
    '',
    '## 2. 长代码块（40 行，应默认折叠）',
    '',
    '```java',
    ...longLines,
    '```',
    '',
    '## 3. 普通短代码块（无高亮、无折叠）',
    '',
    '```java',
    'int a = 1;',
    'int b = 2;',
    'System.out.println(a + b);',
    '```',
    '',
    '## 4. 流程图（应不受影响）',
    '',
    '```mermaid',
    'flowchart LR',
    '  A[开始] --> B[结束]',
    '```',
    ''
  ].join('\n')
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })
  try {
    return await res.json()
  } catch {
    return { code: res.status, message: 'HTTP ' + res.status }
  }
}

/** ---- DOM 探针（用函数 + toString，避免模板字符串嵌套转义）---- */
function structureProbe() {
  const wraps = Array.from(document.querySelectorAll('.code-wrap'))
  const pres = Array.from(document.querySelectorAll('.markdown-body pre.hljs'))
  return JSON.stringify({
    wrapCount: wraps.length,
    preCount: pres.length,
    linesPerPre: pres.map((p) => p.querySelectorAll('.code-line').length),
    mermaidSvg: document.querySelectorAll('.mermaid-block svg').length
  })
}

function highlightProbe() {
  const pres = Array.from(document.querySelectorAll('.markdown-body pre.hljs'))
  const pre = pres.find((p) => p.querySelectorAll('.code-line.is-hl').length > 0)
  if (!pre) return JSON.stringify({ found: false })
  const lines = Array.from(pre.querySelectorAll('.code-line'))
  const marked = lines.map((l, i) => (l.classList.contains('is-hl') ? i + 1 : 0)).filter(Boolean)
  const first = pre.querySelector('.code-line.is-hl')
  const style = getComputedStyle(first)
  return JSON.stringify({
    found: true,
    marked,
    bg: style.backgroundColor,
    barWidth: getComputedStyle(first, '::after').width
  })
}

function foldProbe() {
  const wrap = document.querySelector('.code-wrap')
  if (!wrap) return JSON.stringify({ found: false })
  const lines = Array.from(wrap.querySelectorAll('.code-line'))
  const visible = lines.filter((l) => l.offsetParent !== null)
  const btn = wrap.querySelector('.code-fold-toggle')
  return JSON.stringify({
    found: true,
    isCollapsed: wrap.classList.contains('is-collapsed'),
    total: lines.length,
    visible: visible.length,
    btnText: btn ? btn.textContent.trim() : null,
    btnVisible: btn ? btn.offsetParent !== null : false,
    lines: wrap.dataset.lines
  })
}

function copyProbe() {
  const wrap = document.querySelector('.code-wrap')
  const lines = Array.from(wrap.querySelectorAll('.code-line'))
  const text = lines.map((l) => l.textContent || '').join('\n')
  return JSON.stringify({ text, count: text.split('\n').length })
}

;(async () => {
  const dark = process.argv.includes('--dark')
  const shotArg = process.argv.find((a) => a.startsWith('--shot='))
  const shotPath = shotArg ? shotArg.slice('--shot='.length) : ''

  // ---------- 自备数据：登录 → 建临时文章 ----------
  const login = await api('/auth/login', {
    method: 'POST',
    body: { username: ADMIN_USER, password: ADMIN_PASS }
  })
  if (login.code !== 0) {
    throw new Error(
      '管理员登录失败（' + (login.message || login.code) + '）；' +
        '如果改过后台密码，请用 SMOKE_ADMIN_USER / SMOKE_ADMIN_PASS 环境变量提供'
    )
  }
  const token = login.data.token
  const created = await api('/admin/articles', {
    method: 'POST',
    token,
    body: {
      title: '代码块特性测试（临时）',
      content: buildContent(),
      status: 'PUBLISHED',
      categoryId: 1,
      tagIds: [],
      topped: false
    }
  })
  if (!created.data?.slug) {
    throw new Error('创建临时文章失败：' + (created.message || ''))
  }
  const ARTICLE = created.data.slug
  const articleId = created.data.id
  console.log('临时文章: id=' + articleId + ' slug=' + ARTICLE)

  const cleanup = async () => {
    await api('/admin/articles/' + articleId, { method: 'DELETE', token }).catch(() => {})
  }

  const profile = path.join(os.tmpdir(), 'dsh-codeblock-' + (dark ? 'dark' : 'light'))
  const proc = spawn(
    chrome,
    ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--window-size=1440,2000',
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
      /* 等 chrome 起来 */
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 2000, deviceScaleFactor: 1, mobile: false })

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (res.result?.exceptionDetails) {
      throw new Error(res.result.exceptionDetails.exception?.description || 'evaluate failed')
    }
    return res.result?.result?.value
  }

  const runProbe = async (fn) => JSON.parse(await evaluate('(' + fn.toString() + ')()'))

  await send('Page.navigate', { url: BASE + '/' })
  await sleep(2000)
  if (dark) {
    await evaluate("localStorage.setItem('fcdzy_theme','dark')")
  }
  await send('Page.navigate', { url: BASE + '/article/' + ARTICLE })
  await sleep(7000)

  // ---------- 1. 结构 ----------
  const structure = await runProbe(structureProbe)
  console.log('结构:', JSON.stringify(structure))
  check('只有一个长代码块被包装成 .code-wrap', structure.wrapCount === 1, String(structure.wrapCount))
  check('页面共 3 个代码块', structure.preCount === 3, String(structure.preCount))
  check('长代码块 40 行', structure.linesPerPre.includes(40), JSON.stringify(structure.linesPerPre))
  check('mermaid 流程图仍正常渲染', structure.mermaidSvg === 1, String(structure.mermaidSvg))

  // ---------- 2. 行内高亮 ----------
  const highlight = await runProbe(highlightProbe)
  console.log('行内高亮:', JSON.stringify(highlight))
  check('高亮块存在', highlight.found === true)
  check('{2,5-7} 精确命中 2/5/6/7 行', JSON.stringify(highlight.marked) === JSON.stringify([2, 5, 6, 7]), JSON.stringify(highlight.marked))
  check('高亮行有底色', Boolean(highlight.bg) && highlight.bg !== 'rgba(0, 0, 0, 0)', highlight.bg)
  check('高亮行有 2px 竖线', highlight.barWidth === '2px', highlight.barWidth)

  // ---------- 3. 默认折叠 ----------
  const collapsed = await runProbe(foldProbe)
  console.log('初始状态:', JSON.stringify(collapsed))
  check('长代码块默认折叠', collapsed.isCollapsed === true)
  check('折叠时只显示前 30 行', collapsed.visible === 30, collapsed.visible + '/' + collapsed.total)
  check('按钮文案含总行数 40', String(collapsed.btnText || '').includes('40'), collapsed.btnText)

  // ---------- 4. 展开 / 收起 ----------
  await evaluate(
    "(() => { const b = document.querySelector('.code-wrap .code-fold-toggle'); b.scrollIntoView({ block: 'center' }); b.click(); })()"
  )
  await sleep(600)
  const expanded = await runProbe(foldProbe)
  console.log('展开后:', JSON.stringify(expanded))
  check('点击后全部展开', expanded.isCollapsed === false && expanded.visible === 40, 'visible=' + expanded.visible)
  check('按钮文案变为「收起」', expanded.btnText === '收起', expanded.btnText)

  await evaluate("document.querySelector('.code-wrap .code-fold-toggle').click()")
  await sleep(500)
  const recollapsed = await runProbe(foldProbe)
  check('再次点击可收起', recollapsed.isCollapsed === true)

  // ---------- 5. 复制仍拿到全文 ----------
  const copy = await runProbe(copyProbe)
  check('折叠状态下内容仍是完整 40 行', copy.count === 40, copy.count + ' 行')
  const firstLine = (copy.text || '').split('\n')[0] || ''
  check('复制内容不含行号', !/^\s*\d+\s+/.test(firstLine), JSON.stringify(firstLine.slice(0, 36)))

  // ---------- 6. 无报错 + 截图 ----------
  const errors = consoleLogs.filter((l) => /error/i.test(l))
  check('无控制台报错', errors.length === 0, errors.slice(0, 2).join(' | '))

  if (shotPath) {
    await evaluate('window.scrollTo(0, 0)')
    await sleep(400)
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    if (shot.result?.data) {
      fs.writeFileSync(shotPath, Buffer.from(shot.result.data, 'base64'))
      console.log('截图已保存:', shotPath)
    }
  }

  console.log(failed === 0 ? '\n代码块特性检查全部通过 ✅' : '\n共有 ' + failed + ' 项未通过 ❌')
  await cleanup()
  proc.kill()
  process.exit(failed === 0 ? 0 : 1)
})()
