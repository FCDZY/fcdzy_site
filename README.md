# 个人网站 MVP（SpringBoot + Vue3 + MySQL）

一个前后端分离的个人网站：前台展示 + 后台管理，包含文章、分类、标签、专题、图片上传与站点配置。

- 后端：Spring Boot 3.5 + Spring Data JPA + Spring Security(JWT) + MySQL 8 + BCrypt
- 前端：Vue 3 + Vite + TypeScript + Pinia + Vue Router + Element Plus + markdown-it + highlight.js

## 目录结构

```
fcdzy_site/
├── backend/          Spring Boot 后端（端口 8080）
│   ├── src/main/java/com/fcdzy/site/
│   │   ├── common/       统一响应、分页、异常处理
│   │   ├── config/       安全配置、资源映射、启动初始化
│   │   ├── controller/   前台公开接口 + 后台管理接口
│   │   ├── dto/          请求 / 响应对象
│   │   ├── entity/       实体（文章、分类、标签、专题、管理员、站点配置）
│   │   ├── repository/   数据访问
│   │   ├── security/     JWT 签发解析、认证过滤器
│   │   ├── service/      业务逻辑
│   │   └── util/         slug 生成、Markdown 摘要
│   └── uploads/      本地上传目录（运行时生成）
└── frontend/         Vue3 前端（开发端口 5173）
    └── src/
        ├── api/          接口封装（publicApi / authApi / adminApi）
        ├── components/   通用组件（文章卡片、分页、Markdown 正文、上传）
        ├── composables/  Markdown 渲染、SEO、工具
        ├── layouts/      前台布局、后台布局
        ├── router/       路由与登录守卫
        ├── stores/       站点配置 / 登录状态（Pinia）
        ├── styles/       全局样式与 Markdown 排版
        └── views/        前台页面 + 后台页面
```

## 环境要求

| 依赖 | 版本 |
| --- | --- |
| JDK | 17+（本机 23） |
| Maven | 3.8+ |
| Node.js | 20.19+ / 22.12+（本机 22） |
| MySQL | 8.x（本机 8.0，端口 3306） |

## 数据库准备

```sql
CREATE DATABASE IF NOT EXISTS fcdzy_site DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
```

连接信息在 `backend/src/main/resources/application.yml`：

```yaml
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/fcdzy_site?...
    username: root
    password: "123456"
```

表结构由 JPA 自动创建（`spring.jpa.hibernate.ddl-auto=update`），首次启动会自动初始化：

- 管理员账号：`admin` / `admin123`（BCrypt 加盐存储，可在 `site.admin.*` 修改）
- 站点默认配置项
- 演示内容：2 个分类、4 个标签、1 个专题、4 篇文章（含 1 篇草稿）

> 生产环境请务必修改 `site.jwt.secret`、管理员密码与数据库密码。

## 启动后端

```bash
cd backend
mvn spring-boot:run
# 或者： mvn -DskipTests package && java -jar target/fcdzy-site-1.0.0.jar
```

- 接口地址：http://127.0.0.1:8080
- 上传文件访问：http://127.0.0.1:8080/uploads/...
- 站点地图：http://127.0.0.1:8080/sitemap.xml 、/robots.txt

## 启动前端

```bash
cd frontend
npm install
npm run dev
```

- 前台：http://127.0.0.1:5173
- 后台：http://127.0.0.1:5173/admin （账号 admin / admin123）

Vite 已配置代理，把 `/api`、`/uploads`、`/sitemap.xml`、`/robots.txt` 转发到后端 8080。

生产构建：

```bash
cd frontend
npm run build      # 产物在 frontend/dist，交给 Nginx 托管，并反向代理 /api、/uploads 到后端
```

## 一键启动（Windows）

双击仓库根目录下的 `start-backend.bat` 和 `start-frontend.bat` 即可（会自动安装前端依赖）。

## 自检脚本（可选）

前后端都启动后，可在 `frontend` 目录运行：

