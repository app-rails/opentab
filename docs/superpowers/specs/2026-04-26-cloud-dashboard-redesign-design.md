# Cloud Dashboard & Landing Redesign

**Status**: Design
**Date**: 2026-04-26
**Scope**: Replace the visually thin `apps/cloud` authenticated shell, `/dash` index, `/dash/$workspaceSyncId` detail, and the bare `/` landing with a unified, production-grade UI. Two surfaces, one spec; Phase A (authenticated) ships before Phase B (landing).
**Plan**: TODO(plan): 路径待写

---

## 0. 概览

### 0.1 目标

让 cloud 这一侧从"功能跑通的 alpha 后台"变成"可以放在产品门面上的 SaaS"。三件事:

1. **重设计 authenticated shell** — 侧栏(Dashboard / Devices / Settings)+ 底部固定的"主题切换 + 用户身份"。把当前藏在头像 dropdown 里的设置入口、登出、主题切换拎到永远可见的位置。
2. **重设计 dashboard 数据呈现** — `/dash` 的 stats hero + workspace 卡片网格(带 favicon stack 预览),`/dash/$workspaceSyncId` 升级版 collection accordion(全展开/折叠工具条 + 视觉打磨)。空状态从一行字升级到引导 CTA 卡。
3. **替换简陋 landing** — `/` 路由从两个按钮升级到 5 段简化营销页(Header / Hero / Feature / CTA / Footer),Hero 用真实 dashboard 截图 + 渐变光斑 + subtle grid 背景。

### 0.2 非目标

- 数据可视化 / 时间序列 / 活跃度热力图(无 `daily_stats` 聚合)
- 拖拽重排 / 跨 workspace 移动 collection
- 搜索 / 过滤(workspace 数 / collection 数预期 < 20,没必要)
- 本次不做完整 SaaS 营销页(Phase B 只 5 段);testimonials / pricing / FAQ / logos / stats 留作 §8.3 backlog
- 检测扩展是否安装 / sync wizard 是否完成(空态用静态 CTA 文案,不做扩展握手)
- 修改 `/settings/*` 子页内部布局(只在新 shell 里挂上去)
- 修改 `/devices` 路由内部
- 修改扩展端 UI

### 0.3 前提 / 起点

- `apps/cloud` 已经按 [`2026-04-24-apps-cloud-design.md`](./2026-04-24-apps-cloud-design.md) 跑起来,RR7 + Better Auth + Drizzle + D1 + Cloudflare Workers。
- 当前已实现:`/auth/*` / `/dash` / `/dash/$workspaceSyncId` / `/dash/*/collections/*` / `/settings/*` / `/devices` / `/admin/*` 全套路由,以及 `UserNav` dropdown(头像 menu 含 Settings / Appearance / Log out)和独立 `ThemeSwitcher`(rounded-full 三按钮 segmented control)。
- 共享 UI 组件在 `packages/ui/src/components/`(button / card / dialog / accordion / dropdown-menu / popover / tooltip / 等 15 个);本地 `apps/cloud/app/components/ui/` 还有 `radio-group` / `collapsible` 等补丁件。
- Loader 已经返回 dashboard 需要的所有数字(`workspaces` / `totalCollections` / `totalTabs`),不缺数据。Workspace 详情 loader 也已返回 collection + tab 全集。
- 设备数据通过 `/devices` 路由查询;**dashboard stats hero 不读 `devices` 表**,以减少 loader 改动面。"上次同步时间"用 `max(workspaces.updatedAt)` 推算,不引入新查询。

### 0.4 关键决策一览

| # | 类别 | 决策 |
|---|---|---|
| 1 | Scope | Shell + dashboard index + workspace 详情 + landing(简化版),四块一起改 |
| 2 | Spec / Phase 切分 | 一个 spec,切 Phase A(authenticated)+ Phase B(landing);Phase A 先做 |
| 3 | Authenticated shell 形态 | 极简侧栏:3 顶级入口 + 底部固定"主题三按钮 + 用户卡" |
| 4 | Dashboard 视觉密度 | 中等档:stats hero(三数字)+ workspace 卡(favicon stack 预览),不引入图表 |
| 5 | Workspace 详情布局 | 升级版 accordion(保留折叠语义),加"全展开 / 全折叠"工具条 |
| 6 | Empty state | 单卡片 CTA(主按钮装扩展、副 link 指向 sync wizard 路径),不做扩展检测 |
| 7 | Landing 范围 | 5 段简化:Header / Hero / Feature(三栏)/ CTA / Footer |
| 8 | Landing Hero | 文 + 产品截图 + 渐变光斑 + subtle grid 背景 |
| 9 | "Create workspace" 入口 | 只一个,放 dashboard header 右上角实心 CTA;**删除** grid 末尾虚线"创建"卡 |
| 10 | UserNav dropdown 命运 | 保留(给 mobile / 习惯头像菜单的用户兜底),但不再是主入口 |
| 11 | ThemeSwitcher 位置 | 主位置改为侧栏底部固定;`UserNav` 里的 Appearance 子菜单保留 |
| 12 | 响应式 | 桌面侧栏永久;`< md` 断点收为 sheet drawer,顶栏出 hamburger |
| 13 | Loader 改动 | dashboard index loader 增补 `tabsByWorkspace[].previewFavIcons[]`(每 ws 取前 5 个);workspace 详情 loader **不改**;landing 不需 loader |
| 14 | 路由变更 | 不新增路由;`/` 渲染从"redirect-or-empty"改为"redirect-or-landing";所有 authenticated 路由共享新 shell layout |

