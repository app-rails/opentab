---
id: APP-0001
status: implementing
---

# opentab 仓 v1 改造（schema-only 包 + 扩展端切到 JSON over HTTP）

## Problem

opentab 仓库当前同时承载扩展端、服务端（`apps/server` Node + Hono）、管理面板（`apps/web` Vite SPA）和六个内部包（`packages/{api,auth,config,db,shared,ui}`）。这套结构有两个用户视角的痛点：

第一，整仓是 Apache 2.0 公开仓，但商业模式上 Stripe 订阅、备份恢复、用户私有数据这类闭源服务端逻辑被迫和扩展代码混在同一个仓里，开源承诺（"扩展代码可审计"）和商业资产（"服务端不可外泄"）边界模糊。第二，扩展端通过 tRPC 直接耦合一个特定服务端实现，未来桌面 / iOS 客户端无法独立复用契约，扩展和服务端必须同 PR 同发版，迭代节奏被强行绑死。

## Solution

把 opentab 仓削成只剩两个核心产物：扩展端 (`apps/extension`) 和一个 schema-only 的 npm 包 `@opentabai/api`。所有服务端代码搬到独立的私有仓库 `opentab-server`，扩展端通过 JSON over HTTP（不是 tRPC）调用服务端，wire protocol 由 `@opentabai/api` 包定义并发布到 npm。

用户（扩展用户和未来其它端的开发者）能得到：扩展仓继续完全开源可审，云端服务作为独立 hosted service 接入；未来任何客户端只要装 `@opentabai/api` 就能拿到完整的 wire protocol 契约（zod schema + 端点定义 + 错误码），不需要看服务端源码；扩展和服务端可以独立发版，只要 protocol version 兼容。

## User Stories

1. 作为扩展用户，我希望扩展继续是离线优先的本地工具，云端同步只是可选层，关掉云同步后扩展功能不退化
2. 作为扩展用户，我希望扩展安装包不再夹带任何 admin panel / 服务端代码，下载体积只反映扩展真实功能
3. 作为审计者 / 开源贡献者，我希望仓库结构清晰，看到的所有代码都属于扩展运行时或公开 wire protocol，不会混入闭源服务端逻辑
4. 作为未来第三方客户端开发者（桌面 / iOS / CLI），我希望从 npm 装 `@opentabai/api` 就能拿到完整的 zod schema 和端点定义，不依赖任何服务端实现
5. 作为扩展维护者，我希望扩展端的网络调用错误模型统一为 HTTP status code + `{ error: { code, message } }`，不再依赖 tRPC 特有的错误传播机制
6. 作为扩展维护者，我希望 wire protocol 改动通过 `PROTOCOL_VERSION` 显式控制，扩展和服务端版本不匹配时能给用户清晰的"请升级扩展"提示
7. 作为扩展维护者，我希望 monorepo 的 `pnpm-workspace.yaml`、`turbo.json` 只包含真正还在用的 workspace，不残留指向已删除目录的脚本
8. 作为扩展维护者，我希望 UI 组件（shadcn/ui 风格的 button / dialog / dropdown 等）直接放在 extension 里，不再走 `@opentab/ui` 这一层无收益的间接

## Behavior

