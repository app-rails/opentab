# Extension Settings Router & Welcome Design

**Status**: Design
**Date**: 2026-04-27
**Scope**: 把 `apps/extension/src/entrypoints/settings/` 从单 SPA + `useState` tab 切换重构成 HashRouter 驱动的多页 shell;新增欢迎页(默认路由)+ 服务器面板(主开关 + 4 步 wizard + 状态信息 + 数据统计 + 同步日志分页表)。把现有 sync 状态模型从 3 kind 扩到「intent + savedConfig + auth」三层正交,支持暂停 / 重新启用 / 重新配置而不丢数据。新增 cloud 端 `GET /api/sync/stats` 返回当前用户的实体计数。新增 `@stepperize/react` 依赖。不改 `popup` / `tabs` / `import` / `setup-callback` 任何 entrypoint,不改 sync push/pull/snapshot 协议,不改 syncOutbox schema。
**Plan**: TODO(plan): 路径待写

---

## 0. 概览

### 0.1 目标

让 `settings.html` 从"右侧条件渲染 3 个 panel 的单页"升级到"路由化 app shell + 4 个独立页面"。五件事:

1. **引入 HashRouter** — `settings.html` 内部用 react-router 7 + HashRouter,4 个路由对应 4 个页面,sidebar 链接是 `<NavLink>`,可以从外部直链 `chrome-extension://<id>/settings.html#/server`。
2. **新增欢迎页(默认路由 `#/`)** — 三张 CTA 卡片(设置语言 / 导入数据 / 配置同步),引导首次进入的用户。复用现有 shadcn `Card`,文案 1-2 句、纯静态、不做向导。
3. **新增服务器面板(`#/server`)** — 主开关 hero(shadcn `<Switch>`,关掉只暂停同步,配置数据保留)+ 4 步初始化 wizard(用 `@stepperize/react`,沿用现有 backup/connect/authorize/transfer 4 步)+ 服务器信息卡 + 数据统计(authenticated 时显示 `M / N` 即"服务器 / 本地",hover 显示完整 tooltip;disabled / configured 只显本地数字)+ 同步日志分页表(50 条/页)。Hero 右上控件矩阵:`[立即同步] [Switch] [⋯ 菜单]`,菜单含"重新配置 / 复制设备 ID / 忘记此服务器"三项。同步日志 7 列展示 `workspace | collection | tab | 动作 | 状态 | 变更时间 | 同步时间`,数据源是本地 `syncOutbox` 表 + 父级实体 name 的 batch 查询。Sidebar 服务器项前有状态灯,跟新 sync state 矩阵对齐。

4. **cloud 新增 stats 端点** — `GET /api/sync/stats` 返回 `{ workspaces, collections, tabs }` 三个未删除计数,deviceToken 鉴权,沿用 `requireDeviceToken` / `enforceRateLimit` / `requireProtocolVersion` 中间件。给两个地方消费:server panel 数据统计卡 + wizard Step 4 download 卡片(让用户看到服务器侧实体数后再选方向)。

5. **重新设计 sync state 模型** — 把现 `SyncAuthState` 3-kind union(disabled / configured / authenticated)拆成三层正交字段:`enabled: boolean`(用户意图,主开关)、`savedConfig: { host, lastUsedAt } | null`(上次的连接信息,关掉开关也保留)、`auth: { deviceToken, deviceId, user } | null`(token 包,跨重连复用)。chrome.storage key 升 v2,带 v1→v2 migration。为暂停/重连/重新配置/token 失效后恢复提供干净的状态分支。

Shell 复用 `apps/cloud/app/components/shell` 的视觉直觉(头部标题 + nav + 底部用户/工具),但**不复用代码**:cloud 那边深度依赖 `react-router-7 + RR7 loader/action + Better Auth context`,extension 是 chrome MV3 + Dexie + chrome.storage,共享反而拖泥带水。各自实现自己的 `<SidebarNav>` 与 `<UserBar>`。

### 0.2 非目标

- 完整 onboarding 流程(分步引导 / 进度状态 / 视频示意图)— 欢迎页本次只做 3 张 CTA 卡 + 一行提示。后续如果要做 step-by-step,独立 spec
- Sync wizard 流程改造 — `<SyncSetupWizard>` / `<SyncStatusCard>` / `<SyncDisconnectDialog>` 全部保留,挂在 `#/server` 面板里。不改其内部
- 同步日志:冲突检测 / 手动重试单条 / 删除日志条目 — 都不做。当前 schema 的 `dead` 状态意味着"重试耗尽,需要用户重新连接服务器或者改字段后再 mutate",不引入新的 UI action
- 同步日志的搜索 / 时间范围过滤 / 自定义分页大小 — 只做"全部 / 仅 dead / 仅 failed / 仅 pending"4 个 dropdown 选项,固定 50 条/页
- 把 `#/general` 拆成更细的子页(主题独立 / 语言独立 / 关于独立)— 三块在同一页里就够,等真有第 4 类设置再拆
- 改 `popup` / `tabs` / `import` / `setup-callback` 4 个 entrypoint
- 改 `syncOutbox` 表结构 / 新增 Dexie 索引(已有 `[status+createdAt]` 索引足够支撑分页查询)

### 0.3 前提 / 起点

- WXT 0.20 + React 19 + Vitest 4。`apps/extension/src/entrypoints/settings/` 当前是 `index.html` + `main.tsx`(只 init i18n + render `<App />`)+ `App.tsx`(单文件 SPA,`useState<SettingsPanel>` 切 panel,250 行)
- `react-router` 未安装;装上需要新增 dep(版本对齐 cloud 端,即 RR7,`v7.x.x`)
- 现有可复用组件:
  - `apps/extension/src/components/theme-toggler.tsx` — 双模式(`type="icon"` 循环 / `type="toggle"` 三按钮组)
  - `apps/extension/src/lib/locale.ts` 提供 `useLocale().cycleLocale` + `langAbbr`
  - `apps/extension/src/lib/use-sync-auth-state.ts` — 返回 `{ kind: "disabled" | "configured" | "authenticated" }`,`authenticated` 时含 `user.name`
  - `apps/extension/src/components/settings/{sync-setup-wizard,sync-status-card,sync-disconnect-dialog}.tsx`
  - shadcn UI 包 `@opentab/ui/components/{button,card,table,select,badge,...}`
- 数据源:
  - 计数:`db.workspaces.where('deletedAt').equals(null).count()`(同理 collections / tabs)
  - 同步日志:`db.syncOutbox.orderBy('createdAt').reverse().offset(n).limit(50).toArray()`,父级 name 通过额外 `db.tabCollections.where('syncId').anyOf(ids).toArray()` 等 batch 查询补齐
- i18n:现有 keys 在 `apps/extension/src/locales/{en,zh}.json`,settings 相关 keys 在 `settings.*` 命名空间。本次新 keys 加在 `settings.welcome.*` / `settings.server.*` / `settings.sync_log.*`

### 0.4 关键决策一览

