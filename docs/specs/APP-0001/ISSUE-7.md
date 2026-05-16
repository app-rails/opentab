---
id: APP-0001/ISSUE-7
parent: APP-0001/PRODUCT
category: enhancement
status: needs-triage
---

# polling 默认值 + README / CLAUDE.md / CONTEXT.md 元数据

## What to build

把 `apps/extension/src/lib/settings.ts` 的 `sync_polling_interval` 默认值改成 60_000 毫秒（1 分钟），用户已修改过的设置不被覆盖。更新顶层项目文档同步反映新的 monorepo 形态：README.md（删 server / web 相关段落，顶部加"Cloud sync provided by a separate hosted service"段落）、CONTEXT.md 的"项目概览 / 常用命令 / Monorepo 结构"段（删 `apps/server` / `apps/web` / `packages/{auth,db,config,shared,ui}` 字样，更新常用命令清单去除已删 workspace 的脚本）。CLAUDE.md 当前已无项目概览段（只剩行为规则 + ETHOS / CONTEXT 指针），本切片仅需校验它不再含旧架构引用，无需主动改写；如未来 CLAUDE.md 重新加入项目概览，则同步处理。服务端 URL env 注入已并入 ISSUE-3（与 `api-client.ts` 一起实现），不在本切片范围。覆盖 PRODUCT.UserStory #1、#3、PRODUCT.Behavior #8、#11。

## Acceptance

- [ ] 覆盖 PRODUCT.Acceptance "Behavior 8" — 新装扩展首次同步间隔为 60_000ms；已升级的扩展保留用户原值（迁移逻辑覆盖）
- [ ] 覆盖 PRODUCT.Acceptance "Behavior 11" — README.md / CONTEXT.md 不再含 `apps/server` / `apps/web` / `packages/{auth,db,config,shared,ui}` 字样；CLAUDE.md 同样校验无旧架构引用（若仍是当前的纯行为规则形态，仅需 grep 通过即可，不必主动改写）
- [ ] 切片特有：README.md 顶部含"Cloud sync provided by a separate hosted service"段落
- [ ] 切片特有：CONTEXT.md 的 Monorepo 结构段同步只列 `apps/extension` + `packages/api`，常用命令段去除指向已删 workspace 的脚本

## Blocked by

- APP-0001/ISSUE-3
- APP-0001/ISSUE-6
