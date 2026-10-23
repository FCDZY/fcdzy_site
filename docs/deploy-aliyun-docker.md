# 用 Docker 把个人网站部署到阿里云 ECS（完整教程）

> 面向本项目（SpringBoot 3.5 + Vue3 + MySQL 8）的单机 Docker 部署。
> 从零开始：买机器 → 装 Docker → 配 .env → 一条命令起服务 → 域名 HTTPS → 备份与发版。
>
> ⚠️ 一句实话：这套配置是我按项目的真实情况写的，但**本机没有装 Docker**，所以我没能在这里跑一遍
> `docker compose config` / `docker build` 验证。第一次在服务器上执行时如果哪一步报错，把报错信息贴回来我帮你改。

---

## 0. 先看全貌

### 0.1 架构

```
               公网                     ECS（一台机器，Docker 内网）
        ┌──────────────┐      ┌────────────────────────────────────────────┐
用户 ──▶│  80 / 443    │─────▶│  fcdzy-frontend (nginx:1.27)               │
        └──────────────┘      │    ├─ /            静态文件 dist（SPA）     │
                              │    ├─ /api/  ─────┐                        │
                              │    ├─ /uploads/ ──┤ 反向代理（容器名解析）  │
                              │    └─ /sitemap.xml┘                        │
                              │            │                                │
                              │            ▼                                │
                              │  fcdzy-backend (temurin 21 JRE, :8080)      │
                              │    └─ /app/uploads ← 命名卷 uploads-data    │
                              │            │                                │
                              │            ▼                                │
                              │  fcdzy-mysql (mysql:8.0, :3306)             │
                              │    └─ /var/lib/mysql ← 命名卷 mysql-data    │
                              └────────────────────────────────────────────┘
```

### 0.2 容器与端口

| 服务 | 容器名 | 镜像 | 对外端口 | 说明 |
| --- | --- | --- | --- | --- |
| frontend | fcdzy-frontend | nginx:1.27-alpine | **80 / 443** | 静态资源 + 反向代理，唯一对外入口 |
| backend | fcdzy-backend | eclipse-temurin:21-jre | 仅内网 8080 | REST 接口、图片读写、sitemap |
| mysql | fcdzy-mysql | mysql:8.0 | 仅内网 3306 | 数据落命名卷 |

**为什么前端不用改代码就能换域名**：前端请求走的是相对路径 `/api`（`frontend/src/api/http.ts` 里 `baseURL: '/api'`），
所以同一份构建产物在任何域名下都能用，靠 Nginx 反代即可。

**但有一个必须改的地方**：后端会返回**绝对地址**的图片 URL（`site.base-url`），默认是 `http://localhost:8080/uploads/...`。
生产环境必须通过环境变量把它改成你的公网地址，否则后台上传的图片在前台会 404。教程第 3 步和第 5.5 步就是这个。

### 0.3 仓库里已经为你准备好的文件

| 文件 | 作用 |
| --- | --- |
| [docker-compose.yml](../docker-compose.yml) | 三个服务的编排，只有 80 对外 |
| [.env.example](../.env.example) | 密码/域名/密钥模板，复制成 `.env` 后填 |
| [backend/Dockerfile](../backend/Dockerfile) | 多阶段：Maven 编译 → JRE 运行，非 root、带健康检查 |
| [backend/docker/maven-settings.xml](../backend/docker/maven-settings.xml) | 构建时走阿里云 Maven 镜像 |
| [backend/.dockerignore](../backend/.dockerignore) | 不把 target/、uploads/ 打进构建上下文 |
| [frontend/Dockerfile](../frontend/Dockerfile) | 多阶段：Node 构建 → Nginx 托管 |
| [frontend/nginx.conf](../frontend/nginx.conf) | SPA 回落、gzip、`client_max_body_size`、反代规则 |
| [frontend/.dockerignore](../frontend/.dockerignore) | 不把 node_modules/、dist/ 打进构建上下文 |

> 建议先把这些文件提交到 git，再往服务器上拉代码。

---

## 1. 服务器准备

### 1.1 买 ECS

阿里云控制台 → 云服务器 ECS → 创建实例，建议：

