---
id: APP-0001/ISSUE-7
parent: APP-0001/PRODUCT
category: enhancement
status: needs-triage
---

# polling 默认值 + 服务端 URL env + README/CLAUDE.md 元数据

## What to build

把 `apps/extension/src/lib/settings.ts` 的 `sync_polling_interval` 默认值改成 60_000 毫秒（1 分钟），用户已修改过的设置不被覆盖。在 `api-client.ts` 通过环境变量 `VITE_OPENTAB_SERVER_URL` 注入服务端 baseURL（dev 默认 `http://localhost:8787`，prod 由 build 注入实际部署 URL），运行时由 settings 的 `server_url` 覆盖；env 缺失时给显式错误而非静默拼出 `undefined` 路径。更新 README.md（删 server / web 相关段落，顶部加"Cloud sync provided by a separate hosted service"段落）和 CLAUDE.md 的项目概览段（同步删除 `apps/server` / `apps/web` 字样）。覆盖 PRODUCT.UserStory #1、#3、PRODUCT.Behavior #8、#11。

## Acceptance

- [ ] 覆盖 PRODUCT.Acceptance "Behavior 8" — 新装扩展首次同步间隔为 60_000ms；已升级的扩展保留用户原值（迁移逻辑覆盖）
- [ ] 覆盖 PRODUCT.Acceptance "Behavior 11" — README.md 和 CLAUDE.md 不含 `apps/server` / `apps/web` 字样，README 顶部含"Cloud sync provided by a separate hosted service"段落
- [ ] 切片特有：`VITE_OPENTAB_SERVER_URL` 未设置且 settings.server_url 为空时，sync 启动给可读错误（用户能据此设置 server URL），不静默 fetch `undefined/...`
- [ ] 切片特有：dev / prod 两种构建下，extension 实际请求的 baseURL 可通过 build banner 或 about 页验证

## Blocked by

- APP-0001/ISSUE-3
- APP-0001/ISSUE-6
