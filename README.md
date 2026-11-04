# EMRank Status Page

使用 **Bun 1.4.0+、Hono、SQLite、React + MUI** 的状态页。网络层由 Globalping 多地区 probe 采集，业务层由部署在腾讯云函数（SCF）中的 Node.js 20.19 拨测脚本真实请求并校验响应；一个应用提供 API、静态页面和数据聚合，通过服务器现有 Nginx 对外服务。

- **Globalping 网络层**：上海、北京、香港、东京、硅谷等地区 probe 请求 `HEAD /`、`GET /health`、`GET /v1/models`，只验证可达性、TLS、状态码和延迟。
- **腾讯云函数业务层**：每个地区部署一个 SCF 函数并开启函数 URL，真实发送 `POST /v1/embeddings`、`/v1/rerank`、`/v1/systemone`、`/v1/decisions`，由函数校验响应值；状态站按地区拉取结果。
- 统一视图与分地区视图：模型行显示整体可用率、p95、地区状态点，可展开查看每个地区的明细，也可切换成模型 × 地区矩阵。
- `MONITORING_MODE=mock` 提供确定性多地区模拟数据，页面显著标记“模拟数据”，用于无凭据联调。
- 管理员用户名密码登录，HttpOnly Cookie 会话有效期七天，每 IP 每分钟最多十次登录尝试。
- 管理页支持同步模型、选择 Embedding/Reranker/Decisions/System One、查看数据源状态和立即同步。

## Docker 部署

