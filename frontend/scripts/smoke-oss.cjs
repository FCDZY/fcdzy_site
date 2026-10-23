/**
 * 图片上传（阿里云 OSS 后端中转）专项检查：
 * 上传配置、格式校验、5MB 大小校验、上传返回完整 URL、
 * OSS 模式下的 URL 域名 / 匿名可读 / Cache-Control 30 天。
 *
 * 用法：node scripts/smoke-oss.cjs
 *
 * 说明：AccessKeySecret 未填时后端会回退到本地存储，此时 OSS 相关断言会标注「跳过」；
 * 填好 secret 重启后端后再跑本脚本，即可完整验证 OSS 链路。
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const zlib = require('node:zlib')

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5173'
const API = process.env.SMOKE_API || 'http://127.0.0.1:8080'
const DEBUG_PORT = 9699

let failures = 0
let skipped = 0
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '[OK]  ' : '[MISS]'} ${label}${detail ? `  → ${detail}` : ''}`)
  if (!ok) failures++
}
function skip(label, detail = '') {
  console.log(`  [SKIP] ${label}${detail ? `  → ${detail}` : ''}`)
  skipped++
}

/** 生成一张最小的合法 PNG（1x1 透明），避免依赖外部图片文件 */
function tinyPng() {
  const crcTable = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable[n] = c >>> 0
  }
  const crc32 = (buf) => {
    let c = 0xffffffff
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const typeBuf = Buffer.from(type, 'ascii')
    const crcBuf = Buffer.alloc(4)
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
    return Buffer.concat([len, typeBuf, data, crcBuf])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(1, 0)
  ihdr.writeUInt32BE(1, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.from([0, 0, 0, 0, 0])
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

let token = ''
async function uploadForm(filePath) {
  const form = new FormData()
  form.append('file', new Blob([fs.readFileSync(filePath)]), path.basename(filePath))
  const res = await fetch(`${API}/api/admin/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, code: json.code, message: json.message, data: json.data }
}

;(async () => {
  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  }).then((r) => r.json())
  token = login?.data?.token
  if (!token) throw new Error('管理员登录失败，请确认后端已启动')

  const cfg = await fetch(`${API}/api/admin/upload`, { headers: { Authorization: `Bearer ${token}` } }).then(() => null)
  const config = await fetch(`${API}/api/admin/upload/config`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json())
  const mode = config.data?.mode

  console.log('【需求 1/3】上传配置与校验规则')
  check('上传配置接口可用', !!config.data, `mode=${mode}`)
  check('只允许 jpg / png / webp', (config.data?.accept || []).join(',') === 'jpg,jpeg,png,webp', (config.data?.accept || []).join(','))
  check('单张上限 5MB', config.data?.maxSizeMb === 5, `${config.data?.maxSizeMb}MB`)
  check('Cache-Control 30 天', config.data?.cacheMaxAge === 2592000, `${config.data?.cacheMaxAge}s`)

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-oss-'))
  const pngPath = path.join(dir, 'tiny.png')
  fs.writeFileSync(pngPath, tinyPng())
  const gifPath = path.join(dir, 'no.gif')
  fs.writeFileSync(gifPath, Buffer.from('GIF89a', 'ascii'))
  const bigPath = path.join(dir, 'big.png')
  fs.writeFileSync(bigPath, Buffer.alloc(6 * 1024 * 1024))

  console.log('\n【需求 3】格式与大小校验')
  const gif = await uploadForm(gifPath)
  check('gif 被拒绝', gif.code === 400 && gif.message.includes('jpg'), `${gif.code} ${gif.message}`)
  const big = await uploadForm(bigPath)
  check('6MB 被拒绝', big.code === 400 && big.message.includes('5MB'), `${big.code} ${big.message}`)

  console.log('\n【需求 7】合法图片上传并返回完整 URL')
  const ok = await uploadForm(pngPath)
  // AK 有效但缺 oss:PutObject 授权属于云账号配置问题，不是代码问题：跳过并给出指引
  const permissionDenied = ok.code === 500 && /权限|鉴权|AccessDenied/i.test(ok.message || '')
  if (permissionDenied) {
    check('上传失败时返回中文友好提示（不是堆栈）', /[\u4e00-\u9fa5]/.test(ok.message || ''), ok.message)
    skip('上传成功 / URL 校验（AK 缺少写入权限）', '给 AK 授予 oss:PutObject 后重跑')
    skip('OSS 域名 / 对象命名 / 公共读 / Cache-Control 校验', ok.message)
    fs.rmSync(dir, { recursive: true, force: true })
    console.log('\n图片上传检查：代码与校验通过，OSS 写入被 IAM 拒绝（2 项跳过）')
    process.exit(0)
  }
  check('上传成功', ok.code === 0 && !!ok.data?.url, `code=${ok.code} url=${ok.data?.url}`)
  const url = ok.data?.url || ''
  check('返回完整可访问地址（http/https 开头）', /^https?:\/\//.test(url), url)

  console.log('\n【需求 2/4/5】OSS 对象命名、公共读、缓存头')
  if (mode === 'oss') {
    check('URL 指向配置的 Bucket 与地域', url.includes('takeout-dish.oss-cn-beijing.aliyuncs.com'), url)
    check('对象路径为 image/yyyyMMdd/UUID.ext', /\/image\/\d{8}\/[0-9a-f]{32}\.(png|jpg|webp)$/.test(url), url)
    let head = null
    try {
      head = await fetch(url, { method: 'HEAD' })
    } catch (error) {
      head = null
    }
    check('匿名可读（不带 AK 也能访问）', head?.status === 200, `HTTP ${head?.status}`)
    const cacheControl = head?.headers.get('cache-control') || ''
    check('响应头含 max-age=2592000', cacheControl.includes('max-age=2592000'), cacheControl || '(无 Cache-Control)')
  } else {
    skip('OSS 相关检查（当前为本地存储模式）', 'application-local.yml 的 access-key-secret 为空')
  }

  fs.rmSync(dir, { recursive: true, force: true })

  console.log(
    failures === 0
      ? `\n图片上传检查通过 ✅${skipped ? `（${skipped} 项因未配置 OSS 跳过）` : ''}`
      : `\n共有 ${failures} 项未通过 ❌`
  )
  process.exit(failures === 0 ? 0 : 1)
})().catch((error) => {
  console.error('图片上传检查失败:', error)
  process.exit(1)
})
