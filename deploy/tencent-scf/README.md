# 腾讯云 SCF 拨测函数（Node.js 20.19）

每个地区部署一份本函数并开启 **函数 URL**。状态站按地区主动调用函数 URL，请求中携带 `target`、`apiKey` 和单个 `check`；函数对目标发起真实的模型请求，然后返回与 Site24x7 `current_status` 兼容的 JSON。函数所在地域从 `context.tencentcloud_region` 获取，用于生成 `location_name`。

```
状态站 collector
  └─ POST https://<region>.tencentscf.com/   (每个 check × 每个地区一次)
       headers: x-probe-token: <CLOUD_PROBE_TOKEN>
       body: { target, apiKey, check, timeoutMs }
  ← { code: 0, data: { status, locations: [{ location_name, status, attribute_value, ... }] } }
```

## 文件

| 文件 | 用途 |
| --- | --- |
| `index.mjs` | ES Module 入口，使用 `import` / `export`；执行方法为 `index.main_handler`。**不要改成 CommonJS 的 `index.js`** |
| `package.json` | 无第三方依赖；`npm test` 运行本地测试 |
| `test/index.test.mjs` | 基于 `node:test` + 本地 HTTP 上游的 ES Module 功能测试 |
| `test/memory.test.mjs` | 连续探测 100 次后的 RSS 必须低于 64 MB |
| `.node-version` | 本地开发使用的 Node.js 版本 |

## 本地测试（Node.js 20.19）

```bash
fnm install 20.19.6        # 首次
cd deploy/tencent-scf
fnm exec --using=20.19.6 -- node --test test
```

`package.json` 里的 `npm test` 等价于 `node --test test`。

测试会启动一个本地 HTTP 上游，覆盖 embedding / rerank / systemone / decisions、鉴权、目标校验、直接调用和 **64 MB RSS 预算**，不会访问真实上游。

## 内存预算

- 使用 Node 20 内置 `fetch`（undici），无第三方 HTTP 客户端依赖。
- 使用 `AbortSignal.timeout` 控制单次请求超时；响应体上限 1 MB。
- 不加载 `node:crypto`，token 比较使用 Buffer 常量时间循环。
- 显式 `import { Buffer } from 'node:buffer'` 和 `import { URL } from 'node:url'`，避免 SCF ESM 沙箱缺少全局对象。
- Node.js 20.19 本地实测：连续 100 次探测后 RSS 约 **54 MB**，低于硬性要求 64 MB；`test/memory.test.mjs` 会在超限时失败。

## `client.ms_elapsed is not a function` 排查

`fetch-v2` 在发出上游请求前会调用 `context.getRemainingTimeInMillis()`，且没有保护这个平台方法的异常。如果该方法抛出 `client.ms_elapsed is not a function`，就会进入外层 `probe_failed` 分支并返回 HTTP 500。本地模拟已复现这一过程；此前将错误归因于 HTTP 客户端插桩缺乏依据。

`fetch-v3` 为剩余时间查询增加异常保护：查询失败时使用请求中的 `timeoutMs`、环境变量 `PROBE_TIMEOUT_MS` 或默认 15000 毫秒，仍限制在 500–30000 毫秒之间，并通过 `AbortSignal.timeout` 控制请求。平台方法正常时，继续按剩余时间预留 1 秒。当前部署的函数执行超时为 10 秒；它独立于状态站每 30 秒一次的拨测间隔。若平台剩余时间查询失败且请求超过 10 秒，平台会先终止函数并返回超时。

重新上传 `index.mjs` 后，GET 函数 URL 的 `meta.version` 应为 `fetch-v3`。本地测试覆盖平台方法抛错后仍完成真实本地 HTTP 探测；云端效果需要部署后验证。

## 为什么选事件函数而不是 Web 函数

- 本场景是“状态站发一次请求 → 函数探测一个模型 → 返回 JSON”，没有常驻 HTTP 服务的需求。
- 事件函数只需要导出 `main_handler(event, context)`；函数 URL 把 HTTP 请求转换成 `event`，再把返回的 `{ statusCode, headers, body }` 转换成 HTTP 响应。
- Web 函数要求进程监听 `0.0.0.0:9000`，更适合 Express/Koa 等常驻 Web 服务，对当前脚本是多余的。
- **函数 URL 是触发器/访问方式，不是函数类型**；事件函数和 Web 函数都可以绑定函数 URL。

