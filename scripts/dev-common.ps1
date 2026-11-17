#Requires -Version 5.1
<#
  本地开发脚本的公共函数（被 dev.ps1 / db-local.ps1 调用，不单独执行）
#>

$script:MysqlCandidates = @(
  'D:\MySQL\MySQL Server 8.0\bin\mysql.exe',
  'D:\MySQL\MySQL Server 8.0\bin\mysql',
  'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe'
)

$script:DumpCandidates = @(
  'D:\MySQL\MySQL Server 8.0\bin\mysqldump.exe',
  'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe'
)

function Find-Tool {
  param([string[]]$Candidates, [string]$Name)
  foreach ($path in $Candidates) {
    if (Test-Path $path) { return $path }
  }
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw "找不到 $Name，请把 MySQL 的 bin 目录加入 PATH，或修改 scripts\dev-common.ps1 里的路径"
}

function Get-MySqlPath { Find-Tool -Candidates $script:MysqlCandidates -Name 'mysql' }
function Get-DumpPath { Find-Tool -Candidates $script:DumpCandidates -Name 'mysqldump' }

function Test-Port {
  param([int]$Port)
  $conn = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
  return ($null -ne $conn)
}

function Get-PortOwner {
  param([int]$Port)
  return Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
}

function Wait-Http {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 150,
    [scriptblock]$Check = $null
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $res = Invoke-WebRequest -Uri $Url -TimeoutSec 3 -UseBasicParsing
      if ($res.StatusCode -eq 200) {
        if ($null -eq $Check) { return $true }
        if (& $Check) { return $true }
      }
    } catch {
      # 还没起来，继续等
    }
    Start-Sleep -Milliseconds 700
  }
  return $false
}

<#
  从 backend\config\application-db.yml 读数据库账号。
  该文件在 .gitignore 里，不进仓库、不进 jar。

  安全约束：如果它指向的不是本机，直接报错——避免"本地开发"意外连到云端库。
#>
function Resolve-DbCredentials {
  param(
    [string]$ConfigPath,
    [string]$PasswordOverride,
    [switch]$AllowRemote
  )

  if (-not (Test-Path $ConfigPath)) {
    throw "找不到数据库配置文件：$ConfigPath"
  }
  $text = Get-Content $ConfigPath -Raw -Encoding UTF8
  $url = [regex]::Match($text, 'url:\s*(\S+)').Groups[1].Value
  $user = [regex]::Match($text, 'username:\s*(\S+)').Groups[1].Value.Trim('"')
  $pass = [regex]::Match($text, 'password:\s*(\S+)').Groups[1].Value.Trim('"')

  $isLocal = ($url -match 'localhost|127\.0\.0\.1')
  if (-not $isLocal -and -not $AllowRemote) {
    throw @"
配置文件指向的不是本机数据库，为安全起见已停止：
  $url

如果你确实想连远程库，加 -AllowRemote 参数。
正常本地开发请把 backend\config\application-db.yml 改成 localhost 的账号。
"@
  }

  if ($PasswordOverride) { $pass = $PasswordOverride }
  if (-not $user) { $user = 'root' }

  return [pscustomobject]@{
    Url      = $url
    Username = $user
    Password = $pass
    IsLocal  = $isLocal
  }
}

function Invoke-MySql {
  param(
    [string]$User,
    [string]$Password,
    [string]$Database = '',
    [string]$Sql = '',
    [string]$InputFile = ''
  )
  $mysql = Get-MySqlPath
  # 用 MYSQL_PWD 环境变量传密码：既不会在命令行里暴露密码，
  # 也避免 mysql 输出「Using a password on the command line interface can be insecure」警告
  # （那条警告走 stderr，会让 PowerShell 误判成错误）。
  $env:MYSQL_PWD = $Password
  # 注意：PowerShell 里逗号优先级高于加号，@('-u' + $User, '-p' + $Password) 会被拼成一个字符串。
  # 必须逐条追加，才能得到真正的参数数组。
  $mysqlArgs = @()
  $mysqlArgs += ('-u' + $User)
  $mysqlArgs += '--default-character-set=utf8mb4'
  if ($Database) { $mysqlArgs += $Database }
  if ($Sql) { $mysqlArgs += @('-N', '-e', $Sql) }
  if ($InputFile) {
    $escaped = '"' + $InputFile + '"'
    $cmd = '"' + $mysql + '" ' + ($mysqlArgs -join ' ') + ' < ' + $escaped
    $out = cmd /c $cmd 2>$null
    return $out
  }
  $out = & $mysql @mysqlArgs 2>$null
  return $out
}