| # | 决策 | 一句话 |
|---|---|---|
| 1 | Router 选型 | HashRouter,chrome-extension:// 适配最干净 |
| 2 | 欢迎页位置 | settings.html 默认路由 `#/`,不开新 entrypoint |
| 3 | 同步日志列布局 | 7 列扁平 `workspace \| collection \| tab \| 动作 \| 状态 \| 变更时间 \| 同步时间`,不用嵌套路径列 |
| 4 | 父级 name 解析 | 每页 50 行 batch 查 Dexie,parent hard-deleted 时 fall back 到 syncId 前缀 |
| 5 | Sidebar 状态灯 | 3 色对齐 `useSyncAuthState`:disabled 灰 / configured 黄 / authenticated 绿 |
| 6 | 主题/语言切换 | 复用现有 `<ThemeToggler type="icon">` + `cycleLocale`,与 workspace-sidebar footer 一致 |
| 7 | Settings panels 拆几页 | 4 页(welcome / general / import-export / server),不再细拆 |
| 8 | `#/general` 内容 | 主题 + 语言 + 关于(build info)放在同一页,不独立 |
| 9 | 同步日志状态过滤 | 表头右上 dropdown:全部 / 仅 dead / 仅 failed / 仅 pending,不用 chip |
| 10 | 数据统计 server 数来源 | 新增 `GET /api/sync/stats`,deviceToken 鉴权;不复用 snapshot(snapshot 返回全量树太重) |
| 11 | 数据统计未认证显示 | disabled / configured 只显本地数字;authenticated 显 `M / N` + hover tooltip |
| 12 | 服务器面板主控件 | shadcn `<Switch>` 主开关 + 4 步 wizard,关掉只暂停 sync engine,不清 token / saved host |
| 13 | sync state 重构 | 拆成 `enabled / savedConfig / auth` 三层正交字段;chrome.storage 升 v2 + migration |
| 14 | wizard 视觉 | 用 `@stepperize/react`(Avatar + icon + 标题描述 + chevron 分隔),沿用现有 4 步逻辑 |
| 15 | 立即同步按钮位置 | hero subtitle 内,紧贴"最后同步 N 分钟前",primary 填充小按钮 |
| 16 | ⋯ 菜单 | OFF + saved 显「忘记此服务器」;ON 已连接 显「重新配置 / 复制设备 ID / 忘记此服务器」;OFF + 无配置 / wizard 进行中 隐藏 |
| 17 | 重新启用(Case 1)| 自动 `/api/whoami` 校验,200 OK 直接 resume;401/403 进完整 wizard from Step 1(备份重要,数据可能 drift)|
| 18 | 重新配置(Case 2)| ⋯ 菜单"重新配置"项 → wizard from Step 2(跳过备份,数据不动);Step 2 用 Combobox + host 历史下拉 |
| 19 | host 历史 | 存 `chrome.storage.local`,新 key,去重 + FIFO max 5 |
| 20 | 运行期 token 失效 | 顶部 banner + "重新认证" CTA → 完整 wizard,避免静默丢同步 |

详见 §1 方案对比、§2 架构、§4 路由与导航。

---

## 1. 方案对比

### 1.1 Router 选型

候选:

- **A. HashRouter** — `settings.html#/server`
- **B. MemoryRouter** — 路由完全在内存,URL 不变
- **C. BrowserRouter** — `chrome-extension://<id>/settings/server` 这种 path

| 维度 | A (Hash) | B (Memory) | C (Browser) |
|---|---|---|---|
| chrome-extension:// 兼容 | ✓ 直接可用 | ✓ 但不能直链 | ✗ 刷新 / 直链都 404 |
| 外部直链(popup → settings) | ✓ `chrome.tabs.create({ url: '...#/server' })` | ✗ 必须用消息传 | ✗ |
| 浏览器后退 / 前进 | ✓ | ✗ | ✓ |
| 实现复杂度 | 低 | 低 | 高(需要 manifest.json `web_accessible_resources` + WXT 路由 hack) |
| Bundle 体积 | 同 C | 略小(无 history listener) | 同 A |

**采纳 A**。理由:外部直链是设计核心(`#/server` 必须能从 popup / 扩展 menu 跳转);C 的 path-based 在 MV3 下要么用 `?route=...` query 模拟、要么改 manifest 暴露 path,代价不成比例。

代价:URL 多个 `#`,审美不优雅,但功能等价。

### 1.2 欢迎页位置

候选:

- **A. settings.html SPA 内的默认路由 `#/`**(选中)
- **B. 独立 entrypoint `apps/extension/src/entrypoints/welcome/`**,产出 `welcome.html`

| 维度 | A (SPA 路由) | B (独立 entrypoint) |
|---|---|---|
| Bundle 数量 | 不增 | +1 React 树 + i18n init |
| 首次安装弹出 | `chrome.runtime.onInstalled` 打开 `settings.html#/`,sidebar 在,但 main 显示欢迎 CTA | 打开 `welcome.html`,纯欢迎页面 |
| 跨页跳转 | `<Link to="/server">`(SPA 路由) | `chrome.tabs.create({ url: '/settings.html#/server' })`(开新 tab) |
| 视觉 isolation | 需要在欢迎路由里设计"主区"留白 | 完全独立,可全屏 hero |
| 与 sidebar 一致性 | 自动一致 | 必须手动复制或抽公共组件 |

**采纳 A**。理由:欢迎页本质是"settings 的入口/导览",三个 CTA 全是 settings 子页;SPA 路由让 CTA 用 `<Link>` 即跳,体验顺。第一次安装弹出时 sidebar 在场也合理 — 用户立刻能看到"还有这些可以配置"。

代价:欢迎页被框在 240px sidebar 旁边,做不出全屏 hero 的"开箱仪式感"。如果未来要做 step-by-step onboarding 才需要独立 entrypoint。

### 1.3 同步日志列布局

候选:

- **A. 7 列扁平**(选中):`workspace | collection | tab | 动作 | 状态 | 变更时间 | 同步时间`
- **B. 单"路径"列**:`实体类型 | 动作 | 路径(workspace/collection/tab 嵌套显示) | 状态 | 时间`

| 维度 | A | B |
|---|---|---|
| 列对齐 | tab title 齐 1fr 列,workspace / collection 齐左侧 | 路径列宽度不齐,长 tab title 影响整列 |
| 同/未同步对比 | 多一个"同步时间"列直观 | 时间合并,同步状态全靠图标 |
| 实体类型识别 | 看哪一列有名字即可推断,无需独立"实体"列 | 必须有"实体"列 |
| 窄屏(1280)适配 | 紧但够,tab 列截断 + tooltip | 路径列容易换行 |
| Cells 数量 | 多,但每 cell 单一字段渲染 | 少,但路径 cell 是混合内容 |

**采纳 A**。理由:用户描述很明确 "workspace - collection - tab - 动作 - 状态 - 变更时间 - 同步时间";扁平列让"哪条同步了哪条没同步"一眼看懂,变更时间 vs 同步时间分两列对比直观(pending / dead 行第二列空,一目了然)。

代价:列数多,窄屏 tab 列必须截断 + hover 显示完整 title。

### 1.4 父级 name 解析策略

候选:

- **A. 每页 50 行 batch 查 Dexie**(选中):页加载时,从 50 条 outbox 行收集 unique workspaceSyncId / collectionSyncId,各做一次 `where('syncId').anyOf(ids).toArray()`,内存 Map 拼接
- **B. 渲染时按 row lookup**:每行渲染时 `useLiveQuery(() => db.workspaces.get(...))`
- **C. SyncOp.payload 冗余存 names**:写 outbox 时把当前 workspace name / collection name 一起塞进 payload

| 维度 | A | B | C |
|---|---|---|---|
| 查询次数 / 页 | 最多 3 次(workspace + collection batch 各一,tab 自身用 payload) | 50 × N 个 hooks | 0 |
| 跟随重命名 | ✓ 实时反映父级当前名 | ✓ | ✗ 显示写入时刻的旧名 |
| schema 改动 | 无 | 无 | 需要改 `mutate-with-outbox`(不在 scope) |
| 实现复杂度 | 中 | 低但散 | 高(改写出口) |

