@echo off
chcp 65001 >nul
title 个人网站 - 前端 (Vite :5173)
cd /d "%~dp0frontend"
echo ============================================
echo  启动前端 Vite 开发服务（端口 5173）
echo  前台：http://127.0.0.1:5173
echo  后台：http://127.0.0.1:5173/admin
echo ============================================
if not exist node_modules (
  echo 首次运行，正在安装依赖...
  call npm install
)
call npm run dev
pause
