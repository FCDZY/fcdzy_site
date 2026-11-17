/**
 * 回收站（软删除）检查：删除 → 前台/后台都看不到 → 回收站可见 → 还原 → 再删再彻底删除。
 *
 * 用法：node scripts/smoke-trash.cjs
 */
const API = process.env.SMOKE_API || 'http://127.0.0.1:8080/api'
const USER = process.env.SMOKE_ADMIN_USER || 'admin'
const PASS = process.env.SMOKE_ADMIN_PASS || 'admin123'

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed += 1
  console.log(`${ok ? '[OK]  ' : '[FAIL]'} ${name}${detail ? '  -> ' + detail : ''}`)
}

let token = ''

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    /* 空响应 */
  }
  return { status: res.status, code: json ? json.code : null, message: (json && json.message) || '', data: json ? json.data : null }
}

;(async () => {
  const login = await api('/auth/login', { method: 'POST', auth: false, body: { username: USER, password: PASS } })
  if (login.code !== 0) throw new Error('管理员登录失败：' + (login.message || login.code))
  token = login.data.token

  // 准备一篇临时文章
  const created = await api('/admin/articles', {
    method: 'POST',
    body: {
      title: '回收站测试（临时）',
      content: '# 回收站测试\n\n这是一篇用于验证软删除的临时文章。\n',
      status: 'PUBLISHED',
      categoryId: 1,
      tagIds: [],
      topped: false
    }
  })
  const id = created.data.id
  const slug = created.data.slug
  console.log('临时文章:', id, slug)

  // ① 删除前可见
  check('删除前前台可访问', (await api(`/public/articles/${slug}`, { auth: false })).code === 0)

  // ② 删除 = 移入回收站
  const removed = await api(`/admin/articles/${id}`, { method: 'DELETE' })
  check('删除接口返回成功', removed.code === 0, `code=${removed.code}`)

  check('删除后前台详情 404', (await api(`/public/articles/${slug}`, { auth: false })).code === 404)
  const publicList = await api('/public/articles?pageNum=1&pageSize=50', { auth: false })
  check(
    '删除后不出现在前台列表',
    !(publicList.data?.list || []).some((a) => a.id === id)
  )
  const adminList = await api('/admin/articles?page=1&size=50')
  check('删除后不在后台文章列表', !(adminList.data?.list || []).some((a) => a.id === id))

  // ③ 回收站里能看到
  const trash = await api('/admin/articles/trash?page=1&size=50')
  const inTrash = (trash.data?.list || []).find((a) => a.id === id)
  check('回收站里能看到这篇文章', Boolean(inTrash), `回收站共 ${trash.data?.total} 条`)
  check('回收站条目带删除时间', Boolean(inTrash && inTrash.deletedAt), inTrash ? String(inTrash.deletedAt) : '')

  // ④ 还原
  const restored = await api(`/admin/articles/${id}/restore`, { method: 'PUT' })
  check('还原接口返回成功', restored.code === 0)
  check('还原后前台可访问', (await api(`/public/articles/${slug}`, { auth: false })).code === 0)
  const trashAfterRestore = await api('/admin/articles/trash?page=1&size=50')
  check('还原后不在回收站', !(trashAfterRestore.data?.list || []).some((a) => a.id === id))

  // ⑤ 再删一次 → 彻底删除
  await api(`/admin/articles/${id}`, { method: 'DELETE' })
  const purged = await api(`/admin/articles/${id}/purge`, { method: 'DELETE' })
  check('彻底删除接口返回成功', purged.code === 0, `code=${purged.code}`)

  const trashAfterPurge = await api('/admin/articles/trash?page=1&size=50')
  check('彻底删除后不在回收站', !(trashAfterPurge.data?.list || []).some((a) => a.id === id))
  check('彻底删除后详情 404', (await api(`/public/articles/${slug}`, { auth: false })).code === 404)
  const again = await api(`/admin/articles/${id}/restore`, { method: 'PUT' })
  check('已彻底删除的文章无法再还原', again.code === 404, `code=${again.code}`)

  // ⑥ 未登录不能访问回收站
  const anon = await fetch(API + '/admin/articles/trash?page=1&size=10')
  check('未登录访问回收站被拒绝', anon.status === 401, `HTTP ${anon.status}`)

  console.log(failed === 0 ? '\n回收站检查全部通过 ✅' : '\n共有 ' + failed + ' 项未通过 ❌')
  process.exit(failed === 0 ? 0 : 1)
})()
