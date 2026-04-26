# Cloud Dashboard & Landing Redesign Plan

Goal: 落地 [`spec 2026-04-26-cloud-dashboard-redesign-design.md`](../specs/2026-04-26-cloud-dashboard-redesign-design.md) Phase A + Phase B,把 `apps/cloud` 的 authenticated shell / dashboard / workspace 详情 / 公开 landing 全部重做。

Architecture: 复用现有 shadcn `Sidebar` primitive(`components/ui/sidebar.tsx`,含 mobile Sheet 与 cookie 持久化)+ DropdownMenu / ThemeSwitcher / UserNav 既有组件,**只在 `components/shell/`、`components/dash/`、`components/landing/` 三个新目录里组装**。`/admin` 路由作为 shell 模式参考(`components/admin/layout/`),OpenTab shell 跟它对齐风格但导航项与底部交互独立。

Tech Stack: React Router 7 + better-auth + drizzle (D1) + Tailwind v4 + shadcn/ui + lucide-react + vitest + playwright(若启用 e2e)

Related specs/plans:
- spec §0.4 决策表
- spec §2.1 路由/Layout 分层
- spec §3.1–§3.6 视觉系统
- spec §4 Loader 改动
- spec §6 Phase 切分
- spec §7 验收

Scope:
- In:
  - 新 `components/shell/*`,把 dash/settings/devices/admin 四个 layout 切到 shell pattern
  - `routes/dash/index.tsx` + `routes/dash/$workspaceSyncId.tsx` 重做(含 loader 增补 `previewFavIcons[]`)
  - 新 `components/dash/*` 子组件(StatsHero / WorkspaceCard / FaviconStack / EmptyState / ExpandCollapseToolbar)
  - 新 `components/landing/*`(LandingShell / Header / Hero / Features / Cta / Footer)
  - `routes/index.tsx` unauthenticated 分支替换为 Landing
  - Light + dark dashboard 截图资产
- Not in:
  - `routes/settings/*` 内部布局调整(只挂壳)
  - `routes/devices/*` 内部布局调整
  - `routes/admin/*` 内部任何修改 — 已有 shell,本次不动(决策点见 §Prerequisites)
  - 扩展端 deeplink 协商
  - 真实 marketing 文案(用 spec §3.6 占位文案,待营销侧 finalize)
  - testimonials / pricing / FAQ / logos 页(spec §0.2 non-goal)
  - daily_stats 聚合表 / 趋势可视化(spec §0.2 non-goal)
  - 视觉 baseline 截图回归工具(spec §8.2 占位,本 plan 不引入 Chromatic/visual diff)

---

## File Map

Created:
```
apps/cloud/app/test/setup-dom.ts                     # happy-dom + testing-library setup(Task 0)
apps/cloud/app/test/__tests__/smoke.test.tsx         # Task 0 的 smoke 验证测试
apps/cloud/app/test/render-with-router.tsx           # 测试工具(Task 1 顺手建立)
apps/cloud/app/components/shell/authenticated-shell.tsx
apps/cloud/app/components/shell/app-sidebar.tsx
apps/cloud/app/components/shell/sidebar-nav.tsx
apps/cloud/app/components/shell/sidebar-user-card.tsx
apps/cloud/app/components/shell/sidebar-theme-row.tsx
apps/cloud/app/components/dash/stats-hero.tsx
apps/cloud/app/components/dash/workspace-card.tsx
apps/cloud/app/components/dash/favicon-stack.tsx
apps/cloud/app/components/dash/empty-state.tsx
apps/cloud/app/components/dash/expand-collapse-toolbar.tsx
apps/cloud/app/components/landing/landing-shell.tsx
apps/cloud/app/components/landing/landing-header.tsx
apps/cloud/app/components/landing/hero.tsx
apps/cloud/app/components/landing/features.tsx
apps/cloud/app/components/landing/cta.tsx
apps/cloud/app/components/landing/footer.tsx
apps/cloud/app/lib/dashboard-greeting.ts
apps/cloud/app/lib/__tests__/dashboard-greeting.test.ts
apps/cloud/public/images/dashboard-light.png
apps/cloud/public/images/dashboard-dark.png
```

Modified:
```
apps/cloud/app/routes/layout.tsx                     # root layout (chrome 拆分)
apps/cloud/app/routes/index.tsx                      # / 未登录走 Landing
apps/cloud/app/routes/dash/layout.tsx                # 套 AuthenticatedShell
apps/cloud/app/routes/dash/index.tsx                 # 重做 + loader 增补
apps/cloud/app/routes/dash/$workspaceSyncId.tsx      # 升级 accordion + 工具条
apps/cloud/app/routes/dash/__tests__/dash-loader.test.ts   # 加 previewFavIcons describe 块
apps/cloud/app/routes/devices/layout.tsx             # 套 AuthenticatedShell
apps/cloud/app/routes/settings/layout.tsx            # 套 AuthenticatedShell
apps/cloud/app/lib/datetime.ts                       # 加 formatRelativeFromNow(Intl)
apps/cloud/app/lib/__tests__/datetime.test.ts        # 若不存在则创建,加 formatRelativeFromNow 测试
apps/cloud/vitest.config.ts                          # Task 0:environment → happy-dom + include 收 .tsx + setupFiles
apps/cloud/package.json                              # Task 0:加 testing-library + happy-dom dev deps
```

Verified-unchanged:
```
apps/cloud/app/components/user/user-nav.tsx          # 复用,内部不改
apps/cloud/app/components/theme.tsx                  # useThemeMode + ThemeSwitcher 复用,不改
apps/cloud/app/components/ui/sidebar.tsx             # shadcn primitive,不改
apps/cloud/app/hooks/use-auth-user.ts                # useAuthUser hook,不改
apps/cloud/app/routes/admin/**                       # admin 已有 shell,本次不动
apps/cloud/app/routes/dash/$workspaceSyncId.tsx::loadWorkspaceDetail   # loader 不改
apps/cloud/app/routes/dash/index.tsx::loadDash 第 1+2+3 个 batch 查询  # 不动,只在 batch 末尾追加第 4 个
# package.json 不新增 date-fns(用 Intl.RelativeTimeFormat),但 Task 0 会加 testing-library/happy-dom
```

---

## Prerequisites

环境与工具已就位(参考 `apps/cloud/package.json` / `vitest.config.ts`):

- `pnpm install` 已跑过
- `pnpm --filter @opentab/cloud test` 现状全绿(基线)
- `pnpm --filter @opentab/cloud typecheck` 现状全绿(基线)
- 工具:`rg`(ripgrep)、`pnpm`、Chrome DevTools(Manual 步骤用)

**Component test 基础设施**:`apps/cloud` 现有 vitest config `environment: "node"` + `include` glob 不收 `.tsx`,**没有 testing-library / jsdom / happy-dom 依赖**。Plan 用 Task 0 一次性补齐:加 `@testing-library/react` + `happy-dom`、改 vitest config 让 `.test.tsx` 走 happy-dom、其他保持 node。Task 1 在此之上建立 `renderWithRouter` 测试工具,后续 Task 1–4 / 9–12 / 14 / 16–20 直接复用。