1. 扩展构建产物 (`apps/extension/.output/chrome-mv3/`) 不包含 `apps/server`、`apps/web`、`packages/{auth,db,config,shared,ui}` 的任何代码或类型
2. 扩展端调用 `endpoints.sync.push / pull / snapshot` 时，请求 body 在 client 端先经 zod `request.parse` 校验，响应 body 在 client 端经 zod `response.parse` 校验，任一失败抛出可识别的 schema 错误
3. 扩展端遇到服务端返回 HTTP 401 时，统一清空本地 auth 状态并触发 re-init，不区分 token 过期 / token 撤销 / token 缺失等子原因
4. 扩展端遇到服务端返回 HTTP 426（protocol version mismatch）时，UI 给出阻塞性提示要求用户升级扩展版本，不再尝试自动重试同步
5. 扩展端遇到其它 4xx / 5xx 时，根据响应 body 的 `error.code` 字符串做语义判定，不再依赖 tRPC procedure name 路由
6. `@opentabai/api` 包导出 `PROTOCOL_VERSION` 常量、`endpoints` 对象（key 为业务名，value 为 endpoint 定义；至少覆盖 sync 簇 push / pull / snapshot、auth 簇含 exchange / consume、health 簇 `/api/health` 返回 `HealthResponse`）、`apiCall` client helper、`checkProtocolCompatibility(serverHealth: HealthResponse): CompatibilityResult` 辅助函数、`UUID_V7_REGEX`、所有 request / response zod schemas（含 `HealthResponse`、`ExchangeConsumeRequest`、`ExchangeConsumeResponse`）、错误码 enum、长度上限常量；不导出任何 tRPC router / context 类型；客户端遇到 server 返回未定义在 enum 内的 error code 时，统一降级为 `ErrorCode.INTERNAL`，不抛 schema 校验失败
7. `@opentabai/api` 通过 `pnpm publish` 推到 npm 后，第三方项目 `pnpm add @opentabai/api` 能在 Node 20+ ESM 环境直接 import 上述所有导出
8. 扩展端 settings 的 `sync_polling_interval` 默认值落在 30_000 – 60_000 毫秒区间（具体值见 Decisions）；用户已修改过的设置不被覆盖
9. `pnpm install && pnpm build` 在改造后从干净仓库一次成功，无对已删除 workspace 的悬挂引用
10. `pnpm --filter @opentab/extension dev` 启动后扩展能加载并连接到本地 opentab-server（默认 `http://localhost:8787`，可通过环境变量覆盖）
11. README.md 顶部和 `CONTEXT.md` 的"项目概览 / 常用命令 / Monorepo 结构"段不再提及 `apps/server` / `apps/web` / `packages/{auth,db,config,shared,ui}`，并明确说明云同步由独立 hosted service 提供；CLAUDE.md 当前已无项目概览段，仅需 grep 校验它不含旧架构引用，无需主动改写

## Decisions