**采纳 A**。理由:父级重命名后日志该跟着更新("旧 collection 名"对用户没意义);batch 查询 < 5ms,不挡渲染;C 要改 mutate 出口路径,本次 spec 明确不动 syncOutbox。

代价:父级被 hard-delete 时(目前 workspace/collection 删除是 soft delete + deletedAt,但日志一旦"已同步 + 失去引用"可能被更晚的 cascade 清理),Map miss 时 fallback 到 syncId 前 4 位。

### 1.5 数据统计 server 数来源

候选:

- **A. 新增 `GET /api/sync/stats`**(选中):返回 `{ workspaces, collections, tabs }` 三个数
- **B. 复用 `GET /api/sync/snapshot`**:从 snapshot 全量树的 `.length` 算出
- **C. 不显示 server 数,只显本地**:跟当前 mockup v4 一致

| 维度 | A | B | C |
|---|---|---|---|
| 端点单一职责 | ✓ 只算数 | ✗ 拉全量树就为算个数 | — |
| 网络字节 | ~50 字节 | KB ~ MB(取决树大小) | 0 |
| 速率限制冲突 | 独立 endpoint 配自己的限流 | snapshot 已限制到 10/5min(prod) | — |
| 用户能否看 sync drift | ✓ | ✓ 但代价高 | ✗ 看不出 push/pull 不一致 |
| 实现 | 新增 ~20 行 + 1 个 service 函数 + 测试 | 0 改动 | 0 改动 |

**采纳 A**。理由:snapshot 是冷启动专用,prod 限到 10/5min,extension 进 server-page 时拉全量树就为显示三个数字,代价不成比例。新 endpoint 沿用 `pull/push/snapshot` 三件套同构(`requireDeviceToken` + `enforceRateLimit` + `requireProtocolVersion`),margin 成本低。

代价:多一个 endpoint 要维护;后端 schema 变了(新增 protocol response type)需要版本兼容。

### 1.6 数据统计未认证显示

候选:

- **A. authenticated 显 `M / N`,disabled / configured 只显本地一个数字**(选中)
- **B. 一律显 `M / N`,未认证 M 显 `—`**:`— / 14`
- **C. 一律显两个数字,未认证用 N/A 占位**

| 维度 | A | B | C |
|---|---|---|---|
| 视觉一致性 | 两种状态卡片不一样 | 一致 | 一致 |
| "首次看到"用户预期 | 直观:没启用就只有本地 | 困惑:为什么有个 `—` | 同 B |
| 信号噪声 | 高 — 卡片本身告诉你"启用了 sync"或"没启用" | 中 | 低 |
| 实现 | 一个 conditional render | 同 | 同 |

**采纳 A**。理由:未启用同步时 `M / N` 那个 M 没意义,`—` 占位反而让用户怀疑"是网络挂了还是没配?"。卡片形态本身就该告诉你 sync 状态。

代价:authenticated 切换到 disabled 时(罕见,断开连接)卡片视觉跳一下,可接受。

### 1.7 服务器面板主控件:Switch vs Connect/Disconnect 按钮

候选:

- **A. shadcn Switch 主开关**(选中):隐喻「sync intent」,关掉数据保留
- **B. 显式 Connect / Disconnect 按钮**:更"动作感",但 disconnect 容易让人以为是清理
- **C. 不做开关,直接进 wizard**:首次或永久跑 wizard,无暂停态

| 维度 | A Switch | B Connect/Disconnect | C 无开关 |
|---|---|---|---|
| 暂停意图清晰度 | 高 | 中(disconnect 可能误解为"清理") | ✗ 不支持暂停 |
| 重连成本 | 一键 | 重新点 connect | 完整 wizard |
| 视觉重 | 轻(20×36 px) | 中 | 无 |
| 跟系统设置(macOS / iOS Settings)一致性 | ✓ | ✗ | — |
| 暂停期间 outbox 写入是否堆积 | 是,resume 时 flush | 同 A | N/A |

**采纳 A**。理由:用户主诉求是"想暂停一下,数据别丢";Switch 的"intent toggle"语义最贴近。Disconnect 这种命名容易让用户怀疑"我点下去会不会清数据",反而提高心理门槛。

代价:Switch 视觉小,首次访问的用户可能注意不到 → 用 hero 卡 + status badge + 引导文案补强。

### 1.8 sync state 重构:扁平 union vs 三层正交字段

候选:

- **A. 三层正交字段**(选中):`{ enabled, savedConfig, auth }`,每层独立演进
- **B. 扩 union 到 5+ kinds**:`disabled-no-config / disabled-with-config / configured / authenticated / authenticated-paused / ...`
- **C. 维持现状 + UI 内部组合**:UI 自己组合 `disabled` 和 localStorage 里另存的 saved config

| 维度 | A 三层 | B 扁平 union | C 维持现状 |
|---|---|---|---|
| 表示能力 | 任意正交组合 | union 爆炸,新场景要加 kind | UI 组合,容易漏边界 |
| 类型安全 | 高(每层独立可选) | 高但 union 越长越难 exhaustive 检查 | 低(组合状态散在 UI) |
| migration 成本 | 一次 v1→v2 | 一次 v1→v2 | 不用 migration,但 UI 改动大 |
| 重新配置 / Case 1 / Case 2 表达 | 干净 | 多种 kind 转换有歧义 | 全靠 UI 拼,易错 |

**采纳 A**。理由:三层正交后,主开关只动 `enabled`,wizard 完成只动 `auth`,"忘记此服务器"清 `savedConfig` + `auth`。每个动作只动它该动的那层,不互相干扰。

代价:存储 schema 改了一次,要写 v1→v2 migration(读旧 key 自动转新结构,plan 阶段定细节)。

### 1.9 Case 1(暂停后重新启用)token 失效时的策略

候选:

- **A. 完整 wizard from Step 1**(选中):备份 → 连接(Combobox 历史秒填)→ 授权 → 同步方向
- **B. 仅跳到 Step 3 授权**:其他 step 全跳过
- **C. 静默重新授权 + 透明地 retry**:用户无感

| 维度 | A 完整 wizard | B 仅 Step 3 | C 静默 |
|---|---|---|---|
| 数据安全 | ✓ 备份 + 方向选择保证 | ✗ 万一服务器数据已变,直接同步可能覆盖 | ✗ 高风险 |
| 用户感知 | 长但透明 | 中等 | 隐式,出错只能事后救 |
| 对应"token 为何失效"的常见原因 | 服务器吊销设备 / 人为重置 → 数据可能 drift,值得重走 | 假设服务器数据稳定,假设可能不成立 | 同 B |

**采纳 A**。理由:token 失效通常意味着"服务器一侧发生了管理动作"(吊销设备 / reset 用户 / 重新 deploy),本地和服务器数据 drift 风险高。让用户走一次完整 wizard,Step 1 备份 + Step 4 方向选择是数据安全的两道护栏,不能省。

代价:用户体验上比 B 多走 3 步。但 Step 2 用 Combobox 自动 pre-fill 历史 host 一键过,Step 3 重新授权(open OAuth tab → callback)15 秒级,Step 4 方向选择本来就不能省 — 总耗时分钟级,可接受。

### 1.10 Sidebar 服务器状态灯

候选(对应新的三层 sync state 模型):

- **A. 4 状态灯**(选中):
  - 灰 + "未启用" — `enabled=false ∧ savedConfig=null`
  - 灰(hover "已暂停") — `enabled=false ∧ savedConfig≠null`
  - 黄 + "配置中" — `enabled=true ∧ auth=null`(wizard 进行中)
  - 绿 + "已启用" — `enabled=true ∧ auth≠null`
