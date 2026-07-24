# 电商 AIGC 平台复刻蓝图

> 这里的“复刻”指构建同类产品能力与交互模型，不复制原站品牌、代码、素材、私有数据或服务端提示词。

## 1. MVP 范围

第一版只做三条闭环工作流：

1. 通用商品生图：商品图 + 商品描述 + 场景/比例/清晰度 -> 生成结果。
2. 商品主图：商品素材 + 卖点 + 平台规格 -> 1-4 张电商首图。
3. 模特穿搭：服装平铺/人台图 + 模特/场景参数 -> 上身结果。

配套能力必须同时交付：短信/密码登录、素材上传、异步任务、资产库、积分钱包、订单、审核、失败退款和管理后台。带货视频与详情页放到第二阶段，因为它们涉及更长任务、更多中间产物与更高失败成本。

## 2. 页面与路由

| Route | 页面 | 访问 |
| --- | --- | --- |
| `/` | 全屏媒体首页 + 创作入口 | 公开 |
| `/login` 或弹窗 | 密码/短信登录 | 公开 |
| `/create/image` | 通用商品生图 | 登录 |
| `/create/hero-image` | 商品主图工作流 | 登录 |
| `/create/model-tryon` | 模特穿搭工作流 | 登录 |
| `/tasks` | 任务列表、状态、重试 | 登录 |
| `/assets` | 输入素材与生成结果 | 登录 |
| `/wallet` | 积分余额、流水、充值 | 登录 |
| `/account` | 资料、安全、注销 | 登录 |
| `/admin/*` | 用户、任务、订单、审核、模型配置 | 管理员 |

## 3. 用户系统

### 身份与会话

- 登录方式：手机号 + 短信验证码；账号/手机号 + 密码。
- 首次短信登录可自动注册，但必须先同意协议和用途声明。
- Access token 15 分钟，Refresh token 30 天；Refresh token 哈希入库并支持轮换。
- 用户端与管理端使用不同 audience、cookie 名和权限域。
- 风控：短信发送频率、IP/设备速率限制、图形验证码、密码连续失败锁定、异常设备提醒。

### 权限

- `user`: 创建任务、管理本人素材和钱包。
- `reviewer`: 审核任务与申诉，只读必要用户信息。
- `operator`: 配置功能、价格和供应商路由。
- `admin`: 用户、订单、权限和系统配置。

资源授权必须以 `owner_id` 在服务端校验，不能依赖前端隐藏按钮。对象存储使用短期签名 URL；私有原图、生成结果和日志不允许公开列目录。

### 账户状态

`ACTIVE -> SUSPENDED -> ACTIVE`，或 `ACTIVE/SUSPENDED -> DELETION_PENDING -> DELETED`。注销进入冷静期，终止新任务并处理余额/订单；审计与法定留存数据按政策单独保留。

## 4. 核心数据模型

| Table | 核心字段 |
| --- | --- |
| `users` | `id, phone, email, password_hash, nickname, avatar_key, status, token_version, created_at` |
| `user_consents` | `user_id, document_type, version, accepted_at, ip, user_agent` |
| `refresh_sessions` | `id, user_id, token_hash, device_id, expires_at, revoked_at` |
| `memberships` | `user_id, plan_id, starts_at, expires_at, status` |
| `wallets` | `user_id, available_points, frozen_points, version` |
| `wallet_ledger` | `id, user_id, type, amount, balance_after, biz_type, biz_id, idempotency_key` |
| `orders` | `id, user_id, amount_cny, points, provider, provider_trade_no, status` |
| `assets` | `id, owner_id, kind, storage_key, mime, width, height, duration, hash, audit_status` |
| `workflows` | `id, key, version, schema_json, pricing_rule, enabled` |
| `generation_tasks` | `id, user_id, workflow_key, workflow_version, status, progress, quote_points, error_code` |
| `task_inputs` | `task_id, field_key, value_json, asset_id` |
| `task_attempts` | `id, task_id, provider, model, request_redacted, response_redacted, cost, status, latency_ms` |
| `task_outputs` | `task_id, asset_id, ordinal, metadata_json` |
| `moderation_records` | `target_type, target_id, stage, provider, result, labels_json, reviewer_id` |
| `appeals` | `user_id, target_type, target_id, reason, status, resolution` |
| `audit_logs` | `actor_id, action, target_type, target_id, metadata_redacted, created_at` |

钱包更新用数据库事务、行锁或乐观锁。每一笔冻结、扣除、解冻和退款都写不可变流水，并通过唯一 `idempotency_key` 防止重复扣费。

## 5. 任务状态机

```text
DRAFT
  -> QUOTED
  -> FUNDS_FROZEN
  -> INPUT_REVIEW
  -> QUEUED
  -> RUNNING
  -> OUTPUT_REVIEW
  -> SUCCEEDED -> SETTLED
                 -> ASSET_LIBRARY

INPUT_REVIEW / RUNNING / OUTPUT_REVIEW
  -> FAILED_RETRYABLE -> QUEUED
  -> FAILED_FINAL -> REFUNDED
  -> REJECTED -> REFUNDED
  -> CANCELED -> REFUNDED
```

任务创建接口只写数据库和投递队列，不等待模型。Worker 用任务 ID 拉取最新状态；每次供应商调用有独立 attempt。Webhook 与轮询都必须幂等，迟到回调不能把终态改回运行态。

## 6. API 草案

### Auth

- `POST /api/auth/captcha`
- `POST /api/auth/sms-code`
- `POST /api/auth/phone-login`
- `POST /api/auth/password-login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/session`

### Product

