@echo off
rem ============================================================
rem  Local database helper
rem  Usage:
rem    scripts\db-local.cmd -Action info
rem    scripts\db-local.cmd -Action clone
rem    scripts\db-local.cmd -Action clean
rem ============================================================
setlocal
set "SCRIPT=%~dp0db-local.ps1"

if not exist "%SCRIPT%" (
  echo [db-local.cmd] cannot find "%SCRIPT%"
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
set "RC=%ERRORLEVEL%"

if not "%RC%"=="0" (
  echo.
  echo [db-local.cmd] failed with exit code %RC% - see messages above
  pause
  exit /b %RC%
)

endlocal & exit /b 0