- **B. 3 状态灯**:把"未启用"和"已暂停"合并成一种灰
- **C. 2 状态灯**:绿 / 灰

| 维度 | A 4 状态 | B 3 状态 | C 2 状态 |
|---|---|---|---|
| 是否区分"从未配置"vs"暂停" | ✓ 通过 hover label | ✗ 同样灰 | ✗ |
| 视觉密度 | 灰色用 hover 区分,主色还是 3 档 | 3 档 | 2 档 |
| sidebar 文字 label 复杂度 | 4 种文案 | 3 种 | 2 种 |
| 用户能否一眼看出"我之前配过吗" | ✓ | ✗ | ✗ |

**采纳 A**。理由:用户暂停后再回 sidebar 时,知道"已经配过,只是停着"很重要,跟"从来没配过"是不同的心理预期。区分通过 label 文字 + hover 提示,主色保持 3 档不抢眼。

代价:i18n 多 1 条 status label key。

---

## 2. 架构

### 2.1 模块切分

```
apps/extension/src/entrypoints/settings/
  ├── index.html              ← WXT entrypoint(无改)
  ├── main.tsx                ← 改:挂 <RouterProvider> 取代 <App />
  ├── routes.tsx              ← 新:路由配置(4 条)
  ├── App.tsx                 ← 删:旧单文件 SPA
  ├── shell/                  ← 新
  │   ├── settings-shell.tsx       ← layout(sidebar + <Outlet />)
  │   ├── settings-sidebar.tsx     ← nav + 4-state 状态灯 + footer (UserBar)
  │   └── user-bar.tsx             ← 用户身份 + 主题/语言 quick toggle
  └── pages/                  ← 新
      ├── welcome-page.tsx        ← #/        三张 CTA 卡
      ├── general-page.tsx        ← #/general 主题 + 语言 + 关于(从旧 App.tsx 拆)
      ├── import-export-page.tsx  ← #/import-export 导入 + 导出按钮(从旧 App.tsx 拆)
      └── server/                 ← #/server  按状态拆组件
          ├── server-page.tsx        ← 顶层,根据 SyncSettings 状态分发
          ├── server-hero.tsx        ← 主开关 + status badge + 立即同步 + ⋯ 菜单
          ├── server-empty.tsx       ← OFF + 无配置 (B 方案插图 + 一句场景)
          ├── server-paused.tsx      ← OFF + 有保存配置 (read-only 信息卡)
          ├── server-reauth-banner.tsx ← 运行期 token 失效顶部 banner
          ├── server-info-card.tsx   ← endpoint / 设备 / 最后同步
          ├── server-stats-cards.tsx ← M/N 三张卡
          ├── server-sync-log.tsx    ← 同步日志表 + 分页 + 过滤 + 图例
          └── wizard/
              ├── server-wizard.tsx       ← stepperize 容器 + 路由分发
              ├── step-backup.tsx
              ├── step-connect.tsx        ← Combobox + host 历史
              ├── step-authorize.tsx
              ├── step-transfer.tsx       ← upload/download 卡片 (含服务器 stats)
              └── step-complete.tsx       ← ✓ 中转屏
```

`pages/server/` 拆成 ~10 个文件听起来多,但每个职责单一(状态分发 / hero / 4 步 / 数据卡 / 日志表)。比塞在一个 800 行的 `server-page.tsx` 容易测、容易看 sub-state 渲染分支。

### 2.2 数据流

```
                     chrome.storage.local
                            │
                            ▼
                   useSyncSettings()
            (enabled, savedConfig, auth)
                            │
              ┌─────────────┼─────────────┬──────────────┐
              │             │             │              │
              ▼             ▼             ▼              ▼
        SettingsSidebar  ServerPage    UserBar     SyncEngine
          (4 状态灯)     (状态分发)    (头像/名)   (subscribe → start/stop)


                          IndexedDB
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
        useLocalStats()              useSyncLog(page)
        useLiveQuery + count(*)      useLiveQuery + outbox
                                      + parent name batch

                  cloud /api/sync/stats
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
       useServerStats()           Wizard Step 4 download card
       (statsM 显示在统计卡)        (用同一个 fetch hook,在 Step 4 挂载时拉)
       仅 enabled+auth 时触发
```

`useLiveQuery`(dexie-react-hooks)绑 Dexie 表;数据变 → 自动重渲染。无独立 store,无 Zustand。

### 2.3 与 `apps/cloud` 的关系

cloud 端 dash shell 是 "RR7 loader → server-side data → render";extension 端 settings shell 是 "Dexie live query → client-side render"。视觉上对齐,代码上独立。**不抽 `packages/ui/components/shell`**(早期抽,场景没收敛,会变成两端互相牵制)。

---

## 3. 数据模型

### 3.0 SyncSettings(主开关 + 配置 + 认证三层)

新结构,替换现 `SyncAuthState`:

```
SyncSettings {
  // 用户意图(主开关)
  enabled: boolean

  // 上次连接信息(关掉开关也保留,"忘记此服务器"才清)
  savedConfig: {
    host: string
    lastUsedAt: number   // ms epoch
  } | null

  // 认证包(token 失效或重新配置时清)
  auth: {
    deviceToken: string  // hash 不存,直接放 token(已经是 chrome.storage.local)
    deviceId: string
    user: { id: string, name: string, email?: string }
    issuedAt: number
  } | null

  // 历史 host(Combobox 下拉源)
  hostHistory: Array<{ host: string, lastUsedAt: number }>  // FIFO max 5,去重 by host
}
```

**派生 UI 状态**(都从这三层算出来):

| sidebar 灯 | server panel 形态 |
|---|---|
| `!enabled ∧ !savedConfig` → 灰 "未启用" | server-empty(B 方案插图) |
| `!enabled ∧ savedConfig` → 灰 "已暂停" | server-paused(read-only 信息卡) |
| `enabled ∧ !auth` → 黄 "配置中" | wizard(从合适的 Step 开始) |
| `enabled ∧ auth` → 绿 "已启用" | server-info-card + stats-cards + sync-log |

**chrome.storage 迁移**:

- 旧 key `opentab_sync_auth_v1`(union 类型)→ 新 key `opentab_sync_settings_v1`(`SyncSettings`)
- migration 在第一次 `getSyncSettings()` 调用时跑:读旧 key,按 union kind 映射到新结构,写新 key,删旧 key
- 旧 `disabled` → `{ enabled: false, savedConfig: null, auth: null, hostHistory: [] }`
- 旧 `configured` → `{ enabled: true, savedConfig: { host, lastUsedAt: now }, auth: null, hostHistory: [{host, lastUsedAt: now}] }`(把"半成品"当 wizard 中态续上)
- 旧 `authenticated` → `{ enabled: true, savedConfig: { host, lastUsedAt: now }, auth: { ... }, hostHistory: [{host, lastUsedAt: now}] }`

> TODO(plan): migration 失败兜底(旧 key 数据损坏)→ 直接重置成 disabled + 提示用户"配置已重置,请重新设置"

### 3.1 同步日志的"行模型"

每行来自 `syncOutbox` 一条记录,渲染时还需要父级 name。从 schema 派生的逻辑视图:

```
LogRow {
  // 直接来自 SyncOp
  id, opId, action, status, createdAt, syncedAt, attemptCount, lastError

  // 派生
  entityType: 'workspace' | 'collection' | 'tab'
  workspaceName: string | null   // null = workspace 自己 / 父级 hard-deleted
  collectionName: string | null  // null = collection 自己 / 不是 tab 类型 / 父级 hard-deleted
  tabTitle: string | null        // null = 不是 tab 类型 / payload 缺 title
  fallbackSyncIdPrefix: string   // 任何 name 缺失时显示
}
```

