---
id: APP-0001/ISSUE-3
parent: APP-0001/PRODUCT
category: enhancement
status: needs-triage
---

# 扩展端 sync 客户端切到 @opentabai/api

## What to build

在 `apps/extension/src/lib/` 新建 `api-client.ts`：封装 baseURL 拼接、Bearer token 注入、settings 缓存，对外暴露 `getExtensionApiCall()`，绑定后的 `apiCall<E>(endpoint, body)` 返回已通过 `response.parse` 的 typed payload（不暴露 raw fetch `Response`）。把 `sync-engine.ts` 内所有 `trpc.sync.*` 调用替换为 `apiCall(endpoints.sync.*, body)`，保留原有重试 / 增量 / outbox 语义。错误判定改为对 `UnauthorizedError` / `VersionMismatchError` / `ApiError` 的 `instanceof` 检查 + `error.code` 字符串匹配；其中 426 触发阻塞性 UI 提示要求升级扩展，不再自动重试。删除 `trpc.ts`、`@trpc/client`、`@trpc/server` 依赖与导入。覆盖 PRODUCT.UserStory #5、#6、PRODUCT.Behavior #2、#3、#4、#5、#10。

## Acceptance

- [ ] 覆盖 PRODUCT.Acceptance "User Story 5, 6 + Behavior 2, 3, 4, 5" — sync 在 401 / 426 / 其它错误三条路径行为符合预期（含单元测试 + 手动验证）
- [ ] 覆盖 PRODUCT.Acceptance "Behavior 10" — `pnpm --filter @opentab/extension dev` 后启动本地 opentab-server 能完成一次完整 push / pull 同步循环
- [ ] 切片特有：`api-client.ts` 单元测试覆盖 baseURL 拼接、Bearer token 注入、settings 缓存失效逻辑
- [ ] 切片特有：扩展端代码 grep `@trpc/`、`trpc.`、`createTRPCClient` 全空
- [ ] 切片特有：426 触发的阻塞 UI 提示在 tabs / settings 任一入口可见且无法静默绕过
- [ ] 切片特有：401 触发统一清空 auth 状态 + re-init，不区分子原因

## Blocked by

- APP-0001/ISSUE-2
