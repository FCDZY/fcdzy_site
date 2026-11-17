@echo off
rem ============================================================
rem  Local dev launcher (works in cmd.exe / double-click / PowerShell)
rem  Usage:
rem    scripts\dev.cmd              start backend + frontend
rem    scripts\dev.cmd -Stop        stop
rem    scripts\dev.cmd -Status      show status
rem    scripts\dev.cmd -NoOpen      start without opening browser
rem ============================================================
setlocal
set "SCRIPT=%~dp0dev.ps1"

if not exist "%SCRIPT%" (
  echo [dev.cmd] cannot find "%SCRIPT%"
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
set "RC=%ERRORLEVEL%"

if not "%RC%"=="0" (
  echo.
  echo [dev.cmd] failed with exit code %RC% - see messages above
  pause
  exit /b %RC%
)

endlocal & exit /b 0