**派生规则**:

- `entityType === 'workspace'`:`workspaceName` 来自 `payload.name`(upsert)或 `null`(delete)
- `entityType === 'collection'`:`workspaceName` 通过 `payload.workspaceSyncId` 查 `db.workspaces`;`collectionName` 来自 `payload.name`(upsert)或 `null`(delete)
- `entityType === 'tab'`:`workspaceName` 通过 collection.workspaceSyncId 链路查;`collectionName` 通过 `payload.collectionSyncId` 查;`tabTitle` 来自 `payload.title`(upsert)或 `null`(delete)
- 所有"通过 syncId 查 name"用 50 行 batch:先 `Set` 收集 unique syncIds,一次 `where('syncId').anyOf([...]).toArray()` 拿全,build Map

**变更时间 / 同步时间映射**:

- 变更时间 = `createdAt`(写入 outbox 的时刻 = 用户操作的时刻)
- 同步时间 = `syncedAt`(成功推到服务端的时刻;`status !== 'synced'` 时为 `null`,UI 显示 `—`)

### 3.2 同步日志状态语义

跟 schema 1:1。UI 文案约定:

| schema status | UI label  | 颜色变量    | 行背景 |
|---------------|-----------|-------------|--------|
| `synced`      | 已同步    | `--success`(绿) | 默认 |
| `pending`     | 待同步    | `--accent`(蓝) | 默认 |
| `failed`      | 重试中    | `--warning`(橙) | 浅橙 6% |
| `dead`        | 已放弃    | `--error`(红) | 浅红 6% |

### 3.3 数据统计

服务器面板三张卡片显示 workspace / collection / tab 计数。`authenticated` 时形如 `M / N`(M = 服务器,N = 本地),hover 显示 `服务器: M | 本地: N` tooltip;`disabled` / `configured` 时只显本地一个数字。

**本地数据(N)**:

```
workspaces:   db.workspaces.where('deletedAt').equals(null).count()
collections:  db.tabCollections.where('deletedAt').equals(null).count()
tabs:         db.collectionTabs.where('deletedAt').equals(null).count()
```

通过 `useLiveQuery` 包裹,任意 mutation 自动重计数。

**服务器数据(M)**:

```
GET /api/sync/stats
  Headers: Authorization: Bearer <deviceToken>, x-protocol-version: ...
  Response: { workspaces: number, collections: number, tabs: number }
```

挂载 `#/server` 时调用一次;`useSyncAuthState().kind === 'authenticated'` 才发起;响应 4xx/5xx / 网络失败时进入 "M 不可用" 状态(卡片显示 `?  / N` 配 retry 按钮)。不做轮询,用户切换路由再回 `#/server` 重新拉。

cloud 端实现(沿用现有 `pull.ts` / `snapshot.ts` 套路):

```
apps/cloud/app/routes/api/sync/stats.ts
  GET → requireProtocolVersion → requireDeviceToken → enforceRateLimit
       → countAllForUser(userId) → statsResponseSchema.parse(...)
```

新 service 函数 `countAllForUser` 在 `apps/cloud/app/services/sync.server.ts` 旁边加一个文件或同文件加函数,逻辑就是三次 `db.select().from(...).where(eq(userId)).count()`(或 dialect 抽象层等价写法)。

新协议 type 加在 `packages/protocol/`(沿用 `snapshotResponseSchema` 命名风格,`statsResponseSchema`)。

> TODO(plan): 三个本地 count 单查 vs `Promise.all` 批查 vs 用一个 hook — plan 选最 idiomatic 写法
> TODO(plan): cloud 端 cloudflare D1 的 count 查询性能,是否需要 cache(KV TTL 30s)— plan 阶段评估,默认不加

---

## 4. 路由与导航

### 4.1 路由表

| Path | 组件 | 说明 |
|---|---|---|
| `#/` | `<WelcomePage />` | 欢迎页(默认) |
| `#/general` | `<GeneralPage />` | 主题 + 语言 + 关于 |
| `#/import-export` | `<ImportExportPage />` | 导入 + 导出 |
| `#/server` | `<ServerPage />` | 服务器信息 + 统计 + 同步日志 |

未匹配路径(包括外链历史遗留的 `#/foo`)→ redirect 到 `#/`(welcome)。

### 4.2 Sidebar 结构

```
┌────────────────────────┐
│ [O] 设置                │  ← 标题 + logo
│ ↗ 欢迎页                │  ← <NavLink to="/" />,welcome 时高亮
│ ────────────────────── │
│ ⚙️ 通用设置            │  ← <NavLink to="/general" />
│ ↕️ 导入导出            │  ← <NavLink to="/import-export" />
│ ● 服务器  [已启用]      │  ← <NavLink to="/server" />,前 9px 圆点 + 文字状态
│ ────────────────────── │
│ 👤 zhaolion  🌗  中     │  ← <UserBar />
└────────────────────────┘
```

服务器 nav item 的状态(由 §3.0 SyncSettings 派生):

| 条件 | 圆点色 | 右侧 label | hover 提示 |
|---|---|---|---|
| `!enabled ∧ !savedConfig` | 灰(`--text-tertiary`) | 未启用 | "点击进入设置同步" |
| `!enabled ∧ savedConfig` | 灰(`--text-tertiary`) | 已暂停 | "上次连接 opentab.app · 打开开关恢复" |
| `enabled ∧ !auth` | 黄(`--warning`) | 配置中 | "正在走设置向导" |
| `enabled ∧ auth` | 绿(`--success`) | 已启用 | "已连接 opentab.app · 最后同步 N 分钟前" |

### 4.3 Server panel hero 右上控件矩阵

| 状态 | 立即同步 | Switch | ⋯ 菜单 |
|---|---|---|---|
| `!enabled ∧ !savedConfig` | — | OFF · hover "启用同步" | —(隐藏,无东西可删) |
| `!enabled ∧ savedConfig` | — | OFF · hover "启用(自动重连)" | 「忘记此服务器」 |
| `enabled ∧ wizard 进行中` | — (隐藏) | ON · hover "暂停设置" | —(避免误删半成品) |
| `enabled ∧ 重连中` | — (disabled) | ON · hover "暂停同步" | 「忘记此服务器」 |
| `enabled ∧ auth ∧ 已连接` | ✓ primary 小按钮,紧贴 subtitle "最后同步 N 分钟前" | ON · hover "暂停同步" | 「重新配置 / 复制设备 ID / 忘记此服务器」 |

### 4.4 UserBar(footer)状态

派生自 §3.0 SyncSettings:

| 条件 | 显示 |
|---|---|
| `enabled ∧ auth` | 头像(`auth.user.name` 首字母,`--accent` 背景)+ 名字 + 主题 icon + 语言 icon |
| `enabled ∧ !auth`(wizard 中) | 灰头像 + 「配置中」 + 主题 icon + 语言 icon。点头像区域跳 `#/server` |
| `!enabled ∧ savedConfig` | 灰头像 + 「已暂停」 + 主题 icon + 语言 icon。点头像区域跳 `#/server` |
| `!enabled ∧ !savedConfig` | 灰头像 + 「未登录」 + 主题 icon + 语言 icon。点头像区域跳 `#/server` |

### 4.5 直链入口

- 第一次安装:`chrome.runtime.onInstalled` 打开 `chrome.runtime.getURL('/settings.html')` → 默认进 `#/`(welcome)
  - > TODO(plan): `background.ts` 是否已经有 onInstalled 处理(打开 `tabs.html` 之类),plan 阶段确认是否需要改
