# 潮汐创作台

面向电商团队的 AIGC 创作平台第一版原型。当前包含公开首页、登录交互、响应式工作台，以及 GitHub Actions 到 Ubuntu 服务器的自动部署链路。

## 本地开发

```bash
npm ci
npm run dev
```

打开 `http://localhost:3000`。

## 验证

```bash
npm run typecheck
npm run build
```

## 生产部署

向 `main` 分支 push 后，GitHub Actions 会完成类型检查和生产构建，然后通过 SSH 同步到 `/home/ubuntu/project/AIGC_web`，执行 `scripts/deploy.sh` 并检查服务健康状态。

服务器端使用：

- Node.js 22
- systemd 服务 `aigc-web`
- 本地监听 `127.0.0.1:3010`
- Nginx 公开路径 `/aigc/`

仓库 Secrets：`DEPLOY_HOST`、`DEPLOY_USER`、`DEPLOY_PATH`、`DEPLOY_SSH_KEY`。

## 文档

- `DESIGN.md`：公开页面设计系统。
- `SYSTEM-BLUEPRINT.md`：用户、任务、积分、API 与提示词系统蓝图。
