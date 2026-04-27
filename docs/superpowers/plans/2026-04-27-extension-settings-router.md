# Extension Settings Router & Welcome Plan

Goal: 落地 [`spec 2026-04-27-extension-settings-router-design.md`](../specs/2026-04-27-extension-settings-router-design.md),把 `apps/extension/src/entrypoints/settings/` 从单 SPA 重构成 HashRouter shell + 主开关 + 4 步 wizard;新增 cloud `GET /api/sync/stats` + `GET /api/sync/whoami`。

Architecture: settings.html 内挂 `react-router-7` HashRouter,4 路由(`/` welcome / `/general` / `/import-export` / `/server`)。新建 `pages/server/` 子目录拆 10 个组件按 SyncSettings 状态分发(empty / paused / wizard / connected)。Wizard 用 `@stepperize/react` 包装现有 14-state XState 机器,4 步逻辑不动只换 React UI。新增 `lib/sync-settings.ts` 三层正交 state(`enabled / savedConfig / auth`),v1→v2 migration 把旧 `opentab_sync_auth_v1` 的 3-kind union 转成新结构。Cloud 端 `/api/sync/stats` 与 `/api/sync/whoami` 复用 `requireDeviceToken` / `enforceRateLimit` / `requireProtocolVersion` 三件套。

Tech Stack: WXT 0.20 + React 19 + react-router 7 + @stepperize/react + Dexie 4 + chrome.storage + Vitest 4 / Cloud: RR7 + Better Auth + Drizzle + D1 + Cloudflare Workers

Related specs/plans:
- spec §0.4 决策表 #1-#20
- spec §1.1-§1.10 方案对比
- spec §2.1 模块切分
- spec §3.0 SyncSettings + §3.1-§3.3 同步日志/统计
- spec §4 路由与 sidebar/hero 控件矩阵
- spec §5.1-§5.4 关键流程
- spec §7 验收

Scope:
- In:
  - extension `entrypoints/settings/` 全部重构(routes / shell / pages / wizard)
  - 新 `lib/sync-settings.ts` + v1→v2 migration + `lib/host-history.ts`
  - 新 `pages/server/` 10 个组件按 SyncSettings 状态分发
  - 复用现有 `<SyncSetupWizard>` 内部 XState 机器,只换 stepperize 视觉壳
  - cloud 新 `GET /api/sync/stats` + `GET /api/sync/whoami` 端点
  - protocol 新 `statsResponseSchema` + `whoamiResponseSchema`
  - i18n keys:`settings.welcome.*` / `settings.server.*` / `settings.wizard.*` / `settings.sync_log.*` / `settings.sidebar.*` 完整 zh+en
- Not in:
  - 改 `popup` / `tabs` / `import` / `setup-callback` 4 个 entrypoint
  - 改 sync push/pull/snapshot 现有协议
  - 改 syncOutbox schema / 新增 Dexie 索引
  - Wizard 内部 XState 机器重写(14 状态、状态迁移逻辑全保留)
  - 改 cloud 自己的 dashboard loader
  - 抽 `packages/ui/components/shell` 共享组件
  - sync engine 自动清理暂停期 outbox / 进度提示
  - 视觉 baseline 截图回归
  - Step 4 旧 token 回滚语义研究(走 spec §6.1 last item TODO)
  - 第一次安装 `chrome.runtime.onInstalled` 自动开 settings.html(spec §6.2 TODO);用户通过 action click 或 workspace-sidebar Settings 按钮发现入口

---

## File Map

Created:
```
apps/extension/src/entrypoints/settings/routes.tsx
apps/extension/src/entrypoints/settings/shell/settings-shell.tsx
apps/extension/src/entrypoints/settings/shell/settings-sidebar.tsx
apps/extension/src/entrypoints/settings/shell/settings-sidebar.test.tsx
apps/extension/src/entrypoints/settings/shell/user-bar.tsx
apps/extension/src/entrypoints/settings/pages/welcome-page.tsx
apps/extension/src/entrypoints/settings/pages/welcome-page.test.tsx
apps/extension/src/entrypoints/settings/pages/general-page.tsx
apps/extension/src/entrypoints/settings/pages/import-export-page.tsx
apps/extension/src/entrypoints/settings/pages/server/server-page.tsx
apps/extension/src/entrypoints/settings/pages/server/server-page.test.tsx
apps/extension/src/entrypoints/settings/pages/server/server-hero.tsx
apps/extension/src/entrypoints/settings/pages/server/server-hero.test.tsx
apps/extension/src/entrypoints/settings/pages/server/server-empty.tsx
apps/extension/src/entrypoints/settings/pages/server/server-paused.tsx
apps/extension/src/entrypoints/settings/pages/server/server-reauth-banner.tsx
apps/extension/src/entrypoints/settings/pages/server/server-info-card.tsx
apps/extension/src/entrypoints/settings/pages/server/server-stats-cards.tsx
apps/extension/src/entrypoints/settings/pages/server/server-sync-log.tsx
apps/extension/src/entrypoints/settings/pages/server/wizard/server-wizard.tsx
apps/extension/src/entrypoints/settings/pages/server/wizard/server-wizard.test.tsx
apps/extension/src/entrypoints/settings/pages/server/wizard/step-backup.tsx
apps/extension/src/entrypoints/settings/pages/server/wizard/step-connect.tsx
apps/extension/src/entrypoints/settings/pages/server/wizard/step-connect.test.tsx
apps/extension/src/entrypoints/settings/pages/server/wizard/step-authorize.tsx
apps/extension/src/entrypoints/settings/pages/server/wizard/step-transfer.tsx
apps/extension/src/entrypoints/settings/pages/server/wizard/step-transfer.test.tsx
apps/extension/src/entrypoints/settings/pages/server/wizard/step-complete.tsx
apps/extension/src/lib/sync-settings.ts
apps/extension/src/lib/__tests__/sync-settings.test.ts
apps/extension/src/lib/host-history.ts
apps/extension/src/lib/__tests__/host-history.test.ts
apps/extension/src/lib/sync-log-loader.ts
apps/extension/src/lib/__tests__/sync-log-loader.test.ts
apps/extension/src/lib/server-stats-fetch.ts
apps/extension/src/lib/__tests__/server-stats-fetch.test.ts
apps/extension/src/lib/server-whoami-fetch.ts
apps/extension/src/lib/__tests__/server-whoami-fetch.test.ts
apps/extension/src/lib/use-sync-settings.ts
apps/extension/src/lib/__tests__/use-sync-settings.test.tsx
apps/cloud/app/routes/api/sync/stats.ts
apps/cloud/app/routes/api/sync/__tests__/stats.test.ts
apps/cloud/app/routes/api/sync/whoami.ts
apps/cloud/app/routes/api/sync/__tests__/whoami.test.ts
apps/cloud/app/services/sync-stats.server.ts
apps/cloud/app/services/__tests__/sync-stats.test.ts
packages/protocol/src/endpoints/stats.ts
packages/protocol/src/endpoints/whoami.ts
packages/ui/src/components/table.tsx
packages/ui/src/components/select.tsx
packages/ui/src/components/badge.tsx
packages/ui/src/components/command.tsx
```

Modified:
```
apps/extension/package.json              # +react-router +@stepperize/react +dexie-react-hooks
apps/extension/src/entrypoints/settings/main.tsx        # 挂 RouterProvider
apps/extension/src/lib/sync-engine.ts    # 加 pause/resume + 401/403 处理 + sync() 早 return
apps/extension/src/lib/sync-client.ts    # createSyncClientFromState 改读 SyncSettings.auth
apps/extension/src/entrypoints/background.ts  # ensureSyncEngine 改读 SyncSettings + 监听新 storage key
apps/extension/src/locales/en.json       # 新 keys
apps/extension/src/locales/zh.json       # 新 keys
packages/protocol/src/index.ts           # +export endpoints/{stats,whoami}
packages/ui/package.json                 # exports 加新 4 个组件
apps/cloud/app/routes.ts                 # 新 routes 注册
```

Deleted:
```
apps/extension/src/entrypoints/settings/App.tsx
```

Verified-unchanged:
```
apps/extension/src/entrypoints/settings/index.html       # WXT entrypoint 不动
apps/extension/src/lib/db.ts                             # syncOutbox schema 不动
apps/extension/src/lib/sync-setup/state-machine.ts       # XState 14 状态不动
apps/extension/src/lib/sync-setup/wizard-progress.ts     # localStorage 进度不动
apps/extension/src/components/settings/sync-disconnect-dialog.tsx  # 复用,只换调用方
apps/cloud/app/services/sync.server.ts                   # snapshot/pull/push 不动
```

---

## Prerequisites

环境(已就位):
- `pnpm install` 跑过;`apps/extension` 与 `apps/cloud` 都能 `lint` / `test` / `build`
- vitest 4 + @testing-library/react 16 已配在 `apps/extension`,环境用 **jsdom**(`apps/extension/vitest.config.ts:8`),setup 仅 `import "@testing-library/jest-dom/vitest"`
- chrome.storage 在 jsdom 下没有全局,**测试每个用例需手动 `vi.stubGlobal('chrome', { storage: { local: {get,set,remove}, onChanged: { addListener, removeListener } } })`**;Task 5 写一个 `apps/extension/src/test/chrome-storage-mock.ts` 公共 helper,后续 sync-settings/use-sync-settings/sync-engine-pause 测试复用

工具:
- 本地 grep 用 `rg`(ripgrep);Acceptance 命令一律用 `rg` 而非 `grep`
- `jq` 已安装(用于 i18n key 对齐验证)

外部依赖确认:
- `react-router@7.x` 与 `@stepperize/react@latest` 在 npm 可用,跟 React 19 兼容
- cloud 端已有 `requireDeviceToken` / `enforceRateLimit` / `requireProtocolVersion` 三件套

