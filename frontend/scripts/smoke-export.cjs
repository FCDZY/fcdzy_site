/**
 * 后台「导出全部文章」检查：
 * 能下到 zip、里面是 markdown + front matter + manifest.csv、未登录拿不到。
 *
 * 用法：node scripts/smoke-export.cjs
 */
const API = process.env.SMOKE_API || 'http://127.0.0.1:8080/api'
const USER = process.env.SMOKE_ADMIN_USER || 'admin'
const PASS = process.env.SMOKE_ADMIN_PASS || 'admin123'

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed += 1
  console.log(`${ok ? '[OK]  ' : '[FAIL]'} ${name}${detail ? '  -> ' + detail : ''}`)
}

/** 极简 zip 解析（只依赖 Node 内置 DecompressionStream） */
async function readZip(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  // 从尾部找 EOCD（0x06054b50）
  let eocd = -1
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('不是合法 zip（找不到 EOCD）')

  const entryCount = view.getUint16(eocd + 10, true)
  const cdOffset = view.getUint32(eocd + 16, true)

  const files = {}
  let pointer = cdOffset
  for (let i = 0; i < entryCount; i += 1) {
    if (view.getUint32(pointer, true) !== 0x02014b50) break
    const method = view.getUint16(pointer + 10, true)
    const compressedSize = view.getUint32(pointer + 20, true)
    const nameLen = view.getUint16(pointer + 28, true)
    const extraLen = view.getUint16(pointer + 30, true)
    const commentLen = view.getUint16(pointer + 32, true)
    const localOffset = view.getUint32(pointer + 42, true)
    const name = buffer.subarray(pointer + 46, pointer + 46 + nameLen).toString('utf8')

    const localNameLen = view.getUint16(localOffset + 26, true)
    const localExtraLen = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + localNameLen + localExtraLen
    const raw = buffer.subarray(dataStart, dataStart + compressedSize)

    if (method === 0) {
      files[name] = raw
    } else {
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      files[name] = Buffer.from(await new Response(stream).arrayBuffer())
    }
    pointer += 46 + nameLen + extraLen + commentLen
  }
  return files
}

;(async () => {
  // 未登录应拿不到
  const anonymous = await fetch(`${API}/admin/export/articles`)
  check('未登录访问导出接口被拒绝', anonymous.status === 401, `HTTP ${anonymous.status}`)

  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS })
  }).then((r) => r.json())
  if (login.code !== 0) throw new Error('管理员登录失败：' + (login.message || login.code))
  const token = login.data.token

  const res = await fetch(`${API}/admin/export/articles`, { headers: { Authorization: `Bearer ${token}` } })
  check('登录后导出返回 200', res.status === 200, `HTTP ${res.status}`)
  check('响应类型是 zip', (res.headers.get('content-type') || '').includes('zip'), res.headers.get('content-type'))
  check(
    '文件名带日期',
    /fcdzy-articles-\d{8}-\d{4}\.zip/.test(res.headers.get('content-disposition') || ''),
    res.headers.get('content-disposition')
  )

  const count = Number(res.headers.get('X-Article-Count') || 0)
  const buffer = Buffer.from(await res.arrayBuffer())
  check('内容以 PK 开头（合法 zip）', buffer[0] === 0x50 && buffer[1] === 0x4b, buffer.subarray(0, 4).toString('hex'))
  check('文件大小合理（> 1KB）', buffer.length > 1024, `${buffer.length} 字节`)

  const files = await readZip(buffer)
  const names = Object.keys(files)
  const mdFiles = names.filter((n) => n.startsWith('articles/') && n.endsWith('.md'))
  console.log('包内文件:', names.slice(0, 6).join(', '), mdFiles.length > 6 ? `… 共 ${mdFiles.length} 个 md` : '')

  check('包含 manifest.csv', names.includes('manifest.csv'))
  check('包含 README.txt', names.includes('README.txt'))
  check('md 文件数 = 接口返回的文章数', mdFiles.length === count && count > 0, `${mdFiles.length} / ${count}`)

  const manifest = files['manifest.csv'].toString('utf8')
  check('manifest 有表头', manifest.includes('id,title,slug,status,category,tags'), manifest.split('\n')[0].slice(0, 60))
  check('manifest 行数 = 文章数 + 1', manifest.trim().split('\n').length === count + 1, `${manifest.trim().split('\n').length} 行`)

  const firstMd = files[mdFiles[0]].toString('utf8')
  check('md 有 YAML front matter', firstMd.startsWith('---\n') || firstMd.startsWith('---\r\n'), firstMd.slice(0, 12).replace(/\n/g, '\\n'))
  check('front matter 含 title/slug/status', /title:/.test(firstMd) && /slug:/.test(firstMd) && /status:/.test(firstMd))
  check('front matter 含 tags 数组', /tags: \[/.test(firstMd))
  check('正文在 front matter 之后', firstMd.split('---').length >= 3, (firstMd.split('---')[2] || '').trim().slice(0, 30))

  console.log(failed === 0 ? '\n文章导出检查全部通过 ✅' : '\n共有 ' + failed + ' 项未通过 ❌')
  process.exit(failed === 0 ? 0 : 1)
})()
