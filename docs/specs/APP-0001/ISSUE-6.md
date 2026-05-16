---
id: APP-0001/ISSUE-6
parent: APP-0001/PRODUCT
category: enhancement
status: needs-triage
---

# 删 apps/server / apps/web / 不再用 packages + workspace 清理

## What to build

删除 `apps/server`、`apps/web`、`packages/auth`、`packages/db`、`packages/config`、`packages/shared`、`packages/ui` 整个目录（删 `packages/ui` 是 User Story 8 的收尾步骤，依赖 ISSUE-5 把扩展端引用先迁完）。把 `AuthState` 类型从 `@opentab/shared` 搬到 `apps/extension/src/lib/auth-storage.ts`（扩展独占数据结构）。更新 `pnpm-workspace.yaml`（仅保留 `apps/extension` 和 `packages/api`）、`turbo.json`（清理对应 pipeline）、根 `package.json` scripts（删 server / web 相关条目），移除根 `package.json` 与已删 server / web 中所有 `@trpc/client` / `@trpc/server` 残留依赖。覆盖 PRODUCT.UserStory #1、#2、#3、#7、#8、PRODUCT.Behavior #1、#9。

## Acceptance

- [ ] 覆盖 PRODUCT.Acceptance "User Story 1, 2, 3 + Behavior 1" — 扩展构建产物（`apps/extension/.output/chrome-mv3/`）与改造前对比无 `apps/server` / `apps/web` / `packages/{auth,db,config,shared,ui}` 任何代码或类型残留，整体体积下降
- [ ] 覆盖 PRODUCT.Acceptance "User Story 7, 8 + Behavior 9" — 从干净仓库 `pnpm install && pnpm build` 一次通过，`pnpm-workspace.yaml` / `turbo.json` / 根 `package.json` scripts 不存在指向已删目录的引用
- [ ] 切片特有：根 `package.json` 顶层依赖中 `@trpc/client`、`@trpc/server` 已删除
- [ ] 切片特有：`AuthState` 类型迁移后，扩展内引用从 `@opentab/shared` 改为本地相对路径，typecheck 通过
- [ ] 切片特有：`turbo.json` pipeline 仅引用现存 workspace

## Blocked by

- APP-0001/ISSUE-3
- APP-0001/ISSUE-5