---

## Group 1 — Cloud Stats & Whoami API

outcome: cloud 加两个 endpoint,extension 后续可以无缝调用。两个 endpoint 独立可发布。

### Task 1: 新增 `statsResponseSchema` + `whoamiResponseSchema` 到 protocol 包

Files:
- Create: `packages/protocol/src/endpoints/stats.ts`
- Create: `packages/protocol/src/endpoints/whoami.ts`
- Modify: `packages/protocol/src/index.ts`

Design intent: protocol 包是 cloud / extension 共享类型源;新增两个 zod schema 为后续 endpoint 提供契约。沿用现有 `endpoints/health.ts` / `endpoints/snapshot.ts` 一文件一 endpoint + index 桶式 re-export 的模式。

Steps:
- [ ] Step 1: 在 `endpoints/stats.ts` 定义 `statsResponseSchema`(三个非负整数 workspaces/collections/tabs);`endpoints/whoami.ts` 定义 `whoamiResponseSchema`(user 子对象沿用 snapshot 的 user shape + deviceId)
  Acceptance: `rg "statsResponseSchema" packages/protocol/src/endpoints/stats.ts` → ≥ 1 命中;`rg "whoamiResponseSchema" packages/protocol/src/endpoints/whoami.ts` → ≥ 1 命中
- [ ] Step 2: 在 `packages/protocol/src/index.ts` 加 `export * from "./endpoints/stats"; export * from "./endpoints/whoami";`
  Acceptance: `rg "endpoints/(stats|whoami)" packages/protocol/src/index.ts | wc -l` → 2
- [ ] Step 3: 跑 protocol build
  Acceptance: `pnpm --filter @opentab/protocol build` → exit 0
- [ ] Step 4: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(protocol): add stats and whoami response schemas"

DoD: 新 schema 已 export,protocol 包能被 cloud / extension import 而无类型报错。
Commit: `feat(protocol): add stats and whoami response schemas`

### Task 2: 新增 `apps/cloud/app/services/sync-stats.server.ts` countAllForUser 函数

Files:
- Create: `apps/cloud/app/services/sync-stats.server.ts`
- Create: `apps/cloud/app/services/__tests__/sync-stats.test.ts`

Design intent: 把"按 userId 数三表 active 行数"逻辑独立成 service,route handler 只做 HTTP 包装。

Steps:
- [ ] Step 1: 写 failing test,用 in-memory libsql 插 N 条 workspace/collection/tab(含 deletedAt) → expect counts 跳过 deleted、跨 userId 隔离
  Acceptance: `pnpm --filter @opentab/cloud test sync-stats` → FAIL "function not defined"
- [ ] Step 2: 实现 `countAllForUser(db, userId)` → `Promise<{ workspaces, collections, tabs }>`;三个 `db.select({ count: count() }).from(...).where(and(eq(userId), isNull(deletedAt)))` `Promise.all`
  Acceptance: `pnpm --filter @opentab/cloud test sync-stats` → PASS
- [ ] Step 3: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(cloud-sync): add countAllForUser service"

DoD: countAllForUser 跨 userId 隔离 + 排除 deletedAt 行,被对应测试覆盖。
Commit: `feat(cloud-sync): add countAllForUser service`

### Task 3: 新增 `GET /api/sync/stats` route + 注册

Files:
- Create: `apps/cloud/app/routes/api/sync/stats.ts`
- Create: `apps/cloud/app/routes/api/sync/__tests__/stats.test.ts`
- Modify: `apps/cloud/app/routes.ts`

Design intent: 端点本身只做 middleware + service 调用 + schema 校验,沿用 `pull.ts` / `snapshot.ts` 同构。

Steps:
- [ ] Step 1: 写 failing test 覆盖 4 个分支(无 token / 协议版本不符 / 速率限制 / 正常 200)
  Acceptance: `pnpm --filter @opentab/cloud test stats` → FAIL "stats route not found"
- [ ] Step 2: 实现 `loader`,顺序:`requireProtocolVersion` → `requireDeviceToken` → `enforceRateLimit({ endpoint: "sync.stats", max: prod ? 30 : 200, windowSec: 60 })` → `countAllForUser` → `statsResponseSchema.parse`
  Acceptance: `pnpm --filter @opentab/cloud test stats` → PASS
- [ ] Step 3: 在 `apps/cloud/app/routes.ts` 加 route 注册
  Acceptance: `rg '"/api/sync/stats"' apps/cloud/app/routes.ts` → 1 命中
- [ ] Step 4: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(cloud-sync): add GET /api/sync/stats endpoint"

DoD: 新 endpoint 在 cloud build 通过、4 个测试场景全过。
Commit: `feat(cloud-sync): add GET /api/sync/stats endpoint`

### Task 4: 新增 `GET /api/sync/whoami` route + 注册

Files:
- Create: `apps/cloud/app/routes/api/sync/whoami.ts`
- Create: `apps/cloud/app/routes/api/sync/__tests__/whoami.test.ts`
- Modify: `apps/cloud/app/routes.ts`

Design intent: 仅做 token 校验 + 返回当前 user 信息;给 extension Case 1 自动重连用。

Steps:
- [ ] Step 1: 写 failing test 覆盖(无 token → 401 / token 无效 → 401 / 正常 200 返回 `{ user, deviceId }`)
  Acceptance: `pnpm --filter @opentab/cloud test whoami` → FAIL "whoami route not found"
- [ ] Step 2: 实现 loader,中间件链同 stats(限流稍紧:`max: prod ? 60 : 300`)。**`requireDeviceToken` 返回 `{ userId, deviceId, device }`,无 user 字段**;handler 需额外 `db.select().from(users).where(eq(users.id, auth.userId)).limit(1)` 拿 user 行(import `users` from `~/drizzle/schema/auth` 或本仓库等价路径,plan 阶段确认),再 `whoamiResponseSchema.parse({ user: { id, name, email }, deviceId: auth.deviceId })`
  Acceptance: `pnpm --filter @opentab/cloud test whoami` → PASS
- [ ] Step 3: 在 `routes.ts` 加 route 注册
  Acceptance: `rg '"/api/sync/whoami"' apps/cloud/app/routes.ts` → 1 命中
- [ ] Step 4: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(cloud-sync): add GET /api/sync/whoami endpoint"

DoD: whoami endpoint 上线,3 测试场景全过。
Commit: `feat(cloud-sync): add GET /api/sync/whoami endpoint`

---

## Group 2 — SyncSettings 数据模型 + Migration

outcome: 新建三层正交 state lib,带 v1→v2 migration,React hook,host history util。后续 UI 全部基于此 lib。

### Task 5: 新建 `lib/sync-settings.ts` 类型与 getter/setter

Files:
- Create: `apps/extension/src/lib/sync-settings.ts`
- Create: `apps/extension/src/lib/__tests__/sync-settings.test.ts`

Design intent: spec §3.0 三层结构;getter 自带 v1→v2 migration(Task 6 实现 migration 逻辑);setter 全量覆盖。chrome.storage key = `opentab_sync_settings_v1`(注意:v1 是新 key 的版本号;旧 key 是 `opentab_sync_auth_v1`,见 spec §3.0)。

Steps:
- [ ] Step 1: 写 failing test:`getSyncSettings` 返回默认值(全 null/false)、`setSyncSettings({ enabled: true, ... })` 后再 get 拿回相同值
  Acceptance: `pnpm --filter @opentab/extension test sync-settings` → FAIL "sync-settings module not found"
- [ ] Step 2: 实现 `SyncSettings` 类型 + `getSyncSettings()` + `setSyncSettings(partial)` + `clearSyncSettings()`(3 函数,~50 行);chrome.storage.local 读写
  Acceptance: `pnpm --filter @opentab/extension test sync-settings` → PASS(基础 read/write 部分)
- [ ] Step 3: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(ext-settings): add SyncSettings storage lib"

DoD: 基础 get/set/clear 在 chrome.storage 上正确工作,migration 逻辑留 Task 6。
Commit: `feat(ext-settings): add SyncSettings storage lib`

### Task 6: v1→v2 Migration

Files:
- Modify: `apps/extension/src/lib/sync-settings.ts`(在 `getSyncSettings` 里加 migration 逻辑)
- Modify: `apps/extension/src/lib/__tests__/sync-settings.test.ts`(加 4 fixture 测试)

Design intent: 只在第一次 `getSyncSettings()` 时跑;读旧 key → 按 union kind 映射 → 写新 key → 删旧 key。失败兜底 = 重置成 disabled + log warn。

**关键细节:旧 `SyncAuthState.authenticated` 仅存 `{ host, deviceId, deviceToken, deviceName }`(`apps/extension/src/lib/sync-auth-storage.ts:23-29`),无 `user`**。因此新 `SyncSettings.auth.user` 必须 typed 为 `{ id: string, name: string, email?: string } | undefined`;迁移时 `user` 留空,UserBar 渲染头像/名字 fallback 顺序:`user.name` → `auth.deviceName` → `"已认证"`。Task 30 whoami 调用成功后顺手回填 `auth.user`(详见 Task 30 Step 3)。

Steps:
- [ ] Step 1: 写 failing test:三个 fixture(`{ kind: "disabled" }` / `{ kind: "configured", host }` / `{ kind: "authenticated", host, deviceId, deviceToken, deviceName }`)+ 一个损坏 fixture(JSON 解析失败),分别预设旧 key,期望 `getSyncSettings()` 返回新结构(authenticated 转出的 `auth.user === undefined` + `auth.deviceName` 保留)+ 旧 key 已删
  Acceptance: `pnpm --filter @opentab/extension test sync-settings` → FAIL "migration not implemented"