| 项 | 建议 | 原因 |
| --- | --- | --- |
| 规格 | **2 核 4G** 起 | 在服务器上构建要同时跑 Maven + Node，2G 内存很容易 OOM（附录 A 有 2G 机器的替代方案） |
| 镜像 | Alibaba Cloud Linux 3 / Ubuntu 22.04 | 都行，本教程命令两者通用 |
| 系统盘 | 40G ESSD 起 | 镜像 + 依赖 + MySQL 数据；Docker 构建缓存也吃空间 |
| 带宽 | 3~5 Mbps 按量/固定 | 个人博客够用；图片多建议后面接 OSS + CDN |
| 地域 | 离你近的（如华东1-杭州） | 延迟低，备案也在同一地域 |

### 1.2 安全组（最容易漏的一步）

ECS 控制台 → 安全组 → 入方向规则，放行：

| 端口 | 来源 | 用途 |
| --- | --- | --- |
| 22 | 你的 IP（最好固定） | SSH |
| 80 | 0.0.0.0/0 | HTTP |
| 443 | 0.0.0.0/0 | HTTPS |

**不要**放行 3306、8080——本项目这两个端口只在 Docker 内网暴露。

### 1.3 安装 Docker 与 Compose

```bash
# 1) 官方脚本 + 阿里云镜像源（国内机器最快的方式）
curl -fsSL https://get.docker.com | bash -s docker --mirror Aliyun

# 2) 开机自启并启动
sudo systemctl enable --now docker

# 3) 当前用户免 sudo（重新登录后生效）
sudo usermod -aG docker $USER && newgrp docker

# 4) 验证：两个命令都要有输出
docker --version
docker compose version
```

> `docker compose version` 没输出的话，说明只装了 docker 本体，补一下：
> `sudo dnf install -y docker-compose-plugin`（Alinux/CentOS）或 `sudo apt install -y docker-compose-plugin`（Ubuntu）。

### 1.4 配置镜像加速（强烈建议）

阿里云控制台 → 容器镜像服务 ACR → 镜像工具 → **镜像加速器**，复制你的专属地址（形如 `https://xxxx.mirror.aliyuncs.com`）：

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<'EOF'
{
  "registry-mirrors": ["https://你的专属地址.mirror.aliyuncs.com"],
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "3" }
}
EOF
sudo systemctl daemon-reload && sudo systemctl restart docker

# 验证加速是否生效（输出里应能看到 mirror 地址）
docker info | grep -A3 "Registry Mirrors"
```

> 顺带把日志大小限制上了，不然容器日志长期跑下来会把磁盘写满。
>
> 2024 年之后不少公共加速器已停服，所以优先用阿里云控制台里的专属加速地址。
> 如果 `docker pull` 还是慢/超时，直接跳到 **附录 A**（本地构建 → 推到 ACR → 服务器只 pull），那条路最稳。

### 1.5 （可选）加 2G swap，防止构建时被 OOM Kill

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h   # 确认 Swap 那行有 2.0Gi
```

---

## 2. 把代码放到服务器

### 方式 A：git（推荐，后续发版方便）

本地先提交并推送（注意 `.env` 不要提交，仓库的 `.gitignore` 已忽略）：

```bash
# 本地
git add . && git commit -m "chore: 增加 Docker 部署配置" && git push
```

服务器上：

```bash
# 推荐放 /opt 或 /home 下
cd /opt
git clone <你的仓库地址> fcdzy_site
cd fcdzy_site
```

> 用 Gitee/自建 Git 更快；用 GitHub 如果拉取慢，把仓库镜像到阿里云 云效 Codeup 也可以。

### 方式 B：本地打包上传

```powershell
# 本地 Windows PowerShell（只传源码，别传 node_modules / target / dist）
cd D:\aiconding
tar --exclude=node_modules --exclude=target --exclude=dist --exclude=.git -czf fcdzy_site.tar.gz fcdzy_site
scp .\fcdzy_site.tar.gz root@<ECS公网IP>:/opt/
```

```bash
# 服务器
cd /opt && tar -xzf fcdzy_site.tar.gz && cd fcdzy_site
```

