#Requires -Version 5.1
<#
.SYNOPSIS
  本地开发一键启停：用本地 MySQL 跑起前后端，改代码即时生效，完全不碰线上。

.DESCRIPTION
  - 后端连的库由参数控制（默认 fcdzy_site_local，随便折腾的那个）
  - 数据库账号从 backend\config\application-db.yml 读取（该文件不入库、不进 jar）
  - 通过环境变量 SPRING_DATASOURCE_* 覆盖配置，**不修改任何配置文件**
  - 前后端各自写日志：backend\target\dev-backend.log / frontend\dev-frontend.log

.EXAMPLE
  .\scripts\dev.ps1                启动（默认用 fcdzy_site_local 库）
  .\scripts\dev.ps1 -Stop          停止
  .\scripts\dev.ps1 -Status        看状态
  .\scripts\dev.ps1 -DbName fcdzy_site   用另一个库启动
  .\scripts\dev.ps1 -NoOpen        启动但不自动打开浏览器
#>
param(
  [switch]$Stop,
  [switch]$Status,
  [switch]$NoOpen,
  [string]$DbName = 'fcdzy_site_local',
  [string]$DbPassword = '',
  [switch]$AllowRemote
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'dev-common.ps1')

$root = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'
$configFile = Join-Path $backendDir 'config\application-db.yml'
$stateFile = Join-Path $PSScriptRoot '.dev-state.json'
$backendLog = Join-Path $backendDir 'target\dev-backend.log'
$frontendLog = Join-Path $frontendDir 'dev-frontend.log'

$BACKEND_PORT = 8080
$FRONTEND_PORT = 5173

function Read-State {
  if (Test-Path $stateFile) {
    try { return Get-Content $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return $null }
  }
  return $null
}

function Show-Status {
  Write-Host ''
  Write-Host '  本地开发环境状态' -ForegroundColor Cyan
  Write-Host '  ------------------'
  $b = Get-PortOwner -Port $BACKEND_PORT
  $f = Get-PortOwner -Port $FRONTEND_PORT
  if ($b) { Write-Host ("  后端 :8080  运行中 (PID " + $b.OwningProcess + ')') -ForegroundColor Green }
  else { Write-Host '  后端 :8080  未运行' -ForegroundColor DarkGray }
  if ($f) { Write-Host ("  前端 :5173  运行中 (PID " + $f.OwningProcess + ')') -ForegroundColor Green }
  else { Write-Host '  前端 :5173  未运行' -ForegroundColor DarkGray }

  $state = Read-State
  if ($state) {
    if ($state.db) { Write-Host ("  开发用库 : " + $state.db) }
    if ($state.startedAt) { Write-Host ("  启动时间 : " + $state.startedAt) }
  }
  Write-Host ''
}

function Stop-Dev {
  $state = Read-State
  foreach ($port in @($BACKEND_PORT, $FRONTEND_PORT)) {
    $owner = Get-PortOwner -Port $port
    if ($owner) {
      try {
        Stop-Process -Id $owner.OwningProcess -Force -ErrorAction Stop
        Write-Host ("  已停止 :" + $port) -ForegroundColor Yellow
      } catch {
        Write-Host ("  停止 :" + $port + ' 失败：' + $_.Exception.Message) -ForegroundColor Red
      }
    }
  }
  if ($state -and $state.backendShell) {
    try { Stop-Process -Id $state.backendShell -Force -ErrorAction SilentlyContinue } catch { }
  }
  if ($state -and $state.frontendShell) {
    try { Stop-Process -Id $state.frontendShell -Force -ErrorAction SilentlyContinue } catch { }
  }
  if (Test-Path $stateFile) { Remove-Item $stateFile -Force }
  Write-Host '  已停止本地开发环境' -ForegroundColor Cyan
  Write-Host ''
}

if ($Stop) { Stop-Dev; exit 0 }
if ($Status) { Show-Status; exit 0 }

# ==================== 启动 ====================

Write-Host ''
Write-Host '  启动本地开发环境' -ForegroundColor Cyan
Write-Host '  ------------------'

# 1) 前置检查
if (-not (Test-Port -Port 3306)) {
  throw '      本地 MySQL 没有在 3306 端口监听，请先启动 MySQL80 服务'
}
Write-Host '  MySQL :3306 正常' -ForegroundColor Green