- 现有 workspace-sidebar footer "Settings" 按钮当前打开 `chrome.runtime.getURL('/settings.html')`,行为不变,默认仍进 `#/`
- 未来其他入口(popup / context menu)可以直链 `#/server` 等子路由

---

## 5. 关键流程

### 5.1 同步日志分页 + 父级名解析

```
ServerPage 挂载
  └→ useSyncLog(page=1, filter='all'|'dead'|'failed'|'pending')
       │
       ├→ rows =
       │    filter === 'all'
       │      ? db.syncOutbox.orderBy('id').reverse()        // ++id 自增 ≈ createdAt 序
       │           .offset((page-1)*50).limit(50).toArray()
       │      : db.syncOutbox
       │           .where('[status+createdAt]')               // 已有复合索引
       │           .between([filter, Dexie.minKey], [filter, Dexie.maxKey])
       │           .reverse()
       │           .offset((page-1)*50).limit(50).toArray()
       │
       ├→ workspaceIds = uniq(rows 中所有 workspace 类 syncId,
       │                       含 collection.payload.workspaceSyncId、
       │                       collection 链上拿到的 workspaceSyncId)
       ├→ collectionIds = uniq(rows 中所有 collection 类 syncId,
       │                        含 tab.payload.collectionSyncId)
       │
       ├→ workspaceMap = db.workspaces
       │                     .where('syncId').anyOf([...workspaceIds])
       │                     .toArray() → Map<syncId, name>
       ├→ collectionMap = db.tabCollections
       │                     .where('syncId').anyOf([...collectionIds])
       │                     .toArray() → Map<syncId, {name, workspaceSyncId}>
       │
       └→ rows.map(toLogRow(workspaceMap, collectionMap))
```

`useLiveQuery` 包整个流程;outbox 表新增/状态变 → 自动重跑。

`filter='all'` 走 `orderBy('id').reverse()`(`++id` 自增,排序与 `createdAt` 同向,免新建索引);`filter !== 'all'` 走 `where('[status+createdAt]').between([s, min], [s, max]).reverse()` 直接吃复合索引第一段。两条路径分支在 hook 里收口,page 组件无感知。

> TODO(plan): collection → workspaceSyncId 链接路径:从 collection.workspaceSyncId 字段拿(已存),还是从 tab.payload 反推?plan 阶段挑一种,确保 hard-deleted 父级 fallback 到 syncId 前缀的判断点统一。

### 5.2 Toggle 状态机(主开关 + 数据)

```
                    ┌──────────────────────────────────────┐
                    │ Toggle OFF (sync engine paused)       │
                    │   • outbox writes 仍堆积              │
                    │   • UI 显 "已暂停" / "未启用"           │
                    └──────────────────────────────────────┘
                              │ 用户翻 ON
                              ▼
                    ┌──────────────────────────────────────┐
                    │ Has savedConfig?                      │
                    └──────────────┬─────────┬──────────────┘
                            yes    │         │ no
                                   ▼         ▼
                  ┌──────────────────────┐  Wizard from Step 1 (备份)
                  │ Has auth?             │  → Step 2 → 3 → 4 → 完成
                  └────┬─────────┬────────┘
                  yes  │         │ no
                       ▼         ▼
                 /api/whoami    Wizard from Step 2 (Combobox 默认上次 host)
                 200 OK / 401-403 / network err
                       │
              ┌────────┼────────────┐
              200      401/403       network
              ▼        ▼             ▼
           已连接   完整 wizard    "暂时连不上,
            (resume)  (Case 1     稍后重试" banner
                       走 Step 1 备份)   保持 OFF 状态
```

- "Sync engine paused" 不是 disable;outbox 还在写,只是 background `sync.tick()` 不发起 push/pull。Resume 时一次 flush。
- `/api/whoami` 是新或已有端点?
  > TODO(plan): grep `whoami` / `me` 看现有协议有无该端点;如无,本次也加(返回 `{ user, deviceId }`,鉴权同 stats)

### 5.3 Case 2 重新配置流程

```
用户在已连接面板 → ⋯ 菜单点 "重新配置"
        │
        ▼
启动 wizard from Step 2 (备份跳过)
        │
        ▼
Step 2: Combobox pre-fill 当前 host,下拉显示 hostHistory(去重 by host)
        │ 用户输入新 host(可能跟旧的同) → /health 检查
        ▼
Step 3: 重新走 OAuth (即使 host 没变,token 也会刷)
        │ 拒绝/超时 → 用户取消
        ▼
Step 4: 调 /api/sync/stats(用新 token)→ 显 download 卡片真实数字
        │ 用户选 upload 或 download
        ▼
完成态:savedConfig.host 更新,hostHistory unshift 新 host(去重 + truncate 5),auth 替换

取消:
- 任何步骤点"取消重新配置" 或关掉开关:
    - 旧 token 仍有效 → 回到原"已连接"状态(savedConfig / auth 不变)
    - 旧 token 已被 Step 3 invalidate → 必须完成 Step 3 + 4(没法回退,因为旧凭证已经失效)
        > TODO(plan): Step 3 OAuth 是"全新签发"还是"调用接口才让旧失效"?决定能否安全 revert
```

### 5.4 运行期 token 失效处理

```
SyncEngine 任意一次 push/pull 收到 401/403
        │
        ▼
设置 SyncSettings.auth = null(savedConfig 保留)
        │
        ▼
SettingsSidebar 灯 → 黄(配置中);ServerPage 状态切换
        │
        ▼
ServerPage 顶部插入 <ServerReauthBanner>:
  ⚠️ 认证已过期 · 数据可能未同步上传
  [重新认证]  [稍后]
        │
        ▼
点"重新认证" → 启动 wizard from Step 1 (Case 1 行为,完整 wizard)
点"稍后" → 仅关掉 banner,sync engine 仍 paused 直到下次重新 enabled
```

### 5.5 i18n keys 结构

新增三个命名空间(命名沿用项目现有 `settings.*` 风格):

```
settings.welcome.*
  title, subtitle, card_language_title, card_language_desc, card_language_cta,
  card_import_title, card_import_desc, card_import_cta,
  card_sync_title, card_sync_desc, card_sync_cta,
  hint_jump_to_main

settings.server.*
  title, subtitle_default, subtitle_paused, subtitle_configuring, subtitle_connected,
  status_disabled, status_paused, status_configuring, status_connected,
  switch_label_off, switch_tooltip_enable, switch_tooltip_resume, switch_tooltip_pause,
  hero_empty_title, hero_empty_scenario,
  paused_card_title, paused_card_hint,
  reauth_banner_title, reauth_banner_cta_now, reauth_banner_cta_later,
  info_section_title, info_endpoint, info_device_name, info_device_id, info_last_sync,
  action_sync_now, action_syncing,
  stats_section_title, stats_workspaces, stats_collections, stats_tabs, stats_tooltip,
  menu_reconfigure, menu_copy_device_id, menu_forget_server,
  forget_dialog_title, forget_dialog_body, forget_dialog_confirm, forget_dialog_cancel

settings.wizard.*
  step_backup_title, step_backup_desc, step_backup_action, step_backup_done,
  step_connect_title, step_connect_desc, step_connect_input_label, step_connect_input_help,
  step_connect_history_label, step_connect_history_when_used,
  step_connect_health_checking, step_connect_health_failed,
  step_authorize_title, step_authorize_desc, step_authorize_waiting,
  step_authorize_reopen, step_authorize_cancel,
  step_transfer_title, step_transfer_desc,
  step_transfer_upload_title, step_transfer_upload_desc, step_transfer_upload_recommended,
  step_transfer_download_title, step_transfer_download_desc,
  step_transfer_warning,
  step_complete_title, step_complete_summary, step_complete_done,
  reconfigure_skip_backup_label, reconfigure_cancel

settings.sync_log.*
  title, col_workspace, col_collection, col_tab, col_action, col_status,
  col_changed_at, col_synced_at,
  status_synced, status_pending, status_retrying, status_dead,
  filter_all, filter_dead, filter_failed, filter_pending,
  pagination_summary, pagination_prev, pagination_next,
  legend_synced, legend_pending, legend_retrying, legend_dead,
  empty_no_logs

settings.sidebar.*
  title, welcome_link,
  nav_general, nav_import_export, nav_server,
  status_disabled, status_paused, status_configuring, status_connected,
  status_tooltip_disabled, status_tooltip_paused, status_tooltip_configuring, status_tooltip_connected,
  user_unauthenticated, user_paused, user_configuring
```