参考：腾讯云《事件函数开发规范》（文档 583/9210）与《Web 函数》（文档 583/56124）。

## 部署（每个地区一个函数）

1. 在腾讯云云函数控制台新建函数：
   - **函数类型：事件函数（Event Function），不要选 Web 函数**
   - 运行环境：**Nodejs 20.19**
   - 执行方法：`index.main_handler`
   - 函数代码：上传 **`index.mjs`**（ES Module）和可选的 `package.json`（没有依赖）。不要上传成 CommonJS 的 `index.js`；`.mjs` 里使用 `require`/`module.exports` 会直接报 `0 code exit unexpected`
   - 如果代码放在 `src/index.mjs`，执行方法必须写成 `src/index.main_handler`；或者把文件移到包根目录并保持 `index.main_handler`
   - 执行超时：当前使用 **10 秒**（单次只探测一个 check，五个地区的 embedding 拨测已验证通过）
   - 内存：**64 MB** 即可（本地实测 RSS 约 54 MB；如控制台允许，128 MB 更稳）

   > 事件函数通过 `event` 接收 HTTP 请求，并返回 `{ statusCode, headers, body }`；函数 URL 只是触发器。Web 函数要求代码自行监听 `0.0.0.0:9000` 并常驻 HTTP Server，本脚本不是这种形态，选错会启动失败。
2. 配置环境变量：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `PROBE_TOKEN` | 推荐 | 函数 URL 的共享密钥；状态站的 `CLOUD_PROBE_TOKEN` 必须与它一致。不配置时函数会拒绝 HTTP 调用 |
| `PROBE_TIMEOUT_MS` | 否 | 单次上游请求超时，默认 `15000`，最大 `30000` |
| `PROBE_ALLOW_HTTP` | 否 | 仅本地测试用；设为 `1` 才允许 `http://` 目标 |
| `PROBE_ALLOW_INSECURE` | 否 | 仅本地测试用；设为 `1` 时允许没有 `PROBE_TOKEN` 的 HTTP 调用 |

   函数所在地域直接读取内置 `context.tencentcloud_region`，并以原始 region id（如 `ap-shanghai`、`ap-tokyo`、`na-siliconvalley`）写入 `location_name`；页面展示的中文地区名由状态站 `data/regions.json` 的 `label` 决定，函数内不再维护地区映射表。API Key 和 `target` 都从 event 请求体读取，不在函数环境变量中保存。