---

## 1. 方案对比 (Alternatives considered)

### 1.1 Scope 边界

候选:
- A. 只重做 `/dash` index
- B. `/dash` index + 详情页
- C. **采纳**:Shell + index + 详情 + landing(简化)
- D. C + 完整 marketing(pricing / testimonials / FAQ / logos / stats)

| 维度 | A | B | C | D |
|---|---|---|---|---|
| 解决"丑"程度 | 部分 | 大半 | 完整 | 完整 |
| 解决"入口太深" | 否 | 否 | 是 | 是 |
| 工程量 | 小 | 中 | 中-大 | 大 |
| 内容空白(testimonials 没用户) | - | - | - | 严重 |

**采纳 C 的理由**:用户已经指出"缺登录登出 / 设置 / 主题切换"——其实都有,但塞在头像 dropdown。只有重做 shell 才能把这些拎出来到永远可见的位置。Landing 简化版把 `/` 这块裸奔之地补上,但拒绝 D 的完整 marketing,因为 testimonials / logos / stats 现阶段没真实素材,做了就是放假数据。

**保留代价**:Phase A 改动面跨 5+ 路由,需要把现有 `routes/layout.tsx` 拆出 `LandingLayout` 与 `AuthenticatedShellLayout` 两个包装,触动结构。Phase A 做完之前,登录前后体验割裂(landing 没改,新 shell 已经在);需要在 Phase A 提交时同步把 `/` 暂时也走新 shell 或保留旧版,见 §5.5。

### 1.2 一个 spec vs 拆两个

候选:
- A. 一个 spec,涵盖 authenticated 与 landing
- B. 拆两个 spec(authenticated redesign + public landing)

**采纳 A**。两个工程虽然受众/layout 不同,但共享视觉语言(同一套 token / shadcn 组件 / 渐变色板)、共享一套 lucide icon 集、共享 dark mode 适配。一个 spec 论证一次决策更合理。Plan 阶段会切两个文件落地(见 §6),实施顺序明确:Phase A 先做、截好 dashboard 截图喂给 Phase B。

**代价**:spec 比单页面长。用 §0.4 决策表 + Phase 章节切分缓解。

### 1.3 Authenticated Shell 形态

候选:
- A. **采纳**:极简侧栏 — 3 顶级入口(Dashboard / Devices / Settings)+ 底部用户/主题
- B. 侧栏列出 workspace 树(workspace 当二级菜单)
- C. 仅图标轨道(VSCode 风,主区最大化)

| 维度 | A | B | C |
|---|---|---|---|
| 信息层次清晰 | 强 | 中(workspace 多则爆) | 弱(label 全靠悬浮) |
| 改动面 | 小 | 中(layout loader 要查 ws) | 中 |
| 用户身份/主题入口可见性 | 强(底部固定区) | 强 | 弱(图标轨道太挤) |
| 主区可用宽度 | 中 | 中 | 大 |

**采纳 A 的理由**:OpenTab 用户预期 workspace 数 < 10,B 的侧栏树收益小但代价是 layout loader 多一次查询。C 把"用户身份/主题"塞回 popover,跟用户最初提到的"入口太深"诉求矛盾。A 用"主区当 workspace 主角(卡片 grid)+ 侧栏当全局导航"是最简洁的分工。