### 确认目录结构对得上

compose 文件要求这些相对路径存在（缺一个都会构建失败）：

```bash
ls -1
# 期望看到：backend  frontend  docker-compose.yml  .env.example
ls backend/Dockerfile backend/docker/maven-settings.xml frontend/Dockerfile frontend/nginx.conf
```

---

## 3. 配置 .env（最关键的一步）

```bash
cd /opt/fcdzy_site
cp .env.example .env

# 生成一个随机 JWT 密钥（直接把输出粘到 .env 的 SITE_JWT_SECRET）
openssl rand -base64 48

vi .env
```

**必改的 5 项**：

| 变量 | 怎么填 | 填错的后果 |
| --- | --- | --- |
| `MYSQL_ROOT_PASSWORD` | 强密码 | 数据库裸奔（虽然只在内网） |
| `SITE_BASE_URL` | `http://你的域名` 或 `http://公网IP` | **上传的图片全部 404**（后端会拼出 `http://localhost:8080/...`） |
| `SITE_WEB_URL` | 同上 | sitemap.xml 里的链接是 localhost:5173 |
| `SITE_JWT_SECRET` | `openssl rand -base64 48` 的输出 | 用默认值等于后台登录令牌可被伪造 |
| `SITE_ADMIN_PASSWORD` | 你的后台密码（≥6 位） | 用默认 `admin123` 会被扫 |

改完的样子（示例，域名换成你自己的）：

```dotenv
MYSQL_ROOT_PASSWORD=Str0ng-Passw0rd-9527
MYSQL_DATABASE=fcdzy_site

SITE_BASE_URL=http://blog.example.com
SITE_WEB_URL=http://blog.example.com

SITE_JWT_SECRET=粘贴openssl生成的那一串
SITE_JWT_EXPIRE_HOURS=24

SITE_ADMIN_USERNAME=admin
SITE_ADMIN_PASSWORD=你的后台密码
SITE_ADMIN_NICKNAME=站长

HTTP_PORT=80
BACKEND_MAX_HEAP=512m
TZ=Asia/Shanghai
```

```bash
# 确认 .env 写进 git 了没（应该什么都不输出）
git status --short | grep '\.env$' || echo "OK：.env 未被跟踪"
```

> 💡 填密码的小提醒：**别在密码里用 `$`**（Compose 会把它当变量转义符），
> 用大小写字母 + 数字 + `-` `_` `.` 就足够强了。密码里也尽量别带空格，省得在 shell 里来回转义。

---

## 4. 构建并启动

```bash
cd /opt/fcdzy_site
docker compose up -d --build
```

**首次构建耗时参考**（2C4G，走阿里云镜像）：

| 阶段 | 大致耗时 |
| --- | --- |
| 拉取基础镜像（maven / temurin / node / nginx / mysql） | 2~8 分钟（取决于加速器） |
| 后端 Maven 编译（下依赖 + 打包） | 2~5 分钟 |
| 前端 npm install + vite build | 2~4 分钟 |
| 启动三个容器（MySQL 首次初始化 20~40 秒） | 约 1 分钟 |

期间可以用另一个窗口看进度：

```bash
docker compose ps                 # 看状态，mysql 会先 healthy，backend 再起来
docker compose logs -f backend    # 看后端日志（Ctrl+C 退出，不影响容器）
```

看到后端日志里出现这些就算成功：

```
Started SiteApplication in x.xxx seconds
已创建默认管理员账号：admin / 你的密码（请登录后尽快修改密码）
```

> 首次启动会自动建表（`spring.jpa.hibernate.ddl-auto=update`）、写入站点默认配置，
> 并灌入一小批演示数据（2 分类 / 4 标签 / 1 专题 / 4 篇文章）——上线前记得删掉，见第 6 步。

---

## 5. 上线验证

### 5.1 容器状态

```bash
docker compose ps
# 期望：mysql (healthy)、backend (healthy)、frontend (running/up)
```

### 5.2 接口自测

