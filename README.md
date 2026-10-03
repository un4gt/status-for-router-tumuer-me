# Router Status Page

使用 **Bun 1.4.0+、Hono、SQLite、React + MUI** 的状态页。一个应用提供 API、静态页面和定时探测，通过服务器现有 Nginx 对外服务。

- HEAD、Embedding、Reranker 探测，记录状态码、延迟和错误。
- 最近 `5h / 24h / 7d / 30d` 可用率及时间序列，统计口径保持原有行为。
- 管理员用户名密码登录，HttpOnly Cookie 会话有效期七天，每 IP 每分钟最多十次登录尝试。
- 从上游同步模型列表，识别/确认类型，选择模型后立即探测并启动周期探测。
- 管理页支持手动添加、启停、删除检查项和立即探测。

## Docker 部署

需要 Docker Compose 和服务器上已有的 Nginx。镜像固定使用 Bun `1.4.0`，构建时执行类型检查、测试和前端构建。

```bash
cp .env.example .env
# 编辑 .env，填写账号、密码、会话密钥和上游 API 密钥
chmod 600 .env
# 容器使用 bun 用户（UID/GID 1000），目录需要可写
sudo install -d -m 0750 -o 1000 -g 1000 data
docker compose up -d --build
docker compose ps
docker compose logs --tail 100 app
```

应用端口只绑定宿主机 `127.0.0.1:8787`，数据库及 WAL 文件都保存在宿主机 `./data`。停止、重建或升级容器会保留数据。部署默认为单实例。

参考 [Nginx 配置](deploy/nginx.conf.example)，替换域名和证书路径，接入已有 Nginx。整个站点代理到 `http://127.0.0.1:8787`，TLS 由 Nginx 终止；`/admin` 刷新不需要额外的静态文件配置。检查配置后重载 Nginx。

`GET /healthz` 检查进程及数据库连接，供 Docker 健康检查使用。探测失败属于被监控服务的状态，不会使容器健康检查失败。

## 配置

根目录 `.env` 是统一服务端配置入口，本地由 Bun 加载，Docker 由 Compose 的 `env_file` 注入。真实 `.env` 和数据库不会进入 Git 或构建镜像。

| 变量 | 默认值 / 用途 |
| --- | --- |
| `ADMIN_USERNAME` | 必填，管理员用户名；示例为 `admin` |
| `ADMIN_PASSWORD` | 必填，无默认密码 |
| `SESSION_SECRET` | 必填，独立的随机会话签名密钥；更换后原 Cookie 失效 |
| `OPENAI_API_KEY` | 同步模型及模型探测使用的上游密钥；不配置时仍可进行 HEAD 探测 |
| `ROUTER_BASE_URL` | `https://router.tumuer.me/v1`，包含 API 前缀，上游需提供 `/models`、`/embeddings`、`/rerank` |
| `HEAD_CHECK_URL` | `https://router.tumuer.me/` |
| `CHECK_INTERVAL_SECONDS` | 默认 `3600`；每 5 分钟探测一次可设为 `300` 或 `5m`，也支持 `3600s / 60m / 1h / 60*60s`；空值或无效值使用默认值 |
| `DATABASE_PATH` | `./data/status.sqlite`，相对项目根目录解析 |
| `HOST` / `PORT` | 本地默认 `127.0.0.1` / `8787` |
| `TRUST_PROXY` | 本地默认 `false`；开启后信任 Nginx 覆盖的 `X-Real-IP` 和 `X-Forwarded-Proto` |

生成会话密钥：