**保留代价**:多 workspace 切换需要回 dashboard 中转,中间多一跳。如果将来 workspace 数膨胀,可在 Phase A 之后增量做"侧栏 workspace pin"(决策 #3 不锁死这个)。

### 1.4 Dashboard 视觉密度

候选:
- A. 克制档 — 排版 + 间距 + hover,数据跟现状一样
- B. **采纳**:中等档 — stats hero(三数字)+ workspace 卡 favicon stack
- C. 高密度档 — 趋势百分比 + 活跃度热力图 + sparkline

| 维度 | A | B | C |
|---|---|---|---|
| 视觉提升 | 弱 | 强 | 强 |
| 新数据需求 | 无 | favicon URL 列(已有) | 时间序列(需聚合表) |
| 工时 | 1-2 天 | 3-5 天 | 1-2 周 |
| 风险 | 极低 | 低 | 中(DB schema 联动) |

**采纳 B 的理由**:A 等于"换皮不换魂",解决不了"丑"的根本——信息层次淡。C 需要新 `daily_stats` 聚合表或在主表加索引,把 UI 重设计拖成数据基础设施工程。B 的 favicon stack 数据现成(`collectionTabs.favIconUrl` 已有),取每 ws 前 5 个 → 信息密度立刻起来,工程成本可控。

**保留代价**:favicon URL 来自第三方网站,可能 404 / 大小不一 / 未缓存。需要 `<img>` `onError` 降级到色块占位,以及在 loader 里限定每 ws 取 5 个避免 DOM 膨胀。

### 1.5 Workspace 详情页布局

候选:
- A. **采纳**:升级版 accordion(保留现有结构)
- B. Master-detail(左 collection 列表 + 右 tabs 面板,URL 带 `?collection=`)
- C. Collection 卡片网格(每卡显示前 5 tab,"+N more"进入新路由)

| 维度 | A | B | C |
|---|---|---|---|
| 跟 dashboard index 的卡片语言贯穿 | 中 | 弱 | 强 |
| Collection 多时浏览成本 | 高(滚屏) | 低 | 中 |
| 是否引入新路由 | 否 | 否 | 是(`/dash/$ws/collections/$col`) |
| 移动端复杂度 | 低 | 高(降级到列表) | 低 |

**采纳 A 的理由**:OpenTab 用户每 workspace 预期 collection 数 < 8(典型 3-5),B 的 master-detail 在小数据量上是空间浪费。C 需要新增独立 collection 详情路由,scope 立刻膨胀(还要新 loader / breadcrumb / 编辑入口)。A 是"上层卡片网格 + 下层折叠列表"的清晰节奏,改动可控。

**保留代价**:collection 数 ≥ 10 时 accordion 全展开会很长。用工具条"全展开 / 全折叠"+ 默认全展开 + 单条折叠状态记 URL hash 缓解,但不解决核心。如果将来真有 power user,可重新评估 B/C。

### 1.6 Empty State

候选:
- A. 极简空态(图标 + 一行字,升级现状)
- B. **采纳**:单卡片 CTA(主装扩展 + 副"已有则去同步设置")
- C. 完整 onboarding stepper(检测扩展已装 / sync wizard 已完成)

| 维度 | A | B | C |
|---|---|---|---|
| 新用户被引导 | 弱 | 强 | 强 |
| 改动面 | 小 | 小 | 大(需扩展握手 + 后端追踪) |
| 是否吃定一种用户路径 | 否 | 部分 | 是 |

**采纳 B 的理由**:C 要求 cloud 端能感知扩展是否安装(`externally_connectable` 通信)、能感知 sync wizard 是否完成(后端追踪状态)——这是把空态做成独立产品功能,不是 UI 改动。B 的"一卡片 + 二动作"覆盖大多数用户路径(还没装 / 装了没同步),文案承担解释职责,不依赖检测能力。

**保留代价**:对"装了但没启用 sync"的用户,B 给的副 link 只能落到文档/扩展商店,不能直接跳到扩展内向导。后续如果扩展暴露 deeplink(`opentab://settings/sync`),这里可无痛升级。

### 1.7 Landing Hero

候选:
- A. 纯文本极简(大标题 + 渐变 + 双 CTA)
- B. **采纳**:文 + 产品截图 + 渐变光斑 + subtle grid 背景
- C. 抽象动效背景(光斑 + grid + announcement badge,无截图)

| 维度 | A | B | C |
|---|---|---|---|
| 转化潜力 | 弱(看不到产品) | 强(产品截图 = 信任锚) | 中(气质强但无产品信息) |
| 工程依赖 | 无 | 依赖 dash 截图 | 无 |
| AI slop 风险 | 低 | 低 | 中(光斑用力过猛会显土) |

**采纳 B 的理由**:Phase A 先做完 dashboard,截图直接喂给 Hero——天然契合实施顺序。B 拿走 C 的渐变光斑 + grid 背景元素,但加上产品截图作为视觉锚,转化优于纯抽象。

**保留代价**:Phase B 必须等 Phase A 视觉定稿才能截图;dark mode 截图与 light mode 截图都要留(响应主题切换),增加资产管理。

### 1.8 Landing 范围简化

候选:
- A. 完整 marketing(参考 saas-edge-template:Hero / Logos / FeaturesList / FeaturesAccordion / FeaturesStep / Features / Stats / Testimonials / FAQ / CTA)
- B. **采纳**:Header / Hero / Feature / CTA / Footer

**采纳 B 的理由**:cloud 现阶段无真实 testimonials / 客户 logos / 数据 stats,A 等于做 7 块假内容。B 的 5 段是"只放真实素材"——产品介绍 + 三个核心 feature + 一个动作 + 法务/链接尾。

**保留代价**:看起来比成熟 SaaS 网站轻量。等用户量起来后增量补 testimonials / FAQ。

---

## 2. 架构

### 2.1 路由与 Layout 分层

```
apps/cloud/app/
├── routes/
│   ├── index.tsx              # /  → 已登录 redirect /dash; 未登录 render <Landing/>
│   ├── layout.tsx             # 全站 root layout (theme provider, error boundary, toast)
│   │
│   ├── landing/               # 公开区 (Phase B)
│   │   ├── layout.tsx         # <LandingShell/> (顶栏 + footer wrapper)
│   │   └── index.tsx          # <Hero/> + <Features/> + <Cta/>
│   │
│   ├── auth/                  # 不动
│   ├── settings/              # 内部不动,但挂在新 AuthenticatedShellLayout 下
│   ├── devices/               # 同上
│   ├── admin/                 # 同上
│   └── dash/                  # 这次重做的核心
│       ├── layout.tsx         # <AuthenticatedShellLayout/> (新侧栏)
│       ├── index.tsx          # /dash → 重做
│       └── $workspaceSyncId.tsx # 重做(升级 accordion)
│
└── components/
    ├── shell/                 # 新增:侧栏 / 顶栏 / 用户卡 / 主题快捷条
    │   ├── authenticated-shell.tsx
    │   ├── sidebar.tsx
    │   ├── sidebar-user-card.tsx
    │   ├── sidebar-theme-row.tsx
    │   └── mobile-drawer.tsx
    └── landing/               # 新增 (Phase B)
        ├── landing-shell.tsx
        ├── landing-header.tsx
        ├── hero.tsx
        ├── features.tsx
        ├── cta.tsx
        └── footer.tsx
```

> TODO(plan): 确认现有 `routes/layout.tsx` 是要拆 vs 留作 root,还是把 authenticated shell 作为 `routes/dash/layout.tsx` + `routes/settings/layout.tsx` + `routes/devices/layout.tsx` 各自包装(影响嵌套层级与 loader 边界)。

### 2.2 模块切分

三层职责:

| 层 | 关心什么 | 不关心什么 |
|---|---|---|
| `routes/*/layout.tsx` | 鉴权门禁(已有 `requiredAuthContext` middleware)、Outlet 包装、route-level loader 顶层 | 视觉元素 |
| `components/shell/*` | 侧栏视觉、响应式开合、主题切换 UI、用户身份卡 UI | 数据查询(纯 props 驱动) |
| `routes/dash/index.tsx` 等具体页 | loader 数据 + 视觉编排(stats / grid / accordion) | 鉴权 / 全局 chrome |

**Shell 是纯展示组件**:接受 `user` / `themeMode` / `pathname` 等 props,不查 DB、不读 cookie。鉴权与主题状态由父 layout 注入,这样 shell 在 storybook / 单元测试里能脱壳渲染。

### 2.3 数据流

```
Request
  └→ routes/dash/layout.tsx (or root layout)
       └→ requiredAuthContext middleware → user
       └→ useRequestInfo() → theme mode (existing)
            └→ <AuthenticatedShellLayout user theme>  ← shell 拿到 user/theme,无关数据库
                 └→ <Outlet/> → routes/dash/index.tsx
                      └→ loadDash(db, user.id) → { workspaces, totalCollections, totalTabs }
                           ↑↑ 改:每个 workspace 增补 previewFavIcons[]: string[]
                      └→ render <StatsHero/> + <WorkspaceGrid/>
```

Loader 改动只发生在 `routes/dash/index.tsx::loadDash`(决策 #13),其它 loader 不动。详情见 §3。

---

## 3. 视觉系统(轻量 how)

### 3.1 Authenticated Shell

**桌面布局**(`>= md`):

```
┌────────┬─────────────────────────────────┐
│ logo   │  page header (e.g. /dash)       │
│        │  ─────────────────────────────  │
│ Dash●  │                                 │
│ Devices│  page content                   │
│ Settngs│                                 │
│ Admin  │                                 │
│ ──────  │                                 │
│ ◐◑◯    │                                 │
│ user▼  │                                 │
└────────┴─────────────────────────────────┘
   200px           1fr
```

**底部固定区**(从下往上):
- Theme row — 三按钮 segmented control(复用现有 `ThemeSwitcher`,不重写)
- Divider
- User card — 头像 + name + email,点击展开 dropdown(复用现有 `UserNav` 内容,但触发器从顶栏头像变成侧栏底部卡片)

**移动端**(`< md`,决策 #12):侧栏隐藏,顶栏出 hamburger,点击触发 `<Sheet>` 抽屉显示同样侧栏内容。主题三按钮和用户卡留在抽屉底部。

### 3.2 Dashboard Index `/dash`

**布局组成**(从上到下):

```
┌──────────────────────────────────────────────┐
│ "Welcome back, {name}"        [+ Create WS] │  ← header(决策 #9)
│ "{n} workspaces · synced {h}h ago"           │
├──────────────────────────────────────────────┤
│ [3 stats cards: WS / Coll / Tabs]            │  ← stats hero
├──────────────────────────────────────────────┤
│ [WS card] [WS card] [WS card]                │  ← grid (无虚线"创建"卡)
│ [WS card] ...                                 │
└──────────────────────────────────────────────┘
```

**Workspace card**(决策 #4):

```
┌─────────────────────────────┐
│ 📚 Reading           2h ago  │  ← icon + name + last updated
│ ▢ ▢ ▢ ▢ ▢  +18              │  ← favicon stack (前 5 个 + "+N more")
│ 4 collections · 23 tabs      │  ← meta
└─────────────────────────────┘
```

**Greeting 文案规则**:
- 有 `user.name` 用 `Welcome back, {name}`,否则 `Welcome back`
- 副行 `{n} workspace{s} · synced {h} ago`,空数据时只显示 "No workspaces synced yet"

### 3.3 Workspace 详情 `/dash/$workspaceSyncId`

**布局**(决策 #5):

```
Dashboard › Reading                                     ← breadcrumb
┌──────────────────────────────────────────────┐
│ 📚 Reading                  [Rename] [Delete] │
│ 4 collections · 23 tabs                        │
├──────────────────────────────────────────────┤
│ Collections          [Expand all][Collapse all]│  ← 工具条
│                                  [+ New coll] │
├──────────────────────────────────────────────┤
│ ▼ papers/ml-2024  8 tabs · 2h ago  [✎][🗑] │
│   ▢ Attention is all you need                 │
│   ▢ Scaling laws ...                          │
│ ▼ books/queue  12 tabs · 1d ago    [✎][🗑] │
│   ...                                          │
│ ▶ blogs/ai  3 tabs                 [✎][🗑] │
└──────────────────────────────────────────────┘
```

**默认展开策略**:URL `?coll=` 命中时只展开命中项;否则全部展开。"全展开 / 全折叠"工具条只切换本地视图状态,不改 URL。

### 3.4 Empty State(决策 #6)

```
┌─ /dash ──────────────────────────────────────┐
│ Welcome to OpenTab Cloud                       │
│ No workspaces synced yet                       │
│                                                 │
│      ┌───────────────────────┐                │
│      │   🚀                   │                │
│      │ Connect your first device │              │
│      │ ...explanation...      │                │
│      │  [Get Chrome extension]│                │
│      │  I already have it →   │                │
│      └───────────────────────┘                │
└──────────────────────────────────────────────┘
```

**条件**:`workspaces.length === 0`。Stats hero 隐藏(三个零没意义)。"Get Chrome extension" 链接到 chrome web store(链接占位见 plan);副 link 文案 "I already have it →" 暂指向 `/settings/account`(后续可改 deeplink)。

> TODO(plan): chrome web store 商店 URL 与扩展端 deeplink(如有)。

### 3.5 Landing(Phase B,决策 #7 #8)

5 段顺序固定:

```
[Header]  logo / Features / Sign In / Sign Up
─────────
[Hero]    左:badge + 大标题 + 副文 + 双 CTA
          右:dashboard 截图(主题响应)
          背景:渐变光斑 + subtle grid mask
─────────
[Feature] 三栏:Workspaces / Cross-device sync / Collections
─────────
[CTA]     "Start syncing in 60 seconds." + Get extension 按钮
─────────
[Footer]  © 2026 OpenTab · Privacy · Terms · GitHub
```

**Hero 视觉规则**:
- 大标题用渐变文字(品牌色到第二色,见 §3.6)
- 截图随主题切换:light 截图 / dark 截图
- 背景渐变光斑用 `radial-gradient`,grid 背景用 `linear-gradient` + `mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%)`(防止边缘硬切)

> TODO(plan): 实际 copy(标题 / 副文 / 三个 feature 的描述句),由产品/营销侧 finalize;spec 占位文案见 §3.6。

### 3.6 视觉 Token 与文案占位

**主品牌色板**(用现有 shadcn token,不新加):
- `--primary` 主色(已配),`--accent` 副色(已配)
- 渐变文字:`bg-gradient-to-r from-primary to-{accent or pink-500}`
- 渐变光斑:`radial-gradient(800px 300px at 50% 0%, rgba(<primary>,0.15), transparent 60%)` 等等

**占位文案**(spec 期间用,plan 阶段找产品/营销侧 finalize):
- Hero 标题:"Tabs across every device, without the chaos."
- Hero 副文:"OpenTab syncs your browser workspaces and collections, local-first."
- Feature: Workspaces / Cross-device sync / Collections,各 1 句副文
- CTA:"Start syncing in 60 seconds."

### 3.7 响应式断点

- `>= md (768px)`:侧栏永久 200px、主区 1fr
- `< md`:侧栏隐藏,顶栏增加 hamburger,点击触发 `<Sheet>` 抽屉
- Workspace grid:`grid-cols-1` (sm) → `grid-cols-2` (sm-md) → `grid-cols-3` (xl,不变)
- Landing hero 在 `< md` 时改为单列(图在文下方)

---

## 4. 数据模型 / Loader 改动

只一处改动(决策 #13):`routes/dash/index.tsx::loadDash` 返回的 `WorkspaceCardView` 增补 `previewFavIcons: string[]`。

```
WorkspaceCardView (现状)
  + previewFavIcons: string[]  // 至多 5 个 URL
```

**实现思路**(轻量 how,不写 SQL):
- 第三个 batch 查询(tabs grouped by collection)已经返回 `(collectionSyncId, n)`;再加一个/或扩展现有查询取每 collection 的 `favIconUrl` 列表
- App-side merge:`workspaceSyncId → 该 ws 下所有 collection → 拼 favIconUrl 列表 → 取前 5 个非空唯一值`
- 不在 loader 做去重的话,UI 端 `Set` 一下即可

> TODO(plan): 决定查询形态——是新增第四个 batch(`SELECT collectionSyncId, favIconUrl FROM collectionTabs WHERE userId=? AND deletedAt IS NULL`)还是扩展现有第三个 batch。前者改动小、后者更省 round-trip。

**数据完整性**:
- favIconUrl 为 null 时跳过(不计入 5)
- 重复 URL(同一站点多个 tab)做去重
- URL 可能 404 / 慢加载,UI `<img onError>` 降级到 `bg-muted` 色块

`routes/dash/$workspaceSyncId.tsx::loadWorkspaceDetail` **不改**。

Landing 不需要 loader。

---

## 5. 关键流程

### 5.1 已登录用户访问 `/`

```
GET /
 └→ routes/index.tsx loader
      └→ auth.api.getSession() → session 存在
           └→ throw redirect("/dash")  ← 行为不变
```

### 5.2 未登录访客访问 `/`

```
GET /
 └→ routes/index.tsx loader
      └→ getSession() → null
           └→ return null (loader 不抛)
                └→ render <LandingShell><Hero/><Features/><Cta/><Footer/></LandingShell>
```

**关键变化**:之前未登录时渲染的"Sign In + Sign Up + 装扩展"小卡片整体替换为完整 5 段 landing。Sign In/Sign Up 移到 `LandingHeader` 右侧。

### 5.3 已登录但无数据 → Dashboard 空态

```
GET /dash
 └→ routes/dash/index.tsx loader → workspaces.length === 0
      └→ render <AuthenticatedShellLayout>
           └→ <DashEmptyState/> (单卡片 CTA)
                ↑ 不渲染 stats hero、不渲染 grid
```

### 5.4 主题切换从 dropdown 拎到侧栏底部

```
现状:                          → 新设计:
  顶栏头像 dropdown              侧栏底部固定 row(三按钮 segmented)
    └→ Appearance ▶               同时 dropdown 里 Appearance 子菜单保留(决策 #11)
         └→ Light/Dark/System
```

技术上**复用现有 `ThemeSwitcher` 组件**,只是渲染位置变了。`UserNav` 内的 `ThemeSelectorRadioGroup` 也保留。两套入口共存,不引入新的状态来源。

### 5.5 Phase A 落地期间 `/` 的过渡

```
Phase A 完成时(landing 还没做):
  GET /  未登录 → 仍渲染当前简陋页(2 个按钮)
  GET /dash 已登录 → 新 shell + 新 dashboard
```

**理由**:Phase A 已经包含 `routes/dash/layout.tsx` 切到 `AuthenticatedShellLayout`,但 `routes/index.tsx` 不动。Phase B 来时只新增 `routes/landing/*` 与替换 `routes/index.tsx` 的 unauthenticated 分支。这样 Phase A 可以独立 ship,不阻塞营销页。

### 5.6 响应式开合

```
breakpoint < md:
  hamburger click → Sheet open → 渲染同样的 sidebar 内容
  Sheet close (背景点击 / esc / route 切换) → 自动关闭
  
breakpoint >= md (resize-up):
  自动关闭 Sheet(若开),侧栏永久显示
```

---

## 6. Phase 切分

### Phase A — Authenticated Shell + Dashboard + Workspace 详情

TL;DR:用户登录后看到全新 shell + dashboard + workspace 详情。`/`(未登录)还是旧的简陋页。

包含:
- 新 `components/shell/*` 全部组件
- `routes/dash/layout.tsx` 切到新 shell
- `routes/settings/*` / `routes/devices/*` / `routes/admin/*` 也挂到新 shell(共享 layout 包装)
- `routes/dash/index.tsx` 重写(stats hero + grid + 空态 + favicon stack loader)
- `routes/dash/$workspaceSyncId.tsx` 重写(升级 accordion + 工具条)
- `UserNav` 触发器从顶栏头像变成侧栏底部用户卡(组件内容保留)
- 主题三按钮在侧栏底部固定渲染

不含 `/`(landing)。

### Phase B — Public Landing

TL;DR:未登录访客看到一整页 SaaS 营销站。

包含:
- `components/landing/*` 全部组件(LandingShell / Header / Hero / Features / Cta / Footer)
- `routes/index.tsx` unauthenticated 分支替换为 `<Landing>` 渲染
- 截图素材准备(light + dark)从 Phase A 完成态截取
- 文案 finalize(标题 / 副文 / feature 描述 / CTA)

依赖:Phase A 视觉定稿(截图素材)。

---

## 7. 验收

### 7.1 Phase A 验收

**验收标准**:
- 已登录用户访问 `/dash` / `/dash/$id` / `/settings/*` / `/devices` / `/admin/*` 看到统一新 shell(侧栏 + 底部用户/主题区)
- `/dash` 在有数据时显示 stats hero(三数字)+ workspace 网格;每张 workspace 卡显示前 5 个 favicon 缩略
- `/dash` 在 `workspaces.length === 0` 时显示单卡片 CTA(无 stats hero、无 grid)
- Header 右上角的 "Create workspace" 按钮存在;grid 末尾**没有**虚线"创建"卡
- `/dash/$id` 显示升级版 accordion,顶部有"全展开 / 全折叠"工具条
- 主题切换从侧栏底部三按钮可用,且与 `UserNav` 内 Appearance 切换互不冲突(状态同步)
- `< md` 断点:侧栏收为 sheet drawer,顶栏 hamburger 触发
- 已登录访问 `/` 仍 redirect `/dash`(行为不变)

**自动化侧 gate**:
- `pnpm --filter @opentab/cloud typecheck` 全绿
- `pnpm --filter @opentab/cloud test` 全绿(含 dashboard / shell 单测)
- `pnpm --filter @opentab/cloud lint` 全绿
- `pnpm --filter @opentab/cloud build` 全绿
- `pnpm format` no-op(代码已格式化)

**人工侧(场景)**:
- Scenario A1 — 桌面 light mode,登录有数据:打开 `/dash`,看到 welcome 标题、三 stats 数字、≥ 1 个 workspace 卡片(含 favicon stack)
- Scenario A2 — 桌面 dark mode,同上,视觉无错位、无 contrast 问题
- Scenario A3 — 桌面,登录无数据(用空账号):看到 "Welcome to OpenTab Cloud" + 单卡片 CTA,无 stats hero
- Scenario A4 — 桌面,点 workspace 卡 → 进入 `/dash/$id`,accordion 全展开;点"全折叠" → 全收起;面包屑能回 `/dash`
- Scenario A5 — 桌面,从侧栏底部点 dark 切到 light,页面立刻响应;打开头像 dropdown 的 Appearance 子菜单,显示当前主题正确
- Scenario A6 — 桌面,从侧栏底部用户卡触发 dropdown,Sign Out 能登出
- Scenario A7 — `< md` 视口(宽度调到 600px):侧栏消失,顶栏 hamburger 出现;点击 hamburger 弹出 sheet,内容与桌面侧栏一致;路由切换后 sheet 自动关闭
- Scenario A8 — Cypress / Playwright e2e:登录后 `/dash` 截屏与基线对齐(diff 在容差内)

> TODO(plan): 视觉 baseline 截图存放位置 + diff 工具选择(Playwright snapshot vs Chromatic)。

**通过条件**:
- 全部 gate 命令 0 errors
- 8 个 scenario 全过,人工签字
- 无新增控制台 error / aria 警告

### 7.2 Phase B 验收

**验收标准**:
- 未登录访问 `/` 看到完整 5 段 landing(Header / Hero / Features / CTA / Footer)
- Hero 包含产品截图(light / dark 主题切换响应)、渐变光斑 + subtle grid 背景、双 CTA(Get extension / Sign In)
- Sign In / Sign Up 链接从 Header 右侧可达
- Footer 包含版权、Privacy / Terms / GitHub 三链接
- 已登录访问 `/` 仍 redirect `/dash`(行为不变)
- Lighthouse 性能 / 可访问性分数(landing 页) ≥ 90

**自动化侧 gate**:
- 同 7.1 四条命令全绿
- `pnpm --filter @opentab/cloud test:e2e` 含 landing 路由 smoke 测试

**人工侧(场景)**:
- Scenario B1 — 隐身窗口访问 `/`(light mode):看到完整 5 段;Hero 截图清晰、渐变背景柔和、grid mask 不刺眼
- Scenario B2 — 同上,dark mode:截图随之切换、整体可读
- Scenario B3 — 点击 Header "Sign In" 跳到 `/auth/sign-in`;点 Hero "Get extension" 跳到 chrome 商店
- Scenario B4 — `< md` 视口:Hero 文图改为单列(图在下方),三栏 feature 改为单列堆叠
- Scenario B5 — 已登录访问 `/`:redirect `/dash`,不闪烁 landing
- Scenario B6 — 从外站 referrer(如 GitHub)访问 `/`:页面加载稳定,无 layout shift,Lighthouse CLS < 0.1

**通过条件**:
- 自动化 gate 全绿 + Lighthouse ≥ 90
- 6 scenario 全过

---

## 8. 风险与未决

### 8.1 已知风险

| # | 风险 | 缓解 |
|---|---|---|
| R1 | favicon URL 来自第三方,可能 404 / 大小不一 / TLS 错 | `<img onError>` 降级 + `loading="lazy"` + `referrerPolicy="no-referrer"` |
| R2 | 头像 dropdown 与侧栏底部 dropdown 状态来源不同(都用同一个 `useAuthUser`,但事件触发器两套) | shell 复用 `UserNav` 组件实例;主题用现有 `useThemeMode` hook,单一来源 |
| R3 | Phase A 完成期间 `/` 仍是旧版,造成"风格割裂"的过渡期 | 接受;Phase B 紧随其后;若过渡期太长,单独 hotfix 把 `/` 顶部加新 logo + theme 切换以最小化反差 |
| R4 | landing 截图需要随 dashboard 视觉迭代更新 | Phase B plan 里加"截图更新流程"任务,按 dashboard 改动重截 |
| R5 | 渐变文字 / 渐变背景在 print mode / 高对比度模式下退化不优雅 | dark/light 都验过即可;高对比度系统级覆盖,不主动优化 |

### 8.2 未决问题(plan 阶段补)

正文章节里已经标了占位,这里只列索引(避免重复说明):

- Layout 包装策略 — 见 §2.1 占位
- favicon 查询形态(新增 batch vs 扩展现有) — 见 §4 占位
- 空态外链(chrome web store URL + 扩展端 deeplink 是否存在) — 见 §3.4 占位
- Landing 真实 copy — 见 §3.5 占位
- 视觉回归工具与 baseline — 见 §7.1 占位
- Dashboard light/dark 截图存放路径与命名约定(Phase B 资产准备)

### 8.3 后续可选(不在本 spec scope)

- workspace 数 ≥ 10 时侧栏 pin / quick-switcher
- collection 详情独立路由(决策 1.5 的 C 方案,留作未来)
- landing 完整 marketing 段位(testimonials / pricing / FAQ / logos / stats)—— **触发条件**:有真实客户素材 / 公开收费方案 / 累计常见问题后增量补
- `/settings/*` 内部布局升级(超出本 spec)
- 扩展安装/同步状态检测(决策 1.6 的 C 方案,等扩展暴露握手 API 后再做)
