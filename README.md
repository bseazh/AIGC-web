# 芭乐AIGC

面向电商团队的一站式商品视觉创作平台。当前包含公开首页、手机号/邮箱密码账户、100 积分开户、响应式工作台、PostgreSQL/Redis 基础设施，以及 GitHub Actions 到 Ubuntu 服务器的自动部署链路。

## 本地开发

```bash
npm ci
npm run dev
```

打开 `http://localhost:3000`。

## 积分与后台管理

- 积分换算固定为 `1 元 = 10 积分`；当前不接入微信支付。
- 在服务器环境变量中配置 `ADMIN_IDENTIFIERS=admin@example.com,13800138000` 后，对应账号登录会默认进入 `/admin` 管理控制台；可发放测试积分、人工充值，并在 `/admin/codes` 创建支付开通前使用的充值码/兑换码。所有入账都会写入积分流水和审计记录。
- 任务完成、失败、审核拒绝和投诉状态更新通过 SMTP 邮件通知。

## 验证

```bash
npm run typecheck
npm run test:regression
npm run build
```

## 生产部署

向 `main` 分支 push 后，GitHub Actions 会完成类型检查和生产构建，然后通过 SSH 同步到 `/home/ubuntu/project/AIGC_web`，执行 `scripts/deploy.sh` 并检查服务健康状态。

服务器端使用：

- Node.js 22
- PostgreSQL 16
- Redis 7 + BullMQ
- systemd 服务 `aigc-web`
- systemd 服务 `aigc-worker`，以及存储清理、生命周期维护、备份和健康告警定时器
- 本地监听 `127.0.0.1:3010`
- Nginx 正式地址 `https://aigc.bigapple.store/`

仓库 Secrets：`DEPLOY_HOST`、`DEPLOY_USER`、`DEPLOY_PATH`、`DEPLOY_SSH_KEY`。

生产环境变量只存放在服务器 `.env.production`，不会同步到 GitHub。持久化数据位于服务器 `data/`，部署时不会删除。

## 文档

- `DESIGN.md`：公开页面设计系统。
- `SYSTEM-BLUEPRINT.md`：用户、任务、积分、API 与提示词系统蓝图。
- `docs/operations/observability.md`：Loki、Grafana、结构化日志、告警和注册灰度说明。
## 视频生产验收

在生产机写入 `ARK_API_KEY`、`ARK_MODEL` 和全部 COS 变量后，先执行以下检查；脚本不会输出密钥：

```bash
set -a; source .env.production; set +a
npm run verify:production
sudo systemctl restart aigc-worker
sudo systemctl status aigc-worker --no-pager
```

配置隔离的验收用户、管理员和已授权商品图后执行 `npm run verify:ark-video`。脚本会通过网站 API 完成登录、COS 上传、输入审核、任务创建、Worker 生成、输出审核、下载权限、积分结算、拒绝退款和 COS 对象检查，并将可留档 JSON 报告写入 `acceptance-reports/`。

生命周期维护每小时恢复审核后漏排队的任务、退回审核超时任务积分，并在注销冷静期结束后清理账户素材与可识别标识。用户可在模型执行前取消待审核或排队任务并立即取回冻结积分。

发布前后检查项见 `docs/operations/release-checklist.md`。
