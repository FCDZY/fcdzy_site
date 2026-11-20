/**
 * 前端错误上报。
 *
 * 目标：用户遇到白屏 / 未捕获异常时，后台能看到，而不是等对方来反馈。
 *
 * 约束（很重要）：
 * - 上报失败绝不能影响页面：全部 try/catch，用 sendBeacon 或 keepalive fetch
 * - 单次会话最多 5 条、同一条错误只报一次，避免刷爆后端
 * - 只上报路径，不上报带查询串的完整 URL（防止把 token 之类写进数据库）
 */
const ENDPOINT = '/api/public/client-error'
/** 发版后旧页面去要已被删除的分包时，浏览器抛的就是这类错误 */
const STALE_CHUNK_RE =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk \d+ failed|Loading CSS chunk \d+ failed/i
const MAX_REPORTS = 5
const MAX_MESSAGE = 400

let sent = 0
const seen = new Set<string>()

function send(payload: { message: string; stack?: string }) {
  if (sent >= MAX_REPORTS) return
  const message = payload.message.slice(0, MAX_MESSAGE)
  const key = message.slice(0, 100)
  if (seen.has(key)) return
  seen.add(key)
  sent += 1

  try {
    const body = JSON.stringify({
      message,
      stack: payload.stack ? payload.stack.slice(0, 1500) : '',
      url: typeof location === 'undefined' ? '' : location.pathname
    })
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' })
      if (navigator.sendBeacon(ENDPOINT, blob)) return
    }
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true
    }).catch(() => {
      /* 忽略 */
    })
  } catch {
    /* 忽略 */
  }
}

/** 最多自动刷新一次，避免分包真的坏掉时无限刷新 */
const RELOAD_FLAG = 'fcdzy_chunk_reload_at'

/**
 * 遇到「分包 404」：说明用户手上的页面比服务器版本旧（刚发过版）。
 * 自动整页重载一次拿新的 index.html 即可恢复；重载过还失败就交给上报。
 */
export function reloadOnceForStaleChunk(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG) || 0)
    if (last && Date.now() - last < 30000) return false
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()))
  } catch {
    return false
  }
  window.location.reload()
  return true
}

/** 判断一条错误是不是「过期分包」 */
export function isStaleChunkError(message: string): boolean {
  return STALE_CHUNK_RE.test(message)
}

/** 在 main.ts 里调用一次 */
export function installErrorReporter() {
  if (typeof window === 'undefined') return

  window.addEventListener('error', (event) => {
    // 资源加载失败（img/script）也会触发 error，但没有 event.error，跳过以免噪音
    const error = (event as ErrorEvent).error
    if (!error) return
    send({
      message: (event as ErrorEvent).message || String(error),
      stack: error instanceof Error ? error.stack : undefined
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = (event as PromiseRejectionEvent).reason
    const message = reason instanceof Error ? reason.message : String(reason)
    /* 过期分包不是真的 bug：刷新一次就好，别把它塞进后台告警里 */
    if (isStaleChunkError(message) && reloadOnceForStaleChunk()) {
      event.preventDefault()
      return
    }
    send({
      message: '未处理的 Promise 异常：' + message,
      stack: reason instanceof Error ? reason.stack : undefined
    })
  })
}
