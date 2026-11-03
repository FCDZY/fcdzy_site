/**
 * 冒烟脚本共用小工具。
 *
 * 为什么要有它：以前几个套件把示例文章的 slug 写死（如 build-personal-site），
 * 一旦后台把示例文章删掉/改名，测试就会「假失败」。这里统一改成从接口动态取现有文章。
 */
const API = process.env.SMOKE_API || 'http://127.0.0.1:8080'

/** 取第一篇已发布文章（至少保证 id / slug / title） */
async function firstPublishedArticle() {
  const res = await (await fetch(`${API}/api/public/articles?pageNum=1&pageSize=1`)).json()
  const item = res?.data?.list?.[0]
  if (!item) {
    throw new Error(`站点当前没有已发布文章（${API}/api/public/articles 返回空），请先发布一篇再跑该套件`)
  }
  return item
}

async function firstPublishedSlug() {
  const item = await firstPublishedArticle()
  return item.slug
}

/** 取文章详情（含正文） */
async function articleDetail(slug) {
  const res = await (await fetch(`${API}/api/public/articles/${slug}`)).json()
  return res?.data || null
}

/**
 * 找一个「只出现在正文、不在标题/简介里」的关键词，用来验证搜索覆盖正文。
 * 优先选英文单词（URL 更干净），没有再退回中文短语。
 */
async function contentOnlyKeyword() {
  const list = await (await fetch(`${API}/api/public/articles?pageNum=1&pageSize=10`)).json()
  const items = list?.data?.list || []
  const ascii = []
  const chinese = []
  for (const item of items) {
    const detail = await articleDetail(item.slug)
    if (!detail) continue
    const content = String(detail.content || '')
    const title = String(detail.title || '')
    const summary = String(detail.summary || '')
    const asciiWords = content.match(/[A-Za-z][A-Za-z0-9_-]{5,18}/g) || []
    const cnWords = content.match(/[\u4e00-\u9fa5]{4,8}/g) || []
    for (const w of asciiWords) {
      if (!title.includes(w) && !summary.includes(w) && !ascii.includes(w)) ascii.push(w)
    }
    for (const w of cnWords) {
      if (!title.includes(w) && !summary.includes(w) && !chinese.includes(w)) chinese.push(w)
    }
    if (ascii.length || chinese.length) break
  }
  const picked = ascii[0] || chinese[0] || ''
  return picked
}

/** 取第一篇「正文里带代码块」的已发布文章（深色主题的语法高亮检查需要它） */
async function firstArticleWithCode() {
  const list = await (await fetch(`${API}/api/public/articles?pageNum=1&pageSize=20`)).json()
  for (const item of list?.data?.list || []) {
    const detail = await articleDetail(item.slug)
    if (detail && String(detail.content || '').includes('```')) return detail
  }
  throw new Error('没有包含代码块的文章，深色主题的代码高亮检查无法运行')
}

module.exports = { API, firstPublishedArticle, firstPublishedSlug, articleDetail, contentOnlyKeyword, firstArticleWithCode }