需要 Docker Compose 和服务器上已有的 Nginx。`compose.yaml` 默认拉取 [tumuer/router-status:latest](https://hub.docker.com/r/tumuer/router-status)，Bun `1.4.0` 和前后端程序已包含在镜像中。当前发布的镜像架构为 `linux/amd64`，适用于 x86_64 服务器。

在服务器的部署目录中放置 `compose.yaml` 和 `.env` 两个文件，按 [.env.example](.env.example) 填写管理员账号、密码、会话密钥和上游 API 密钥。数据写入同目录下的 `data/`。服务器无需项目源码、Dockerfile、Node.js 或 Bun。

```bash
# 在存放 compose.yaml 和已填写的 .env 的目录中执行
chmod 600 .env
docker compose pull app
docker compose up -d app
docker compose ps
docker compose logs --tail 100 app
```

如需固定版本，把 `compose.yaml` 的 `image` 改为 Docker Hub 上对应的 Git 提交号标签，再执行上述拉取和启动命令。

应用端口只绑定宿主机 `127.0.0.1:8787`，数据库及 WAL 文件都保存在宿主机 `./data`。停止、重建或升级容器会保留数据。部署默认为单实例。

容器启动脚本在数据目录挂载完成后，自动创建 `/app/data` 并将目录所有者设置为 `bun`（UID/GID 1000）、权限设置为 `0750`，随后切换到 `bun` 用户运行应用。首次部署无需手动创建或授权 `data` 目录。已有数据库文件不会被重建或递归修改权限；如果自行恢复备份，仍需确保数据库文件归 UID/GID 1000 所有。若通过 `user:` 指定非 root 用户启动容器，则跳过自动授权，使用挂载目录已有的权限。

源站不配置证书时，使用 [纯 HTTP Nginx 配置](deploy/nginx-http.conf.example)：只监听 `80` 端口，直接代理整个站点到 `http://127.0.0.1:8787`，没有 `443`、证书配置或 HTTPS 跳转。首页、`/admin`、`/api` 和静态资源共用这一份反代配置。

将文件中的 `status.example.com` 替换成实际域名，保存到 Nginx 已启用的配置目录，例如 `/etc/nginx/conf.d/router-status.conf`，然后检查并重载：

```bash
sudo nginx -t && sudo systemctl reload nginx
```

使用 Cloudflare 橙云代理且源站走 HTTP 时，将 Cloudflare 的 SSL/TLS 加密模式设为 **Flexible**：浏览器可以通过 HTTPS 访问 Cloudflare，Cloudflare 到源站使用 HTTP/80。如果浏览器到 Cloudflare 也只使用 HTTP，则设为 **Off**，并关闭 **Always Use HTTPS** 及适用于该站点的 HTTPS 重定向规则。

Compose 已设置 `TRUST_PROXY=true`；直接运行 Bun 并接入 Nginx 时，在 `.env` 中设置 `TRUST_PROXY=true` 后重启后端。示例配置由 Nginx 覆盖转发头，应用端口继续只绑定本机。

源站需要自行提供 HTTPS 时，可使用 [带证书的 Nginx 配置](deploy/nginx.conf.example)，替换域名和证书路径后启用。

镜像内包含 curl，Compose 每 30 秒用它请求 `GET /healthz`，检查进程及数据库连接。探测失败属于被监控服务的状态，不会使容器健康检查失败。

## 配置

`.env` 是统一服务端配置入口：Docker 部署时与 `compose.yaml` 放在同一目录，由 Compose 的 `env_file` 注入；本地开发时放在项目根目录，由 Bun 加载。真实 `.env` 和数据库不会进入 Git 或构建镜像。

| 变量 | 默认值 / 用途 |
| --- | --- |
| `ADMIN_USERNAME` | 必填，管理员用户名；示例为 `admin` |
| `ADMIN_PASSWORD` | 必填，无默认密码 |
| `SESSION_SECRET` | 必填，独立的随机会话签名密钥；更换后原 Cookie 失效 |
| `MONITORING_MODE` | `live`（Globalping + 云函数拨测）、`mock`（确定性模拟数据）、`direct`（仅直连测试） |
| `OPENAI_API_KEY` | 管理页同步 `GET /v1/models` 使用；Globalping 不会使用它 |
| `ROUTER_BASE_URL` | `https://emrank.tech/v1`，包含 API 前缀 |
| `HEAD_CHECK_URL` | `https://emrank.tech/`，旧直连/兼容检查使用 |
| `MONITOR_REGIONS_FILE` | 可选地区定义 JSON；不存在时使用内置上海/北京/香港/东京/硅谷 |
| `GLOBALPING_TARGET_URL` | `https://emrank.tech`，Globalping probe 的目标 origin |
| `GLOBALPING_TOKEN` | 可选 Globalping API token；不配置时使用匿名额度 |
| `GLOBALPING_INTERVAL_SECONDS` | 默认 `300`，网络层同步间隔 |
| `GLOBALPING_HEALTH_PATH` | 默认 `/health` |
| `GLOBALPING_MODELS_PATH` | 默认 `/v1/models` |
| `CLOUD_PROBE_TOKEN` | 与每个 SCF 函数的 `PROBE_TOKEN` 一致；通过 `x-probe-token` 发送 |
| `CLOUD_PROBE_INTERVAL_SECONDS` | 默认 `30`，业务层同步间隔 |
| `CLOUD_PROBE_TIMEOUT_MS` | 默认 `30000`，状态站调用函数 URL 的 HTTP 超时 |
| `CLOUD_PROBE_PROBE_TIMEOUT_MS` | 默认 `15000`，传给函数的单次上游请求超时 |
| `CLOUD_PROBE_CONCURRENCY` | 默认 `4`，每个地区并发调用函数的数量 |
| `TENCENTCLOUD_SECRET_ID` | CAM 调用身份的 SecretId，云函数拨测必填 |
| `TENCENTCLOUD_SECRET_KEY` | 对应 SecretKey，仅在 Bun 服务端计算签名，不发送给函数 |
| `TENCENTCLOUD_UIN` | 主账户 UIN（数字字符串），不是 APPID，也不是子账户 UIN |
| `TENCENTCLOUD_TOKEN` | 使用 STS 临时凭据时填写对应 Token；永久密钥留空 |
| `CHECK_INTERVAL_SECONDS` | 调度 tick 上限，默认 `300`；实际 tick = min(本值, 两个来源间隔) |
| `DECISION_TEST_MODEL` | 默认 `typesafe/jev-latest`，直连/mock 决策探测使用的模型 |
| `DATABASE_PATH` | `./data/status.sqlite`，相对项目根目录解析 |
| `HOST` / `PORT` | 本地默认 `127.0.0.1` / `8787` |
| `TRUST_PROXY` | 本地默认 `false`；开启后信任 Nginx 覆盖的 `X-Real-IP` 和 `X-Forwarded-Proto` |

生成会话密钥：

```bash
openssl rand -hex 32
```

Compose 固定容器内 `HOST=0.0.0.0`、`PORT=8787`、`DATABASE_PATH=/app/data/status.sqlite`、`TRUST_PROXY=true`。修改其它 `.env` 配置后执行 `docker compose up -d --force-recreate app`，单纯 `restart` 不会重新注入环境变量。

例如，要让网络层每 5 分钟同步、模型层每 30 秒同步，在根目录 `.env` 中设置：

```dotenv
GLOBALPING_INTERVAL_SECONDS=300
CLOUD_PROBE_INTERVAL_SECONDS=30
CHECK_INTERVAL_SECONDS=300
```

直接运行 Bun 时，修改后重启后端进程；Docker 部署按上面的命令重建容器。调度器按固定时间边界触发：tick 取 `CHECK_INTERVAL_SECONDS`、Globalping 间隔、Cloud Probe 间隔三者的最小值（默认 30 秒），每个来源按自己的间隔判断是否到期。手动“立即同步”会同时触发两个来源，不会推迟下一次定时同步。

状态页在可见时每 60 秒自动更新，切回页面时立即更新；后台更新不会清空当前页面。页面的“显示范围”（最近 5 小时、24 小时等）只控制统计窗口和图表，不改变 Globalping/云函数拨测的采集频率。色块提示显示完整时间段；“上次检测”使用来源的真实检测时间，不使用时间段起点。

## 模型配置流程

1. 在 `.env` 中配置上游地址、`OPENAI_API_KEY`、Globalping 和云函数拨测参数，并启动或重建应用。
2. 打开 `/admin`，使用配置的用户名和密码登录。
3. 点击“同步模型列表”。仅拉取候选列表，不执行推理，不修改现有探测项。
4. 确认 Embedding / Reranker / Decisions / System One 类型，勾选模型并保存。
5. 在 `data/regions.json` 中为每个地区填入对应的 SCF 函数 URL（`probe_url`，HTTPS 根地址，不附加路径或查询参数），并确保 `.env` 的 `CLOUD_PROBE_TOKEN` 与函数一致。把函数 URL 的认证方式设置为 **CAM 鉴权**，给调用身份授予目标函数的 `scf:InvokeFunctionUrl` 权限，在服务端 `.env` 中填写 `TENCENTCLOUD_SECRET_ID`、`TENCENTCLOUD_SECRET_KEY` 和主账户 `TENCENTCLOUD_UIN`。
6. 点击“立即同步”做一次联调。若使用 `MONITORING_MODE=mock`，无需任何外部凭据即可看到完整模拟数据。

类型识别优先使用上游 `type`、`model_type`、`task`、`capabilities` 或支持的端点信息。名称仅提供建议；`typesafe/jev-*` 会建议为 Decisions。明确属于其他类型的候选不可选；仍可使用手动添加功能配置上游未列出的模型。

云函数脚本位于 [`deploy/tencent-scf`](deploy/tencent-scf)，部署、环境变量和函数 URL 配置见该目录的 README。状态站不再需要 Site24x7 账号或 monitor；模型检查项只需要启用，并由至少一个地区的函数 URL 覆盖。

服务端按[腾讯云函数 URL CAM 文档](https://www.tencentcloud.com/zh/document/product/583/69493)使用内置 `node:crypto` 为每次 POST 生成 `TC3-HMAC-SHA256` 签名，发送 `Authorization`、`X-Scf-Cam-Uin`、`X-Scf-Cam-Timestamp`；临时凭据另外发送 `X-Scf-Cam-Token`。签名覆盖实际请求体和对应地区 Host，使用 UTC 日期和秒级时间戳。CAM 凭据缺失或 UIN 无效时不发送拨测请求，不回退匿名访问。

**必须在腾讯云控制台启用 CAM 鉴权，单靠客户端增加签名不会关闭匿名访问。** 原有 `x-probe-token` 作为函数内的第二层校验继续保留，云函数脚本无需为 CAM 修改。CAM 密钥只保存在状态站服务端；临时凭据到期后需更新三项临时凭据并重启服务。

同步失败不会覆盖当前选择；已配置但上游暂时未列出的模型仍保留显示。取消选择只停用并保留历史，原有 Delete 操作会删除该检查项及其历史。修改同名模型的类型会创建对应类型的检查项并停用原类型，原历史保留。

首次启动创建空数据库，自动迁移并初始化 `net:root` / `net:health` / `net:models` 三个网络检查；旧版 `head:router` 会保留历史但停用。持久化的运行记录防止重启后在同一时段重复定时同步。已有一轮运行时，新的手动运行返回 `409`。容器日志记录每轮同步的开始时间和总耗时。

## 监控数据源：Globalping + 腾讯云函数

状态站不直接对生产上游发请求。网络层由 Globalping 的全球 probe 采集，业务层由部署在各地区的腾讯云 SCF 函数真实请求并校验响应；状态站负责调用函数 URL、落库、聚合和展示。

### 网络层：Globalping

- 每个地区一组 probe，请求三个端点：
  - `HEAD /`：接受 2xx/3xx。
  - `GET /health`：接受 200。
  - `GET /v1/models`：接受 200 或 401；**不发送路由器 API Key**，401 只说明端点可达，不验证鉴权。
- 结果按 probe 的 `city/country` 映射到地区；`timings.total` 作为延迟，记录状态码和错误。
- 某地区没有可用 probe 时不写失败记录，页面显示灰色“无数据”，不拉低可用率。
- 匿名额度为 250 tests/hour、单个 measurement 最多 50 probes；3 个端点 × 3 个地区 × 每 5 分钟 = 108 tests/hour，默认够用。需要更多额度时在 https://dash.globalping.io/tokens 生成 `GLOBALPING_TOKEN`。
- 2026-11-04 查询 `/v1/probes`：上海 5 个、北京 8 个、香港 107 个、东京 133 个、圣何塞 34 个 probe（探针数会波动）。中国大陆 probe 较少，香港和海外城市更稳定；需要更稳定的亚太覆盖时，可在地区文件里增加新加坡等城市。
- 地区文件默认内置上海/北京/香港/东京/硅谷；`globalping` 字段支持用 `|` 分隔多个城市别名，例如硅谷使用 `San Jose+US|Santa Clara+US|San Francisco+US`，香港使用 `Hong Kong+HK|Tsuen Wan+HK`。需要修改时把 `deploy/regions.example.json` 复制到宿主机 `data/regions.json`，并设置 `MONITOR_REGIONS_FILE=./data/regions.json`。复制后只给已部署函数的地域填写 `probe_url`，未部署地区保持空字符串（空值表示未配置，不会阻止服务启动）。Docker 运行镜像只挂载 `./data`，不会复制 `deploy/`。

### 业务层：腾讯云函数拨测

#### 部署方式

- 每个地区部署一个 SCF 函数，**函数类型选择事件函数（Event Function），不要选 Web 函数**；函数 URL 只是触发器。运行环境选择 **Nodejs 20.19**，执行方法为 `index.main_handler`。
- 函数代码位于 [`deploy/tencent-scf`](deploy/tencent-scf)，只使用 Node.js 内置 API（Node 20 的 `fetch` / undici），没有第三方依赖。上传 **`index.mjs`（ES Module，不要用 CommonJS 的 `index.js`）** 和可选的 `package.json`，然后开启**函数 URL**。
- 函数环境变量：
  - `PROBE_TOKEN`：与状态站 `CLOUD_PROBE_TOKEN` 一致，通过 `x-probe-token` 校验。不配置时函数默认拒绝 HTTP 调用。
  - `PROBE_TIMEOUT_MS`：可选，单次上游请求超时，默认 `15000`。
- 请求体中的 `target` 和 `apiKey` 由状态站按次传入，API Key 不保存在函数环境变量中。
- 地区从 SCF 内置的 `context.tencentcloud_region` 读取，原始 region id 写入 `location_name`；页面展示的中文名由 `data/regions.json` 的 `label` 决定，函数内不维护地区映射表。
- 函数超时建议 30 秒；内存 64 MB 即可（本地连续 100 次探测实测 RSS 约 54 MB），如控制台允许可设 128 MB。单次调用只探测一个模型检查。
- 把每个地区的函数 URL 填入 `data/regions.json` 的 `probe_url`（参考 [`deploy/regions.example.json`](deploy/regions.example.json)），重启状态站后生效。
- 当前默认地区与 SCF Region 的对应关系：上海 `ap-shanghai`、北京 `ap-beijing`、香港 `ap-hongkong`、东京 `ap-tokyo`、硅谷 `na-siliconvalley`。SCF 地域列表见 [583/17238](https://cloud.tencent.com/document/product/583/17238)；**没有 `na-losangeles`**，美国西部请使用 `na-siliconvalley`；也没有标准 `ap-shenzhen` 和 `ap-taipei`。

#### 数据流与格式

- 状态站对每个启用的模型检查、每个配置了 `probe_url` 的地区各调用一次函数 URL。
- 函数返回与 Site24x7 `current_status` 兼容的 JSON：`{ code: 0, data: { status, last_polled_time, attribute_value, unit, down_reason, locations: [...] } }`。状态站复用原有解析逻辑，按请求对应的地区 ID 落库，来源记为 `cloudprobe`。
- 状态映射：`1=Up`；`0/2/3=Down/Trouble/Critical` 记为失败；`5/7/9/10` 记为无数据。函数本身只返回 1 或 0。
- 上游请求失败时函数仍返回 HTTP 200，通过 `data.status=0` 和 `data.down_reason` 表达；只有鉴权失败、参数错误或函数内部异常才返回非 200。状态站遇到函数错误时只记录“数据源错误”，不会把模型标成 Down。
- 从 Site24x7 切换后，历史 `source=site24x7` 的结果仍保留在数据库和管理页，但不再计入当前来源统计；新的云函数结果从首次同步开始累计。
- 函数日志记录 check、地区、状态码、延迟和错误，不记录 API Key。

#### 探测规则

| `check.type` | 请求 | 成功条件 |
| --- | --- | --- |
| `model` | `POST {target}/embeddings` | `data[0].embedding` 为非空数组 |
| `rerank` | `POST {target}/rerank` | `results` 或 `data` 为非空数组 |
| `systemone` | `POST {target}/systemone` | `answers.probe.type === "noul"` 且 `noul ∈ [0,1]` |
| `decisions` | `POST {target}/decisions` | 同上 |

请求体与状态站直连探测保持一致。函数只接受 HTTPS 目标，请求体上限 64 KB，模型名上限 200 字符。

完整部署步骤、请求/响应示例和 Node.js 20.19 本地测试命令见 [`deploy/tencent-scf/README.md`](deploy/tencent-scf/README.md)。

### 统一视图与分地区视图

- **统一**：可用率按所有地区样本加权；p95 汇总全部地区延迟样本；模型行状态取“最差地区状态”，行内地区状态点展示每个地区的最新状态。
- **分地区**：选择任一地区后，可用率、延迟和 uptime bar 只统计该地区；其他地区状态点保留但弱化。
- 展开模型行可查看每个地区的可用率、平均/p95、上次检测和小 uptime bar；也可以切换到“地区矩阵”横向比较模型 × 地区。
- 无数据地区显示灰色“无数据”，不计入失败率；未配置云函数拨测的模型显示“未配置拨测”。
- 新数据源的历史从接入时开始累计。旧直连结果保留在管理页，但不会和新来源混算；mock 模式播种完整 30 天，便于验收页面。

## 本地开发与验证

需要 Bun 1.4.0 或以上。本机如果仍是旧版本，请先升级；前端构建也由 Bun 执行。

```bash
bun install --frozen-lockfile
cp .env.example .env
# 填写 .env；联调阶段可先设 MONITORING_MODE=mock
bun run dev:server
# 另一个终端
bun run dev:web
```

前端为 `http://127.0.0.1:5173`，通过 Vite 将 `/api` 代理到本地 `8787`。开发时保持后端默认端口，或同步调整 Vite 的代理地址。

无外部凭据的联调推荐使用服务端 mock 模式：

```bash
MONITORING_MODE=mock DATABASE_PATH=./data/mock.sqlite bun run dev:server
bun run dev:web
```

页面会显示 3 个地区卡、5 个示例模型、统一/分地区切换和“模拟数据”提示。也可以使用纯前端 mock：`bun run dev:web:mock`，模拟登录为 `admin / admin`，不启动后端。

```bash
bun run typecheck
bun run test
bun run build:web
bun run start
```

云函数使用独立的 Node.js 20.19 运行时，本地用 fnm 安装并测试：

```bash
fnm install 20.19.6
cd deploy/tencent-scf
fnm exec --using=20.19.6 -- node --test test
```

其中 `test/memory.test.mjs` 会连续探测 100 次并断言 RSS 低于 64 MB（本地实测约 54 MB）。

构建后也可以直接访问 `http://127.0.0.1:8787`。测试使用临时 SQLite、本地模拟上游和注入的 Globalping/云函数 fetch，不调用真实外部服务。

工程主要目录：`apps/server` 为 API、Globalping/云函数拨测聚合和调度服务，`apps/web` 为前端，`deploy/tencent-scf` 为云函数，`db/migrations` 为版本化 SQL。迁移编号对应 SQLite `user_version`；新增迁移使用递增编号，不修改已部署的迁移文件。当前不自动清理历史记录。

## 备份、恢复与升级

使用 SQLite `VACUUM INTO` 生成包含已提交 WAL 数据的一致性备份，可以在运行期间执行；目标文件必须尚不存在。

```bash
docker compose exec --user bun app bun run db:backup ./data/backups/status-2026-10-03.sqlite
# 非容器环境
bun run db:backup ./data/backups/status-2026-10-03.sqlite
```

备份会写到持久化数据目录，定期复制到服务器外保存。

恢复时先停止应用，将当前主数据库及同名 `-wal`、`-shm` 文件一并移到单独的留存目录，再把选定备份复制为 `data/status.sqlite`，确保 UID/GID 1000 可读写后启动。不要将旧 WAL/SHM 文件与恢复后的主文件混用。

升级前先备份，再拉取镜像并更新容器：

```bash
docker compose pull app
docker compose up -d app
```

如果使用固定版本标签，先修改 `compose.yaml` 中的 `image`。需要回滚数据库结构时，使用与旧镜像匹配的备份；应用会拒绝打开版本比自身迁移更新的数据库。

本次从空库开始，不导入旧平台历史。新站登录、同步、探测和页面验证成功后，再停用旧站定时任务并切换站点流量；旧服务资源不由本项目自动删除。

## API

公共接口：

- `GET /api/public/overview?window=5h|24h|7d|30d`：首屏聚合数据，包含 `mode`、`regions`、`gateway`（端点 + 地区卡）、`models`（整体 + 分地区 + series）和 `sources` 状态。
- `GET /api/public/summary`：原有汇总结构，并新增 `provider`、`stats_by_region`、`last_by_region`。
- `GET /api/public/timeseries?type=head|model|rerank|systemone|decisions&model=...&window=...&region=all|<地区 id>&check_id=...`：`type=head` 映射到当前网络根检查 `net:root`；旧 `head:router` 历史用 `check_id=head:router` 查询。

管理接口需要登录后的 Cookie：

- `POST /api/admin/login`：`{ username, password }`
- `POST /api/admin/logout`
- `POST /api/admin/run` / `POST /api/admin/sources/sync`：立即同步所有到期来源（并发时返回 `409`）
- `GET /api/admin/sources`：模式、地区（含 `probeUrl`）、数据源配置/最近同步/错误
- `GET /api/admin/results?check_id=...&region=...&limit=100`：也兼容 `type`/`model`
- `GET /api/admin/checks`
- `POST /api/admin/checks`：`{ type, model, enabled? }`，`type` 支持 `model|rerank|systemone|decisions`
- `PATCH /api/admin/checks`：`{ id, enabled }`；只更新启用状态
- `DELETE /api/admin/checks`：`{ id }`
- `GET /api/admin/models`：返回 `{ models: [{ id, detected_type, suggested_type, unsupported }] }`
- `PUT /api/admin/checks/selection`：`{ checks: [{ model, type }] }`，完整替换启用集合，保留未选中项的历史；空数组停用全部模型项

内部 `type=model` 表示 embedding，`type=rerank` 表示 reranker，`systemone`/`decisions` 分别对应两个决策端点。`results` 现在带 `region_id` 和 `source`，公共 overview 只统计当前来源，避免旧直连结果与新来源混算。上游鉴权错误返回 `502`，超时返回 `504`，未配置上游密钥返回 `503`，不会使本站管理员退出登录。


## 公共模型名称协调迁移

网关改为作者/模型名时，停止状态站进程和调度器，使用网关审阅过的 `deploy/public-models-20261017.json`（仅名字映射，不含密钥）：

```sh
bun apps/server/src/public-model-cutover.ts preview data/status.sqlite public-models-20261017.json
bun apps/server/src/public-model-cutover.ts apply data/status.sqlite public-models-20261017.json backups/before-public-models.sqlite
# 需要回退时，先停止进程：
bun apps/server/src/public-model-cutover.ts rollback data/status.sqlite
```

apply 必须提供不存在的备份路径，先 VACUUM INTO，再用一个 SQLite 事务改名/合并。所有历史结果保留，不按时间去重；已有目标探针保持原启停，新目标仅在原来源至少一个启用时启用。不合并不同网关地址。原检查与结果来源记录在数据库迁移日志中。

回退恢复旧检查及每条旧结果的来源，迁移后产生的结果保留其实际新身份；若新身份原来不存在，该探针回退后停用。配置被编辑后拒绝自动回退。不要恢复整库丢失切换后的结果。此工具不在启动时自动执行。2026-10-17 已部署 `tumuer/router-status:deploy-20261017-public-models-8f466aa`，按网关审阅映射完成迁移，4,793 条原结果全部保留；切换后首轮 17 项定时检查全部成功。生产入口为 https://status.emrank.tech。本次 Globalping + 云函数拨测改造后，网络层默认 300 秒、模型层默认 900 秒；旧 `head:router` 保留历史但停用。