- **`@opentabai/api` schema-only 包**：定义并导出 wire protocol 所有共享内容；接口形态：`defineEndpoint({path, method, request, response}): EndpointDef`、`endpoints.{sync.push, sync.pull, sync.snapshot, auth.exchange, auth.consume, health.check}: EndpointDef<typeof Req, typeof Res>`（覆盖 sync / auth / health 三簇）、`apiCall<E extends EndpointDef>(endpoint: E, body: z.input<E['request']>, opts: ApiCallOpts): Promise<z.output<E['response']>>`、`checkProtocolCompatibility(serverHealth: HealthResponse): { compatible: boolean; reason?: string }`、`PROTOCOL_VERSION: string`、`UUID_V7_REGEX: RegExp`、`ErrorCode` enum、`HealthResponse` / `ExchangeConsumeRequest` / `ExchangeConsumeResponse` 等 zod schemas 与对应类型；本条目与 Behavior 6 是同一清单的两种视角（Behavior 6 描述"导出了什么"，本条目描述"接口形态如何"），AC 第 "Behavior 6, 7" 项以两者并集为准
- **`apiCall` helper 行为**：负责 request body zod 校验 → fetch → HTTP status code 检查（200 直接 response.parse；401 / 426 抛专属错误；其它 4xx / 5xx 解析 `{ error: { code, message } }` 后抛 `ApiError`，未知 code 字符串降级为 `ErrorCode.INTERNAL` 而非 schema 失败）→ response body zod 校验；headers 中固定带 `X-OpenTab-Protocol-Version`（与 opentab-server protocol gate 期望的 header 名严格一致）
- **`checkProtocolCompatibility` 辅助函数**：接收 `/api/health` 响应中的 server `HealthResponse`，与本地 `PROTOCOL_VERSION` 比较，返回 `{ compatible: boolean, reason?: string }`；扩展启动 / 网络恢复时调用一次，不通过则触发与 426 同样的阻塞 UI（与 426 共享同一升级提示）
- **扩展端 API 客户端 (`api-client.ts`)**：替换原 `trpc.ts`，对外暴露 `getExtensionApiCall(): Promise<ApiCallBound>`，封装 baseURL 拼接、Bearer token 注入、settings 缓存；接口形态：`apiCall<E extends EndpointDef>(endpoint: E, body: z.input<E['request']>): Promise<z.output<E['response']>>`（baseURL 和 auth header 已绑定，返回已通过 `response.parse` 的 typed payload；不暴露 raw fetch `Response`）
- **扩展端 sync 引擎适配**：`sync-engine.ts` 内所有 `trpc.sync.*` 调用换成 `apiCall(endpoints.sync.*, body)`；保留原有重试 / 增量 / outbox 语义，仅替换网络层
- **错误处理统一**：扩展端定义三类错误 `UnauthorizedError`（401）、`VersionMismatchError`（426）、`ApiError`（其它，含 `code: ErrorCode` 字段）；删除原 tRPC 错误判定逻辑
- **扩展端内嵌 UI 组件**：`packages/ui/src/components/*` 平铺到 `apps/extension/src/components/ui/`，`packages/ui/src/lib/utils.ts` 的 `cn` 迁到 `apps/extension/src/lib/utils.ts`，`packages/ui/src/styles/globals.css` 迁到 `apps/extension/src/styles/`；脚本化替换约 30+ 文件的 `@opentab/ui/...` import 为相对路径
- **shadcn 配置归位**：`components.json` 放到 `apps/extension/` 根目录，配置 `aliases.ui` 指向 `@/components/ui`
- **运行时依赖搬运**：`radix-ui`、`class-variance-authority`、`clsx`、`tailwind-merge`、`lucide-react`、`sonner` 从 `packages/ui/package.json` 迁到 `apps/extension/package.json`
- **`AuthState` 迁移**：从 `@opentab/shared` 迁到 `apps/extension/src/lib/auth-storage.ts`（扩展独占数据结构，跨服务类型已由 `@opentabai/api` 承载）
- **包构建产物**：`@opentabai/api` 用 tsup 构建，输出 `dist/`，仅 ESM（`.js` + `.d.ts`），无 CJS；`package.json` 含 `name: "@opentabai/api"`、`version`、`main`、`module`、`types`、`exports`、`publishConfig.access: "public"`、`files: ["dist"]`、`license: "Apache-2.0"`、`prepublishOnly` 触发 tsup build
- **首版发版方式**：早期手动 `pnpm publish` 推 `@opentabai/api@0.1.0`；当协议改动频次稳定后再切 changesets + CI 自动发版（不在 v1 范围）
- **服务端 URL 配置**：扩展端通过环境变量 `VITE_OPENTAB_SERVER_URL`（dev: `http://localhost:8787`，prod: 部署 URL）注入；运行时回落由 settings 的 `server_url` 覆盖
- **polling 默认值**：`sync_polling_interval` 默认 60_000 毫秒（1 分钟）；与 opentab-server 故意不上 Durable Objects 的决策对齐
- **删除清单**：`apps/server`、`apps/web`、`packages/auth`、`packages/db`、`packages/config`、`packages/shared`、`packages/ui`；删 `@trpc/client`、`@trpc/server` 顶层依赖；`pnpm-workspace.yaml` 只保留 `apps/extension` 和 `packages/api`；`turbo.json` 清理对应 pipeline；根 `package.json` scripts 删 server / web 相关条目
- **协议版本号**：v1 首版 `@opentabai/api@0.1.0`、`PROTOCOL_VERSION = "0.1.0"`；待协议稳定（v1 ship 后 1–2 个迭代）再切 `1.0.0`，避免过早承诺稳定

## Acceptance Criteria