```bash
# 站点配置：应返回 code:0，且 backgroundImageUrl/base-url 相关的图片地址是公网地址
curl -s http://127.0.0.1/api/public/site-config | head -c 400; echo

# 文章列表
curl -s "http://127.0.0.1/api/public/articles?page=1&size=3" | head -c 300; echo

# 登录（换成你 .env 里的密码）
curl -s -X POST http://127.0.0.1/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"你的后台密码"}'
# 期望：{"code":0,...,"data":{"token":"eyJ...",...}}

# sitemap 与 robots
curl -s -o /dev/null -w 'sitemap:%{http_code}\n' http://127.0.0.1/sitemap.xml
curl -s -o /dev/null -w 'robots:%{http_code}\n'  http://127.0.0.1/robots.txt

# 未登录访问后台接口应当是 401（安全验证）
curl -s -o /dev/null -w 'admin(未登录):%{http_code}\n' http://127.0.0.1/api/admin/stats
```

### 5.3 浏览器逐项点一遍

| 检查项 | 期望 |
| --- | --- |
| `http://你的域名/` | 首页正常，样式和本地一致 |
| 点进任意文章 | 详情页正常，代码块有高亮 |
| 直接刷新 `/article/xxx`（不是从首页点进去） | **不能 404**（这条验证 SPA 回落配置） |
| `http://你的域名/admin` | 跳到登录页，用 `.env` 里的账号密码能登进去 |
| 后台 → 写文章 → 插入图片 | 上传成功，图片能显示 |
| 前台 → 移动端模式 | 布局正常 |
| 浏览器控制台 | 没有红色报错、没有请求 404 |

### 5.4 重点确认：图片地址是公网地址

在后台「站点配置」上传一张 Logo，然后：

```bash
curl -s http://127.0.0.1/api/public/site-config | grep -o 'http[^"]*uploads[^"]*'
```

输出必须是 `http://你的域名/uploads/...`。
如果看到 `http://localhost:8080/uploads/...`，说明 `SITE_BASE_URL` 没生效：

```bash
docker compose exec backend env | grep SITE_
```

确认变量在容器里存在后重启后端（见第 10 节第 2 条）。

---

## 6. 上线前的安全清单

- [ ] 用后台「账号设置」改掉管理员密码（`.env` 里的密码只在**数据库为空**时生效一次）
- [ ] `SITE_JWT_SECRET` 已换成随机值（换过之后所有旧 token 失效，需要重新登录，属正常）
- [ ] 删掉演示数据：后台 → 文章/分类/标签/专题 里把演示内容清掉，只留自己的
- [ ] 安全组只开 22 / 80 / 443
- [ ] `.env` 没有被提交到 git
- [ ] 数据库不从公网可达：`docker compose exec mysql mysql -uroot -p -e "show databases;"` 只在本机可用即可
- [ ] 配好备份（第 8 步）和阿里云快照策略

---

## 7. 域名 + HTTPS

### 7.1 解析

阿里云 → 云解析 DNS → 添加记录：`A` 记录，主机记录 `blog`（或 `@`），记录值 = ECS 公网 IP。

### 7.2 备案（中国大陆 ECS 必做）

只要域名解析到**中国大陆**的 ECS 并在 80/443 上提供服务，就**必须先完成 ICP 备案**，否则阿里云会拦截访问。
入口：阿里云 → 备案 → 首次备案（个人备案一般 1~2 周）。
不备案的替代方案：把服务器放到香港/新加坡地域（不需要备案，但国内访问延迟高一些）。

### 7.3 上 HTTPS（两种做法，选一个）

**做法一：阿里云免费证书（推荐，最省事）**

1. 阿里云 → 数字证书管理服务 → 免费证书 → 申请 DV 单域名证书 → 绑定你的域名
2. 签发后下载 **Nginx** 格式，得到 `xxx.pem` 和 `xxx.key`
3. 上传到服务器：

```bash
mkdir -p /opt/fcdzy_site/deploy/certs
# 本地
scp xxx.pem xxx.key root@<ECS公网IP>:/opt/fcdzy_site/deploy/certs/
```

4. 把 `frontend/nginx.conf` 换成 HTTP 跳转 + HTTPS 两段（下面的完整内容可直接覆盖）：

