#Requires -Version 5.1
<#
.SYNOPSIS
  本地开发库的日常操作（复制 / 查看 / 清理），避免误碰线上数据。

.DESCRIPTION
  - clone  ：从 fcdzy_site 复制一份到 fcdzy_site_local（本地开发默认用这个库）
  - info   ：看两个库各有几篇文章、回收站残留、客户端错误
  - clean  ：清掉本地库里的测试残留（回收站、临时文章、前端错误、smoke 评论）

.EXAMPLE
  .\scripts\db-local.ps1 -Action clone      # 初始化/重置本地开发库
  .\scripts\db-local.ps1 -Action info
  .\scripts\db-local.ps1 -Action clean
#>
param(
  [ValidateSet('clone', 'info', 'clean')]
  [string]$Action = 'info',
  [string]$SourceDb = 'fcdzy_site',
  [string]$TargetDb = 'fcdzy_site_local',
  [string]$DbPassword = '',
  [switch]$AllowRemote
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'dev-common.ps1')

$root = Split-Path -Parent $PSScriptRoot
$configFile = Join-Path $root 'backend\config\application-db.yml'
$db = Resolve-DbCredentials -ConfigPath $configFile -PasswordOverride $DbPassword -AllowRemote:$AllowRemote

function Show-Info {
  Write-Host ''
  Write-Host '  本地数据库概况' -ForegroundColor Cyan
  Write-Host '  --------------'
  foreach ($name in @($SourceDb, $TargetDb)) {
    $exists = Invoke-MySql -User $db.Username -Password $db.Password -Sql ("SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='" + $name + "'")
    $hasDb = (($exists | Out-String) -match '1')
    if (-not $hasDb) {
      Write-Host ("  " + $name.PadRight(20) + ' 不存在') -ForegroundColor DarkGray
      continue
    }
    $articles = Invoke-MySql -User $db.Username -Password $db.Password -Sql ('SELECT COUNT(*) FROM ' + $name + '.article')
    $trash = Invoke-MySql -User $db.Username -Password $db.Password -Sql ('SELECT COUNT(*) FROM ' + $name + '.article WHERE deleted_at IS NOT NULL')
    $errors = Invoke-MySql -User $db.Username -Password $db.Password -Sql ('SELECT COUNT(*) FROM ' + $name + '.client_error')
    $a = (($articles | Out-String).Trim() -split "`r?`n")[0]
    $t = (($trash | Out-String).Trim() -split "`r?`n")[0]
    $e = (($errors | Out-String).Trim() -split "`r?`n")[0]
    Write-Host ("  " + $name.PadRight(20) + ' 文章 ' + $a + ' 篇   回收站 ' + $t + ' 篇   前端错误 ' + $e + ' 条')
  }
  Write-Host ''
}

function Invoke-Clone {
  Write-Host ''
  Write-Host ('  正在把 ' + $SourceDb + ' 复制到 ' + $TargetDb + '……') -ForegroundColor Cyan

  $mysql = Get-MySqlPath
  $dump = Get-DumpPath
  $tmp = Join-Path $env:TEMP ('fcdzy-clone-' + (Get-Date -Format 'yyyyMMddHHmmss') + '.sql')

  # 不带 --databases：导出内容里没有 CREATE DATABASE / USE，直接导入目标库
  # 密码走 MYSQL_PWD 环境变量，不出现在命令行里（也不会触发 mysql 的 warning）
  $env:MYSQL_PWD = $db.Password
  $dumpCmd = '"' + $dump + '" -u' + $db.Username + ' --single-transaction --default-character-set=utf8mb4 ' + $SourceDb + ' > "' + $tmp + '"'
  cmd /c $dumpCmd 2>$null | Out-Null
  if (-not (Test-Path $tmp)) { throw '导出失败，检查 MySQL 账号权限' }
  Write-Host ('  已导出 ' + [math]::Round((Get-Item $tmp).Length / 1KB) + ' KB') -ForegroundColor DarkGray

  $createSql = 'DROP DATABASE IF EXISTS ' + $TargetDb + '; CREATE DATABASE ' + $TargetDb + ' DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci'
  Invoke-MySql -User $db.Username -Password $db.Password -Sql $createSql | Out-Null

  $env:MYSQL_PWD = $db.Password
  $importCmd = '"' + $mysql + '" -u' + $db.Username + ' --default-character-set=utf8mb4 ' + $TargetDb + ' < "' + $tmp + '"'
  $out = cmd /c $importCmd 2>$null
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue

  $count = Invoke-MySql -User $db.Username -Password $db.Password -Sql ('SELECT COUNT(*) FROM ' + $TargetDb + '.article')
  $c = (($count | Out-String).Trim() -split "`r?`n")[0]
  if (-not ($c -match '^\d+$')) { throw ('导入失败：' + ($out | Out-String)) }
  Write-Host ('  完成：' + $TargetDb + ' 里有 ' + $c + ' 篇文章') -ForegroundColor Green
  Write-Host ''
}

function Invoke-Clean {
  Write-Host ''
  Write-Host ('  清理 ' + $TargetDb + ' 里的测试残留……') -ForegroundColor Cyan
  $sql = @"
DELETE FROM $TargetDb.article WHERE deleted_at IS NOT NULL;
DELETE FROM $TargetDb.article WHERE title LIKE '%测试%' OR title LIKE '%临时%' OR slug LIKE 'reader-%';
DELETE FROM $TargetDb.comment WHERE nickname LIKE '%smoke%';
DELETE FROM $TargetDb.client_error;
"@
  Invoke-MySql -User $db.Username -Password $db.Password -Sql $sql | Out-Null
  Show-Info
}

switch ($Action) {
  'clone' { Invoke-Clone; Show-Info }
  'info' { Show-Info }
  'clean' { Invoke-Clean }
}