复用既有 keys:`settings.appearance.*`(主题/语言,搬到 general-page)/ `settings.about.*`(版本信息)/ `settings.export.*` / `settings.import.*` / `settings.sync.*`(同步状态卡 / wizard 文案)。

> TODO(plan): plan 阶段把上面 keys 列表展开成 en + zh 完整 JSON diff,补到 `apps/extension/src/locales/{en,zh}.json`。

---

## 6. 风险与未决

### 6.1 风险

- **Bundle 体积**:react-router-7 ~12KB gzip + `@stepperize/react` ~2KB,settings.html 当前 bundle ~80KB,合计增 18%。可接受(settings 不是高频打开页)。
- **Dexie live query 雪崩**:如果用户产生大量并发 mutation,`useLiveQuery(syncOutbox)` 可能频繁重跑。50 行限制 + 索引 batch 查应该能压住,极端场景需要 throttle —— 上线后观察。
- **HashRouter scroll restoration**:RR7 的 ScrollRestoration 默认依赖 history,HashRouter 下要手动管理。pages 都很短,基本不需要,但 server-page 同步日志列表可能长 —— plan 阶段决定是否给单页加 `useEffect(() => ref.current?.scrollTo(0, 0), [page])`。
- **`/api/sync/stats` 速率限制**:用户每次切回 `#/server` 都触发一次 fetch,频繁切换可能撞限。沿用 `pull` / `snapshot` 同套限流(prod 较紧、dev 宽松),client 侧可以加"60 秒缓存"短路,plan 决定。
- **服务器 count 与本地 count 时间窗不一致**:server 是 fetch 时刻的 snapshot,local 是 useLiveQuery 实时;用户刚 push 完一个新 workspace,local 已加,server 还没收 → 显示 `M < N` 是正常 sync drift,不是 bug。需要在 hover tooltip 或图例里说清楚,避免误报"数据丢了"。
- **chrome.storage v1→v2 migration 失败**:旧 key 数据损坏 / 解析失败时,要决定是"重置 + 提示" 还是"保留旧 key + 不显示设置面板等待用户介入"。倾向前者,但要清楚提示用户"上次配置无法读取,需要重新设置"。
- **outbox 在暂停期间持续堆积**:用户长期 OFF 后再 ON,可能积累上千 op,resume 时 flush 一波长。需要 plan 阶段评估是否加进度提示("正在恢复 N 条变更...")。
- **重新配置 Step 3 后回退安全性**:wizard Step 3 走完 OAuth 后旧 token 是否立即失效?如果立即失效,Step 4 取消 = 旧凭证已坏,无法回到原"已连接"。这违背 §1.9 决策"取消重新配置回原连接"。
  > TODO(plan): 查 cloud `/api/extension/exchange/consume` 与 better-auth 的 token 替换语义,确认旧 token 何时失效

### 6.2 未决

- 服务器面板的"立即同步"按钮:trigger 什么 chrome message / 直接调 SyncEngine?
  > TODO(plan): plan 阶段查 `sync-engine.ts` 是否暴露 trigger API,沿用即可
- "忘记此服务器" 弹窗:复用现有 `<SyncDisconnectDialog>` 还是新写?
  > TODO(plan): 看现有 dialog 的语义/文案是否能直接对齐"清 token + savedConfig + hostHistory"的新行为
- `/api/whoami` 端点:需要新加(用于 Case 1 token 校验)还是可以复用 `/api/health` + `/api/sync/stats` 的隐式认证副作用?
  > TODO(plan): plan 阶段决,如果新加,独立 ~15 行 + 测试,跟 stats 同套中间件
- 第一次安装是否自动打开 settings.html?
  > TODO(plan): 查 `background.ts` 现有 `onInstalled` 行为;如果当前不开,本次也不加(独立 spec 决定)
- 欢迎页"导入数据"CTA 跳到 `#/import-export` 还是直接打开 `import.html`(独立 entrypoint)?
  > TODO(plan): 查 `import.html` entrypoint 当前作用,决定是 settings 内 panel 还是独立页
- 同步日志的"时间"显示格式:`2 分钟前` 用 `Intl.RelativeTimeFormat` 实现还是引入 `dayjs`/`date-fns`?
  > TODO(plan): grep 当前 codebase 时间格式化怎么做的,沿用同一套
- 现有 `wizard-progress.ts` 的 lastHost 持久化跟新 `hostHistory` 数组的关系:合并还是各自独立?
  > TODO(plan): 看 wizard-progress 的存储位置(localStorage)和新 SyncSettings(chrome.storage.local)分层差异,plan 阶段统一

---

## 7. 验收

### 7.1 自动化侧

```
pnpm --filter @opentab/extension lint
pnpm --filter @opentab/extension check-types
pnpm --filter @opentab/extension test
pnpm --filter @opentab/extension build
pnpm --filter @opentab/cloud lint
pnpm --filter @opentab/cloud test
pnpm --filter @opentab/cloud build
```

要点:
- 所有现有测试 green(没有 settings/App 的 test,改不会破现状)
- 新增测试 green:
  - extension 侧:
    - `settings/shell/__tests__/settings-sidebar.test.tsx` — 4 状态灯渲染、active route 高亮、hover tooltip 文案
    - `settings/pages/__tests__/welcome-page.test.tsx` — 3 张 CTA 渲染 + href 正确
    - `settings/pages/server/__tests__/server-page.test.tsx` — 4 个状态分发(empty / paused / wizard / connected)
    - `settings/pages/server/__tests__/server-hero.test.tsx` — Switch 行为、⋯ 菜单按状态变化、立即同步可见性
    - `settings/pages/server/wizard/__tests__/server-wizard.test.tsx` — stepperize 进度、Step 1→4 串联、取消重新配置回原态
    - `settings/pages/server/wizard/__tests__/step-connect.test.tsx` — Combobox pre-fill、history 下拉、去重、health check 状态
    - `settings/pages/server/wizard/__tests__/step-transfer.test.tsx` — 调 /api/sync/stats、显示服务器数字、不可回退
    - `lib/__tests__/sync-settings.test.ts` — `getSyncSettings` / `setSyncSettings` / migration v1→v2 三种 fixture
    - `lib/__tests__/sync-log-loader.test.ts` — 父级名 batch 查询 / hard-deleted fallback / 4 状态过滤
    - `lib/__tests__/server-stats-fetch.test.ts` — fetch 成功 / 4xx / 5xx / 网络失败 各分支
    - `lib/__tests__/host-history.test.ts` — FIFO max 5、去重 by host、order by lastUsedAt desc
  - cloud 侧:
    - `apps/cloud/app/routes/api/sync/__tests__/stats.test.ts` — 鉴权失败 / 协议版本检查 / 速率限制 / 三个数返回正确 / 不同 user 隔离