$running = @()
if (Test-Port -Port $BACKEND_PORT) { $running += ':8080' }
if (Test-Port -Port $FRONTEND_PORT) { $running += ':5173' }
if ($running.Count -gt 0) {
  Write-Host ('  端口已被占用：' + ($running -join '、')) -ForegroundColor Yellow
  Write-Host '  先执行 .\scripts\dev.ps1 -Stop 清掉，再启动' -ForegroundColor Yellow
  exit 1
}

# 2) 数据库账号
$db = Resolve-DbCredentials -ConfigPath $configFile -PasswordOverride $DbPassword -AllowRemote:$AllowRemote
$jdbcUrl = 'jdbc:mysql://localhost:3306/' + $DbName + '?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true&rewriteBatchedStatements=true'

$count = Invoke-MySql -User $db.Username -Password $db.Password -Sql ('SELECT COUNT(*) FROM ' + $DbName + '.article')
$countText = ($count | Where-Object { $_ -match '^\d+$' } | Select-Object -First 1)
if (-not $countText) {
  Write-Host ('  读不到库 ' + $DbName + '，请用 .\scripts\db-local.ps1 -Action clone 创建') -ForegroundColor Red
  throw ($count | Out-String)
}
Write-Host ('  开发库：' + $DbName + '（' + $countText + ' 篇文章）') -ForegroundColor Green

# 3) 环境变量覆盖数据源（优先级高于 application-db.yml，改配置文件那套彻底不用了）
$env:SPRING_DATASOURCE_URL = $jdbcUrl
$env:SPRING_DATASOURCE_USERNAME = $db.Username
$env:SPRING_DATASOURCE_PASSWORD = $db.Password

# 4) 后端
Write-Host '  启动后端……（首次编译约 30~60 秒）' -ForegroundColor DarkGray
$backendShell = Start-Process -FilePath 'cmd.exe' `
  -ArgumentList '/c', ('mvn -B -q spring-boot:run > "' + $backendLog + '" 2>&1') `
  -WorkingDirectory $backendDir -WindowStyle Hidden -PassThru

$apiCheck = { (Invoke-RestMethod -Uri ('http://127.0.0.1:' + $BACKEND_PORT + '/api/public/articles?pageNum=1&pageSize=1') -TimeoutSec 3).code -eq 0 }
$ok = Wait-Http -Url ('http://127.0.0.1:' + $BACKEND_PORT + '/api/public/articles?pageNum=1&pageSize=1') -TimeoutSeconds 180 -Check $apiCheck
if (-not $ok) {
  Write-Host '  后端启动失败，日志最后 20 行：' -ForegroundColor Red
  if (Test-Path $backendLog) { Get-Content $backendLog -Tail 20 | ForEach-Object { '    ' + $_ } }
  Stop-Process -Id $backendShell.Id -Force -ErrorAction SilentlyContinue
  exit 1
}
Write-Host '  后端 :8080 就绪' -ForegroundColor Green

# 5) 前端
Write-Host '  启动前端……' -ForegroundColor DarkGray
$frontendShell = Start-Process -FilePath 'cmd.exe' `
  -ArgumentList '/c', ('npm run dev > "' + $frontendLog + '" 2>&1') `
  -WorkingDirectory $frontendDir -WindowStyle Hidden -PassThru

$ok = Wait-Http -Url ('http://127.0.0.1:' + $FRONTEND_PORT + '/') -TimeoutSeconds 90
if (-not $ok) {
  Write-Host '  前端启动失败，日志最后 20 行：' -ForegroundColor Red
  if (Test-Path $frontendLog) { Get-Content $frontendLog -Tail 20 | ForEach-Object { '    ' + $_ } }
  Stop-Process -Id $frontendShell.Id -Force -ErrorAction SilentlyContinue
  Stop-Process -Id $backendShell.Id -Force -ErrorAction SilentlyContinue
  exit 1
}
Write-Host '  前端 :5173 就绪' -ForegroundColor Green

# 6) 记录状态
$state = [pscustomobject]@{
  db           = $DbName
  startedAt    = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
  backendShell = $backendShell.Id
  frontendShell = $frontendShell.Id
}
$state | ConvertTo-Json | Set-Content -Path $stateFile -Encoding UTF8

Write-Host ''
Write-Host '  打开 http://localhost:5173 即可预览（改代码即时生效）' -ForegroundColor Cyan
Write-Host '  改完不用了：.\scripts\dev.ps1 -Stop' -ForegroundColor Cyan
Write-Host ''

if (-not $NoOpen) { Start-Process 'http://localhost:5173' }