```bash
bun -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Compose 固定容器内 `HOST=0.0.0.0`、`PORT=8787`、`DATABASE_PATH=/app/data/status.sqlite`、`TRUST_PROXY=true`。修改其它 `.env` 配置后执行 `docker compose up -d --force-recreate app`，单纯 `restart` 不会重新注入环境变量。

例如，要改成每 5 分钟探测一次，在根目录 `.env` 中设置：

```dotenv
CHECK_INTERVAL_SECONDS=300
```

直接运行 Bun 时，修改后重启后端进程；Docker 部署按上面的命令重建容器。调度器每 60 秒检查一次是否到期，按上次探测开始时间计算间隔，不会并发运行多轮探测。页面的“显示范围”（最近 5 小时、24 小时等）只控制历史数据展示，不改变探测频率。

## 模型配置流程

1. 在 `.env` 中配置上游地址、API 密钥，并启动或重建应用。
2. 打开 `/admin`，使用配置的用户名和密码登录。
3. 点击“同步模型列表”。仅拉取候选列表，不执行推理，不修改现有探测项。
4. 确认 Embedding / Reranker 类型，勾选模型，点击“保存并开始探测”。

类型识别优先使用上游 `type`、`model_type`、`task`、`capabilities` 或支持的端点信息。名称仅提供建议，类型缺失或冲突时必须手动确认。明确属于其他类型的候选不可选；仍可使用原有手动添加功能配置上游未列出的模型。

同步失败不会覆盖当前选择；已配置但上游暂时未列出的模型仍保留显示。取消选择只停用并保留历史，原有 Delete 操作会删除该检查项及其历史。修改同名模型的类型会创建对应类型的检查项并停用原类型，原历史保留。

首次启动创建空数据库，只初始化 HEAD 项，不添加固定的模型列表。数据库结构在启动时自动迁移。定时器启动时检查是否到期，此后每 60 秒检查一次，持久化上次开始时间；间隔小于一分钟时实际仍受一分钟检查频率限制。手动运行会重置间隔起点。已有一轮运行时，新的手动运行返回 `409`，定时触发跳过；刚保存的模型选择会在下一轮使用。

## 本地开发与验证

需要 Bun 1.4.0 或以上。本机如果仍是旧版本，请先升级；前端构建也由 Bun 执行。

```bash
bun install --frozen-lockfile
cp .env.example .env
# 填写 .env
bun run dev:server
# 另一个终端
bun run dev:web
```

前端为 `http://127.0.0.1:5173`，通过 Vite 将 `/api` 代理到本地 `8787`。开发时保持后端默认端口，或同步调整 Vite 的代理地址。

```bash
bun run typecheck
bun run test
bun run build:web
bun run start
```

构建后也可以直接访问 `http://127.0.0.1:8787`。测试使用临时 SQLite 和本地模拟上游，不调用真实模型接口。`bun run dev:web:mock` 保留纯前端模拟模式，模拟登录为 `admin / admin`，包含 embedding/reranker 和待确认类型的模型。

工程主要目录：`apps/server` 为 API 和探测服务，`apps/web` 为前端，`db/migrations` 为版本化 SQL。迁移编号对应 SQLite `user_version`；新增迁移使用递增编号，不修改已部署的迁移文件。当前不自动清理历史记录。

## 备份、恢复与升级

使用 SQLite `VACUUM INTO` 生成包含已提交 WAL 数据的一致性备份，可以在运行期间执行；目标文件必须尚不存在。

```bash
docker compose exec app bun run db:backup ./data/backups/status-2026-10-03.sqlite
# 非容器环境
bun run db:backup ./data/backups/status-2026-10-03.sqlite
```

备份会写到持久化数据目录，定期复制到服务器外保存。

恢复时先停止应用，将当前主数据库及同名 `-wal`、`-shm` 文件一并移到单独的留存目录，再把选定备份复制为 `data/status.sqlite`，确保 UID/GID 1000 可读写后启动。不要将旧 WAL/SHM 文件与恢复后的主文件混用。

升级前先备份，然后执行 `docker compose up -d --build`。需要回滚数据库结构时，使用与旧镜像匹配的备份；应用会拒绝打开版本比自身迁移更新的数据库。

本次从空库开始，不导入旧平台历史。新站登录、同步、探测和页面验证成功后，再停用旧站定时任务并切换站点流量；旧服务资源不由本项目自动删除。

## API

公共接口保持原有路径和响应格式：

- `GET /api/public/summary`
- `GET /api/public/timeseries?type=head|model|rerank&model=...&window=5h|24h|7d|30d`

管理接口需要登录后的 Cookie：

- `POST /api/admin/login`：`{ username, password }`
- `POST /api/admin/logout`
- `POST /api/admin/run`
- `GET /api/admin/results?type=...&model=...&limit=100`
- `GET /api/admin/checks`
- `POST /api/admin/checks`：`{ type, model, enabled? }`
- `PATCH /api/admin/checks`：`{ id, enabled }`
- `DELETE /api/admin/checks`：`{ id }`
- `GET /api/admin/models`：返回 `{ models: [{ id, detected_type, suggested_type, unsupported }] }`
- `PUT /api/admin/checks/selection`：`{ checks: [{ model, type }] }`，完整替换启用集合，保留未选中项的历史；空数组停用全部模型项

内部 `type=model` 表示 embedding，`type=rerank` 表示 reranker。候选的识别/建议类型可为 `null`，保存时必须显式指定类型。上游鉴权错误返回 `502`，超时返回 `504`，未配置上游密钥返回 `503`，不会使本站管理员退出登录。