- TypeScript 0 errors
- `apps/extension/.output/chrome-mv3/settings.html` 构建成功且 `bundle size < 110KB gzip`
- `packages/protocol` build 成功(新 `statsResponseSchema` 类型导出)

### 7.2 人工侧

- [ ] 加载 unpacked extension(`.output/chrome-mv3/`)→ 打开 settings.html → 默认进欢迎页,sidebar 顶部"欢迎页"高亮
- [ ] sidebar 4 个 nav 项点击 → URL 切到对应 hash,只该项高亮
- [ ] 浏览器前进/后退按钮 → URL 与高亮同步
- [ ] 直链 `chrome-extension://<id>/settings.html#/server` → 直接进服务器面板,sidebar 高亮正确
- [ ] 直链不存在的 hash(`#/foo`)→ redirect 到 `#/`
- [ ] sidebar"服务器"项前圆点:
  - 未启用同步 → 灰点 + "未启用"
  - 走 wizard 一半离开 → 黄点 + "未认证"
  - 完成认证 → 绿点 + "已启用"
- [ ] sidebar 底部 UserBar:
  - 未启用 → 灰头像 + "未启用",点击跳 `#/server`
  - 已认证 → 头像 + 用户名,主题 icon 点击循环 light/dark/system,语言 icon 点击切换 EN/中
- [ ] 欢迎页 3 张 CTA → 点击分别跳 `#/general` / `#/import-export` / `#/server`
- [ ] 通用设置页:主题切换 / 语言切换 / 关于版本号显示 — 跟旧版行为一致
- [ ] 导入导出页:导出按钮触发下载,导入按钮触发 file picker — 跟旧版一致
- [ ] 服务器面板 hero(主开关 + 状态):
  - OFF + 无配置 → 灰 Switch + "未启用" badge + B 方案插图 + 一句场景文案;⋯ 菜单不显示
  - OFF + 有保存配置 → 灰 Switch + "已暂停" badge + read-only 信息卡 + ⋯ 菜单含「忘记此服务器」
  - ON + 无 auth → 黄 Switch + "配置中" badge + wizard 卡;⋯ 菜单不显示
  - ON + 有 auth → 绿 Switch + "已连接" badge + 立即同步按钮(紧贴 subtitle "最后同步 N 分钟前") + ⋯ 菜单含「重新配置 / 复制设备 ID / 忘记此服务器」
- [ ] 主开关行为:
  - ON → OFF:sync engine pause,outbox 仍可写入;UI 1 秒内切到"已暂停",savedConfig + auth 不变
  - OFF → ON 有 auth:走 `/api/whoami` 校验,200 OK → 切回"已连接"(中间显短暂 spinner < 2s);401/403 → 进 wizard from Step 1 + 顶部 banner;网络失败 → 保持 OFF + "暂时连不上"提示
  - OFF → ON 无 auth(savedConfig 仍在)→ 进 wizard from Step 2,Step 2 输入 pre-fill saved host
- [ ] Wizard 4 步视觉(stepperize):
  - 顶部横向 Avatar + 标题/描述 + chevron 分隔
  - 已完成 step → 主色 + ✓ icon
  - 当前 step → 主色 + 数字 + 浅色高亮环
  - 未到 step → 灰底 + 数字
- [ ] Step 1 备份:点击触发 → 下载 .json + 完成态 ✓ 显示
- [ ] Step 2 连接:首次 = 空 + default `https://opentab.app`;重新配置 = pre-fill 当前 host + 点 ▾ 显历史(去重 + 最多 5 条)
- [ ] Step 3 授权:打开新标签页 OAuth + 等待 callback;callback 失败 / 拒绝 / 超时 = 错误态 + 重新打开授权页 CTA
- [ ] Step 4 同步方向:upload 卡显本地数字 / download 卡显 `/api/sync/stats` 服务器真实数字 / "推荐"标识 / 警告条 / 不可回退
- [ ] Step 完成态(中转屏):✓ 大图标 + 总结数字 + 完成按钮 → 切回常规 server panel
- [ ] 重新配置流程(⋯ → 重新配置):wizard 起始 Step 2,Step 1 显示"已跳过"灰删除线;取消 → token 仍有效时回原"已连接"
- [ ] 服务器面板「数据统计」(已连接):
  - 三张统计卡显示 `M / N` 格式;hover tooltip "服务器: M · 本地: N"
  - 创建一个 workspace → N 立即 +1,M 在下次同步 + retry 后更新
  - server fetch 失败(断网 / 5xx)→ 卡片显示 `?  / N` + retry 按钮
- [ ] 服务器面板「数据统计」(其他状态):
  - 不显示三张卡(其他状态用 hero / wizard / paused 卡占位)
  - 不发起 `/api/sync/stats` 请求(devtools network 0 命中)
- [ ] 运行期 token 失效:模拟 push 收到 401 → ServerPage 顶部出 reauth banner + ⚠️ 图标 + "重新认证"CTA + "稍后";点重新认证 → wizard from Step 1
- [ ] chrome.storage v1→v2 migration:用旧 fixture(disabled / configured / authenticated)各跑一次,确认 `getSyncSettings` 返回新结构,旧 key 已删除
  - 同步日志表显示最近 50 行,7 列对齐,workspace/collection/tab 列父级灰色、自身白色、无关 `—`
  - dead 状态行浅红背景,failed/重试中 浅橙背景
  - 变更时间永远有,同步时间仅 synced 行有,其他显示 `—`
  - 表头右上 dropdown 切"仅 dead"/"仅 failed"/"仅 pending" → 表内容随之过滤
  - 翻页:下一页/上一页正确;页码 summary 准确
  - 空表(全新安装无 op)→ 显示空态文案
- [ ] 服务器面板(未启用):隐藏信息卡 / 统计 / 日志,只显示 wizard 入口或当前配置态对应的引导(沿用现有 `<SyncSetupWizard>` / `<SyncStatusCard>` 行为)
- [ ] copy 检查:中英文对照,无 TODO 残留,无 `settings.foo` 这种未翻译 key 漏出
- [ ] dark mode 整页可读,所有圆点/状态色对比度 OK
- [ ] tab 列长 title 截断 + hover 显示 tooltip

### 7.3 通过条件

- 自动化 4 条命令 0 errors
- 人工 checklist 全部 ✓
- 旧 `App.tsx` 删除后 `git grep "entrypoints/settings/App"` 0 命中

---

## 8. 不在本次范围

- Welcome 页 step-by-step 引导(进度状态 / 完成度指示 / 视频)
- Sync wizard / status card / disconnect dialog 内部改造
- 同步日志:冲突解决 / 单条手动重试 / 删除日志条目
- 同步日志:搜索 / 时间范围过滤 / 自定义页大小
- General 页拆子页(主题独立 / 语言独立)
- 改 popup / tabs / import / setup-callback entrypoint
- 改 syncOutbox schema 或新增 Dexie 索引
- 改 sync push/pull/snapshot 现有协议(本次只新增 `/api/sync/stats` + 可能 `/api/whoami`,不动旧端点)
- 服务器统计的 KV cache / 持久化(每次请求实时 count)
- 服务器统计的轮询自动刷新(只在挂载 + 用户手动 retry 时拉)
- Wizard 内部 XState 机器重写(沿用现有 `state-machine.ts` 14 状态,只换 React 包装)
- Wizard step 增减 / 顺序调整(沿用现有 backup/connect/authorize/transfer 4 步)
- 暂停期间 outbox 自动清理 / 压缩(由后续独立 spec 处理)
- 抽 `packages/ui/components/shell` 共享组件
