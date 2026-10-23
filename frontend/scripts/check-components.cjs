const fs = require('fs')
const path = require('path')

const root = 'D:/aiconding/fcdzy_site/frontend'
const srcDir = path.join(root, 'src')

// 1) 收集 @element-plus/icons-vue 的导出名
const iconEntry = path.join(root, 'node_modules/@element-plus/icons-vue/dist/index.js')
let iconNames = new Set()
if (fs.existsSync(iconEntry)) {
  const text = fs.readFileSync(iconEntry, 'utf8')
  const matches = text.match(/export\s*\{([\s\S]*?)\}/g) || []
  for (const block of matches) {
    block
      .replace(/export\s*\{|\}/g, '')
      .split(',')
      .map((s) => s.trim().split(/\s+as\s+/).pop().trim())
      .filter(Boolean)
      .forEach((n) => iconNames.add(n))
  }
}
console.log('icons exported:', iconNames.size)

const globalTags = new Set([
  'RouterView', 'RouterLink', 'Transition', 'TransitionGroup', 'KeepAlive', 'Component', 'Teleport', 'Suspense'
])

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith('.vue')) out.push(full)
  }
  return out
}

const problems = []
for (const file of walk(srcDir)) {
  const text = fs.readFileSync(file, 'utf8')
  const scriptBlocks = [...text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n')
  const template = (text.match(/<template>([\s\S]*)<\/template>/) || [, ''])[1]

  const defined = new Set()
  for (const m of scriptBlocks.matchAll(/import\s+([\w{},\s*$]+?)\s+from/g)) {
    m[1]
      .replace(/[{}]/g, '')
      .split(',')
      .map((s) => s.trim().split(/\s+as\s+/).pop().trim())
      .filter(Boolean)
      .forEach((n) => defined.add(n))
  }
  for (const m of scriptBlocks.matchAll(/(?:const|let|function|class)\s+([A-Z]\w*)/g)) defined.add(m[1])

  const usedTags = new Set([...template.matchAll(/<([A-Z][A-Za-z0-9]*)/g)].map((m) => m[1]))
  for (const tag of usedTags) {
    if (defined.has(tag) || globalTags.has(tag) || iconNames.has(tag)) continue
    problems.push(`${path.relative(root, file)}: 模板使用了未导入的组件 <${tag}>`)
  }
}

// 2) 检查 el-* 标签名是否在 element-plus 组件清单里（粗查：读 element-plus 的类型声明目录）
const epDir = path.join(root, 'node_modules/element-plus/es/components')
const epComponents = new Set(
  fs.existsSync(epDir) ? fs.readdirSync(epDir).map((n) => `el-${n}`) : []
)
for (const file of walk(srcDir)) {
  const text = fs.readFileSync(file, 'utf8')
  const template = (text.match(/<template>([\s\S]*)<\/template>/) || [, ''])[1]
  const usedEl = new Set([...template.matchAll(/<(el-[a-z0-9-]+)/g)].map((m) => m[1]))
  for (const tag of usedEl) {
    if (epComponents.size && !epComponents.has(tag)) {
      problems.push(`${path.relative(root, file)}: 未知的 Element Plus 组件 <${tag}>`)
    }
  }
}

if (problems.length === 0) {
  console.log('OK: 所有模板组件都已正确导入/注册')
} else {
  console.log('发现 ' + problems.length + ' 个问题:')
  problems.forEach((p) => console.log(' - ' + p))
}
