# CONTEXT.md

OpenTab 项目上下文：架构、命令、领域知识。CLAUDE.md 告诉你怎么做事，ETHOS.md 告诉你为什么这样，**CONTEXT.md 告诉你在哪里做事**。

## 项目概览

OpenTab 是一个浏览器标签页管理 Chrome 扩展，提供 workspaces 和 collections。**Local-first** 架构：IndexedDB（Dexie）为主，服务端同步（Hono + better-auth）为辅。

**Monorepo 结构：**

- `apps/extension/` — Chrome 扩展（WXT 打包）
- `apps/server/` — 后端服务（Hono）
- `apps/web/` — 管理面板
- `packages/` — 共享库：`config`、`db`、`auth`、`api`、`ui`、`shared`

> **服务端拆分进行中**：`apps/server` + `apps/web` 计划拆出到独立私仓 `opentab-server`；本仓保留 `packages/api` + `packages/shared` 作为对外契约层并发到 npm。

## 常用命令

```bash
pnpm install                                # 安装依赖
pnpm dev                                    # 启动所有包（turbo）
pnpm --filter @opentab/extension dev        # 只启动扩展
pnpm --filter @opentab/server dev           # 只启动服务端
pnpm build                                  # 生产构建（turbo）
pnpm lint                                   # TypeScript 检查 + Biome lint
pnpm format                                 # Biome 自动格式化
pnpm check                                  # Biome 格式检查

# 服务端测试
cd apps/server && pnpm test                 # 跑全部 vitest
cd apps/server && pnpm vitest run <file>    # 跑单个测试文件
```

构建产物：`apps/extension/.output/chrome-mv3/` — 在 `chrome://extensions/` 里 load unpacked。

## 代码风格（Biome）

- 2 空格缩进，行宽 100 字符
- 双引号、trailing commas、必带分号
- `noNonNullAssertion` 关闭（允许 `!`）
- 提交前跑 `pnpm format`

## 架构

### Extension（`apps/extension/`）

- **WXT**（v0.20）负责打包；入口在 `src/entrypoints/`
- **Zustand** store 在 `src/stores/app-store.ts`，是 workspaces / collections / tabs / live browser tabs 的唯一可信源
- **Dexie** schema 在 `src/lib/db.ts`，定义 IndexedDB 表：`Accounts`、`Workspaces`、`TabCollections`、`CollectionTabs`、`Settings`、`ImportSessions`
- **Fractional indexing**（`fractional-indexing` 包）支撑拖拽排序
- **@dnd-kit** 处理拖拽交互
- **shadcn/ui** 组件在 `packages/ui/`（跨 app 共享）
- **i18next** 做 i18n；locale 文件在 `src/locales/`
- 路径别名：`@/` → `./src/`

### Server（`apps/server/`）

- **Hono** HTTP 框架，端口 3001
- **better-auth** 通过 `@opentab/auth` 包提供（anonymous + bearer + email/password + OAuth）
- **Drizzle ORM** 通过 `@opentab/db` 包（默认 SQLite，可选 PostgreSQL）
- **tRPC** 通过 `@opentab/api` 包提供类型安全的 API 层
- CORS 由 `TRUSTED_ORIGINS` 和 `TRUSTED_EXTENSION_ORIGINS` 环境变量配置
- 环境变量校验：`@t3-oss/env-core` + Zod

### Auth Flow

扩展默认离线工作，用本地 UUID。开启服务端同步时：扩展调 `/api/auth/sign-in/anonymous` → 拿 bearer token → 存到 `browser.storage.local` 的 `opentab_auth` key → 后续 API 调用都带这个 token。

## 关键模式

- **Radix UI + Dialog**：从 DropdownMenu 触发 Dialog 时，用 `onCloseAutoFocus` + ref 阻止焦点回传到 trigger，避免 `aria-hidden` 警告。`DialogContent` 必须带 `DialogDescription`。
- **Chrome APIs**：扩展用到 `chrome.storage`、`chrome.alarms`、`chrome.tabs`、`chrome.downloads` 权限（在 `wxt.config.ts` 声明）。
- **Offline-first**：所有 CRUD 先走 Dexie。服务端同步是第二层。
- **Extension icons**：WXT 会自动识别 `public/icon/{16,32,48,96,128}.png` 写进 manifest 的 `icons` 字段。改 logo / favicon 时务必同步更新 `public/icon/` 和 `public/favicon*`。

## 规范文档位置

- 产品需求 / 切片：`docs/specs/APP-XXXX/PRODUCT.md`、`ISSUE-N.md`、`PLAN-N.md`
- Milestones：`milestones/`
- Idea backlog：`idea/`
- 代码风格调研：`code-style-research.md`