- `GET /api/home`：首页内容与入口配置。
- `GET /api/workflows`：当前用户可用工作流。
- `GET /api/workflows/:key/schema`：表单 JSON Schema、模型选项、比例和价格规则。
- `POST /api/uploads/presign`：创建限制类型、大小和过期时间的上传地址。
- `POST /api/quotes`：根据工作流和参数返回报价及有效期。
- `POST /api/tasks`：使用 `quote_id` 和幂等键创建任务。
- `GET /api/tasks/:id`：读取进度、输出与错误。
- `POST /api/tasks/:id/retry`：仅对可重试终态开放。
- `POST /api/tasks/:id/cancel`。

取消仅允许在 `PENDING_INPUT_REVIEW` 或 `QUEUED` 阶段执行；任务状态、积分退款、流水和审计在同一事务提交。小时级生命周期维护负责审核超时退款、漏排队恢复及注销冷静期后的数据清理。
- `GET /api/assets`、`DELETE /api/assets/:id`。

### Wallet and Orders

- `GET /api/wallet`
- `GET /api/wallet/ledger`
- `POST /api/orders`
- `POST /api/payments/alipay/notify`
- `GET /api/orders/:id`

所有写接口接受 `Idempotency-Key`。返回统一错误结构：`code, message, retryable, request_id, field_errors`；不要把供应商原始报错、密钥或内部 prompt 返回浏览器。

## 7. 提示词系统

### 能爬到什么

- 可以整理公开案例接口中明确返回的用户输入 `params.prompt`、商品描述、模型名、比例和分辨率。
- 可以记录公开表单的字段名、选项和默认值。
- 这些数据适合作为需求样本和回归测试输入，不等于原站系统提示词。

### 不应声称拿到什么

- 服务端 `system prompt`、模板拼接、负面约束、审核规则和供应商密钥。
- 其他用户的私有任务、素材、token 或未公开接口数据。

### 自建编排

提示词不要存成一个不可维护的长字符串。按工作流版本化：

```text
System policy
  + Workflow objective
  + Product facts (structured)
  + Composition / camera / lighting rules
  + Platform constraints
  + User creative direction
  + Negative constraints
  + Output contract
```

示例输入应先结构化：

```json
{
  "product": {
    "category": "保温杯",
    "material": "磨砂不锈钢",
    "color": "墨绿",
    "selling_points": ["轻量", "防漏", "通勤"]
  },
  "scene": "清晨办公室桌面",
  "composition": "商品居中偏右，左侧留文案空间",
  "platform": "淘宝主图",
  "aspect_ratio": "1:1"
}
```

服务端模板负责把结构化字段渲染成供应商请求。记录 `workflow_version`、模板版本、模型版本和参数，支持回放；日志中对手机号、URL 签名、密钥和用户隐私脱敏。

### 防提示词泄露

- 模板仅存服务端或受控配置中心，前端只收到表单 schema。
- API 返回标准化任务元数据，不回传完整供应商 request。
- 管理后台按角色展示脱敏调试信息。
- 模型输出不能被当成可信指令；用户文本永远作为数据插入固定边界。

## 8. 技术架构

```text
Next.js Web
  -> API/BFF (NestJS or Next Route Handlers)
     -> PostgreSQL
     -> Redis / BullMQ
     -> Object Storage (OSS/S3)
     -> Payment Adapter
     -> Moderation Adapter
     -> AI Provider Router
          -> OpenAI-compatible image provider
          -> Volcano Engine image/video provider

BullMQ Workers
  -> moderation -> generation -> post-process -> watermark/metadata -> asset

Admin Web
  -> users / tasks / orders / reviews / workflow versions / provider health
```

建议从模块化单体开始：一个 API 服务、一个 Worker 服务、一个 PostgreSQL 和 Redis。等视频任务量、供应商路由或团队边界真实增长后再拆服务，避免第一版承担微服务运维成本。

## 9. 爬取与资产策略

只建立“公开产品研究采集器”，不做整站镜像：

- 页面层：URL、标题、可见文案、DOM 结构、响应式布局和交互状态。
- 配置层：公开功能入口、字段 schema、模型/比例/分辨率选项。
- 案例层：公开案例 ID、媒体类型、公开参数和输出 URL，仅保存必要元数据。
- 合规层：协议名称、版本、更新时间与公开规则。

遵守 `robots.txt`、服务条款、请求频率和版权要求。默认不下载原站大媒体；研发演示使用自行生成或已授权素材。数据表保留 `source_url, observed_at, license_note, content_hash`，方便追踪来源和删除。

## 10. 交付顺序

### Phase 0: 1 周

- 原创品牌、设计 token、首页与登录原型。
- 供应商能力/成本验证，确定图像模型和审核方案。
- 数据库、队列、对象存储和支付沙箱搭建。

### Phase 1: 3-5 周

- 登录、账户、上传、三条图像工作流。
- 任务状态、资产库、积分冻结/扣费/退款。
- 输入/输出审核与基础管理后台。

### Phase 2: 3-4 周

- 视频生成、异步供应商回调、详情页多图编排。
- 套餐/会员、申诉、对账和运营配置。
- 质量评测集、A/B 工作流版本和成本路由。

## 11. 上线验收

- 任何任务重复请求或回调都不会重复扣费。
- 失败、拒绝和取消都能按规则解冻/退款，钱包与流水可对账。
- 用户只能访问本人任务和资产，签名 URL 短期有效。
- 服务端提示词、密钥、供应商原始请求不出现在浏览器包或 API 响应中。
- 上传前和生成后均执行审核；申诉与人工处理有审计记录。
- 手机端 390px、平板 768px、桌面 1440px 无溢出和文本遮挡。
- 跑马灯支持暂停与 reduced-motion；表单、弹窗和任务状态可键盘操作。
- 供应商超时、限流、内容拒绝和部分成功均有可理解的用户状态。