- [ ] Step 2: 在 `getSyncSettings` 里检测旧 key `opentab_sync_auth_v1` → 按映射规则(spec §3.0)转新,authenticated 路径产出 `auth: { deviceToken, deviceId, deviceName, user: undefined, issuedAt: Date.now() }` → `chrome.storage.local.set({ opentab_sync_settings_v1: ... })` → `chrome.storage.local.remove("opentab_sync_auth_v1")`。损坏数据(JSON 解析失败 / kind 不识别)→ 写默认值 + log warn
  Acceptance: `pnpm --filter @opentab/extension test sync-settings` → PASS(包含 4 fixture)
- [ ] Step 3: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(ext-settings): migrate SyncAuthState v1 to SyncSettings v2"

DoD: 4 个 migration 路径全过,旧 key 在 migration 后被清理,migrated authenticated 用户的 deviceName 保留。
Commit: `feat(ext-settings): migrate SyncAuthState v1 to SyncSettings v2`

### Task 6.5: 迁移 background.ts + sync-client.ts consumer 到 SyncSettings

Files:
- Modify: `apps/extension/src/entrypoints/background.ts`
- Modify: `apps/extension/src/lib/sync-client.ts`

Design intent: 旧 sync engine 启停由 `getSyncAuth().kind === "authenticated"` 控制(`background.ts:27` `ensureSyncEngine`,`background.ts:81-95` storage onChanged listener),`sync-client.ts:244-247` `createSyncClientFromState` 也按 `state.kind` 构造 client。SyncSettings 没有 `kind` 字段,这两个 consumer 不迁就会变成"永远 disabled"。本 Task 把它们都迁到 `getSyncSettings()`,gating 条件改成 `enabled && auth`,storage key 改成 `opentab_sync_settings_v1`。

**这是 high-risk consumer 迁移,M1 gate 的 `useSyncAuthState`/`getSyncAuth` 残留检查就指它们。**

Steps:
- [ ] Step 1: grep 当前所有 caller,确认本 Task 覆盖完整
  Acceptance: `rg "getSyncAuth\b|useSyncAuthState|setSyncAuth\b" apps/extension/src --type ts | rg -v "lib/sync-auth-storage|lib/use-sync-auth-state|components/settings/sync-(setup-wizard|status-card|disconnect-dialog)|__tests__/|entrypoints/settings/App\.tsx"` → 输出列表只剩 `background.ts` + `sync-client.ts`(若多于这两个 → STOP,告知请求者扩 Task 覆盖。注:`App.tsx` 留待 Task 15 删除;旧 test mock 文件由本 Task Step 6 更新)
- [ ] Step 2: 改 `background.ts` `ensureSyncEngine`:`getSyncAuth()` → `getSyncSettings()`;gating 改成 `if (!settings.enabled || !settings.auth) { destroyEngine(); return; }`;构造 SyncClient 时传 `settings.savedConfig.host` + `settings.auth`
  Acceptance: `rg "getSyncAuth|opentab_sync_auth_v1" apps/extension/src/entrypoints/background.ts` → 0 命中
- [ ] Step 3: 改 `background.ts` storage onChanged listener,key 从 `opentab_sync_auth_v1` 换成 `opentab_sync_settings_v1`
  Acceptance: `rg "opentab_sync_settings_v1" apps/extension/src/entrypoints/background.ts` → ≥ 1 命中
- [ ] Step 4: 改 `sync-client.ts` `createSyncClientFromState` 签名为接收 `SyncSettings`,从 `settings.savedConfig.host` + `settings.auth.deviceToken` 构造
  Acceptance: `rg "SyncAuthState" apps/extension/src/lib/sync-client.ts` → 0 命中
- [ ] Step 5: 改 `sync-client.ts:166` 内部 401 处理 `await clearSyncAuth()` → `await setSyncSettings({ auth: null })`(import from `./sync-settings`)。这一处与 Task 29 SyncEngine 401 catch 不重复:client 内部直接抛错让 engine 捕获 + clean state,但避免双向调用
  Acceptance: `rg "clearSyncAuth" apps/extension/src/lib/sync-client.ts` → 0 命中
- [ ] Step 6: 更新 `apps/extension/src/lib/__tests__/sync-client.test.ts` mock:`vi.mock('./sync-auth-storage')` → `vi.mock('./sync-settings')`,`getSyncAuth` 替换为 `getSyncSettings`,返回 shape 从 `{ kind: 'authenticated', host, deviceToken, ... }` 改成 `{ enabled: true, savedConfig: { host }, auth: { deviceToken, ... } }`
  Acceptance: `pnpm --filter @opentab/extension test sync-client` → PASS
- [ ] Step 7: 跑全部 test + build 确认无回归
  Acceptance: `pnpm --filter @opentab/extension test && pnpm --filter @opentab/extension build` → exit 0
- [ ] Step 8: commit
  Acceptance: `git log -1 --pretty=%s` → "refactor(ext-sync): migrate background and sync-client to SyncSettings"

DoD: background.ts + sync-client.ts 不再引用 `getSyncAuth` / `SyncAuthState` / 旧 storage key;现有 sync 行为(auth 完整时启动 engine)保持等价。
Commit: `refactor(ext-sync): migrate background and sync-client to SyncSettings`

### Task 7: hostHistory util(去重 + FIFO max 5)

Files:
- Create: `apps/extension/src/lib/host-history.ts`
- Create: `apps/extension/src/lib/__tests__/host-history.test.ts`

Design intent: 纯函数,操作 SyncSettings.hostHistory 数组。不直接读写 chrome.storage,由 caller 拼装。

Steps:
- [ ] Step 1: 写 failing test:`pushHost([], "a")` → 1 条;`pushHost([{host:"a"}], "a")` → 1 条(去重);`pushHost([5 条], "new")` → 5 条(FIFO,新的在前);排序按 lastUsedAt desc
  Acceptance: `pnpm --filter @opentab/extension test host-history` → FAIL
- [ ] Step 2: 实现 `pushHost(history, newHost): HostEntry[]` + `removeHost(history, host): HostEntry[]`(后者给"忘记此服务器"用)
  Acceptance: `pnpm --filter @opentab/extension test host-history` → PASS
- [ ] Step 3: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(ext-settings): add host-history utils"

DoD: 去重 by host string、FIFO max 5、按 lastUsedAt desc 排序、不可变(返回新数组)。
Commit: `feat(ext-settings): add host-history utils`

### Task 8: `useSyncSettings` React hook

Files:
- Create: `apps/extension/src/lib/use-sync-settings.ts`
- Create: `apps/extension/src/lib/__tests__/use-sync-settings.test.tsx`

Design intent: 类似现有 `useSyncAuthState`,订阅 chrome.storage.onChanged 事件,任意写 → 重读。

Steps:
- [ ] Step 1: 写 failing test:render hook,初始 disabled;mock `chrome.storage.local.set` 改值并触发 onChanged → hook 返回新值
  Acceptance: `pnpm --filter @opentab/extension test use-sync-settings` → FAIL
- [ ] Step 2: 实现 hook(`useEffect` 调 `getSyncSettings` + 注册 `chrome.storage.onChanged` listener,key === `opentab_sync_settings_v1` 时刷新),~30 行
  Acceptance: `pnpm --filter @opentab/extension test use-sync-settings` → PASS
- [ ] Step 3: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(ext-settings): add useSyncSettings hook"

DoD: hook 在 storage 变化时正确重渲染,无 listener 泄漏(测试 cleanup 后 listener 已 remove)。
Commit: `feat(ext-settings): add useSyncSettings hook`

---

## Group 3 — Router Shell Scaffold

outcome: settings.html 内挂 HashRouter + 4 路由 + shell layout。空内容也要能渲染、4 个 nav 链接能跳转。

### Task 9: 加依赖 react-router + @stepperize/react + dexie-react-hooks

Files:
- Modify: `apps/extension/package.json`

Steps:
- [ ] Step 1: `cd apps/extension && pnpm add react-router @stepperize/react dexie-react-hooks`
  Acceptance: `rg '"react-router"|"@stepperize/react"|"dexie-react-hooks"' apps/extension/package.json` → 3 命中
- [ ] Step 2: `pnpm install` 自动跑 lockfile
  Acceptance: `git status --short pnpm-lock.yaml` → modified
- [ ] Step 3: commit
  Acceptance: `git log -1 --pretty=%s` → "chore(ext): add react-router, stepperize, dexie-react-hooks deps"

DoD: 三个依赖装好,build 仍可跑(下个 Task 会真正 import)。
Commit: `chore(ext): add react-router, stepperize, dexie-react-hooks deps`

### Task 9.5: Scaffold 缺失的 shadcn 组件到 `packages/ui`

Files:
- Create: `packages/ui/src/components/table.tsx`
- Create: `packages/ui/src/components/select.tsx`
- Create: `packages/ui/src/components/badge.tsx`
- Create: `packages/ui/src/components/command.tsx`
- Modify: `packages/ui/package.json`(`exports` 字段加 4 个新条目)

Design intent: `packages/ui/package.json` 用了显式 `exports` map(只导出已加白名单的组件),Group 5+ 需要 table/select/badge/command(后者用于 step-connect Combobox = Popover + Command)。直接 `pnpm dlx shadcn@latest add table select badge command -c packages/ui` 落地组件,然后手动加 exports 条目。**纯重命名 + 配置,放弃 TDD 节奏**。

Steps:
- [ ] Step 1: 在 `packages/ui` 跑 shadcn CLI 加 4 个组件
  Acceptance: `ls packages/ui/src/components/{table,select,badge,command}.tsx` → 4 文件存在
- [ ] Step 2: 在 `packages/ui/package.json` `exports` 加 4 条 `"./components/<name>": "./src/components/<name>.tsx"`(沿用现有 button/card 等条目格式)
  Acceptance: `rg '"./components/(table|select|badge|command)"' packages/ui/package.json | wc -l` → 4
