# Router Status Page (Cloudflare Pages + Worker + D1)

一个可部署在 **Cloudflare Pages（前端静态站点）** + **Cloudflare Worker（API + Scheduled）** 上的状态页，使用 **Cloudflare D1** 存储探活结果与可用率统计。

## 功能

- **HEAD 探活**：对 `HEAD_CHECK_URL` 发起 `HEAD` 请求（2xx/3xx 为成功），记录 `status_code / latency_ms / error`
- **模型 embeddings 探活**：使用 `openai` SDK，基于 `ROUTER_BASE_URL` + `OPENAI_API_KEY` 对多模型执行 `embeddings.create`
- **模型 rerank 探活**：对 `ROUTER_BASE_URL + /rerank` 发起请求（需要 `OPENAI_API_KEY`），记录 `status_code / latency_ms / error`
- **可用率统计**：最近 `5h / 24h / 7d / 30d`（success / total / availability + last status）
- **时间序列聚合**：按窗口自动选桶（5m / 30m / 2h / 6h，且不会小于 `CHECK_INTERVAL_SECONDS`），返回 `availability` 与 `avg_latency_ms`
- **管理员登录**：`admin` + `ADMIN_PASSWORD`，httpOnly cookie session（JWT），1 分钟最多 10 次登录尝试/每 IP
- **定时执行**：Cron 每分钟触发；用 `CHECK_INTERVAL_SECONDS` + D1 `meta.last_run_at` 做间隔控制

## 工程结构

- `apps/web`：React + MUI（Vite）状态页前端（Cloudflare Pages）
- `apps/worker`：Cloudflare Worker（Hono）API + Scheduled（D1）
- `db/schema.sql`：数据库结构参考
- `wrangler.toml`：Worker + D1 + cron 配置

## 环境变量

Worker 侧（Cloudflare 控制台/`wrangler secret put`）：

- `ADMIN_PASSWORD`（secret）
- `SESSION_SECRET`（secret，用于签名 session/JWT）
- `OPENAI_API_KEY`（secret）

Worker 侧（vars，可写在 `wrangler.toml` 或控制台 vars）：

- `ROUTER_BASE_URL`（默认 `https://router.tumuer.me/v1`）
- `HEAD_CHECK_URL`（默认 `https://router.tumuer.me/`）
- `CHECK_INTERVAL_SECONDS`（默认 `3600`，支持 `3600 / 60m / 1h / 60*60s`）

## 数据库（D1）

1) 创建 D1：

```bash
wrangler d1 create router_status
```

2) 把输出的 `database_id` 填到 `wrangler.toml` 的 `[[d1_databases]]` 里。

3) 应用迁移（远程）：

```bash
wrangler d1 migrations apply DB --remote --config wrangler.toml
```

本地开发（local）：

```bash
wrangler d1 migrations apply DB --local --config wrangler.toml
```

## 部署 Worker（API + Scheduled）

设置 secrets：

```bash
wrangler secret put ADMIN_PASSWORD --config wrangler.toml
wrangler secret put SESSION_SECRET --config wrangler.toml
wrangler secret put OPENAI_API_KEY --config wrangler.toml
# Tip: set `keep_vars = true` in wrangler.toml to avoid wiping Dashboard vars on deploy
```

部署：

```bash
bun run deploy:worker
```

## 部署 Pages（前端）

Cloudflare Pages 项目：

- **Build command**：`bash ./build.sh`（自动安装 bun 并构建）
- **Build output directory**：`apps/web/dist`

前端默认请求同域的 `/api/*`。

> 需要把 Worker 绑定到你的 Pages 域名的 `/api/*` 路径（Cloudflare Dashboard → Workers & Pages → Routes），这样 cookie 登录与同域调用都能工作。

### Pages ↔ Worker Route

After you deploy the Worker, add a route so that requests to your Pages domain are forwarded to the Worker:

- Pattern: `<your-pages-domain>/api/*`
- Worker: `router-status` (the Worker deployed from this repo)

Example patterns:

- `your-project.pages.dev/api/*`
- `status.router.tumuer.me/api/*`

## Cloudflare Git 自动部署（推荐）

本项目不依赖 GitHub Actions；推荐直接使用 **Cloudflare Dashboard 的 Git 集成**，让 Pages 与 Worker 都从同一个 GitHub Repo 自动构建/发布。

### Pages（前端）

直接使用 **Cloudflare Pages 绑定 GitHub Repo**：

- Build command：`bash ./build.sh`
- Build output directory：`apps/web/dist`

推送到 `main` 后 Pages 会自动构建并发布。

### Worker（API + 定时任务）

使用 Cloudflare 的 **Workers Git 集成（Workers Builds）** 创建/连接 Worker 项目到同一个 GitHub Repo，并按 `wrangler.toml` 自动部署。

首次部署前需要（只做一次）：

1) 创建 D1，并把真实 `database_id` 写入 `wrangler.toml` 的 `[[d1_databases]]`
2) 远程应用迁移（D1 schema）：

```bash
wrangler d1 migrations apply DB --remote --config wrangler.toml
```

3) 在 Cloudflare Dashboard → Worker → Settings → Variables 中设置 secrets：

- `ADMIN_PASSWORD`
- `SESSION_SECRET`
- `OPENAI_API_KEY`

> 注意：Cloudflare 的 Git 部署流程通常不会自动帮你跑 D1 migrations；后续每次新增迁移文件，都需要你再次手动执行上面的 `wrangler d1 migrations apply ... --remote`（或把它加入你的部署流程里）。

## 本地开发

安装依赖：

```bash
bun install
```

启动 Worker（另开一个终端）：

```bash
bun run dev:worker
```

> 本地 secret/vars：复制 `apps/worker/.dev.vars.example` 为 `apps/worker/.dev.vars` 并填入真实值。

启动前端（另开一个终端）：

```bash
bun run dev:web
```

访问：

- Web：`http://127.0.0.1:5173`
- Worker：`http://127.0.0.1:8787`

Vite 已内置把 `/api` 代理到 `8787`，前端可直接用相对路径调用 API。

### Mock API (frontend only)

Run web without Worker/D1:

```bash
bun run dev:web:mock
```

Mock admin login: `admin / admin`

## API

公共：

- `GET /api/public/summary`
- `GET /api/public/timeseries?type=head&window=24h`
- `GET /api/public/timeseries?type=model&model=text-embedding-3-small&window=7d`

管理（需登录）：

- `POST /api/admin/login { username, password }`
- `POST /api/admin/logout`
- `POST /api/admin/run`
- `GET /api/admin/results?type=model&model=...&limit=100`
