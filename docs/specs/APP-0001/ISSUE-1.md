---
id: APP-0001/ISSUE-1
parent: APP-0001/PRODUCT
category: enhancement
status: needs-triage
---

# @opentabai/api 包骨架 + apiCall helper + 错误模型

## What to build

在现有 `packages/api` 内重做为 `@opentabai/api` schema-only npm 包骨架：tsup 构建（仅 ESM `.js` + `.d.ts`）、`package.json` 配 npm 发版字段但暂不真发版（首发在 ISSUE-4）。实现 wire protocol primitives：`defineEndpoint({path, method, request, response})`、`apiCall<E>(endpoint, body, opts): Promise<z.output<E['response']>>`、`PROTOCOL_VERSION` 常量、`UUID_V7_REGEX`、`ErrorCode` enum，以及三类错误 `UnauthorizedError`（401）、`VersionMismatchError`（426）、`ApiError`（其它，含 `code: ErrorCode`）。本切片不引入任何业务 endpoint schemas，那部分留 ISSUE-2。覆盖 PRODUCT.UserStory #4 的基础设施部分、PRODUCT.Behavior #6、#7。

## Acceptance

- [ ] 覆盖 PRODUCT.Acceptance "Behavior 6, 7 / 导出形状" 中的 primitive 子集（`PROTOCOL_VERSION`、`defineEndpoint`、`apiCall`、`UUID_V7_REGEX`、`ErrorCode` enum、三类错误类）
- [ ] 切片特有：`apiCall` 在 mock fetch 下针对 200 / 401 / 426 / 其它 4xx / 5xx 五条分支返回正确错误类型，单元测试全绿
- [ ] 切片特有：`apiCall` 对 request body 和 response body 都执行 zod 双向校验，失败抛可识别的 schema 错误
- [ ] 切片特有：`pnpm --filter @opentabai/api build` 输出仅 ESM 产物，包内 grep `@trpc/`、`router(`、`procedure` 全空
- [ ] 切片特有：`apiCall` 固定带 `X-Protocol-Version` 请求头

## Blocked by

- 无，可立即开始
