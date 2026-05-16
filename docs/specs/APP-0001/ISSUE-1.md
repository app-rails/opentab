---
id: APP-0001/ISSUE-1
parent: APP-0001/PRODUCT
category: enhancement
status: needs-triage
---

# @opentabai/api 包骨架 + apiCall helper + 错误模型

## What to build

在现有 `packages/api` 内重做为 `@opentabai/api` schema-only npm 包骨架：把 `package.json.name` 从 `@opentab/api` 改为 `@opentabai/api`、tsup 构建（仅 ESM `.js` + `.d.ts`）、`package.json` 配 npm 发版字段但暂不真发版（首发在 ISSUE-4）。实现 wire protocol primitives：`defineEndpoint({path, method, request, response})`、`apiCall<E>(endpoint, body, opts): Promise<z.output<E['response']>>`、`PROTOCOL_VERSION` 常量、`UUID_V7_REGEX`、`ErrorCode` enum，三类错误 `UnauthorizedError`（401）、`VersionMismatchError`（426）、`ApiError`（其它，含 `code: ErrorCode`），以及 `checkProtocolCompatibility(serverHealth: HealthResponse): { compatible: boolean; reason?: string }` 辅助函数（`HealthResponse` 的 schema 由 ISSUE-2 落，本切片可先用 `z.object({ protocolVersion: z.string() }).passthrough()` 作为最小 shape，让 ISSUE-2 平滑替换）。`apiCall` 解析 `{ error: { code, message } }` 时，若 server 返回的 code 字符串不在本地 `ErrorCode` enum 内，统一降级为 `ErrorCode.INTERNAL`，不抛 schema 校验失败。本切片不引入任何业务 endpoint schemas，那部分留 ISSUE-2；不做真 publish（Behavior 7 由 ISSUE-4 兜底）。覆盖 PRODUCT.UserStory #4 的基础设施部分、PRODUCT.Behavior #6。

## Acceptance

- [ ] 覆盖 PRODUCT.Acceptance "Behavior 6 / 导出形状" 中的 primitive 子集（`PROTOCOL_VERSION`、`defineEndpoint`、`apiCall`、`checkProtocolCompatibility`、`UUID_V7_REGEX`、`ErrorCode` enum、三类错误类）
- [ ] 切片特有：`packages/api/package.json` 的 `name` 字段为 `@opentabai/api`；工作区 `dependencies` 引用（至少 `apps/extension/package.json`、`apps/server/package.json`，其它如 `tsconfig.json` paths 或 `pnpm-workspace.yaml` 如有显式列出包名也同步）同步切到新包名，`pnpm install` 一次成功（注：`apps/server` 的 typecheck 中间态失败按 PRODUCT Decisions "合并策略" 允许，本切片不要求修复 server 侧）
- [ ] 切片特有：`apiCall` 在 mock fetch 下针对 200 / 401 / 426 / 其它 4xx / 5xx 五条分支返回正确错误类型，单元测试全绿
- [ ] 切片特有：`apiCall` 在 server 返回未定义 error code 字符串时，`ApiError.code` 降级为 `ErrorCode.INTERNAL`（含单测覆盖）
- [ ] 切片特有：`checkProtocolCompatibility` 在版本匹配 / 不匹配两种输入下分别返回 `compatible: true` 与 `compatible: false + reason`（含单测）
- [ ] 切片特有：`apiCall` 对 request body 和 response body 都执行 zod 双向校验，失败抛可识别的 schema 错误
- [ ] 切片特有：`pnpm --filter @opentabai/api build` 输出仅 ESM 产物，包内 grep `@trpc/`、`router(`、`procedure` 全空
- [ ] 切片特有：`apiCall` 固定带 `X-OpenTab-Protocol-Version` 请求头（与 opentab-server protocol gate 期望严格一致；header 名错会被 server 当作缺 header 直接返回 400 `INVALID_PAYLOAD`）

## Blocked by

- 无，可立即开始
