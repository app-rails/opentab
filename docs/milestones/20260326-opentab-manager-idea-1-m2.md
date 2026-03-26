# Milestone: idea-1 / M2 — 认证体系

Parent Idea: [idea-1](../idea/20260326-opentab-manager-idea-1.md)
Status: DONE

## 目标

better-auth 集成，匿名账号自动创建，离线 fallback 可用。

## 任务

- [x] better-auth 集成到 Hono 后端
- [x] 匿名账号创建 API endpoint
- [x] 扩展安装时自动请求后端创建匿名账号
- [x] Token 存入 Chrome Storage
- [x] 离线 fallback：后端不可用时生成本地 UUID 作为临时 accountId
- [x] 后端恢复可用时自动重试注册并关联本地数据

## 验收标准

- 安装扩展后自动创建匿名账号，token 存入 Chrome Storage
- 后端不可用时扩展仍可正常使用（本地 UUID 模式）
- 后端恢复后自动补注册，本地 UUID 与服务端账号关联成功