```bash
npm run typecheck        # vue-tsc 类型检查
npm run check:components # 检查模板里用到的组件是否都已正确导入/注册
npm run smoke:render     # 无头 Chrome 渲染前台各页面并校验内容
npm run smoke:admin      # 无头 Chrome 完成登录并校验后台各页面（含控制台报错检测）
```

冒烟脚本会自动寻找本机 Chrome/Edge（也可用环境变量 `CHROME_PATH` 指定）。

## 项目状态

已完成并实测通过（后端接口 + 无头浏览器渲染）：

- 后端：登录鉴权、文章/分类/标签/专题 CRUD、专题内排序、图片上传、站点配置、sitemap/robots、未登录访问后台返回 401
- 前台：首页、文章列表、文章详情（Markdown + 代码高亮 + 目录）、分类、标签、专题列表与详情、关于页、404，移动端适配与动态 SEO
- 后台：登录、仪表盘、文章管理（Markdown 编辑器 + 图片上传）、分类、标签、专题与专题内文章排序、站点配置、账号设置

## 功能清单

### 前台
- 首页：Banner、最新文章、分类/标签/专题侧栏
- 文章列表：分页、关键词搜索、按分类/标签筛选
- 文章详情：Markdown 渲染、代码高亮、目录、上一篇/下一篇、所属专题
- 分类页、标签页、专题列表与专题详情（按后台自定义顺序展示）
- 关于页（站点与作者信息来自后台配置）
- 移动端适配、基础 SEO（动态 title/description/keywords/OG、sitemap.xml、robots.txt）

### 后台
- 管理员登录（JWT 放在请求头 `Authorization: Bearer <token>`，不开放注册）
- 仪表盘统计（文章/发布/草稿/分类/标签/专题/总阅读量）
- 文章新增、编辑、删除、草稿与发布状态切换、置顶
- Markdown 编辑器（md-editor-v3，支持粘贴/选择图片上传）
- 分类管理、标签管理
- 专题管理：增删改 + 专题内文章排序（添加、移除、上移、下移、保存顺序）
- 图片上传（本地磁盘，按年月目录存放）
- 站点基础信息配置（站名、副标题、描述、关键词、Logo、作者信息、页脚、备案号等）

## 接口概览

统一响应：`{ "code": 0, "message": "ok", "data": ... }`，`code != 0` 表示失败。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | /api/auth/login | 登录，返回 JWT |
| GET | /api/auth/me | 当前登录用户 |
| PUT | /api/auth/password | 修改密码 |
| PUT | /api/auth/profile | 修改昵称/头像/邮箱 |
| GET | /api/public/site-config | 站点配置 |
| GET | /api/public/articles | 文章列表（page/size/categoryId/tagId/keyword） |
| GET | /api/public/articles/{slug} | 文章详情（浏览量 +1） |
| GET | /api/public/categories\|tags\|topics | 分类/标签/专题 |
| GET | /api/public/topics/{slug} | 专题详情（含按顺序的文章） |
| GET/POST/PUT/DELETE | /api/admin/articles/** | 文章管理 |
| GET/POST/PUT/DELETE | /api/admin/categories\|tags\|topics/** | 分类/标签/专题管理 |
| PUT | /api/admin/topics/{id}/articles | 保存专题内文章顺序 |
| POST | /api/admin/upload | 图片上传（form-data，字段名 file） |
| GET/PUT | /api/admin/site-config | 站点配置读写 |
| GET | /api/admin/stats | 仪表盘统计 |

## 已知取舍（MVP）

- 前台是 SPA，SEO 依赖客户端注入 meta + sitemap；若需要更好的收录效果，可后续接入预渲染或迁移 Nuxt。
- 文章搜索只匹配标题与摘要，未接入全文索引。
- 图片存在本地磁盘，换机器需要一并拷贝 `backend/uploads`；生产建议接对象存储。
- 单管理员模式，没有多用户与角色权限。
- Element Plus 目前是全量引入（首屏 gzip 约 400KB），追求极致体积可接入 `unplugin-vue-components` 按需引入。