```nginx
# ---------- HTTP：只做跳转 ----------
server {
    listen 80;
    server_name blog.example.com;

    # 证书续期/校验用
    location /.well-known/acme-challenge/ { root /usr/share/nginx/html; }
    location / { return 301 https://$host$request_uri; }
}

# ---------- HTTPS：真正对外服务 ----------
server {
    listen 443 ssl;
    http2 on;
    server_name blog.example.com;

    ssl_certificate     /etc/nginx/certs/blog.example.com.pem;
    ssl_certificate_key /etc/nginx/certs/blog.example.com.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;

    root  /usr/share/nginx/html;
    index index.html;
    charset utf-8;
    client_max_body_size 20m;

    gzip on;
    gzip_min_length 1k;
    gzip_comp_level 5;
    gzip_vary on;
    gzip_types text/plain text/css application/json application/javascript application/xml image/svg+xml;

    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
        try_files $uri =404;
    }

    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location /api/ {
        proxy_pass http://backend:8080;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    location /uploads/ {
        proxy_pass http://backend:8080;
        proxy_set_header Host $host;
        expires 7d;
        add_header Cache-Control "public, max-age=604800";
    }

    location = /sitemap.xml { proxy_pass http://backend:8080; proxy_set_header Host $host; }
    location = /robots.txt  { proxy_pass http://backend:8080; proxy_set_header Host $host; }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

5. 打开 compose 里的 443 与证书挂载（`docker-compose.yml` 的 frontend 段）：

```yaml
    ports:
      - "${HTTP_PORT:-80}:80"
      - "${HTTPS_PORT:-443}:443"
    volumes:
      - ./deploy/certs:/etc/nginx/certs:ro
      - nginx-cache:/var/cache/nginx
```

6. `.env` 里把地址改成 https：

```dotenv
SITE_BASE_URL=https://blog.example.com
SITE_WEB_URL=https://blog.example.com
```

7. 重建前端 + 重启后端让地址生效：

```bash
docker compose up -d --build frontend backend
docker compose exec frontend nginx -t        # 校验 nginx 配置语法
```

**做法二：certbot 自动签发/续期**

```bash
sudo apt install -y certbot        # 或 dnf
# 先确保 80 端口能被公网访问（可以先只放 HTTP 配置）
sudo certbot certonly --webroot -w /var/www/certbot -d blog.example.com
# 证书在 /etc/letsencrypt/live/blog.example.com/，把 compose 的挂载改成：
#   - /etc/letsencrypt:/etc/nginx/certs:ro
# 并相应改 nginx.conf 里的 ssl_certificate 路径，然后加一条定时续期：
#   0 3 * * * certbot renew --quiet && docker compose exec frontend nginx -s reload
```

### 7.4 验证 HTTPS

```bash
curl -sI https://blog.example.com | head -3          # 200
curl -sI http://blog.example.com | head -3           # 301 跳 https
```

---

## 8. 备份与恢复

### 8.1 备份数据库

```bash
cd /opt/fcdzy_site
mkdir -p /opt/backup
docker compose exec -T mysql sh -c \
  'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers fcdzy_site' \
  > /opt/backup/db_$(date +%F_%H%M).sql
```

### 8.2 备份上传的图片

```bash
# 卷名前缀就是 compose 顶部的 name: fcdzy-site
docker run --rm \
  -v fcdzy-site_uploads-data:/data \
  -v /opt/backup:/backup \
  alpine tar czf /backup/uploads_$(date +%F).tar.gz -C /data .
```

### 8.3 恢复

```bash
# 数据库
docker compose exec -T mysql sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" fcdzy_site' < /opt/backup/db_2026-10-11_2300.sql

# 图片
docker run --rm -v fcdzy-site_uploads-data:/data -v /opt/backup:/backup \
  alpine sh -c 'tar xzf /backup/uploads_2026-10-11.tar.gz -C /data'
