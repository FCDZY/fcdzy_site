<#
.SYNOPSIS
  发布前端到服务器：备份旧 www → 删旧 assets/ → 上传新 dist → 校验。

.DESCRIPTION
  为什么这么做：Vite 产物文件名带 hash，每次构建都会生成新文件名。
  直接覆盖上传会让旧 chunk 一直堆在 assets/ 里（几百个文件），
  所以先删旧 assets/ 再传，保持目录干净。

  只替换 assets/、index.html、favicon.svg 三项，其余文件（如以后放的
  静态校验文件）不动。上传用 SSH 连接复用，密码只需输一次。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\deploy-frontend.ps1

.EXAMPLE
  # 换服务器 / 换目录
  powershell -ExecutionPolicy Bypass -File scripts\deploy-frontend.ps1 -Server root@1.2.3.4 -RemoteDir /opt/fcdzy/www
#>
param(
    [string]$Server = 'root@8.138.239.19',
    [string]$RemoteDir = '/opt/fcdzy/www',
    [string]$DistDir = (Join-Path $PSScriptRoot '..\frontend\dist'),
    [string]$SiteUrl = 'https://fcdzy.xyz/'
)

$ErrorActionPreference = 'Stop'

function Write-Step($text) {
    Write-Host ''
    Write-Host "==> $text" -ForegroundColor Cyan
}

function Assert-Command($name) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "找不到命令 $name。Windows 10/11 自带 OpenSSH；若是精简系统，请用 WinSCP 手动上传。"
    }
}

Assert-Command ssh
Assert-Command scp

$dist = (Resolve-Path $DistDir -ErrorAction Stop).Path
if (-not (Test-Path (Join-Path $dist 'index.html'))) {
    throw "dist 目录里没有 index.html：$dist`n请先在 frontend 目录执行 npm run build。"
}

$indexMd5 = (Get-FileHash (Join-Path $dist 'index.html') -Algorithm MD5).Hash.ToLower()
$assetCount = (Get-ChildItem (Join-Path $dist 'assets') -File).Count
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'

Write-Host "服务器    : $Server"
Write-Host "目标目录  : $RemoteDir"
Write-Host "本地 dist : $dist"
Write-Host "index.html: MD5 $indexMd5"
Write-Host "assets    : $assetCount 个文件"

# SSH 连接复用：只在第一条命令时输入一次密码，之后 scp/ssh 复用同一条连接
$ctlPath = Join-Path $env:TEMP "fcdzy-ssh-%r-%p"
$sshOpts = @(
    '-o', 'ControlMaster=auto',
    '-o', "ControlPath=$ctlPath",
    '-o', 'ControlPersist=10m',
    '-o', 'StrictHostKeyChecking=accept-new'
)

try {
    Write-Step "1/5 建立连接（如需密码请在此输入）"
    ssh @sshOpts $Server "echo connected: `$(hostname)"
    if ($LASTEXITCODE -ne 0) { throw 'SSH 连接失败' }

    Write-Step "2/5 备份当前 www（保留最近几份，方便回滚）"
    ssh @sshOpts $Server "cd $(Split-Path $RemoteDir -Parent) && tar czf www-backup-$stamp.tgz $(Split-Path $RemoteDir -Leaf) && ls -lh www-backup-*.tgz | tail -3"
    if ($LASTEXITCODE -ne 0) { throw '备份失败' }

    Write-Step "3/5 删除旧 assets/ 与入口文件"
    ssh @sshOpts $Server "cd $RemoteDir && rm -rf assets index.html favicon.svg && ls -la"
    if ($LASTEXITCODE -ne 0) { throw '清理失败' }

    Write-Step "4/5 上传新的 dist 内容"
    scp @sshOpts -r "$dist\." "${Server}:${RemoteDir}/"
    if ($LASTEXITCODE -ne 0) { throw '上传失败' }

    Write-Step "5/5 校验服务器上的文件"
    ssh @sshOpts $Server "cd $RemoteDir && echo '--- 目录：' && ls -1 && echo '--- assets 文件数：' && ls assets | wc -l && echo '--- index.html:' && ls -l index.html && echo '--- 含流程图代码的 chunk：' && (grep -l 'mermaid' assets/*.js | head -3 || echo '未找到 mermaid chunk!')"
    if ($LASTEXITCODE -ne 0) { throw '校验失败' }
}
finally {
    # 断开复用连接
    ssh @sshOpts -O exit $Server 2>$null | Out-Null
}

Write-Step '完成，做一次线上自检'
try {
    $code = & curl.exe -s -o NUL -w '%{http_code}' $SiteUrl
    Write-Host "  $SiteUrl → HTTP $code"
    if ($code -ne '200') { Write-Warning '首页返回非 200，请检查 nginx / 静态文件目录' }
} catch {
    Write-Warning "自检失败（可忽略）：$_"
}

Write-Host ''
Write-Host '提示：浏览器请按 Ctrl + F5 强刷，否则可能仍用缓存的旧 index.html。' -ForegroundColor Green
Write-Host "回滚：把之前的 www-backup-$stamp.tgz 解压回 $(Split-Path $RemoteDir -Parent) 即可。" -ForegroundColor DarkGray