- [ ] 覆盖 User Story 1, 2, 3 + Behavior 1 — 扩展构建产物体积下降，diff `apps/extension/.output/chrome-mv3/` 与改造前对比无 `apps/server` / `apps/web` / `packages/{auth,db,config,shared,ui}` 任何代码或类型残留
- [ ] 覆盖 User Story 4 — `@opentabai/api@0.1.0` 成功 publish 到 npm，新建空仓 `pnpm add @opentabai/api` 后能 import 所有声明的导出并 typecheck 通过
- [ ] 覆盖 User Story 5, 6 + Behavior 2, 3, 4, 5 — 扩展端 sync 在 401 / 426 / 其它错误三条路径上行为符合预期（含单元测试和手动验证）
- [ ] 覆盖 Behavior 6, 7 — `@opentabai/api` 包的导出形状与 Decisions 中"`@opentabai/api` schema-only 包"条目及 Behavior 6 列出的清单一致，不含任何 tRPC 痕迹（grep `@trpc/`、`router(`、`procedure` 应全空）
- [ ] 覆盖 User Story 7, 8 + Behavior 9 — 删 server/web 后 `pnpm install && pnpm build` 从干净仓库一次通过，`pnpm-workspace.yaml` / `turbo.json` / 根 `package.json` scripts 不存在指向已删目录的引用
- [ ] 覆盖 Behavior 8 — `sync_polling_interval` 默认值改后，新装扩展首次同步间隔为 60_000ms；已升级的扩展保留用户原值
- [ ] 覆盖 Behavior 10 — 启动本地 opentab-server 后，用手工注入的合法 token 跑通一次完整 push / pull 同步循环（device flow UI 在 OOS；token 获取路径依 Open Questions "v1 sync 认证路径"决议——若决议恢复 anonymous 兼容则升级为真 e2e）
- [ ] 覆盖 User Story 8 — `apps/extension/src/components/ui/` 下所有原 `@opentab/ui` 组件存在并可被引用，全仓（含 `.ts` / `.tsx` / `.css` / `tsconfig*.json` / `components.json` / `tailwind` 配置等）不再出现 `@opentab/ui` import 或 `packages/ui` 路径引用，特别核对 `apps/extension/src/assets/main.css` 的 `@source` 指令已更新
- [ ] 覆盖 User Story 8 — `pnpm --filter @opentab/extension dev` 启动后，对 tabs（newtab）/ settings / import 三个 entrypoint 做手动 smoke test：原本依赖 `@opentab/ui` 的页面（如 collection 卡片、save-tabs dialog、theme toggler）视觉与交互无回归
- [ ] 覆盖 Behavior 11 — README.md / CLAUDE.md / CONTEXT.md 均不含 `apps/server` / `apps/web` / `packages/{auth,db,config,shared,ui}` 字样；README 顶部含"Cloud sync provided by a separate hosted service"段落；CONTEXT.md 的 Monorepo 结构段同步更新

## Testing Decisions

- **好测试的定义**：只测外部行为（zod 校验结果、HTTP status code 分支、错误类型），不测实现细节（fetch 调用次数、内部缓存命中）
- **被测模块**：
  - `@opentabai/api` 的 `apiCall` helper —— request/response zod 双向校验、HTTP 401/426/其它分支、`ApiError` 携带的 `code` 字段正确性
  - 扩展端 `sync-engine.ts` 适配后的 push / pull 路径 —— 替换网络层后保持原有 outbox / 增量 / 重试语义
  - 扩展端 `api-client.ts` —— baseURL 拼接、Bearer token 注入、settings 缓存失效