- [ ] Step 3: 跑 ui build 确保无破损
  Acceptance: `pnpm --filter @opentab/ui build` → exit 0
- [ ] Step 4: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(ui): add table, select, badge, command components"

DoD: 4 个组件 + 4 条 exports;`@opentab/ui/components/{table,select,badge,command}` 可被 extension 端 import。
Commit: `feat(ui): add table, select, badge, command components`

### Task 10: 新建 `routes.tsx` + 改 `main.tsx` 挂 RouterProvider + sidebar 骨架

Files:
- Create: `apps/extension/src/entrypoints/settings/routes.tsx`
- Create: `apps/extension/src/entrypoints/settings/shell/settings-shell.tsx`
- Create: `apps/extension/src/entrypoints/settings/shell/settings-sidebar.tsx`
- Modify: `apps/extension/src/entrypoints/settings/main.tsx`

Design intent: 4 路由暂时全部指向占位组件 `<div data-testid="placeholder-{name}">WIP</div>`,等后续 Task 替换。settings-shell 是 layout(渲染 sidebar + `<Outlet />`),sidebar 暂时只放 logo + 4 个 NavLink + 空 footer。状态灯 / UserBar 留 Task 32。

Steps:
- [ ] Step 1: `routes.tsx` 用 `createHashRouter` 定 4 路由;`shell/settings-shell.tsx` 240×600 grid layout(`grid-cols-[240px_1fr]` + `<Outlet />`);`shell/settings-sidebar.tsx` 4 NavLink + active 高亮(`isActive` className)
  Acceptance: `rg "createHashRouter" apps/extension/src/entrypoints/settings/routes.tsx` → 1 命中
- [ ] Step 2: `main.tsx` 把 `<App />` 替换为 `<RouterProvider router={router} />`
  Acceptance: `rg "RouterProvider" apps/extension/src/entrypoints/settings/main.tsx` → 1 命中
- [ ] Step 3: 跑 build 确认 hash router 不破构建
  Acceptance: `pnpm --filter @opentab/extension build` → exit 0
- [ ] Step 4: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(ext-settings): scaffold HashRouter shell with 4 routes"

DoD: settings.html 加载后可以点 sidebar 4 个链接,URL 变成 `#/`、`#/general`、`#/import-export`、`#/server`,active 高亮正确。
Commit: `feat(ext-settings): scaffold HashRouter shell with 4 routes`

### Task 11: shell-sidebar 测试 + UserBar 基础版

Files:
- Create: `apps/extension/src/entrypoints/settings/shell/settings-sidebar.test.tsx`
- Create: `apps/extension/src/entrypoints/settings/shell/user-bar.tsx`

Design intent: UserBar 暂时只渲染头像占位 + ThemeToggler(icon) + cycleLocale 按钮。状态灯 / 用户名 / hover tooltip 留 Task 32(Group 9)。`useLocale()` 没有 `langAbbr` 字段,跟 `workspace-sidebar.tsx:97` 同样的方式内联计算:`locale === "en" ? t("sidebar.language_en") : t("sidebar.language_zh")`(或抽公共,Task 32 收尾时考虑 lift 到 useLocale)。

Steps:
- [ ] Step 1: 写 sidebar 测试:渲染 + 期望 4 个 NavLink + 各自 to= 正确;active 状态(模拟 location.hash)
  Acceptance: `pnpm --filter @opentab/extension test settings-sidebar` → FAIL "Cannot find component"
- [ ] Step 2: 把 user-bar 引入 sidebar footer;UserBar 渲染 `<ThemeToggler type="icon" />` + cycleLocale 按钮(label/abbr 像 workspace-sidebar.tsx:94-97 那样内联算)+ 灰头像占位
  Acceptance: `pnpm --filter @opentab/extension test settings-sidebar` → PASS
- [ ] Step 3: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(ext-settings): add settings sidebar with theme/locale toggles"

DoD: sidebar 测试覆盖 NavLink + UserBar 基础渲染。
Commit: `feat(ext-settings): add settings sidebar with theme/locale toggles`

---

## Group 4 — Welcome / General / Import-Export Pages

outcome: 把旧 App.tsx 的 general / import-export panel 拆成路由页面。新增 welcome 页 3 张 CTA。

### Task 12: WelcomePage 3 张 CTA

Files:
- Create: `apps/extension/src/entrypoints/settings/pages/welcome-page.tsx`
- Create: `apps/extension/src/entrypoints/settings/pages/welcome-page.test.tsx`

Design intent: 3 张 `<Card>` 横向 grid,每张含 icon + title + desc + CTA `<Link>`。`<Link to="/general">` 等 SPA 路由跳转,不开新 tab。

Steps:
- [ ] Step 1: 写测试:期望 3 个 CTA `<a>` 元素,href 分别为 `#/general` / `#/import-export` / `#/server`,文案使用 i18n key
  Acceptance: `pnpm --filter @opentab/extension test welcome-page` → FAIL
- [ ] Step 2: 实现 welcome-page,Card 用 `@opentab/ui/components/card`;3 张 grid `grid-cols-3 gap-3`(窄屏 stack)
  Acceptance: `pnpm --filter @opentab/extension test welcome-page` → PASS
- [ ] Step 3: 把 routes.tsx 里 `/` 占位换成 `<WelcomePage />`
  Acceptance: `rg "WelcomePage" apps/extension/src/entrypoints/settings/routes.tsx` → 1 命中
- [ ] Step 4: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(ext-settings): add welcome page with 3 setup CTAs"

DoD: 进入 settings.html 默认看到欢迎页 3 张卡,点击各自跳到 `#/general` 等。
Commit: `feat(ext-settings): add welcome page with 3 setup CTAs`

### Task 13: GeneralPage 从旧 App.tsx 抽出 Appearance + About

Files:
- Create: `apps/extension/src/entrypoints/settings/pages/general-page.tsx`
- Modify: `apps/extension/src/entrypoints/settings/routes.tsx`

Design intent: 复用旧 App.tsx 的 Appearance section(THEME_OPTIONS 单选 / LANGUAGE_OPTIONS 列表)+ BuildInfo 组件,搬到独立文件。i18n key 不变(`settings.appearance.*` / `settings.about.*`)。**纯重命名 + 文件移动,放弃 TDD 节奏**(无新行为)。**禁止从 App.tsx 顺手把 sync 相关 import 复制过来**(`useSyncAuthState` / `SyncSetupWizard` / `SyncStatusCard` / `useState<SettingsPanel>` 全部不要)。

Steps:
- [ ] Step 1: 把旧 App.tsx 里 `activePanel === "general"` 分支的 JSX 复制到 general-page.tsx,提取 useState/effect 到本文件
  Acceptance: `rg "settings.appearance.title" apps/extension/src/entrypoints/settings/pages/general-page.tsx` → 1 命中
- [ ] Step 2: 把 BuildInfo 组件搬过来
  Acceptance: `rg "BuildInfo" apps/extension/src/entrypoints/settings/pages/general-page.tsx` → 1 命中
- [ ] Step 3: 校验无 sync-related import 被顺手带过来
  Acceptance: `rg "useSyncAuthState|SyncSetupWizard|SyncStatusCard|SettingsPanel" apps/extension/src/entrypoints/settings/pages/general-page.tsx` → 0 命中
- [ ] Step 4: routes.tsx 里 `/general` 换成 `<GeneralPage />`,build 通过
  Acceptance: `pnpm --filter @opentab/extension build` → exit 0
- [ ] Step 5: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(ext-settings): extract general page (theme/locale/about)"

DoD: `#/general` 显示主题切换 / 语言切换 / 关于版本号,功能跟旧 App.tsx 一致;无 sync 相关 import 残留。
Commit: `feat(ext-settings): extract general page (theme/locale/about)`

### Task 14: ImportExportPage 从旧 App.tsx 抽出导入导出按钮

Files:
- Create: `apps/extension/src/entrypoints/settings/pages/import-export-page.tsx`
- Modify: `apps/extension/src/entrypoints/settings/routes.tsx`

Design intent: 纯文件移动,放弃 TDD 节奏(同 Task 13)。**禁止顺手带过来 sync-related import**。

Steps:
- [ ] Step 1: 复制旧 App.tsx `activePanel === "import-export"` 分支 JSX + `handleExport` / `handleImport` callback
  Acceptance: `rg "exportAllData|processImportFile" apps/extension/src/entrypoints/settings/pages/import-export-page.tsx` → 2 命中
- [ ] Step 2: 校验无 sync 相关 import 残留
  Acceptance: `rg "useSyncAuthState|SyncSetupWizard|SyncStatusCard|SettingsPanel" apps/extension/src/entrypoints/settings/pages/import-export-page.tsx` → 0 命中
- [ ] Step 3: routes.tsx 替换 `/import-export` 占位
  Acceptance: `pnpm --filter @opentab/extension build` → exit 0
- [ ] Step 4: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(ext-settings): extract import-export page"

DoD: `#/import-export` 导出按钮触发下载、导入按钮触发 file picker,跟旧 App.tsx 一致;无 sync 相关 import 残留。
Commit: `feat(ext-settings): extract import-export page`

### Task 15: 删除旧 App.tsx

Files:
- Delete: `apps/extension/src/entrypoints/settings/App.tsx`

Design intent: 旧 App.tsx 内容已全部迁出,清理。

Steps:
- [ ] Step 1: `rg 'from "./App"' apps/extension/src/entrypoints/settings/` → 应 0 命中
  Acceptance: 输出空
  On failure: 命中 > 0 → STOP;说明还有引用,先迁完再删
- [ ] Step 2: `git rm apps/extension/src/entrypoints/settings/App.tsx`
  Acceptance: `git status -s` 显示 `D ...App.tsx`
- [ ] Step 3: 跑 lint + build
  Acceptance: `pnpm --filter @opentab/extension lint && pnpm --filter @opentab/extension build` → exit 0