3. 开启函数 URL（函数配置 → 函数 URL），将认证方式设为 **CAM 鉴权**，记录形如 `https://<appid>-<urlid>.<region>.tencentscf.com` 的 HTTPS 根地址，不附加路径或查询参数。按[函数 URL 认证鉴权配置](https://www.tencentcloud.com/zh/document/product/583/69493)给调用身份授予目标函数的 `scf:InvokeFunctionUrl` 权限。签名校验由腾讯云平台完成，函数代码无需增加验签逻辑。
4. 把每个地区的 URL 填入状态机的 `data/regions.json`：

```json
[
  { "id": "shanghai", "label": "上海", "code": "SHA", "globalping": "Shanghai+CN", "probe_url": "https://<ap-shanghai-url>" },
  { "id": "beijing", "label": "北京", "code": "BJS", "globalping": "Beijing+CN", "probe_url": "https://<ap-beijing-url>" },
  { "id": "hongkong", "label": "香港", "code": "HKG", "globalping": "Hong Kong+HK|Tsuen Wan+HK", "probe_url": "https://<ap-hongkong-url>" },
  { "id": "tokyo", "label": "东京", "code": "TYO", "globalping": "Tokyo+JP", "probe_url": "https://<ap-tokyo-url>" },
  { "id": "siliconvalley", "label": "硅谷", "code": "SJC", "globalping": "San Jose+US|Santa Clara+US|San Francisco+US", "probe_url": "https://<na-siliconvalley-url>" }
]
```

> SCF 没有 `na-losangeles`，美国西部请使用 `na-siliconvalley`；Globalping 侧用 `San Jose+US` 匹配。中国内地标准地域可选 `ap-shanghai`、`ap-beijing`、`ap-guangzhou`、`ap-chengdu`、`ap-chongqing`、`ap-nanjing`；香港使用 `ap-hongkong`。

5. 状态站 `.env` 配置 `CLOUD_PROBE_TOKEN`（与函数一致）、`CLOUD_PROBE_INTERVAL_SECONDS` 等，以及以下 **仅供 Bun 服务端使用** 的 CAM 配置，然后重启状态站：

| 变量 | 说明 |
| --- | --- |
| `TENCENTCLOUD_SECRET_ID` | 获得目标函数调用权限的身份所使用的 SecretId |
| `TENCENTCLOUD_SECRET_KEY` | 对应 SecretKey，不上传至云函数，不放进探测请求体 |
| `TENCENTCLOUD_UIN` | 主账户 UIN，不是 APPID 或子账户 UIN |
| `TENCENTCLOUD_TOKEN` | STS 临时凭据的 Token；永久密钥留空 |

状态站使用 `TC3-HMAC-SHA256` 对实际 POST 请求体签名，发送 `Authorization`、`X-Scf-Cam-Uin`、`X-Scf-Cam-Timestamp`，临时凭据额外发送 `X-Scf-Cam-Token`；现有 `x-probe-token` 继续发送。凭据不完整时停止拨测，不回退为匿名请求。临时凭据的 SecretId、SecretKey、Token 需成组更新，更新后重启状态站。

启用 CAM 后，普通浏览器访问或无签名的 GET/POST 会被平台拒绝，这是预期行为。要查看 readiness，可在控制台直接测试 GET 事件；状态站的签名 POST 用于验证完整调用链路。仅在客户端签名但保持函数 URL 为“开放”，无法阻止匿名调用。

> 地区 ID 必须与状态站页面使用的地区一致。函数返回的 `location_name` 只用于展示和日志；落库使用状态站请求时对应的 `region.id`。

## 请求与响应

状态站对每个启用的模型检查、每个配置了 `probe_url` 的地区各调用一次：

```http
POST / HTTP/1.1
content-type: application/json
x-probe-token: <CLOUD_PROBE_TOKEN>

{
  "target": "https://emrank.tech/v1",
  "apiKey": "<EMRank API Key>",
  "check": { "id": "model:Qwen/Qwen3-Embedding-0.6B", "type": "model", "model": "Qwen/Qwen3-Embedding-0.6B" },
  "timeoutMs": 15000
}
```

`location_name` 来自 `context.tencentcloud_region` 的映射，不需要在请求体中传递；若直接本地调用且没有 SCF context，才允许用 `locationName` 兜底。

成功响应（`status`：1 成功，0 失败；`attribute_value` 为延迟毫秒）：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "status": 1,
    "last_polled_time": "2026-11-04T07:00:00.000Z",
    "attribute_value": 123,
    "unit": "ms",
    "down_reason": null,
    "locations": [
      {
        "location_name": "ap-shanghai",
        "status": 1,
        "last_polled_time": "2026-11-04T07:00:00.000Z",
        "attribute_value": 123
      }
    ]
  },
  "meta": { "region": "ap-shanghai", "function": "emrank-probe-shanghai", "request_id": "...", "location": "ap-shanghai" }
}
```

上游失败时仍是 HTTP 200，`data.status = 0`，`data.down_reason` 记录原因（如 `HTTP 503`、超时、响应字段缺失）。只有函数自身参数错误、鉴权失败或内部异常才返回非 200。

## 上游探测规则

| `check.type` | 请求 | 成功条件 |
| --- | --- | --- |
| `model` | `POST {target}/embeddings` | `data[0].embedding` 为非空数组 |
| `rerank` | `POST {target}/rerank` | `results` 或 `data` 为非空数组 |
| `systemone` | `POST {target}/systemone` | `answers.probe.type === "noul"` 且 `noul ∈ [0,1]` |
| `decisions` | `POST {target}/decisions` | 同上 |

请求体与状态站直连探测（`apps/server/src/checkRunner.ts`）保持一致。

## 安全与限制

- **务必配置 `PROBE_TOKEN`**；未配置时函数默认拒绝函数 URL 调用，避免被当作任意目标代理。
- 函数只接受 HTTPS 目标；拒绝带用户名/密码的 URL，避免 SSRF 和凭据泄漏。
- API Key 通过 event 请求体传入，不写入函数环境变量；函数日志不记录 API Key。
- 请求体上限 64 KB，响应体上限 1 MB；模型名上限 200 字符；单次超时上限 30 秒。
- 每个地区一个函数；函数 URL 与版本/别名绑定，更新代码后记得给对应版本启用 URL。
