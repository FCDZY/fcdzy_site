/**
 * 登录防爆破检查：同一 IP 连续失败 5 次 → 锁 10 分钟（锁定期间密码正确也拒绝）。
 *
 * 用伪造的 X-Forwarded-For 模拟不同来源 IP，避免把本机真实 IP 锁住（否则后续套件全挂）。
 *
 * 用法：node scripts/smoke-login-guard.cjs
 */
const API = process.env.SMOKE_API || 'http://127.0.0.1:8080/api'
const USER = process.env.SMOKE_ADMIN_USER || 'admin'
const PASS = process.env.SMOKE_ADMIN_PASS || 'admin123'

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed += 1
  console.log(`${ok ? '[OK]  ' : '[FAIL]'} ${name}${detail ? '  -> ' + detail : ''}`)
}

async function login(password, ip) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(ip ? { 'X-Forwarded-For': ip } : {}) },
    body: JSON.stringify({ username: USER, password })
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    /* 非 JSON */
  }
  return { httpStatus: res.status, code: json ? json.code : null, message: (json && json.message) || '' }
}

;(async () => {
  const wrong = `${PASS}-not-the-password`

  // 先确认账号密码是对的（用不影响锁定的 IP）
  const probeIp = `198.51.100.${(Date.now() % 200) + 1}`
  const okB = await login(PASS, probeIp)
  check('用正确密码可登录', okB.code === 0, `code=${okB.code}`)

  /*
   * 关键：锁定状态存在后端内存里，同一 IP 锁 10 分钟。
   * 这个套件会被反复执行，所以每次挑一个「还没被锁」的假 IP：
   * 先试一发，返回 429 说明这 IP 上次跑测试时锁住了 → 换下一个。
   */
  const base = 198
  let lockedIp = ''
  let firstWrong = null
  for (let i = 1; i <= 8 && !lockedIp; i += 1) {
    const candidate = `198.51.100.${100 + i}`
    const res = await login(wrong, candidate)
    if (res.code === 401) {
      lockedIp = candidate
      firstWrong = res
      break
    }
    if (res.code !== 429) {
      check('找不到可用测试 IP', false, `code=${res.code}`)
      break
    }
  }
  check('找到可用于测试的干净 IP', Boolean(lockedIp), lockedIp || '(全部已锁)')

  // 该 IP 已经失败了 1 次，再补 4 次 → 共 5 次
  const attempts = [firstWrong]
  for (let i = 0; i < 4; i += 1) {
    attempts.push(await login(wrong, lockedIp))
  }
  check(
    '前 5 次错误密码都返回 401',
    attempts.every((r) => r && r.code === 401),
    attempts.map((r) => (r ? r.code : 'null')).join(',')
  )

  // 第 6 次仍错误 → 应被锁定（429）
  const sixth = await login(wrong, lockedIp)
  console.log('第 6 次:', JSON.stringify(sixth))
  check('第 6 次被锁定（HTTP 429）', sixth.httpStatus === 429, `http=${sixth.httpStatus}`)
  check('提示包含「尝试次数过多」', sixth.message.includes('过多'), sixth.message)

  // 锁定期间即使密码正确也要拒绝
  const correctButLocked = await login(PASS, lockedIp)
  check(
    '锁定期间正确密码也被拒绝',
    correctButLocked.code === 429,
    `code=${correctButLocked.code} msg=${correctButLocked.message}`
  )

  // 其它 IP 不受影响
  const otherIp = `198.51.100.${(Date.now() % 150) + 2}`
  const okOther = await login(PASS, otherIp)
  check('另一个 IP 不受影响', okOther.code === 0, `code=${okOther.code}`)

  // 不带 XFF（本机真实 IP）也应能登录——证明测试没把真实 IP 锁住
  const local = await login(PASS)
  check('本机真实 IP 未被锁定', local.code === 0, `code=${local.code}`)

  console.log(failed === 0 ? '\n登录防爆破检查全部通过 ✅' : '\n共有 ' + failed + ' 项未通过 ❌')
  process.exit(failed === 0 ? 0 : 1)
})()