**Hook mock 模式**:涉及 `useAuthUser` / `useThemeMode` 的组件单测,用 `vi.mock("~/hooks/use-auth-user", () => ({ useAuthUser: () => mockUser }))` 注入。逐 test 文件内 mock 即可,不放全局 setup。

**决策点 — Admin shell 处置**:`/admin` 现有 `SidebarProvider + AppSidebar` 模式,与本 plan 引入的 `AuthenticatedShellLayout` 概念重叠。本 plan **不动 admin**(避免 scope 膨胀),admin 继续走它自己的 sidebar 实现。如果你要让 admin 也切到统一 shell,开 follow-up plan。

> Pre-existing issue NOT addressed: admin 与 dash 的 shell 实现会有一段时间并存(两套 sidebar 配置)。本 plan 不消除该并存。

---

## Group 0 — Component test 基础设施

Outcome: vitest 能跑 `.test.tsx` 文件 + React render,smoke test 通过。后续所有 Group 1+ 的 component 单测建立在此之上。

### Task 0: 配置 happy-dom + testing-library

Files:
- Modify: `apps/cloud/package.json`(加 dev deps)
- Modify: `apps/cloud/vitest.config.ts`(include + environmentMatchGlobs + setupFiles)
- Create: `apps/cloud/app/test/setup-dom.ts`
- Create: `apps/cloud/app/test/__tests__/smoke.test.tsx`

Design intent: cloud 用 vitest 4(`vitest@^4.1.1`),**`environmentMatchGlobs` 在 vitest 4 已被移除**,不能用 vitest 3 那个旧 API。最简洁方案:全局把 environment 改成 `happy-dom` —— loader tests 不依赖 DOM API(用 `createTestDb` + Drizzle in-memory D1),在 happy-dom 下也跑得动;happy-dom 启动 overhead 对 5 个 loader test 可忽略。这样不需要 `projects` 数组也不需要按文件切环境。

```jsonc
// pseudo-code (shape only) — vitest.config.ts diff anchor
test: {
  environment: "happy-dom",                                    // was "node"
  include: ["app/**/*.test.{ts,tsx}", "app/**/__tests__/**/*.test.{ts,tsx}"],
  setupFiles: ["./app/test/setup-dom.ts"],
}
```

Steps:
- [ ] Step 1: `pnpm --filter @opentab/cloud add -D @testing-library/react@^16 @testing-library/dom@^10 @testing-library/jest-dom@^6 happy-dom@^15`
  Acceptance: `cat apps/cloud/package.json | grep -E "(testing-library|happy-dom)"` → 4 lines 全命中
  On unexpected version conflict: STOP;不就地降版本,回报让人类决定
- [ ] Step 2: 改 `vitest.config.ts`:`environment: "node"` → `"happy-dom"`;改 `include` 收 `.tsx`;加 `setupFiles: ["./app/test/setup-dom.ts"]`
  Acceptance: `pnpm --filter @opentab/cloud test` → 现状 5 个 loader test 仍全绿(happy-dom 不破坏 db-harness)
  On any loader test failure: STOP;happy-dom 与 cloudflare-workers-shim 有冲突,改用 vitest 4 `projects` 数组方案(为 `.test.ts` 保留 node env、`.test.tsx` 用 happy-dom),不就地继续
- [ ] Step 3: 创建 `app/test/setup-dom.ts`,内容仅一行:`import "@testing-library/jest-dom/vitest";`
  Acceptance: `cat apps/cloud/app/test/setup-dom.ts` → 1 行
- [ ] Step 4: 创建 `app/test/__tests__/smoke.test.tsx`,渲染 `<div>hello</div>` 并断言可见;**不**测 router(留给 Task 1)
  Acceptance: `pnpm --filter @opentab/cloud test smoke` → 1/1 PASS
- [ ] Step 5: Commit

DoD: vitest 能跑 `.test.tsx` + 现有 `.test.ts` 不破;smoke 测试通过。

Commit: `chore(cloud): switch vitest to happy-dom for component tests`

---

## Group 1 — Shell 基础与共用组件

Outcome: 新 `components/shell/*` 组件全部就位,可在任何 authenticated 路由作为 layout 包装使用,但**还没接到任何路由上**。这一阶段全部是组件单测 + 渲染验证,不动路由文件。

### Task 1: 建立 renderWithRouter 工具 + SidebarThemeRow

Files:
- Create: `apps/cloud/app/test/render-with-router.tsx`
- Create: `apps/cloud/app/components/shell/sidebar-theme-row.tsx`
- Create: `apps/cloud/app/components/shell/__tests__/sidebar-theme-row.test.tsx`

Design intent: Task 0 已经把 happy-dom + testing-library 装好;这里只建立 `renderWithRouter` 工具(用 `<MemoryRouter>` JSX 形式,比 `createMemoryRouter` 短)。把现有 `ThemeSwitcher`(`components/theme.tsx`)封装为侧栏底部固定行;不复制 `ThemeSwitcher` 内部状态,纯渲染包装。

```ts
// pseudo-code (shape only) — render-with-router.tsx
import { MemoryRouter } from "react-router";
import { render, type RenderOptions } from "@testing-library/react";
export function renderWithRouter(
  ui: ReactElement,
  opts?: RenderOptions & { initialEntries?: string[] },
) {
  const { initialEntries = ["/"], ...rest } = opts ?? {};
  return render(<MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>, rest);
}
```

Steps:
- [ ] Step 0: 建立 `renderWithRouter` 工具 — 包装 `@testing-library/react` 的 `render` 与 `createMemoryRouter` + `RouterProvider`
  Acceptance: `apps/cloud/app/test/render-with-router.tsx` 存在;`pnpm --filter @opentab/cloud typecheck` → 0 errors
- [ ] Step 1: 写 failing test — `renderWithRouter(<SidebarThemeRow/>)` 后能找到 3 个 `button[type=submit]` 且 `name` 分别为 `light` / `dark` / `system`
  Acceptance: `pnpm --filter @opentab/cloud test sidebar-theme-row` → expect FAIL(组件未实现 / "Cannot find module")
- [ ] Step 2: 实现组件,内部直接 `<ThemeSwitcher/>` 加包装 `<div className="px-2 pb-2">`
  Acceptance: `pnpm --filter @opentab/cloud test sidebar-theme-row` → 1/1 PASS
- [ ] Step 3: Commit

DoD: 测试工具就位 + 组件能在 jsdom 下正常渲染,3 个主题按钮 `name` 属性正确;ThemeSwitcher 表单提交 action 不被吞。

Commit: `feat(cloud-shell): add renderWithRouter and SidebarThemeRow`

### Task 2: SidebarUserCard

Files:
- Create: `apps/cloud/app/components/shell/sidebar-user-card.tsx`
- Create: `apps/cloud/app/components/shell/__tests__/sidebar-user-card.test.tsx`

