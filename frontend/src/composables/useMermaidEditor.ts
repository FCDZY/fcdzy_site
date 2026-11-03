/**
 * 让 md-editor-v3 的后台预览使用「本地打包」的 mermaid。
 *
 * 背景：md-editor-v3 5.x 默认从 unpkg CDN 拉 mermaid（`mermaid@11.9.0/dist/mermaid.min.js`），
 * 国内网络经常拉不到，预览里就只剩一段代码。它提供 `editorExtensions.mermaid.instance` 这个口子：
 * 只要调用方提供了 instance，它就不会再去加载 CDN 脚本。
 *
 * 这里静态引入 mermaid —— 本模块只被后台文章编辑页引用，所以 mermaid 会被打进
 * 那个路由的 chunk（前台首屏不受影响）。
 */
import mermaid from 'mermaid'
import { config } from 'md-editor-v3'

config({
  editorExtensions: {
    mermaid: {
      // 提供实例后 md-editor-v3 会跳过 CDN 加载
      instance: mermaid
    }
  }
})

export default mermaid