- [ ] Step 4: commit
  Acceptance: `git log -1 --pretty=%s` → "refactor(ext-settings): remove legacy App.tsx"

DoD: App.tsx 已不存在,extension 仍能完整 build。
Commit: `refactor(ext-settings): remove legacy App.tsx`

---

## Group 5 — Server Page 静态部分(empty / paused / 信息卡 / 统计 / 同步日志)

outcome: 新建 server-page 状态分发壳子 + 4 个状态分支组件 + 信息/统计/日志 3 个 connected-only 组件。**hero 留 Group 6,wizard 留 Group 7**。

### Task 16: server-page.tsx 状态分发 + server-empty + server-paused

Files:
- Create: `apps/extension/src/entrypoints/settings/pages/server/server-page.tsx`
- Create: `apps/extension/src/entrypoints/settings/pages/server/server-page.test.tsx`
- Create: `apps/extension/src/entrypoints/settings/pages/server/server-empty.tsx`
- Create: `apps/extension/src/entrypoints/settings/pages/server/server-paused.tsx`
- Modify: `apps/extension/src/entrypoints/settings/routes.tsx`

Design intent: server-page 用 useSyncSettings 推导出 4 状态 → 渲染分支组件。empty / paused 是纯静态(B 方案插图 + 一句场景 / read-only 信息卡)。

```ts
// pseudo-code, shape only
function ServerPage() {
  const settings = useSyncSettings();
  if (!settings.enabled && !settings.savedConfig) return <ServerEmpty />;
  if (!settings.enabled && settings.savedConfig) return <ServerPaused config={settings.savedConfig} />;
  if (settings.enabled && !settings.auth) return <ServerWizard />;
  return <ServerConnected settings={settings} />;
}
```

Steps:
- [ ] Step 1: 写 failing test:mock useSyncSettings 4 种返回 → 期望 4 个对应分支组件出现(用 testing-library `getByTestId`)
  Acceptance: `pnpm --filter @opentab/extension test server-page` → FAIL
- [ ] Step 2: 实现 server-page 状态分发 + server-empty(B 方案静态插图 + scenario 文案)+ server-paused(read-only host/lastUsedAt 卡 + "💡 配置数据保留" hint)+ ServerWizard / ServerConnected 占位
  Acceptance: `pnpm --filter @opentab/extension test server-page` → PASS
- [ ] Step 3: routes.tsx 替换 `/server` 占位为 `<ServerPage />`
  Acceptance: `pnpm --filter @opentab/extension build` → exit 0
- [ ] Step 4: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(ext-settings): add server page state dispatcher with empty and paused"

DoD: `#/server` 在 disabled 显示 empty 插图,paused 显示 read-only 卡;wizard / connected 暂时占位。
Commit: `feat(ext-settings): add server page state dispatcher with empty and paused`

### Task 17: server-info-card

Files:
- Create: `apps/extension/src/entrypoints/settings/pages/server/server-info-card.tsx`

Design intent: 显示 endpoint / 设备名 / 设备 ID / 最后同步时间;数据来源 SyncSettings.savedConfig + SyncSettings.auth + db.syncMeta lastSyncAt。无交互(立即同步 / 断开按钮全在 hero,见 Group 6)。**纯展示组件,放弃 TDD 节奏**(由消费者集成测试覆盖)。

Steps:
- [ ] Step 1: 实现组件,接受 `{ savedConfig, auth, lastSyncAt }` props,渲染 grid;不做 fetch、不做 mutation
  Acceptance: `rg "endpoint|deviceName|deviceId|lastSync" apps/extension/src/entrypoints/settings/pages/server/server-info-card.tsx` → ≥ 4 命中
- [ ] Step 2: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(ext-settings): add server info card component"

DoD: 纯展示组件,被 Task 24 ServerConnected 引入。
Commit: `feat(ext-settings): add server info card component`

### Task 18: `lib/server-stats-fetch.ts` + 测试

Files:
- Create: `apps/extension/src/lib/server-stats-fetch.ts`
- Create: `apps/extension/src/lib/__tests__/server-stats-fetch.test.ts`

Design intent: 纯 fetch util,接受 `{ host, deviceToken }`,调 `${host}/api/sync/stats` 带 `Authorization: Bearer ${deviceToken}` + `x-protocol-version`。返回 `{ ok: true, stats } | { ok: false, error: 'unauthorized' | 'network' | 'server' }`。

Steps:
- [ ] Step 1: 写 failing test,mock global fetch 4 个分支(200 / 401 / 500 / network 失败),expect 各自 result
  Acceptance: `pnpm --filter @opentab/extension test server-stats-fetch` → FAIL
- [ ] Step 2: 实现 ~30 行 fetch util;不重试,失败直接 return
  Acceptance: `pnpm --filter @opentab/extension test server-stats-fetch` → PASS
- [ ] Step 3: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(ext-settings): add server stats fetch util"

DoD: 4 分支测试全过。
Commit: `feat(ext-settings): add server stats fetch util`

### Task 19: server-stats-cards M/N 显示 + tooltip + retry

Files:
- Create: `apps/extension/src/entrypoints/settings/pages/server/server-stats-cards.tsx`

Design intent: 三张卡;authenticated 时左 M(server,fetch) / 右 N(local,useLiveQuery)用 ` / ` 分隔;失败显 `?  / N` + retry。tooltip 用 shadcn Tooltip。**视觉为主,放弃 TDD 节奏**;由 Manual 验收覆盖。

Steps:
- [ ] Step 1: 实现 useLiveQuery 三个 count(workspaces / collections / tabs);useEffect 调 server-stats-fetch(只在 mount 时,不轮询)
  Acceptance: `rg "useLiveQuery|server-stats-fetch" apps/extension/src/entrypoints/settings/pages/server/server-stats-cards.tsx` → ≥ 2 命中
- [ ] Step 2: 渲染 3 张卡 + tooltip + retry button
  Acceptance: `rg "Tooltip|retry" apps/extension/src/entrypoints/settings/pages/server/server-stats-cards.tsx -i` → ≥ 2 命中
- [ ] Step 3: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(ext-settings): add server stats cards with M/N drift display"

DoD: 卡片 mount 时拉一次 server stats,tooltip + retry button 可用。
Commit: `feat(ext-settings): add server stats cards with M/N drift display`

### Task 20: `lib/sync-log-loader.ts` 同步日志数据加载 + 父级名 batch + 测试

Files:
- Create: `apps/extension/src/lib/sync-log-loader.ts`
- Create: `apps/extension/src/lib/__tests__/sync-log-loader.test.ts`

Design intent: 接收 `{ page, filter }` → return `LogRow[]`(spec §3.1)。`useLiveQuery` 包在 hook 里;loader 函数本身只负责一次性 load,可单测。**关键字段:每个 SyncOp 行有 `entitySyncId` 字段,对 `entityType === 'workspace'` 该字段就是 workspaceSyncId;对 collection / tab 则需要进一步 batch 查 payload.parentSyncId 链路。**

```ts
// pseudo-code, shape only
type Filter = 'all' | 'pending' | 'failed' | 'dead';
async function loadSyncLog(db: Dexie, page: number, filter: Filter): Promise<LogRow[]> {
  const rows = filter === 'all'
    ? await db.syncOutbox.orderBy('id').reverse().offset((page-1)*50).limit(50).toArray()
    : await db.syncOutbox
        .where('[status+createdAt]')
        .between([filter, Dexie.minKey], [filter, Dexie.maxKey])
        .reverse().offset((page-1)*50).limit(50).toArray();
  // 收集父级 syncIds → batch 查 workspaces / tabCollections → build maps
  // map rows to LogRow with workspaceName/collectionName/tabTitle
  return rows.map(toLogRow);
}
```

Steps:
- [ ] Step 1: 写 failing test:fixture 插 5 条 outbox + 2 条 workspace + 3 条 collection,期望 LogRow 含正确 names;父级缺失 fallback 到 syncId 前 4 位;filter='dead' 只返回 dead 行
  Acceptance: `pnpm --filter @opentab/extension test sync-log-loader` → FAIL
- [ ] Step 2: 实现 loader(spec §5.1 完整逻辑),约 60 行
  Acceptance: `pnpm --filter @opentab/extension test sync-log-loader` → PASS
- [ ] Step 3: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(ext-settings): add sync log loader with parent name resolution"

DoD: 4 个测试场景(空 outbox / 完整父级 / 父级缺失 / filter)全过。
Commit: `feat(ext-settings): add sync log loader with parent name resolution`

### Task 21: server-sync-log 表格组件

Files:
- Create: `apps/extension/src/entrypoints/settings/pages/server/server-sync-log.tsx`

Design intent: useLiveQuery 包 sync-log-loader;7 列表格 + 表头 dropdown filter + 分页按钮 + 底部 4 状态图例。父级 syncId 灰、自身白、无关 `—`(spec §4.3)。**视觉为主,放弃 TDD 节奏**(数据正确性已覆盖在 Task 20 loader 测试)。

Steps:
- [ ] Step 1: 实现组件:useState page + filter,useLiveQuery(`() => loadSyncLog(db, page, filter)`) + 渲染 7 列 table + dropdown(`@opentab/ui/components/select`) + 分页 + 图例
  Acceptance: `rg "loadSyncLog" apps/extension/src/entrypoints/settings/pages/server/server-sync-log.tsx` → 1 命中
- [ ] Step 2: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(ext-settings): add server sync log table"

DoD: 表格组件完成,数据流 = useLiveQuery → loader → table。
Commit: `feat(ext-settings): add server sync log table`

---

## Group 6 — Server Hero + Toggle 集成

outcome: server-hero 主开关 + status badge + 立即同步 + ⋯ 菜单 + connected 完整组装。SyncEngine 监听 enabled。

