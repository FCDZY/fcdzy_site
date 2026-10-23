# syntax=docker/dockerfile:1

# ==================== 1. 构建阶段 ====================
# Vite 6 需要 Node 20.19+ / 22.12+
FROM node:22-alpine AS build
WORKDIR /app

# 国内用 npmmirror，装依赖快很多
RUN npm config set registry https://registry.npmmirror.com

# 先装依赖，单独一层便于缓存（有 lock 文件时也可以改成 npm ci）
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .
# npm run build = vue-tsc --noEmit && vite build
# 若某次类型检查挡住了发布，可临时改成：RUN npx vite build
RUN npm run build

# ==================== 2. 运行阶段 ====================
# Nginx 托管静态文件，并把 /api、/uploads 等反向代理到后端容器
FROM nginx:1.27-alpine
ENV TZ=Asia/Shanghai
RUN apk add --no-cache tzdata \
 && cp /usr/share/zoneinfo/$TZ /etc/localtime \
 && echo $TZ > /etc/timezone

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