docker compose restart backend
```

### 8.4 自动化建议

- 服务器侧：`crontab -e` 加一条每天 3 点执行 8.1+8.2 的脚本，保留最近 14 天
- 云端侧：ECS 控制台给系统盘配**自动快照策略**（每天一次，保留 7 天），这是最后的兜底
- 备份要定期**真的恢复一次**验证，不然等于没备份

---

## 9. 日常发版更新

```bash
cd /opt/fcdzy_site
git pull

# 全量重建（改了后端/前端/依赖都用这个）
docker compose up -d --build

# 只改了前端
docker compose up -d --build frontend

# 只改了后端
docker compose up -d --build backend

# 看结果
docker compose ps && docker compose logs --tail=50 backend
```

- **数据库结构变更**：项目用的是 `ddl-auto=update`，加字段/加表会自动同步，不需要手工执行 SQL；但**不会删字段**，删字段要自己处理。
- **图片不会丢**：`uploads-data` 是命名卷，重建容器不动它。
- **回滚**：最简单是 `git checkout <上一个提交> && docker compose up -d --build`；
  更稳的做法是给镜像打版本号（`fcdzy-site-backend:1.0.0`），需要时改 compose 的 `image:` 回退。
- **清理构建缓存**（磁盘吃紧时）：

```bash
docker system df              # 先看看占了多少
docker image prune -f         # 清悬空镜像
docker builder prune -f       # 清构建缓存
```

---

## 10. 常见问题排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 上传图片报 **413 Request Entity Too Large** | Nginx 默认只允许 1MB | `frontend/nginx.conf` 里 `client_max_body_size 20m;`（已配好），改完 `docker compose up -d --build frontend` |
| 图片 **404** / 地址里是 `localhost:8080` | `SITE_BASE_URL` 没生效 | 见 5.4；确认 `docker compose exec backend env \| grep SITE_`，必要时用下面的兜底写法 |
| 刷新 `/article/xxx` **404** | SPA 回落没配 | `frontend/nginx.conf` 里的 `try_files $uri $uri/ /index.html;` |
| 后台接口全 **401** | token 过期，或换过 `SITE_JWT_SECRET` | 重新登录；换了密钥旧 token 必然失效 |
| 后台**登录不了** | 数据库已有 admin，`.env` 里改的密码不会覆盖 | 用旧密码登录后到「账号设置」改；或直接改库：`docker compose exec mysql mysql -uroot -p fcdzy_site -e "select username from admin_user;"` |
| 后端日志 **Communications link failure** | 后端比 MySQL 先起来 / 密码不对 | compose 已用 `depends_on: condition: service_healthy`；再看 `MYSQL_ROOT_PASSWORD` 是否和 mysql 容器一致 |
| 构建卡在 **Downloading from central** | 没走阿里云 Maven 镜像 | 确认 `backend/docker/maven-settings.xml` 存在且 Dockerfile 里那行 COPY 没被删 |
| 前端镜像构建失败（`vue-tsc` 报类型错误） | `npm run build` 会先跑 `vue-tsc --noEmit` | 修掉类型错误；急着发布就把 `frontend/Dockerfile` 的 `RUN npm run build` 临时改成 `RUN npx vite build` |
| 构建被 **Killed**（OOM） | 内存不足 | 加 swap（1.5）；或降 `BACKEND_MAX_HEAP=384m`；或走附录 A |
| `docker compose up` 报 **port 80 already in use** | 宿主机已有 nginx/apache/宝塔 | `sudo ss -lntp \| grep :80` 找到并停掉，或把 `.env` 里 `HTTP_PORT` 改成 8080 之类 |
| 站点打不开、容器却正常 | 安全组没放行 80 | 回 1.2 检查安全组 |
| 发布时间差 8 小时 | 时区 | compose 里已设 `TZ=Asia/Shanghai` + MySQL `--default-time-zone=+08:00`；确认 `.env` 的 `TZ` 没被改 |
| 磁盘满 | 日志/镜像/构建缓存 | compose 已限制日志大小；定期 `docker system prune -f`；`df -h` 看系统盘 |

**SITE_BASE_URL 没生效时的兜底写法**（不依赖环境变量名绑定，直接塞 JSON）：

```yaml
    environment:
      SPRING_APPLICATION_JSON: '{"site":{"base-url":"https://blog.example.com","web-url":"https://blog.example.com"}}'