- **不需要专属单元测试的模块**：UI 组件平铺（行为 == shadcn 原版；现有 `save-tabs-dialog.test.tsx` 等测试是 `vi.mock("@opentab/ui/...")` 把 UI 包整体 mock 掉，不验证真实迁移——靠扩展整体构建通过 + tabs（newtab）/ settings / import 三个 entrypoint 手动 smoke test 覆盖迁移，单测无价值）、删除 / 配置清理 / 文档更新（无 runtime 行为）
- **Prior art**：扩展端既有测试风格见 `apps/extension/src/lib/__tests__/`（vitest，文件名与被测模块同名加 `.test.ts`），`apps/extension/src/lib/collection-dedup.test.ts` 是较好的纯函数测试样例；目前没有针对网络层（trpc client）的现成测试，`apiCall` 的 fetch 路径需要新建 `packages/api/src/__tests__/api-call.test.ts`，用 `vi.fn()` mock fetch 验证 HTTP status code 映射

## Out of Scope

- Device flow UI（用户跨设备登录的扫码 / 自助复原入口）—— 推迟到 Phase 3，opentab-server 侧也未实现
- Stripe / 订阅升级 UI（"升级到 Pro"按钮、订阅管理面板）—— 推迟到 Phase 3
- 备份恢复 UI（手动触发备份、查看备份历史、从备份恢复）—— 推迟到 Phase 3
- changesets + CI 自动发版流程 —— 早期手动 `pnpm publish` 已够用，迭代频次稳定后再切
- `@opentabai/api` 的 CJS 产物 —— 仅 ESM，目标用户均为 Node 20+ / Bun / 现代打包器
- 扩展端实时同步（WebSocket / SSE / Durable Objects）—— 故意保持 polling，与 opentab-server ADR-0005 对齐
- 扩展端 `user.tier` / quota 显示 UI —— 订阅相关数据模型独立表，扩展 v1 不读
- 401 错误的细分（token 过期 vs 撤销 vs 缺失）—— 与 opentab-server ADR-0012 对齐，统一不区分

## Open Questions

- `@opentabai/api` 是否需要在首版就拆 sub-path exports（如 `@opentabai/api/schemas` vs `@opentabai/api/client`）？默认单一入口 `@opentabai/api`，等真有第三方客户端来集成再拆
- **跨仓包名同步（执行前必须解决）**：opentab-server 仓现有 PRD / ADR 仍指 `@opentab/api`，本仓 PRD 按 memory 锁定决策用 `@opentabai/api`。两者必须在 ISSUE-4 publish 前统一——默认按本仓决策推 server 侧 PRD/ADR/实现改 `@opentabai/api`，但需要用户在 opentab-server 仓做对应更新或显式翻盘到 `@opentab/api`
- **v1 sync 认证路径（ISSUE-3 e2e 验收的前置）**：device flow UI 在 OOS，但 opentab-server v1 sync 入口已定为 setup/exchange + deviceToken，扩展原本走的 anonymous sign-in 是否在 server v1 继续支持需要确认。如果不支持，ISSUE-3 的"完整 push / pull 同步循环"验收要降级为"用手工注入的合法 token 跑通"，真正的 e2e 留 Phase 3 装上 device flow UI 后做

## Further Notes

- 协议形态决策来源：opentab-server 仓 `docs/adr/0003-protocol-contract-via-npm.md`（在 review 阶段把 tRPC 翻盘为 JSON over HTTP）
- 错误模型决策来源：opentab-server 仓 `docs/adr/0012-error-codes-and-protocol-evolution.md`
- 跨仓改造账本：`~/.claude/projects/-Users-liang-zhao-code-github-app-rails-opentab/memory/project_server_rewrite.md`（含 2026-05-16 锁定的所有子决策）
- 关联私有仓 PR：[opentab-server#1](https://github.com/app-rails/opentab-server/pull/1)（v1 PRD + 12 份 ADR）
- 关联本仓 PR：[opentab#58](https://github.com/app-rails/opentab/pull/58)（agent 基线文档，独立合并）
- 临时约束：本仓涉及上游参考项目时统一使用"参考项目"代称，具体禁词清单见 opentab 项目 memory 中关于"参考项目命名"的 feedback 条目（PRD / 代码 / commit / PR / 对话均适用）
