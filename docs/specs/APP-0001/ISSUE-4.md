---
id: APP-0001/ISSUE-4
parent: APP-0001/PRODUCT
category: enhancement
status: needs-triage
---

# @opentabai/api@0.1.0 首次 publish 到 npm

## What to build

完成 `@opentabai/api` 的 publishConfig 收尾（`access: public`、`files: ["dist"]`、`license: Apache-2.0`、`prepublishOnly` 触发 tsup build、`name` / `main` / `module` / `types` / `exports` 字段对齐 dist 实际产物），手动跑 `pnpm publish` 推 `0.1.0`。本切片放在 ISSUE-3 完成之后，确保发版前已在真实扩展中验证过协议形态。覆盖 PRODUCT.UserStory #4。

## Acceptance

- [ ] 覆盖 PRODUCT.Acceptance "User Story 4 + Behavior 7" — npm 上可访问 `@opentabai/api@0.1.0`，新建空仓 `pnpm add @opentabai/api` 后能 import 所有声明的导出并 typecheck 通过
- [ ] **发版前置（PRODUCT.OpenQuestions "跨仓包名同步"）**：确认 npm scope `opentabai` 归属于本项目维护者（`npm access list packages opentabai` 或 `npm org ls opentabai`），且 `@opentabai/api` 当前为可创建状态（`npm view @opentabai/api` 返回 404）
- [ ] **发版前置（PRODUCT.OpenQuestions "跨仓包名同步"）**：opentab-server 仓的 PRD / ADR / 实现已统一更新为 `@opentabai/api`（或 PRODUCT.OpenQuestions 翻盘后两仓均改回 `@opentab/api`）；publish 时两仓决策必须一致
- [ ] 切片特有：发版前在本地 `pnpm pack` 验证 tarball 只含 `dist/`，无源码、无测试、无 `node_modules`、无 `tsconfig`
- [ ] 切片特有：`PROTOCOL_VERSION` 常量值 == `"0.1.0"`，与发版号一致
- [ ] 切片特有：README / package.json `description` 字段说明这是 OpenTab wire protocol schema-only 包，不含 server 实现

## Blocked by

- APP-0001/ISSUE-3
