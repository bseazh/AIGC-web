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
- 在服务器环境变量中配置 `ADMIN_IDENTIFIERS=admin@example.com,13800138000` 后，对应已登录账号可进入 `/admin/wallets`，执行人工充值或发放测试积分。两种操作都会独立写入积分流水。
- 任务完成与失败状态只在任务中心展示，不发送站外通知。

## 验证

```bash
npm run typecheck
npm run build
```

## 生产部署

向 `main` 分支 push 后，GitHub Actions 会完成类型检查和生产构建，然后通过 SSH 同步到 `/home/ubuntu/project/AIGC_web`，执行 `scripts/deploy.sh` 并检查服务健康状态。

服务器端使用：

- Node.js 22
- PostgreSQL 16
- Redis 7 + BullMQ
- systemd 服务 `aigc-web`
- 本地监听 `127.0.0.1:3010`
- Nginx 正式地址 `https://aigc.bigapple.store/`

仓库 Secrets：`DEPLOY_HOST`、`DEPLOY_USER`、`DEPLOY_PATH`、`DEPLOY_SSH_KEY`。

生产环境变量只存放在服务器 `.env.production`，不会同步到 GitHub。持久化数据位于服务器 `data/`，部署时不会删除。

## 文档

- `DESIGN.md`：公开页面设计系统。
- `SYSTEM-BLUEPRINT.md`：用户、任务、积分、API 与提示词系统蓝图。
## 视频生产验收

在生产机写入 `ARK_API_KEY`、`ARK_MODEL` 和全部 COS 变量后，先执行以下检查；脚本不会输出密钥：

```bash
set -a; source .env.production; set +a
npm run verify:production
sudo systemctl restart aigc-worker
sudo systemctl status aigc-worker --no-pager
```

通过后在「复刻带货视频」用已授权素材分别提交已开通的 5 / 10 / 15 秒及 480p / 720p / 1080p 组合。任务详情将显示视频播放器，并可从下载按钮获取原始产物；产物私有保存于 COS 的 `users/<用户ID>/outputs/<任务ID>/`，不会公开桶路径。