```

---

## 附录 A：2 核 2G 小内存机器（本地构建 → ACR → 服务器只 pull）

服务器内存不够时，最省心的方案是**在本地构建镜像推送到阿里云 ACR**，服务器只负责拉取运行。

```bash
# 1) 阿里云控制台 → 容器镜像服务 ACR → 创建个人版实例、命名空间（如 myblog）
#    然后本地登录
docker login --username=你的阿里云账号 registry.cn-hangzhou.aliyuncs.com

# 2) 本地构建并推送（项目根目录执行）
docker build -t registry.cn-hangzhou.aliyuncs.com/myblog/fcdzy-backend:1.0.0  ./backend
docker build -t registry.cn-hangzhou.aliyuncs.com/myblog/fcdzy-frontend:1.0.0 ./frontend
docker push registry.cn-hangzhou.aliyuncs.com/myblog/fcdzy-backend:1.0.0
docker push registry.cn-hangzhou.aliyuncs.com/myblog/fcdzy-frontend:1.0.0

# 3) 服务器上把 docker-compose.yml 里的 build 换成 image（或另存一个 docker-compose.prod.yml）
#    backend:  image: registry.cn-hangzhou.aliyuncs.com/myblog/fcdzy-backend:1.0.0
#    frontend: image: registry.cn-hangzhou.aliyuncs.com/myblog/fcdzy-frontend:1.0.0

# 4) 服务器只拉取运行，不构建
docker login --username=你的阿里云账号 registry.cn-hangzhou.aliyuncs.com
docker compose pull
docker compose up -d --no-build
```

> 这样做还有个额外好处：**发版不会占用服务器 CPU/内存**，也不会因为服务器上依赖下载失败而卡住。
> 缺点是多了一步本地构建（可以用 GitHub Actions / 云效流水线自动化）。

---

## 附录 B：不想用 Docker 的裸机部署（要点）

1. 装 JDK 21、MySQL 8、Nginx
2. `cd backend && mvn -DskipTests package`，得到 `target/fcdzy-site-1.0.0.jar`
3. `nohup java -jar fcdzy-site-1.0.0.jar --spring.profiles.active=prod &`（建议用 systemd 托管）
4. `cd frontend && npm install && npm run build`，把 `dist/` 丢给 Nginx
5. Nginx 配置与 `frontend/nginx.conf` 基本一致，只是 `proxy_pass http://backend:8080` 要改成 `http://127.0.0.1:8080`
6. 建库、改 `application.yml` 里的连接串/密钥/地址

**结论**：不如 Docker 省事，环境依赖和升级都更麻烦，个人项目还是建议用容器。

---

## 附录 C：后续演进（用户多了再考虑）

| 需求 | 方案 |
| --- | --- |
| 图片不想放 ECS 磁盘 | 换 OSS：后端 `UploadService` 改成上传到 OSS 并返回 CDN 地址（改动只在这一个类） |
| 数据库想更稳 | 换阿里云 RDS MySQL，`.env` 里的 `SPRING_DATASOURCE_URL` 指向 RDS 内网地址即可 |
| 访问变慢 | 前面挂 CDN，静态资源与 `/uploads` 走 CDN 回源 |
| 想跑多台 | 前面用 SLB，后端无状态（把 uploads 换成 OSS 之后即可水平扩容） |
| 想自动发布 | 云效流水线 / GitHub Actions：构建镜像 → 推 ACR → ssh 到服务器 `docker compose pull && up -d` |

---

## 附：命令速查

```bash
# 起服务
docker compose up -d --build
# 看状态 / 看日志
docker compose ps
docker compose logs -f backend
# 重启单个服务
docker compose restart backend
# 进容器排查
docker compose exec backend sh
docker compose exec mysql mysql -uroot -p fcdzy_site
# 停止（保留数据卷）
docker compose down
# 停止并删掉数据卷（⚠️ 数据库和图片全没，确认后再用）
docker compose down -v
# 更新发版
git pull && docker compose up -d --build
# 备份
docker compose exec -T mysql sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction fcdzy_site' > backup.sql
```