### Task 22: SyncEngine 增加 pause/resume,监听 SyncSettings.enabled

Files:
- Modify: `apps/extension/src/lib/sync-engine.ts`
- Create: `apps/extension/src/lib/__tests__/sync-engine-pause.test.ts`

Design intent: SyncEngine 已有 `sync()` / `syncIfNeeded()` / `notifyChange()` 公共方法(`apps/extension/src/lib/sync-engine.ts:152-172`,**没有 `tick()`**)。加一个内部 `paused` flag,外部通过 `pause()` / `resume()` 切。**listener 注册放在 background.ts 里(那里已经有 storage onChanged + ensureSyncEngine 入口),不在 SyncEngine ctor**,避免单元测试需要 stub chrome 全局。

**与 Task 6.5 的接力**:Task 6.5 已经把 `background.ts` storage onChanged listener 改成监听 `opentab_sync_settings_v1`,内部还会调 `ensureSyncEngine()` + 在 auth 变化时 `engine.sync()`(保留原有 immediate-sync 行为)。本 Task 在同一个 listener 末尾加 pause/resume 路径:`if (!newSettings.enabled) engine.pause(); else if (oldSettings.enabled === false && newSettings.enabled) engine.resume();`,**不要拆 listener,不要替换 ensureSyncEngine + immediate-sync 逻辑**。

Steps:
- [ ] Step 1: 写 failing test:创建 engine,调 `pause()`,await `engine.sync()` → expect 早 return(mock SyncClient.push 无调用);`resume()` 后 `sync()` 恢复
  Acceptance: `pnpm --filter @opentab/extension test sync-engine-pause` → FAIL
- [ ] Step 2: 在 SyncEngine class 加 `pause()` / `resume()` / `isPaused` getter;`sync()` 入口判断 paused 直接 return Promise.resolve
  Acceptance: `pnpm --filter @opentab/extension test sync-engine-pause` → PASS
- [ ] Step 3: 在 background.ts 现有 settings-onChanged listener 末尾(Task 6.5 落地后的位置)加 `engine.pause()` / `engine.resume()` 调用,基于 `newSettings.enabled` 切换。**不动 ensureSyncEngine + immediate-sync 既有逻辑**
  Acceptance: `rg "engine\.(pause|resume)" apps/extension/src/entrypoints/background.ts | wc -l` → ≥ 2
- [ ] Step 4: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(ext-sync-engine): support pause/resume gated by SyncSettings.enabled"

DoD: engine pause 时 outbox 仍可写,但 `sync()` 早 return;background.ts 监听 SyncSettings.enabled 切换 → engine pause/resume 立刻生效。
Commit: `feat(ext-sync-engine): support pause/resume gated by SyncSettings.enabled`

### Task 23: server-hero(主开关 + status badge + 立即同步 + ⋯ 菜单)

Files:
- Create: `apps/extension/src/entrypoints/settings/pages/server/server-hero.tsx`
- Create: `apps/extension/src/entrypoints/settings/pages/server/server-hero.test.tsx`

Design intent: 渲染顶部 hero 卡片;Switch 调 `setSyncSettings({ enabled })`;立即同步 button(`enabled+auth` 时显示)调 SyncEngine `sync()`(通过 chrome message 发给 background,因为 engine singleton 在 background.ts);⋯ 菜单按矩阵显示项(spec §4.3)。

Steps:
- [ ] Step 1: 写 failing test 覆盖 5 个状态(empty / paused / wizard 中 / 重连中 / 已连接),期望右上控件矩阵正确(立即同步可见性 / Switch state / ⋯ 菜单项数)
  Acceptance: `pnpm --filter @opentab/extension test server-hero` → FAIL
- [ ] Step 2: 实现组件,Switch 用 `@opentab/ui/components/switch`;⋯ 菜单用 `@opentab/ui/components/dropdown-menu`;立即同步 button 内联 subtitle 后(flex-wrap)
  Acceptance: `pnpm --filter @opentab/extension test server-hero` → PASS(5 状态全过)
- [ ] Step 3: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(ext-settings): add server hero with toggle, sync now, and overflow menu"

DoD: hero 5 状态控件矩阵跟 spec §4.3 一致;Switch onclick 调 setSyncSettings 改 enabled。
Commit: `feat(ext-settings): add server hero with toggle, sync now, and overflow menu`

### Task 24: ServerConnected 组装(hero + info-card + stats-cards + sync-log)

Files:
- Modify: `apps/extension/src/entrypoints/settings/pages/server/server-page.tsx`(把 ServerConnected 占位换成真正组装)

Design intent: 已有所有子组件,纯组装 + vertical stack。

Steps:
- [ ] Step 1: 把 server-page 里 `<ServerConnected />` 占位换成实际 JSX:`<ServerHero />` + `<ServerInfoCard ... />` + `<ServerStatsCards />` + `<ServerSyncLog />`
  Acceptance: `rg "ServerHero|ServerInfoCard|ServerStatsCards|ServerSyncLog" apps/extension/src/entrypoints/settings/pages/server/server-page.tsx` → ≥ 4 命中
- [ ] Step 2: 跑 server-page 测试再次确保通过
  Acceptance: `pnpm --filter @opentab/extension test server-page` → PASS
- [ ] Step 3: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(ext-settings): assemble server connected view"

DoD: ON+auth 状态下 server panel 完整渲染 hero / info / stats / log 4 块。
Commit: `feat(ext-settings): assemble server connected view`

---

## Group 7 — Wizard(stepperize + 4 步)

outcome: 新建 wizard 容器 + 4 个 step 组件,包装现有 XState 机器,UI 完全替换为 stepperize 视觉。

### Task 25: server-wizard.tsx + 4 step 组件骨架

Files:
- Create: `apps/extension/src/entrypoints/settings/pages/server/wizard/server-wizard.tsx`
- Create: `apps/extension/src/entrypoints/settings/pages/server/wizard/server-wizard.test.tsx`
- Create: `apps/extension/src/entrypoints/settings/pages/server/wizard/step-backup.tsx`
- Create: `apps/extension/src/entrypoints/settings/pages/server/wizard/step-connect.tsx`
- Create: `apps/extension/src/entrypoints/settings/pages/server/wizard/step-authorize.tsx`
- Create: `apps/extension/src/entrypoints/settings/pages/server/wizard/step-transfer.tsx`
- Create: `apps/extension/src/entrypoints/settings/pages/server/wizard/step-complete.tsx`

Design intent: server-wizard 用 `Stepperize.defineStepper(...)` 定 4 步 + complete。沿用现有 `createSetupMachine` XState,在 wizard top-level 实例化 + 通过 context 传给 step 组件。

```ts
// pseudo-code, shape only
const { useStepper } = Stepperize.defineStepper(
  { id: "backup", title: t("settings.wizard.step_backup_title"), icon: SaveIcon },
  { id: "connect", title: ..., icon: ServerIcon },
  { id: "authorize", title: ..., icon: KeyIcon },
  { id: "transfer", title: ..., icon: ArrowRightLeftIcon },
  { id: "complete", title: ..., icon: CheckCircleIcon },
);
```

Steps:
- [ ] Step 1: 写 failing test:render wizard,期望初始 step="backup",call `nextStep()` 后 step="connect"
  Acceptance: `pnpm --filter @opentab/extension test server-wizard` → FAIL
- [ ] Step 2: 实现 server-wizard.tsx(stepperize 容器 + Avatar/icon/chevron header)+ 5 个 step 文件骨架(每个 export `<StepX stepper={...} />`,内部 placeholder),抽 XState machine 实例 hold 在 server-wizard 顶层 + 通过 context 传给 step
  Acceptance: `pnpm --filter @opentab/extension test server-wizard` → PASS
- [ ] Step 3: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(ext-settings): scaffold stepperize wizard with 5 step shells"

DoD: wizard 容器 + 5 step 骨架可 render,可点击 next/prev。
Commit: `feat(ext-settings): scaffold stepperize wizard with 5 step shells`

### Task 26: step-backup + step-authorize + step-complete 实现(简单步骤)

Files:
- Modify: `apps/extension/src/entrypoints/settings/pages/server/wizard/step-backup.tsx`
- Modify: `apps/extension/src/entrypoints/settings/pages/server/wizard/step-authorize.tsx`
- Modify: `apps/extension/src/entrypoints/settings/pages/server/wizard/step-complete.tsx`

Design intent: backup 调旧 `exportLocalBackupToDownloads`(import from `@/lib/sync-setup/backup`)+ 显示完成态;authorize 调旧 `openAuthorizationTab`(import from `@/lib/sync-setup/exchange`)+ bridge OAuth callback(用现有 `useSetupCallbackBridge` from `@/lib/sync-setup/use-callback-bridge`);complete 显示 ✓ 总结 + "完成"按钮 → setSyncSettings({ auth: ... }) + 切回 ServerConnected。**复用既有 lib,放弃 TDD 节奏**(集成测试在 Group 9 Manual 覆盖)。

Steps:
- [ ] Step 1: 实现 step-backup.tsx(button 触发 backup + 完成态)
  Acceptance: `rg "exportLocalBackupToDownloads" apps/extension/src/entrypoints/settings/pages/server/wizard/step-backup.tsx` → 1 命中
- [ ] Step 2: 实现 step-authorize.tsx(spinner + 等待 callback + 重新打开授权页 button)
  Acceptance: `rg "openAuthorizationTab" apps/extension/src/entrypoints/settings/pages/server/wizard/step-authorize.tsx` → 1 命中
- [ ] Step 3: 实现 step-complete.tsx(✓ 大图标 + 总结文案 + 完成 button → 写入 SyncSettings.auth + savedConfig)
  Acceptance: `rg "setSyncSettings" apps/extension/src/entrypoints/settings/pages/server/wizard/step-complete.tsx` → 1 命中