Design intent: 用现有 `UserNav` 的 dropdown 内容,但触发器从顶栏头像换成"侧栏底部 user pill"(头像 + 名 + email,整行可点)。组件**自取 user**(用 `useAuthUser` hook),不接 prop drill,跟 admin pattern(`components/admin/layout/sidebar.tsx`)一致。

Steps:
- [ ] Step 1: 写 failing test — `renderWithRouter(<SidebarUserCard/>)`,`vi.mock("~/hooks/use-auth-user", () => ({ useAuthUser: () => mockUser }))` 注入 mockUser;断言可见 user.name + user.email 截断;点击触发器后 dropdown 打开,看到 `Log out` / `Settings` / `Appearance` 三 menu item
  Acceptance: `pnpm --filter @opentab/cloud test sidebar-user-card` → expect FAIL(组件未实现)
- [ ] Step 2: 实现组件 — 内部 `const user = useAuthUser()`,触发器是 button(头像 + name + email),内部复用 `UserNav` 的 DropdownMenuContent 部分(可重构 `UserNav` 抽出 `UserNavMenuContent` 子组件;若不抽,本 task 直接复制 menu items 也接受,**理由记下**)
  Acceptance: `pnpm --filter @opentab/cloud test sidebar-user-card` → PASS;`pnpm --filter @opentab/cloud typecheck` → 0 errors
- [ ] Step 3: Commit

DoD: 触发器在视觉上是 user pill 而非头像;dropdown 内容与 `UserNav` 行为一致(Log out 触发同一 sign-out action);组件不需要 prop drill user。

Commit: `feat(cloud-shell): add SidebarUserCard with reused UserNav menu`

> On dropdown duplication: 若选择"复制 menu items 而非抽组件",**必须**在 `sidebar-user-card.tsx` 顶部加一行 `// NOTE: Menu items must stay in sync with components/user/user-nav.tsx; refactor to shared component if drift accumulates.`

### Task 3: SidebarNav

Files:
- Create: `apps/cloud/app/components/shell/sidebar-nav.tsx`
- Create: `apps/cloud/app/components/shell/__tests__/sidebar-nav.test.tsx`

Design intent: 3 个固定项(Dashboard / Devices / Settings)+ 条件渲染 Admin(role === "admin")。复用 shadcn `SidebarMenu` / `SidebarMenuButton` primitives,不自造 NavLink 样式。

Steps:
- [ ] Step 1: 写 failing test — `renderWithRouter(<SidebarNav/>)` + mock `useAuthUser` 返回 `{ role: "user" }` 时只见 3 项;mock `{ role: "admin" }` 见 4 项;active 态用 `data-active` 属性表达
  Acceptance: `pnpm --filter @opentab/cloud test sidebar-nav` → expect FAIL
- [ ] Step 2: 实现 — 内部 `const { role } = useAuthUser()`,用 `<NavLink>` 包 `<SidebarMenuButton asChild>`,`isActive` 注入 `data-active`
  Acceptance: `pnpm --filter @opentab/cloud test sidebar-nav` → PASS
- [ ] Step 3: Commit

DoD: 4 个 NavLink 各自带 lucide icon(LayoutDashboardIcon / LaptopIcon / SettingsIcon / CircleGaugeIcon)与 label;active 态可视。

Commit: `feat(cloud-shell): add SidebarNav with role-based items`

### Task 4: AppSidebar 组合 + AuthenticatedShell wrapper

Files:
- Create: `apps/cloud/app/components/shell/app-sidebar.tsx`
- Create: `apps/cloud/app/components/shell/authenticated-shell.tsx`
- Create: `apps/cloud/app/components/shell/__tests__/authenticated-shell.test.tsx`

Design intent: AppSidebar 把 Header(logo)+ Content(SidebarNav)+ Footer(SidebarThemeRow + SidebarUserCard)拼起来。AuthenticatedShell 包 `SidebarProvider` + `AppSidebar` + `SidebarInset`,接受 `children` —— **不**接 user prop;子组件各自用 `useAuthUser` hook 自取(跟 admin pattern 一致)。

```tsx
// pseudo-code (shape only)
export function AuthenticatedShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
```

Steps:
- [ ] Step 1: 写 failing test — `renderWithRouter(<AuthenticatedShell><div data-testid="content"/></AuthenticatedShell>)` + mock `useAuthUser` 返回 mockUser;断言 `getByTestId("content")` 存在;sidebar logo / nav / theme row / user card 全部可见
  Acceptance: `pnpm --filter @opentab/cloud test authenticated-shell` → expect FAIL
- [ ] Step 2: 实现 AppSidebar(对照 `components/admin/layout/sidebar.tsx`,但内容换成 SidebarNav + SidebarThemeRow + SidebarUserCard;不接 user prop)
  Acceptance: `pnpm --filter @opentab/cloud test authenticated-shell` → PASS
- [ ] Step 3: 实现 AuthenticatedShell wrapper
  Acceptance: 同上,test 仍 PASS;`pnpm --filter @opentab/cloud typecheck` → 0 errors
- [ ] Step 4: Commit

DoD: 在 jsdom 下渲染整个 shell 不崩,组件结构与 spec §3.1 文字描述一致(侧栏 logo / 导航 / 底部 theme + user);shell 不接 user prop,内部用 hook 自取。

Commit: `feat(cloud-shell): assemble AuthenticatedShell with sidebar layout`

---

## Group 2 — 接路由(把 dash / devices / settings 套 shell)

Outcome: 已登录用户访问 `/dash` `/devices` `/settings` 都看到新 shell;旧 navbar(`routes/layout.tsx` 顶栏)在 authenticated 子树下不再出现。

### Task 5: 拆 root layout — chrome 移除

Files:
- Modify: `apps/cloud/app/routes/layout.tsx`(精简到仅"全局 chrome:Theme provider / toast / outlet",移除 navbar)

