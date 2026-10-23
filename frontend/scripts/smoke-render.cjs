/**
 * 渲染冒烟测试：用无头 Chrome 打开前台/后台页面，检查真实渲染结果。
 * 用法：先启动后端(8080)与前端(5173)，然后 node scripts/smoke-render.cjs
 */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5173'
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

const profile = path.join(os.tmpdir(), 'dsh-smoke-chrome-profile')

function dumpDom(url) {
  return execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-extensions',
      `--user-data-dir=${profile}`,
      '--virtual-time-budget=9000',
      '--dump-dom',
      url
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
  )
}

async function api(pathname) {
  const res = await fetch(`${BASE}${pathname}`)
  const body = await res.json()
  return body.data
}

function check(label, ok) {
  console.log(`  ${ok ? '[OK]  ' : '[MISS]'} ${label}`)
  return ok
}

function appLength(html) {
  const m = html.match(/<div id="app"[^>]*>/)
  return m ? html.length - m.index : 0
}

;(async () => {
  const chromeName = path.basename(chrome)
  console.log(`使用浏览器: ${chromeName}\n目标站点: ${BASE}\n`)

  const config = await api('/api/public/site-config')
  const list = await api('/api/public/articles?page=1&size=8')
  const topics = await api('/api/public/topics')
  const categories = await api('/api/public/categories')
  const detail = await api('/api/public/articles/build-personal-site')

  let failed = 0
  const run = (name, url, checks) => {
    const html = dumpDom(`${BASE}${url}`)
    const len = appLength(html)
    console.log(`${name}  (${url})  #app 渲染长度=${len}`)
    if (len < 500) {
      console.log('  [MISS] 页面几乎空白，可能存在运行时错误')
      failed++
    }
    for (const [label, ok] of checks(html)) {
      if (!check(label, ok)) failed++
    }
    console.log('')
  }

  run('首页', '/', (html) => [
    // 站点名称已改为前端常量（后台不再提供该配置），页脚版权里仍会出现
    ['站点名（前端常量）渲染于页脚', html.includes(config.siteName || 'FCDZY个人博客')],
    ['Banner 标题', html.includes(config.homeBannerTitle)],
    ['首篇文章标题', html.includes(list.list[0].title)],
    ['文章卡片', html.includes('article-card')],
    ['分类入口', html.includes(categories[0].name)],
    ['侧栏含热门文章', html.includes('热门文章')],
    ['侧栏不再有专题模块', !html.includes('topic-list') && !html.includes('暂无专题')]
  ])

  run('文章列表', '/articles', (html) => [
    ['文章卡片', html.includes('article-card')],
    ['出现文章标题', html.includes(list.list[0].title)]
  ])

  run('文章详情', '/article/build-personal-site', (html) => [
    ['文章标题', html.includes(detail.title)],
    ['Markdown 正文', html.includes('markdown-body')],
    ['代码块', html.includes('<pre')],
    ['代码高亮', html.includes('hljs-')],
    ['标题锚点', /<h2 id=/.test(html)],
    ['悬浮目录', html.includes('article-toc')],
    ['标签渲染', html.includes((detail.tags || [])[0]?.name || detail.title)]
  ])

  run('专题列表', '/topics', (html) => [['专题名渲染', html.includes(topics[0].name)]])

  run('专题详情', `/topic/${topics[0].slug}`, (html) => [
    ['专题名', html.includes(topics[0].name)],
    ['专题内文章标题', html.includes(topics[0].name) && /article/.test(html)]
  ])

  run('分类页面', '/categories', (html) => [['分类名渲染', html.includes(categories[0].name)]])

  run('关于页', '/about', (html) => [['作者名渲染', html.includes(config.authorName)]])

  run('后台未登录跳转', '/admin', (html) => [
    ['出现登录表单', html.includes('type="password"')],
    ['默认账号提示', html.includes('admin123')],
    ['未进入后台菜单', !html.includes('站点配置')]
  ])

  console.log(failed === 0 ? '全部渲染检查通过 ✅' : `共有 ${failed} 项未通过 ❌`)
  process.exit(failed === 0 ? 0 : 1)
})().catch((error) => {
  console.error('冒烟测试失败:', error)
  process.exit(1)
})