- [ ] Step 4: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(ext-settings): implement backup, authorize, complete wizard steps"

DoD: 三个步骤独立可工作(暂不串联,Task 25 wizard 流程已能 next/prev 切换)。
Commit: `feat(ext-settings): implement backup, authorize, complete wizard steps`

### Task 27: step-connect Combobox + host 历史

Files:
- Modify: `apps/extension/src/entrypoints/settings/pages/server/wizard/step-connect.tsx`
- Create: `apps/extension/src/entrypoints/settings/pages/server/wizard/step-connect.test.tsx`

Design intent: shadcn Combobox 模式(用 Task 9.5 加的 `@opentab/ui/components/popover` + `@opentab/ui/components/command`);pre-fill `lastHost`(savedConfig.host || `https://opentab.app`);下拉显示 hostHistory(去重,FIFO)。点击下拉项 → 替换 input。提交时调 `checkHealth`(import from `@/lib/sync-setup/api-handshake`)。`DEFAULT_SYNC_HOST` 从 `@/lib/sync-setup/config` 拿默认值。

Steps:
- [ ] Step 1: 写 failing test:render with hostHistory=[a, b],期望 dropdown 含 2 项;点击其中一项 → input value 变;提交 → 调 health
  Acceptance: `pnpm --filter @opentab/extension test step-connect` → FAIL
- [ ] Step 2: 实现 Combobox(shadcn Popover + Command 模式);submit 调旧 `checkHealth` API;成功 → `pushHost(history, host)` + `setSyncSettings({ savedConfig, hostHistory })` + nextStep()
  Acceptance: `pnpm --filter @opentab/extension test step-connect` → PASS
- [ ] Step 3: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(ext-settings): step-connect with host history combobox"

DoD: Combobox 下拉、pre-fill、health check、写入 savedConfig 全工作。
Commit: `feat(ext-settings): step-connect with host history combobox`

### Task 28: step-transfer 用 server-stats-fetch 显示服务器数字

Files:
- Modify: `apps/extension/src/entrypoints/settings/pages/server/wizard/step-transfer.tsx`
- Create: `apps/extension/src/entrypoints/settings/pages/server/wizard/step-transfer.test.tsx`

Design intent: mount 时调 `serverStatsFetch({ host: savedConfig.host, deviceToken: auth.deviceToken })` → download 卡显服务器真实数字;upload 卡显本地 useLiveQuery counts;两 button 选择方向 → 调旧 transfer service(extension 当前在 `sync-setup-wizard.tsx` 的 actor `uploadBootstrap` / `downloadSnapshot` 内嵌实现;Task 28 实现时如果发现需要抽出可独立 helper,在 plan 评论里报告 — 不就地改 wizard 内部)。

Steps:
- [ ] Step 1: 写 failing test:mock serverStatsFetch 返回 `{ workspaces: 8, collections: 30, tabs: 180 }` → 期望 download card 显示 8/30/180;点 upload → mock `uploadBootstrap` 被调
  Acceptance: `pnpm --filter @opentab/extension test step-transfer` → FAIL
- [ ] Step 2: 实现 step-transfer:useEffect fetch + 2 卡片(upload 标"推荐"+ 本地数字 / download + 服务器数字)+ 警告条 + "开始同步" button → 调 transfer service → nextStep("complete")
  Acceptance: `pnpm --filter @opentab/extension test step-transfer` → PASS
- [ ] Step 3: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(ext-settings): step-transfer with direction cards and server stats"

DoD: download 卡显 server 真实数字、upload 卡显 local;选方向后 transfer 触发。
Commit: `feat(ext-settings): step-transfer with direction cards and server stats`

---

## Group 8 — Reconfigure + Reauth Banner + Case 1 Auto-Reconnect

outcome: 重新配置流程(从 Step 2 起 + 取消回原)+ 运行期 token 失效 banner + Case 1 自动重连。

### Task 29: server-reauth-banner + sync-engine 401/403 监听

Files:
- Create: `apps/extension/src/entrypoints/settings/pages/server/server-reauth-banner.tsx`
- Modify: `apps/extension/src/lib/sync-engine.ts`(401/403 时清 SyncSettings.auth)
- Modify: `apps/extension/src/entrypoints/settings/pages/server/server-page.tsx`(顶部插 banner)

Design intent: SyncEngine 任意一次 `sync()` 收到 401/403 → `setSyncSettings({ auth: null })`;server-page 检测 `enabled && !auth && savedConfig` → 在 wizard 之上叠加 reauth banner。点"重新认证"→ 强制走 wizard from Step 1(spec §1.9 决策)。

Steps:
- [ ] Step 1: 在 sync-engine 写 failing test(在 `sync-engine-pause.test.ts` 里加新 `describe("401 handler", ...)`):mock SyncClient `push`/`pull` 抛带 status 401 的错 → 期望 `sync()` 内部 catch + 调 setSyncSettings 把 auth 字段变 null
  Acceptance: `pnpm --filter @opentab/extension test sync-engine-pause -- -t "401"` → FAIL "401 handler missing"
- [ ] Step 2: 实现 401/403 catch → setSyncSettings({ auth: null });测试通过
  Acceptance: `pnpm --filter @opentab/extension test sync-engine-pause -- -t "401"` → PASS
- [ ] Step 3: 实现 server-reauth-banner.tsx(图标 + 文案 + "重新认证" + "稍后" 两 button);server-page 在 wizard 上方插入(`enabled && !auth && savedConfig`)
  Acceptance: `rg "ServerReauthBanner" apps/extension/src/entrypoints/settings/pages/server/server-page.tsx` → 1 命中
- [ ] Step 4: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(ext-settings): handle runtime auth expiry with reauth banner"

DoD: 模拟 push 401 → SyncSettings.auth 清空 + banner 出现;点重新认证 → wizard from Step 1。
Commit: `feat(ext-settings): handle runtime auth expiry with reauth banner`

### Task 30: Case 1 自动重连(toggle ON 时 whoami 校验)

Files:
- Create: `apps/extension/src/lib/server-whoami-fetch.ts`
- Create: `apps/extension/src/lib/__tests__/server-whoami-fetch.test.ts`
- Modify: `apps/extension/src/entrypoints/settings/pages/server/server-page.tsx`(加 reconnecting 中间态)

Design intent: server-page 在 `enabled && auth` 但首次 mount 时,先调 whoami;200 → 直接 connected;401/403 → 清 auth + reauth banner + wizard from Step 1。

Steps:
- [ ] Step 1: 写 failing test for server-whoami-fetch 4 分支(mirror server-stats-fetch test 风格)
  Acceptance: `pnpm --filter @opentab/extension test server-whoami-fetch` → FAIL
- [ ] Step 2: 实现 fetch util(~30 行,跟 stats-fetch 相同模式)
  Acceptance: `pnpm --filter @opentab/extension test server-whoami-fetch` → PASS
- [ ] Step 3: server-page 加 `useRef<string | null>(null)` 跟踪"上次校验过的 deviceToken",`useEffect(() => { if (auth?.deviceToken && auth.deviceToken !== ref.current) { ref.current = auth.deviceToken; setReconnecting(true); whoami().then(...).catch(...) } }, [auth?.deviceToken])`;200 → setReconnecting(false) + 顺手把 user 信息 setSyncSettings 回填 auth.user(覆盖 migration 的 undefined);401 → 清 auth(会触发 reauth banner 通过 §3.0 派生条件)。**禁用 ref 防止 setSyncSettings({auth:null}) 触发的 onChanged 重新进入 effect 循环调 whoami**
  Acceptance: `rg "reconnecting|useRef" apps/extension/src/entrypoints/settings/pages/server/server-page.tsx` → ≥ 3 命中
- [ ] Step 4: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(ext-settings): auto reconnect on toggle on with whoami check"

DoD: ON+auth 时 mount 调一次 whoami;成功直接 connected,失败走 reauth 路径。
Commit: `feat(ext-settings): auto reconnect on toggle on with whoami check`

### Task 31: 重新配置流程(从 Step 2 起,取消回原)

Files:
- Modify: `apps/extension/src/entrypoints/settings/pages/server/server-hero.tsx`(⋯ 菜单点"重新配置" → setReconfiguring 状态)
- Modify: `apps/extension/src/entrypoints/settings/pages/server/server-page.tsx`(reconfiguring=true 时 render wizard 但 skip Step 1,提供"取消重新配置"出口)
- Modify: `apps/extension/src/entrypoints/settings/pages/server/wizard/server-wizard.tsx`(接受 `startStep` prop;`reconfigureMode` prop 控制 step 1 显示"已跳过"灰条)

Design intent: server-page 用本地 useState 追踪 `reconfiguring`;true 时 render `<ServerWizard startStep="connect" reconfigureMode />`;wizard 内部 step-1 visible-but-disabled + "取消重新配置" link 在每 step 底部显示,点击 → setReconfiguring(false) + 不动 SyncSettings(token 仍有效就回原 connected)。

Steps:
- [ ] Step 1: server-hero ⋯ 菜单"重新配置"项 onClick 调 props.onReconfigure
  Acceptance: `rg "onReconfigure" apps/extension/src/entrypoints/settings/pages/server/server-hero.tsx` → ≥ 1 命中
- [ ] Step 2: server-page useState reconfiguring + 渲染分支(true 时 wizard 而非 ServerConnected)
  Acceptance: `rg "reconfiguring" apps/extension/src/entrypoints/settings/pages/server/server-page.tsx` → ≥ 2 命中
- [ ] Step 3: server-wizard 加 `startStep` / `reconfigureMode` props,初始 step 跳过到 startStep,Step 1 在 stepper 显示"已跳过"灰删除线
  Acceptance: `rg "startStep|reconfigureMode" apps/extension/src/entrypoints/settings/pages/server/wizard/server-wizard.tsx` → ≥ 2 命中