Design intent: root layout 当前同时承担"全局 wrapper"和"已登录顶栏",这是耦合。本 task 把顶栏从 root 摘出,各 authenticated 子层 layout 自己决定挂哪种 shell;未登录(/、/auth/*)继续用空 root,内部直接 render 自己的 chrome。

Steps:
- [ ] Step 1: 把现有 navbar JSX 与逻辑(`<header>...</header>` + 移动端 nav)从 `routes/layout.tsx` 全部删除,保留 `<main className="...">`
  Acceptance: `rg 'NavLink' apps/cloud/app/routes/layout.tsx` → 0 matches
- [ ] Step 2: 把 `<main className="mx-auto max-w-3xl ...">` 也移除,因为 SidebarInset 会自己提供 main 容器
  Acceptance: 文件长度 ≤ 30 行(主要是 imports + Outlet wrapper)
- [ ] Step 3: 跑 typecheck + 测试基线
  Acceptance: `pnpm --filter @opentab/cloud typecheck` → 0 errors;`pnpm --filter @opentab/cloud test` → 现状基线全绿
  On failure: 现有 test 依赖旧 navbar 结构 → STOP,更新 test 选择器或调整 plan 顺序,不就地扩范围
- [ ] Step 4: Commit

DoD: root layout 仅承担 outlet 渲染;移除前后 `/auth/sign-in` 渲染外观无差(无 chrome 即可,本来未登录状态就没 navbar 渲染条件)。

Commit: `refactor(cloud): strip authenticated chrome from root layout`

### Task 6: 套壳 — `/dash` layout

Files:
- Modify: `apps/cloud/app/routes/dash/layout.tsx`

Design intent: shell 自取 user(Task 4 决定),所以 layout 不需要新加 loader,只在 default export 外包一层 `<AuthenticatedShell><Outlet/></AuthenticatedShell>`。

Steps:
- [ ] Step 1: 改 `routes/dash/layout.tsx` default export:`return <AuthenticatedShell><Outlet/></AuthenticatedShell>`;不修改 loader、不改函数签名(`_: Route.ComponentProps` 保留)
  Acceptance: `rg 'AuthenticatedShell' apps/cloud/app/routes/dash/layout.tsx` → 1 match;`rg 'export async function loader' apps/cloud/app/routes/dash/layout.tsx` → 0 matches(没新加 loader)
- [ ] Step 2: 跑 typecheck
  Acceptance: `pnpm --filter @opentab/cloud typecheck` → 0 errors
- [ ] Step 3: Manual smoke — `pnpm --filter @opentab/cloud dev` 后浏览器访问 `/dash`,看到侧栏 + 旧 dashboard 内容(workspace cards 还是旧 grid)
  Manual: agent 不启动 dev server / 不做视觉判断;此 step 由人类执行;agent 在 handover report 里记
- [ ] Step 4: Commit

DoD: `/dash` 已套新 shell,旧 dashboard 内容(stats + grid)仍可见但被新 shell 包住。

Commit: `feat(cloud-dash): mount AuthenticatedShell on /dash layout`

### Task 7: 套壳 — `/devices` 与 `/settings` layout

Files:
- Modify: `apps/cloud/app/routes/devices/layout.tsx`
- Modify: `apps/cloud/app/routes/settings/layout.tsx`

Design intent: 与 Task 6 同一个模式重复两次。`/settings/layout.tsx` 当前还渲染了 "Settings" 标题 + Menu — 保留这两块,只在外面包一层 `AuthenticatedShell`。同样不加 loader、不改函数签名。

Steps:
- [ ] Step 1: 修改 devices layout,跟 Task 6 同一个套壳模式(`<AuthenticatedShell><Outlet/></AuthenticatedShell>`)
  Acceptance: `rg 'AuthenticatedShell' apps/cloud/app/routes/devices/layout.tsx` → 1 match
- [ ] Step 2: 修改 settings layout — 在原有 `<><h2>Settings</h2><Menu/><Outlet/></>` 外面包 `<AuthenticatedShell>` 即可,不传 prop
  Acceptance: `rg 'AuthenticatedShell' apps/cloud/app/routes/settings/layout.tsx` → 1 match
- [ ] Step 3: 跑 typecheck + test
  Acceptance: `pnpm --filter @opentab/cloud typecheck && pnpm --filter @opentab/cloud test` 全绿
- [ ] Step 4: Commit

DoD: 三个 authenticated 子树(dash / devices / settings)都共享同一 shell。

Commit: `feat(cloud-shell): mount AuthenticatedShell on devices and settings layouts`

---

## Group 3 — Dashboard Index 重做

Outcome: `/dash` 显示 stats hero + workspace 卡片网格(含 favicon stack),空数据时显示单卡片 CTA;header 右上角"Create workspace"按钮保留;grid 末尾**没有**虚线"创建"卡。

### Task 8: Loader 增补 `previewFavIcons[]`

Files:
- Modify: `apps/cloud/app/routes/dash/index.tsx`(只改 `loadDash` 与 `WorkspaceCardView` 类型,不动 UI)
- Modify: `apps/cloud/app/routes/dash/__tests__/dash-loader.test.ts`(在现有 describe 里加 `previewFavIcons` 断言,不新建测试文件)

Design intent: 现有 `loadDash` 第 3 个 batch 是 `groupBy(collectionSyncId) + count()`,无法保留 favIconUrl。**新增第 4 个 batch**(ungrouped row select)取 `(collectionSyncId, favIconUrl)`;app-side 第二阶段按 collection→workspace 路径回滚到每 ws 的前 5 个非空唯一 URL。spec §4 占位的两个候选在此收口为"新增第 4 个 batch",理由:不动现有 grouped count 查询(语义稳定 + 测试不破)。

```ts
// pseudo-code (shape only) — append a 4th batch in db.batch([...])
db.select({
  collectionSyncId: collectionTabs.collectionSyncId,
  favIconUrl: collectionTabs.favIconUrl,
}).from(collectionTabs)
  .where(and(eq(collectionTabs.userId, userId), isNull(collectionTabs.deletedAt)))
```

Steps:
- [ ] Step 1: 写 failing test — 在 `dash-loader.test.ts` 加 `describe("previewFavIcons", ...)`:用 `createTestDb` seed 3 ws、6 collection、25 tabs(混含 null / 重复 favIconUrl)调 `loadDash`,断言每个 `workspaces[*].previewFavIcons.length <= 5`、元素非空、唯一
  Acceptance: `pnpm --filter @opentab/cloud test dash-loader` → expect FAIL("Property 'previewFavIcons' does not exist on type 'WorkspaceCardView'" 或 assertion fail)
- [ ] Step 2: 在 `WorkspaceCardView` 加 `previewFavIcons: string[]` 字段;在 `db.batch([...])` 数组末尾追加第 4 个查询(ungrouped favIcon select);在 batch 解构出 `favIconRows`;app-side 聚合:先按 collectionSyncId 桶化所有非空 favIconUrl + 去重(`Set`),再按每个 workspace 的 collection 列表合并取前 5 个
  Acceptance: 同测试 PASS;`pnpm --filter @opentab/cloud typecheck` → 0 errors
- [ ] Step 3: 在 loader 顶部加注释:`// NOTE: 第 4 个 batch 是 ungrouped fetch。tabs 超过 10k 时需重新评估(可能要 LIMIT 或单独 favicon-cache)。`
  Acceptance: `rg "ungrouped fetch" apps/cloud/app/routes/dash/index.tsx` → 1 match
- [ ] Step 4: Commit

DoD: loader 返回 `previewFavIcons`,空 ws 返回空数组,有 favicon 的 ws 返回最多 5 个非空唯一 URL;现有 `dash-loader.test.ts` 其他测试不被破坏。

Commit: `feat(cloud-dash): add previewFavIcons aggregation to loadDash`

### Task 9: FaviconStack 组件

Files:
- Create: `apps/cloud/app/components/dash/favicon-stack.tsx`
- Create: `apps/cloud/app/components/dash/__tests__/favicon-stack.test.tsx`

Design intent: 5 个 16px favicon 重叠 -3px,后跟"+N" 文字(N = 总 tabs - 5);URL 加载失败 fallback 为 `<div className="bg-muted">`。

Steps:
- [ ] Step 1: 写 failing test — `<FaviconStack urls={[a,b,c]} totalTabs={3}/>` 显示 3 个 img 无 "+N";`urls={[a,b,c,d,e]} totalTabs={20}/>` 显示 5 个 img + "+15"
  Acceptance: `pnpm --filter @opentab/cloud test favicon-stack` → expect FAIL
- [ ] Step 2: 实现组件,`<img onError={() => setFailed(true)}>` 失败 fallback;referrerPolicy="no-referrer";loading="lazy"
  Acceptance: 同测试 PASS
- [ ] Step 3: Commit

DoD: 视觉:5 个图重叠;数据:总数 ≤ 5 不显示 "+N",超过显示 "+剩余数"。

Commit: `feat(cloud-dash): add FaviconStack with lazy + onError fallback`

### Task 10: WorkspaceCard 组件

Files:
- Create: `apps/cloud/app/components/dash/workspace-card.tsx`
- Create: `apps/cloud/app/components/dash/__tests__/workspace-card.test.tsx`

Design intent: 接收 `WorkspaceCardView` props,整卡是 `<Link to="/dash/$syncId">`;卡内:icon + name + 最后更新 + FaviconStack + collection/tabs 计数。

Steps:
- [ ] Step 1: 写 failing test — render `<WorkspaceCard ws={mockWs}/>` 后:link href 包含 `ws.syncId`;name 可见;collection/tabs 计数文案正确(单复数 — `1 collection`/`4 collections`);FaviconStack 渲染
  Acceptance: `pnpm --filter @opentab/cloud test workspace-card` → expect FAIL
- [ ] Step 2: 实现组件,内部用 shadcn `<Card>` + `<Link>`,Hover state 用 Tailwind `group-hover:` 拼装
  Acceptance: 同测试 PASS
- [ ] Step 3: Commit

DoD: 卡片在视觉上对应 spec §3.2 的 wireframe;a11y:整卡可键盘聚焦,enter 跳转。

Commit: `feat(cloud-dash): add WorkspaceCard with favicon preview`

### Task 11: StatsHero + greeting 工具 + 相对时间工具

Files:
- Modify: `apps/cloud/app/lib/datetime.ts`(新加 `formatRelativeFromNow` 函数)
- Modify: `apps/cloud/app/lib/__tests__/datetime.test.ts`(若存在;不存在则新建测试文件)
- Create: `apps/cloud/app/components/dash/stats-hero.tsx`
- Create: `apps/cloud/app/lib/dashboard-greeting.ts`
- Create: `apps/cloud/app/components/dash/__tests__/stats-hero.test.tsx`
- Create: `apps/cloud/app/lib/__tests__/dashboard-greeting.test.ts`

Design intent: 项目无 `date-fns` 依赖,**用 `Intl.RelativeTimeFormat`** 自实现 `formatRelativeFromNow(ms, locale?)`(放在 `lib/datetime.ts`,与现有 `formatDateTimeWithHints` 同文件)。greeting 函数纯函数化,内部调用 `formatRelativeFromNow`。

```ts
// pseudo-code (shape only) — formatRelativeFromNow
export function formatRelativeFromNow(timestampMs: number, locale = "en"): string {
  const diffSec = Math.round((timestampMs - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  // pick the largest unit where |diff| >= threshold; e.g., -7200s → "2 hours ago"
}
```

Steps:
- [ ] Step 1: 写 failing test — `formatRelativeFromNow(Date.now() - 2*3600*1000)` 返回字符串含 `"2 hours ago"`;`Date.now() - 30*1000` 返回含 `"seconds"` 或 "now"
  Acceptance: `pnpm --filter @opentab/cloud test datetime` → expect FAIL
- [ ] Step 2: 实现 `formatRelativeFromNow`;按时间差挑单位(秒 / 分 / 时 / 天 / 月 / 年),用 `Intl.RelativeTimeFormat`
  Acceptance: 上测试 PASS
- [ ] Step 3: 写 failing test for `dashboardGreeting({ name:"Liang", workspaceCount:3, lastSyncedAt:Date.now()-2*3600*1000 })` → `{ title:"Welcome back, Liang", subtitle:"3 workspaces · synced 2 hours ago" }`
  Acceptance: `pnpm --filter @opentab/cloud test dashboard-greeting` → expect FAIL
- [ ] Step 4: 实现 `dashboardGreeting`;边界:`name` 缺失 → "Welcome back";`workspaceCount === 0` → subtitle = "No workspaces synced yet";`lastSyncedAt` 缺失 → subtitle 不含 "synced ..."
  Acceptance: 上测试 PASS,3 个边界场景全过
- [ ] Step 5: 写 failing test for `<StatsHero workspaces={3} collections={12} tabs={87}/>` → 三 card 数字正确、label 正确、单复数文案("Workspace"/"Workspaces")
  Acceptance: `pnpm --filter @opentab/cloud test stats-hero` → expect FAIL
- [ ] Step 6: 实现 StatsHero — 三 card grid,无 react-router 依赖(纯展示,不需要 `renderWithRouter`)
  Acceptance: 上测试 PASS
- [ ] Step 7: Commit

DoD: `formatRelativeFromNow` 输出与场景一致;greeting 输出含空数据 fallback;StatsHero 三数字 + 单复数正确。

Commit: `feat(cloud-dash): add StatsHero, greeting helper, and Intl-based relative-time utility`

### Task 12: EmptyState 组件

Files:
- Create: `apps/cloud/app/components/dash/empty-state.tsx`
- Create: `apps/cloud/app/components/dash/__tests__/empty-state.test.tsx`

Design intent: 单卡片 CTA(spec §3.4)。主按钮 link 到 chrome web store(占位 URL,与扩展商店地址一同标 `> TODO(plan): finalize`);副 link "I already have it →" 指 `/settings/account`。

Steps:
- [ ] Step 1: 写 failing test — render 后:看到 "Welcome to OpenTab Cloud" 标题、"Connect your first device" CTA 标题、主按钮 href 非空、副 link href = "/settings/account"
  Acceptance: `pnpm --filter @opentab/cloud test empty-state` → expect FAIL
- [ ] Step 2: 实现组件;chrome web store URL 用占位常量 `CHROME_STORE_URL` 在文件顶部声明 + 标 `// TODO: replace with published listing URL`;**不**做扩展安装检测
  Acceptance: 同测试 PASS;`rg "TODO: replace with published listing URL" apps/cloud/app/components/dash/empty-state.tsx` → 1 match
- [ ] Step 3: Commit

DoD: 空态卡渲染正确,主/副 link 均可点;TODO 注释明确指出待 finalize 的占位。

Commit: `feat(cloud-dash): add EmptyState single-card CTA`

> Pre-existing issue NOT addressed: chrome web store URL 与扩展端 deeplink 路径暂用占位(spec §8.2)。本 plan 不去扩展项目里查 manifest URL 也不去发布扩展;占位常量保留,等用户提供真实 URL 后单独 PR 替换。

### Task 13: 重写 `/dash` index 主体

Files:
- Modify: `apps/cloud/app/routes/dash/index.tsx`(只改默认 export,不动 loader)

Design intent: header(greeting + Create CTA)+(条件)StatsHero +(条件)WorkspaceGrid 或 EmptyState。**header 右上角的 Create workspace 按钮保留;grid 末尾不渲染虚线"创建"卡**(spec 决策 #9)。

> TDD off: 本 Task 是 UI 编排重写,行为已被 Task 8–12 的子组件单测覆盖;route 级行为差异主要靠 Manual smoke 把关(spec §7.1 Scenario A1–A3),不再补 route 级单测。

```tsx
// pseudo-code (shape only)
const { workspaces, totalCollections, totalTabs } = loaderData;
const hasData = workspaces.length > 0;
return (
  <div className="space-y-6 p-6">
    <DashHeader greeting={dashboardGreeting(...)} createHref="/dash/workspaces/new" />
    {hasData ? (
      <>
        <StatsHero workspaces={workspaces.length} collections={totalCollections} tabs={totalTabs} />
        <div className="grid ...">{workspaces.map(ws => <WorkspaceCard ws={ws} key={ws.syncId} />)}</div>
      </>
    ) : <EmptyState />}
  </div>
);
```

Steps:
- [ ] Step 1: 重写 `routes/dash/index.tsx` 默认 export,删除当前 inline JSX(grid + dashed create card)
  Acceptance: `rg 'No data synced yet' apps/cloud/app/routes/dash/index.tsx` → 0 matches;`rg 'Create workspace' apps/cloud/app/routes/dash/index.tsx` → 1 match(在 header 中)
- [ ] Step 2: 跑 typecheck + 现有 loader 测试(Task 8 加的)
  Acceptance: `pnpm --filter @opentab/cloud typecheck && pnpm --filter @opentab/cloud test routes/dash/__tests__/index` 全绿
- [ ] Step 3: Manual:浏览器 `/dash`,有数据:看到 stats hero + 卡片;空账号:看到单卡片 CTA;header 右上角 Create 按钮在
  Manual: agent 不启动 dev server,本 step 标 `Manual:` 由人类执行
- [ ] Step 4: Commit

DoD: `/dash` 视觉与 spec §3.2 一致;空态切到 EmptyState 而不是 stats hero + 空 grid。

Commit: `feat(cloud-dash): rewrite /dash index with stats hero and empty state`

---

## Group 4 — Workspace 详情升级

Outcome: `/dash/$workspaceSyncId` 保留 accordion 结构,加"全展开 / 全折叠"工具条,视觉打磨与 dashboard index 卡片语言对齐。

### Task 14: ExpandCollapseToolbar 组件

Files:
- Create: `apps/cloud/app/components/dash/expand-collapse-toolbar.tsx`
- Create: `apps/cloud/app/components/dash/__tests__/expand-collapse-toolbar.test.tsx`

Design intent: 接 `onExpandAll` / `onCollapseAll` 两个 callback;两个 ghost 按钮,无内部状态。

Steps:
- [ ] Step 1: 写 failing test — 渲染后两个按钮可见;点击 "Expand all" 触发 `onExpandAll`,"Collapse all" 触发 `onCollapseAll`
  Acceptance: `pnpm --filter @opentab/cloud test expand-collapse-toolbar` → expect FAIL
- [ ] Step 2: 实现纯展示组件
  Acceptance: 同测试 PASS
- [ ] Step 3: Commit

DoD: 两个按钮各自可点击触发各自 callback,无内部状态。

Commit: `feat(cloud-dash): add ExpandCollapseToolbar`

### Task 15: 升级 `/dash/$workspaceSyncId` UI

Files:
- Modify: `apps/cloud/app/routes/dash/$workspaceSyncId.tsx`(只改默认 export,不动 loader)

Design intent: 把当前每个 `CollectionBlock` 内部 `useState(true)` 拆出来,改为顶层 `useState<Set<string>>(全部展开)`,工具条调用 `setExpanded(new Set(allIds))` / `setExpanded(new Set())`;CollectionBlock 改为 controlled(`open`/`onOpenChange` 由父注入)。

> TDD off: state lift + controlled 改造的正确性靠 `pnpm typecheck` + Manual smoke(spec §7.1 Scenario A4)把关;为 controlled accordion 单独造 jsdom 测试 ROI 低。

Steps:
- [ ] Step 1: 把 CollectionBlock 改为 controlled(props 加 `open: boolean`、`onOpenChange: (next: boolean) => void`),内部不再用 `useState`
  Acceptance: `rg 'useState' apps/cloud/app/routes/dash/$workspaceSyncId.tsx` → 父组件命中 1 次,子组件 CollectionBlock 命中 0 次
- [ ] Step 2: 父组件加 `expandedIds: Set<string>` state,默认 `new Set(collections.map(c => c.syncId))`(全展开);提供 `toggle(id)` / `expandAll()` / `collapseAll()`;在 `<header>` 之后渲染 `<ExpandCollapseToolbar>`
  Acceptance: typecheck 0 errors;现有测试(若有)继续通过
- [ ] Step 3: Manual smoke — 进 workspace 详情页,默认全展开;点 "Collapse all" 全部折叠;点 "Expand all" 还原
  Manual: 人类执行
- [ ] Step 4: Commit

DoD: accordion 双向工具条工作;每个 collection 仍可独立折叠;无遗留 console warning(controlled accordion usage)。

Commit: `feat(cloud-dash): controlled accordion with expand/collapse toolbar`

---

## Milestone M1 — Phase A 可交付

对应 spec §7.1。

Automated gates:
- `pnpm --filter @opentab/cloud typecheck` → 0 errors
- `pnpm --filter @opentab/cloud test` → 全绿(含本 plan 新加单测)
- `pnpm --filter @opentab/cloud lint` → 0 errors
- `pnpm --filter @opentab/cloud build` → success
- `pnpm format --check` 或等效:`pnpm check`(若 monorepo 提供)→ 0 errors

Manual(对照 spec §7.1 的 Scenario A1–A8):
- A1 桌面 light + 有数据:`/dash` welcome / stats / WorkspaceCard 含 favicon stack
- A2 桌面 dark + 有数据:同上,无 contrast 问题
- A3 桌面空账号:`/dash` 显示 EmptyState,无 stats hero
- A4 进入 workspace 详情:accordion 全展开 → "Collapse all" → 全收起;面包屑回 `/dash`
- A5 主题切换:侧栏底部三按钮 + UserNav Appearance 子菜单,任一处切换两侧都同步
- A6 用户卡 dropdown:Sign Out 能登出
- A7 mobile(`< md`):侧栏隐藏,SidebarTrigger 在 SidebarInset 顶部,点击触发 sheet
- A8(可选)Playwright snapshot 与基线对齐 — 本 plan **不引入** snapshot 工具,A8 跳过(spec §8.2 占位)

Pass bar: 所有自动化 gate 全绿 + A1–A7 人工签字 + 无新增 console error / aria warning。

---

## Group 5 — Landing 组件(Phase B)

Outcome: `components/landing/*` 全部就位,但 **`routes/index.tsx` 还没改**,旧未登录页仍在生产。这一组只增量加新组件,不破坏既有行为。

### Task 16: LandingHeader / LandingShell

Files:
- Create: `apps/cloud/app/components/landing/landing-shell.tsx`
- Create: `apps/cloud/app/components/landing/landing-header.tsx`
- Create: `apps/cloud/app/components/landing/__tests__/landing-shell.test.tsx`

Design intent: LandingShell = `<LandingHeader/>` + `<main>{children}</main>` + `<Footer/>`(Footer 在 Task 21 加,先放占位 div)。LandingHeader 含 logo / 简短 nav(Features 锚点 / Extension 外链)/ Sign In / Sign Up。

Steps:
- [ ] Step 1: 写 failing test — render LandingShell 后:logo 可见,Sign In link 指 `/auth/sign-in`,Sign Up link 指 `/auth/sign-up`,children 在 main 中
  Acceptance: `pnpm --filter @opentab/cloud test landing-shell` → expect FAIL
- [ ] Step 2: 实现 LandingHeader(用 shadcn Button + react-router Link)
- [ ] Step 3: 实现 LandingShell(空 footer 占位)
  Acceptance: 测试 PASS
- [ ] Step 4: Commit

DoD: LandingShell 在 jsdom 下渲染 OK;Sign In/Sign Up 链接正确。

Commit: `feat(cloud-landing): add LandingShell and LandingHeader`

### Task 17: Hero 组件

Files:
- Create: `apps/cloud/app/components/landing/hero.tsx`
- Create: `apps/cloud/app/components/landing/__tests__/hero.test.tsx`

Design intent: 左文(badge + 大标题 + 副文 + 双 CTA)右图(产品截图,**响应用户级主题切换**)。背景:渐变光斑 + grid mask(spec §3.5)。spec §3.6 占位文案直接 hardcode 进组件,标 `// TODO: copy finalize`。

**主题响应实现**:不要单纯用 `<picture>` + `prefers-color-scheme`(只跟系统),要用 `useThemeMode()` hook(`components/theme.tsx` 已导出)拿用户级偏好:
- `theme === "light"` → 渲染 `<img src={lightSrc}>`
- `theme === "dark"` → 渲染 `<img src={darkSrc}>`
- `theme === "system"` → 用 `<picture>` + `<source media="(prefers-color-scheme: dark)" srcSet={darkSrc}>` + `<img src={lightSrc}>`(系统主题切换响应)

Steps:
- [ ] Step 1: 写 failing test — `renderWithRouter(<Hero/>)`,`vi.mock("~/components/theme", () => ({ useThemeMode: () => "dark" }))` 注入;断言大标题文本含 spec 占位 "without the chaos";"Get extension" CTA href 非空;img src 包含 `dashboard-dark.png`。再加一个 test:mock `useThemeMode` 返回 "system" 时,`<picture>` 元素含 `<source media>`
  Acceptance: `pnpm --filter @opentab/cloud test hero` → expect FAIL
- [ ] Step 2: 实现 Hero — 内部 `const theme = useThemeMode()`,按 light/dark/system 三分支渲染图片;截图引用 `/images/dashboard-light.png` 与 `/images/dashboard-dark.png`(资产 Task 21 准备,组件先指向占位路径);背景用 inline style 或 Tailwind class 实现 radial-gradient + grid mask
  Acceptance: 测试 PASS
- [ ] Step 3: Commit

DoD: Hero 渲染含产品截图占位、双 CTA、渐变背景;**用户主题切换**(包含 force light/dark 而系统相反的情况)能正确切图。

Commit: `feat(cloud-landing): add Hero with user-theme-aware screenshot`

### Task 18: Features 组件

Files:
- Create: `apps/cloud/app/components/landing/features.tsx`
- Create: `apps/cloud/app/components/landing/__tests__/features.test.tsx`

Design intent: 三栏 grid,每栏一个 lucide icon + 标题 + 一句话副文。占位文案见 spec §3.6:Workspaces / Cross-device sync / Collections。

Steps:
- [ ] Step 1: 写 failing test — render 后能找到 3 个 feature title,每个有 icon + paragraph
  Acceptance: `pnpm --filter @opentab/cloud test features` → expect FAIL
- [ ] Step 2: 实现组件 — `FEATURES` 数组在文件顶部声明,标 `// TODO: copy finalize`
- [ ] Step 3: Commit

DoD: 三栏对齐;mobile(`< md`)堆叠为单列。

Commit: `feat(cloud-landing): add Features three-column section`

### Task 19: CTA 组件

Files:
- Create: `apps/cloud/app/components/landing/cta.tsx`
- Create: `apps/cloud/app/components/landing/__tests__/cta.test.tsx`

Design intent: 一段标题 + 一个主按钮,背景柔和渐变(品牌色低饱和)。

Steps:
- [ ] Step 1: 写 failing test — render 后:标题含 spec §3.6 占位 "Start syncing in 60 seconds";按钮 href 非空
  Acceptance: `pnpm --filter @opentab/cloud test cta` → expect FAIL
- [ ] Step 2: 实现组件
- [ ] Step 3: Commit

DoD: CTA 块视觉与 spec §3.5 一致。

Commit: `feat(cloud-landing): add CTA block`

### Task 20: Footer 组件 + LandingShell 整合

Files:
- Create: `apps/cloud/app/components/landing/footer.tsx`
- Create: `apps/cloud/app/components/landing/__tests__/footer.test.tsx`
- Modify: `apps/cloud/app/components/landing/landing-shell.tsx`(把 footer 占位换成 `<Footer/>`)

Steps:
- [ ] Step 1: 写 failing test for Footer — 渲染后:版权字符串含当前年(`new Date().getFullYear()`);三链接 Privacy / Terms / GitHub 可见;GitHub link 是外链 `target="_blank" rel="noreferrer"`
  Acceptance: `pnpm --filter @opentab/cloud test footer` → expect FAIL
- [ ] Step 2: 实现 Footer — Privacy / Terms 暂指 `/legal/privacy` / `/legal/terms`(本 plan 不创建这两个路由 — 标 `// TODO: legal routes`);GitHub URL 为 `https://github.com/zhaolion/opentab`(占位,可改)
  Acceptance: 测试 PASS;`rg "TODO: legal routes" apps/cloud/app/components/landing/footer.tsx` → 1 match
- [ ] Step 3: 把 LandingShell 里的占位 div 替换为 `<Footer/>`;更新 LandingShell 测试断言能找到 Footer 内容
  Acceptance: `pnpm --filter @opentab/cloud test landing-shell footer` 全绿
- [ ] Step 4: Commit

DoD: Footer 渲染含版权/三链接;LandingShell 完整闭合(Header + main + Footer)。

Commit: `feat(cloud-landing): add Footer and integrate into LandingShell`

> Pre-existing issue NOT addressed: `/legal/privacy` 与 `/legal/terms` 路由不存在,Footer link 是 dead link。本 plan 不修复,follow-up 由产品/法务侧补。

---

## Group 6 — 截图资产 + 路由切换(Phase B 收尾)

Outcome: `/` 未登录访问看到完整 5 段 landing;dashboard light/dark 截图作为静态资产部署。

### Task 21: 准备 dashboard 截图资产

Files:
- Create: `apps/cloud/public/images/dashboard-light.png`
- Create: `apps/cloud/public/images/dashboard-dark.png`

Design intent: 在 Phase A 完成的 dashboard 上手动截 light + dark 两张图;尺寸约 1280×800,JPEG/PNG 均可,文件 < 200KB(可用 ImageOptim / `pngquant`)。

Steps:
- [ ] Step 1 (Manual): 启动 `pnpm --filter @opentab/cloud dev`,seed 一个有 3 ws / 几个 collection / 一些 tabs 的账号(可手工 + 扩展同步)
  Manual: agent 不启动 dev server / 不操作扩展
- [ ] Step 2 (Manual): light + dark 各截 dashboard 满屏一张(隐藏个人信息),保存到 `apps/cloud/public/images/`
  Acceptance: 两个文件存在,文件大小 < 200KB
- [ ] Step 3 (Manual): 在浏览器打开 `<dev-url>/images/dashboard-light.png` 与 `dashboard-dark.png`,确认 200 OK 与正确显示
- [ ] Step 4: Commit(资产入仓)

DoD: 两个 PNG 文件入仓,大小合规,Hero 组件无 broken image。

Commit: `chore(cloud-landing): add dashboard screenshot assets`

> Manual reasoning: agent 无法做视觉判断;截图美感 + 隐私脱敏需人类把关。

### Task 22: 路由切换 — `/` 未登录走 Landing

Files:
- Modify: `apps/cloud/app/routes/index.tsx`

Design intent: loader 行为不变(已登录 redirect `/dash`);未登录从渲染当前简陋页改为 `<LandingShell><Hero/><Features/><CTA/></LandingShell>`。

> TDD off: route 切换的正确性 = 子组件已测 + redirect 逻辑未改;Manual smoke 覆盖 spec §7.2 Scenario B5。

Steps:
- [ ] Step 1: 把 `routes/index.tsx` 默认 export 替换为 LandingShell + 各 block 的组合;移除原"appName Cloud"大标题与 Sign In/Sign Up 按钮(LandingHeader 已经承担)
  Acceptance: `rg '<ThemeSwitcher' apps/cloud/app/routes/index.tsx` → 0 matches(原页面底部 ThemeSwitcher 也移除,不再需要)
- [ ] Step 2: 跑 typecheck + 全套 test
  Acceptance: `pnpm --filter @opentab/cloud typecheck && pnpm --filter @opentab/cloud test && pnpm --filter @opentab/cloud build` 全绿
- [ ] Step 3: Manual smoke — 隐身窗口访问 `/`(light + dark)看到完整 5 段;已登录访问 `/` redirect `/dash`
  Manual: 人类执行
- [ ] Step 4: Commit

DoD: 未登录 `/` 是新 landing;已登录 `/` 仍 redirect `/dash`。

Commit: `feat(cloud-landing): replace / unauthenticated branch with Landing`

---

## Milestone M2 — Phase B 可交付

对应 spec §7.2。

Automated gates:
- `pnpm --filter @opentab/cloud typecheck` → 0 errors
- `pnpm --filter @opentab/cloud test` → 全绿
- `pnpm --filter @opentab/cloud lint` → 0 errors
- `pnpm --filter @opentab/cloud build` → success

Manual(对照 spec §7.2 的 Scenario B1–B6):
- B1 隐身 light:看到 5 段;Hero 截图清晰、grid mask 不刺眼
- B2 隐身 dark:截图随主题切换、整体可读
- B3 LandingHeader Sign In / Hero "Get extension" 跳转正确
- B4 mobile(`< md`):Hero 单列;Features 单列堆叠
- B5 已登录访问 `/`:redirect `/dash` 不闪烁 landing
- B6 Lighthouse(`/`)Performance / Accessibility 各 ≥ 90

Pass bar: 自动化 gate 全绿 + B1–B6 人工签字 + Lighthouse ≥ 90。

---

## Rollback

本 plan 纯代码改动(无 D1 migration / 无 secret / 无三方注册),回滚直接:

```bash
# 回到 base(F308AC3 即本 plan 写入的提交,后续每 Task 各自一个 commit)
git reset --hard <base-commit>
```

唯一非代码副作用:Task 21 加的两个 PNG 资产 — 也通过 `git reset --hard` 移除。无外部清理任务。

幂等性:全部 Task 幂等(重跑可叠加,DoD 不依赖前次失败的中间状态)。

---

## Shipping gate

所有 Task 完成后,本 plan 整体交付的判据:

1. M1(Phase A)+ M2(Phase B)双 milestone 全绿
2. `git diff origin/main` 仅包含 File Map 列出的路径,**无意外 orphan**
   - Acceptance: `git diff --name-only origin/main | sort > /tmp/changed.txt && diff /tmp/changed.txt <plan-file-map.txt>` 无 unexpected entry
3. 在新 Chrome profile(从未访问过)走完整剧本:
   - 隐身访问 `/` → 看 landing
   - 点 Sign Up → 注册新账号 → 自动登录
   - 进 `/dash` → 看到 EmptyState
   - 装扩展(若可)→ 同步 → 回 dashboard 看到 stats + cards
   - 点 workspace 卡 → 详情页 accordion 工具条工作
   - 侧栏底部切主题 / 头像 dropdown 切主题 → 两侧同步
4. Handover Report(plan 收尾时由 agent 产出):
   - Gates 结果表
   - 已落地 commits 列表(hash + subject)
   - File-level deltas(对照 File Map)
   - 已知占位与 follow-up 列表(chrome store URL / legal routes / 真实 copy / 视觉回归工具)

---

## 已知 low risk(执行者知情)

- chrome web store URL 与 GitHub repo URL 是占位;真实上线前必须替换
- Privacy / Terms 路由不存在,Footer link 是 dead link
- Landing 真实 copy 仍是 spec §3.6 占位;营销侧 finalize 后做无破坏性 PR 替换
- 不引入 visual regression 工具;后续若决定加 Playwright snapshot 或 Chromatic,作为独立 plan
- Shell 子组件依赖 `useAuthUser` hook,后者用 RR7 `unstable_useRoute`(见 `apps/cloud/app/hooks/use-auth-user.ts:1`)。RR7 升版到 8.x(预计移除 unstable 前缀)时需要顺手核验;无 immediate 风险
