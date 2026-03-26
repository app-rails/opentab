# Milestone: idea-7 / M2 — 自部署方案

Parent Idea: [idea-7](../idea/20260326-opentab-manager-idea-7.md)
Status: TODO

## 目标

用户在全新机器上一键部署后端，扩展可连接自部署后端。

## 任务

- [ ] Dockerfile：Hono 后端容器化
- [ ] docker-compose.yml：Hono + PostgreSQL 一键部署
- [ ] 环境变量配置文档（.env.example）
  - DATABASE_URL
  - AUTH_SECRET
  - CORS_ORIGIN
  - PORT
- [ ] 自部署文档（docs/self-hosting.md）
  - 前置要求（Docker、域名）
  - 部署步骤
  - HTTPS 配置（Caddy/nginx 反向代理示例）
  - 扩展连接自部署后端的配置方法
- [ ] 扩展 Settings 中「自定义后端地址」输入框
- [ ] 后端地址验证（连接测试按钮）

## 验收标准

- 全新机器 `docker compose up` 后端正常启动
- 扩展配置自定义后端地址后正常连接
- 连接测试按钮正确显示成功/失败状态
- 自部署文档步骤完整可执行