- [ ] Step 4: 在每 step 底部加"取消重新配置"link,onClick → server-page.setReconfiguring(false)
  Acceptance: `rg "settings.wizard.reconfigure_cancel" apps/extension/src/entrypoints/settings/pages/server/wizard/` → ≥ 1 命中
- [ ] Step 5: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(ext-settings): reconfigure flow from step 2 with cancel"

DoD: ⋯ 菜单"重新配置" → wizard from connect step + 可取消回原 connected 视图。

> Pre-existing issue NOT addressed: spec §6.1 last item — Step 3 OAuth 完成后旧 token 是否立即失效未确定;如果立即失效,"取消重新配置" 在 Step 3 之后无法回原。本 plan 不解决,标 TODO 给后续 spec。执行中发现该问题 → 报告给人类,不自行 workaround。

Commit: `feat(ext-settings): reconfigure flow from step 2 with cancel`

---

## Group 9 — Sidebar 4 状态灯 + i18n 完整化 + 收尾

outcome: 把 sidebar 状态灯接到 SyncSettings、补全所有 i18n keys、跑全套验收。

### Task 32: settings-sidebar 接 4 状态灯 + UserBar 4 状态

Files:
- Modify: `apps/extension/src/entrypoints/settings/shell/settings-sidebar.tsx`
- Modify: `apps/extension/src/entrypoints/settings/shell/user-bar.tsx`
- Modify: `apps/extension/src/entrypoints/settings/shell/settings-sidebar.test.tsx`

Design intent: sidebar 服务器 nav item 加圆点 + label + tooltip;UserBar 头像/名字/状态文案按 SyncSettings 派生(spec §4.4)。

Steps:
- [ ] Step 1: 扩 sidebar test:mock useSyncSettings 4 状态 → 期望对应圆点 color class + label 文案(用 i18n key 模糊匹配 `getByText`)
  Acceptance: `pnpm --filter @opentab/extension test settings-sidebar` → FAIL "expected 4 status dot"
- [ ] Step 2: 实现 sidebar 圆点 + label + Tooltip;实现 UserBar 头像首字母 + 名字 + 4 状态文案 + 点击跳 `#/server`
  Acceptance: `pnpm --filter @opentab/extension test settings-sidebar` → PASS
- [ ] Step 3: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(ext-settings): wire sidebar 4-state dot and user bar to SyncSettings"

DoD: 4 状态切换 sidebar 灯色 + label,UserBar 同步显示。
Commit: `feat(ext-settings): wire sidebar 4-state dot and user bar to SyncSettings`

### Task 33: i18n keys 完整补到 zh + en

Files:
- Modify: `apps/extension/src/locales/en.json`
- Modify: `apps/extension/src/locales/zh.json`

Design intent: 把 spec §5.5 全部 keys 补全;两语言都要。`settings.welcome.*` / `settings.server.*` / `settings.wizard.*` / `settings.sync_log.*` / `settings.sidebar.*`。

Steps:
- [ ] Step 1: 列出本 plan 引入的所有 i18n key
  Acceptance: `rg 't\("settings\.' apps/extension/src/entrypoints/settings/ -o | sort -u | wc -l` → ≥ 80(粗略估计)
- [ ] Step 2: 把缺的 keys 加到 en.json + zh.json(每个 key 都要两语言);用 jq 对齐两文件 settings.* 命名空间下所有 leaf path
  Acceptance: `diff <(jq -r '[paths(scalars) | select(.[0]=="settings") | join(".")] | sort | .[]' apps/extension/src/locales/en.json) <(jq -r '[paths(scalars) | select(.[0]=="settings") | join(".")] | sort | .[]' apps/extension/src/locales/zh.json)` → 输出空(无差异)
- [ ] Step 3: commit
  Acceptance: `git log -1 --pretty=%s` → "feat(ext-i18n): add settings router and wizard translations"

DoD: 中英文 keys 完全对齐,无 fallback 警告。
Commit: `feat(ext-i18n): add settings router and wizard translations`

### Task 34: 删除旧 sync-status-card 引用,验证 build

Files:
- Verified-unchanged or modify: `apps/extension/src/components/settings/sync-status-card.tsx`(根据是否还有 caller 决定删 or 保留)

Design intent: 清理孤儿;旧组件如果 0 caller 应直接删,新组件已替代功能。

Steps:
- [ ] Step 1: `rg "SyncStatusCard" apps/extension/src --type ts | rg -v "components/(settings/sync-status-card|__tests__/sync-status-card)"` → 列出所有真实 caller(排除组件本身和它的测试文件)
  Acceptance: 输出已知 caller list
  On non-empty: STOP;说明还有未迁移调用方,回报请求者评估 — 不就地修改,不扩 scope
- [ ] Step 2: 若 0 caller,`git rm apps/extension/src/components/settings/sync-status-card.tsx apps/extension/src/components/__tests__/sync-status-card.test.tsx`
  Acceptance: `pnpm --filter @opentab/extension lint && pnpm --filter @opentab/extension build` → exit 0
- [ ] Step 3: commit
  Acceptance: `git log -1 --pretty=%s` → "refactor(ext): remove deprecated sync-status-card replaced by server panel"

DoD: 孤儿 0,build/test/lint 全过。
Commit: `refactor(ext): remove deprecated sync-status-card replaced by server panel`

---

## Milestone M1 — Feature Complete

对应 spec §7。

Automated gates:
- `pnpm --filter @opentab/protocol build` → exit 0
- `pnpm --filter @opentab/extension lint` → exit 0
- `pnpm --filter @opentab/extension check-types` → exit 0
- `pnpm --filter @opentab/extension test` → all pass
- `pnpm --filter @opentab/extension build` → exit 0;Handover Report 报告 `apps/extension/.output/chrome-mv3/settings.html` 实际 gzip size(无硬性上限,新增 react-router 7 + stepperize + 4 shadcn 组件后的实际值由人类评估是否可接受)
- `pnpm --filter @opentab/cloud lint` → exit 0
- `pnpm --filter @opentab/cloud test` → all pass
- `pnpm --filter @opentab/cloud build` → exit 0
- `rg "entrypoints/settings/App" apps/extension/src` → 0 命中(确认旧 App.tsx 完全清理)
- `rg "useSyncAuthState|getSyncAuth\b|setSyncAuth\b|SyncAuthState" apps/extension/src --type ts | rg -v "lib/sync-auth-storage|lib/use-sync-auth-state|components/settings/sync-(setup-wizard|disconnect-dialog)|__tests__/"` → 0 命中(其他 caller 全部已迁到 SyncSettings;sync-setup-wizard 已被 wizard 系列替代但内部 XState 仍依赖旧 storage,留作 follow-up)

Manual (spec §7.2 完整 checklist;Agent 不做 — 报告人类执行):
- [ ] Manual: 加载 unpacked extension → settings.html 默认进 welcome → 4 nav 链接全可点
- [ ] Manual: 主开关 5 状态:OFF 无配置 / OFF 已暂停 / ON 重连中 / ON wizard 中 / ON 已连接,逐一验证 hero 控件矩阵
- [ ] Manual: Wizard 4 步走通(首次):备份 → 连接(host 输入)→ 授权(OAuth)→ 同步方向 → 完成
- [ ] Manual: 重新配置流程:已连接状态 ⋯ → 重新配置 → wizard from Step 2 → 取消回原
- [ ] Manual: 运行期 token 失效:模拟 push 401 → reauth banner 出现 → 点重新认证 → wizard from Step 1
- [ ] Manual: migration:用 v1 fixture 安装 → 进 settings.html 应该看到对应新结构(如 v1=authenticated → 直接 connected)
- [ ] Manual: 中英文切换:UserBar 切语言 → 所有页面文案切换,无 raw key 漏出
- [ ] Manual: dark mode:整 settings.html 在 dark 下可读

Pass bar: 自动化全绿 + 人工 checklist 全过 + 旧 App.tsx / 大部分 useSyncAuthState 已清理 + 无 P0/P1 未闭合。

---

## Rollback

按外部副作用分级(spec §6 风险):

| 改动 | 副作用 | 回滚 |
|---|---|---|
| extension 代码改 | 无 | `git reset --hard <base>` |
| chrome.storage v1→v2 migration | 用户本地数据(deviceToken / host) | 不可回滚 — migration 是单向。如需回滚:用户重装 extension(数据全清重做) |
| cloud 新 endpoint | 无(纯 add-only) | `git reset --hard <base>` + redeploy |

非幂等 Task:
- Task 6 (migration):跑过一次后旧 key 已删,不可重入;测试中用 fresh chrome.storage mock 隔离

---

## Shipping Gate

所有自动化 gate 全绿 + 所有 Manual checklist 项目 ✓ + Handover Report:

- gate 命令结果表
- 已落地 commits 列表(36 个 Task 各一,含 Task 6.5 / 9.5)
- File-level deltas:created 49 files / modified 10 / deleted 1
- settings.html 构建后 bundle gzip size(实际值)
- 下一步 user action:在生产 cloud 部署 `/api/sync/stats` + `/api/sync/whoami`,在 Chrome Web Store 推 extension 更新

---

## Known TODOs(本 plan 不解决,follow-up spec)

- spec §6.1:重新配置 Step 3 完成后旧 token 失效语义 → 影响 §1.9 决策的取消回原行为
- spec §6.2:第一次安装 onInstalled 是否自动开 settings.html
- spec §6.2:welcome "导入数据"CTA 跳 `#/import-export` 还是开 `import.html`
- spec §6.2:同步日志时间显示用 Intl.RelativeTimeFormat 还是引入 dayjs
- spec §6.2:wizard-progress.ts 与新 hostHistory 的关系(是否合并)

执行 plan 时如遇上述任一影响 Task 完成 → STOP,报告人类决定。
