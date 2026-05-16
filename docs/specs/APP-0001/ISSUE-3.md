---
id: APP-0001/ISSUE-3
parent: APP-0001/PRODUCT
category: enhancement
status: needs-triage
---

# 扩展端 sync 客户端切到 @opentabai/api

## What to build

在 `apps/extension/src/lib/` 新建 `api-client.ts`：封装 baseURL 拼接、Bearer token 注入、settings 缓存，对外暴露 `getExtensionApiCall()`，绑定后的 `apiCall<E>(endpoint, body)` 返回已通过 `response.parse` 的 typed payload（不暴露 raw fetch `Response`）。baseURL 由环境变量 `VITE_OPENTAB_SERVER_URL` 注入（dev 默认 `http://localhost:8787`，prod 由 build 注入实际部署 URL），运行时由 settings 的 `server_url` 覆盖；env + settings 同时缺失时给可读错误，不静默拼出 `undefined/...`（这块原本规划在 ISSUE-7，因 Behavior 10 验收依赖它而提前到本切片）。把 `sync-engine.ts` 内所有 `trpc.sync.*` 调用替换为 `apiCall(endpoints.sync.*, body)`，保留原有重试 / 增量 / outbox 语义。错误判定改为对 `UnauthorizedError` / `VersionMismatchError` / `ApiError` 的 `instanceof` 检查 + `error.code` 字符串匹配；其中 426 触发阻塞性 UI 提示要求升级扩展，不再自动重试，文案落到 `apps/extension/src/locales/{en,zh}.json` 现有 i18n 体系（不硬编码字符串）。删除 `apps/extension/src/lib/trpc.ts` 与扩展端所有 `trpc` 引用，删除 `apps/extension/package.json` 的 `@trpc/client` 依赖；现有 `apps/extension/src/lib/api.ts`（若内容已被 `api-client.ts` 完全取代）一并删除，否则迁移残留辅助函数到 `api-client.ts`。**根 `package.json` 和 `apps/server` 的 `@trpc/*` 依赖保留给 ISSUE-6 一起清理**，避免本切片中间状态破坏 server typecheck。覆盖 PRODUCT.UserStory #5、#6、PRODUCT.Behavior #2、#3、#4、#5、#10。

## Acceptance

- [ ] 覆盖 PRODUCT.Acceptance "User Story 5, 6 + Behavior 2, 3, 4, 5" — sync 在 401 / 426 / 其它错误三条路径行为符合预期（含单元测试 + 手动验证）
- [ ] 覆盖 PRODUCT.Acceptance "Behavior 10" — `pnpm --filter @opentab/extension dev` 后启动本地 opentab-server，**用手工注入的合法 token** 跑通一次完整 push / pull 同步循环（device flow UI 在 OOS；token 获取路径依 PRODUCT.OpenQuestions "v1 sync 认证路径"决议——server 若 v1 不再兼容 anonymous，则用 server 提供的 dev/test token 注入入口）
- [ ] 切片特有：`api-client.ts` 单元测试覆盖 baseURL 拼接、Bearer token 注入、settings 缓存失效逻辑
- [ ] 切片特有：`VITE_OPENTAB_SERVER_URL` 未设置且 settings.server_url 为空时，sync 启动给可读错误（用户能据此设置 server URL），不静默 fetch `undefined/...`
- [ ] 切片特有：dev / prod 两种构建下，extension 实际请求的 baseURL 可通过 build banner 或 about 页验证
- [ ] 切片特有：`apps/extension/` 子树 grep `@trpc/`、`trpc.`、`createTRPCClient` 全空（根 `package.json` 与 `apps/server` 的 `@trpc/*` 残留留 ISSUE-6）
- [ ] 切片特有：426 升级提示文案通过 i18next 注册到 `apps/extension/src/locales/{en,zh}.json`，组件内不硬编码字符串
- [ ] 切片特有：426 触发的阻塞 UI 提示在 tabs / settings 任一入口可见且无法静默绕过
- [ ] 切片特有：401 触发统一清空 auth 状态 + re-init，不区分子原因

## Blocked by

- APP-0001/ISSUE-2
