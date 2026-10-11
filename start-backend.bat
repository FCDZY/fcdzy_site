@echo off
chcp 65001 >nul
title 个人网站 - 后端 (SpringBoot :8080)
cd /d "%~dp0backend"
echo ============================================
echo  启动后端 SpringBoot 服务（端口 8080）
echo  依赖：JDK 17+ / Maven / MySQL(库 fcdzy_site)
echo ============================================
call mvn spring-boot:run
pause
