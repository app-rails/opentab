# Spec: M1 — Monorepo 项目初始化

Date: 2026-03-26
Milestone: [idea-1/M1](../../milestones/20260326-opentab-manager-idea-1-m1.md)
Status: DRAFT

## 目标

搭建 pnpm + turborepo monorepo，使 Chrome 扩展（WXT + React）和 Hono 后端可同时启动开发，共享类型包可在两端导入。

## 目录结构

```
port-louis/
  package.json            # root, scripts via turbo
  pnpm-workspace.yaml     # app-* + packages/*
  turbo.json              # v2 tasks format
  tsconfig.base.json      # 共享 TS 配置
  .gitignore
  .nvmrc                  # Node 22
  app-extension/          # @opentab/extension
    package.json
    wxt.config.ts
    tsconfig.json
    components.json       # shadcn/ui (via CLI init)
    src/
      entrypoints/
        popup/
          index.html
          main.tsx
          App.tsx          # 跳转按钮 → tabs 全页面
        tabs/
          index.html
          main.tsx
          App.tsx          # 全页面骨架（Button + Card）
        background.ts      # service worker entry point
      assets/
        main.css           # Tailwind v4 + shadcn theme
      lib/
        utils.ts           # cn() helper
      components/
        ui/                # shadcn: button, card
  app-server/             # @opentab/server
    package.json
    tsconfig.json
    src/
      index.ts            # Hono app, /api/health, port 3001
  packages/
    shared/               # @opentab/shared
      package.json
      tsconfig.json
      src/
        index.ts
        types.ts           # HealthResponse
```

## 设计决策

### 1. Monorepo 结构

- `app-extension/` 和 `app-server/` 是可运行应用，`packages/shared/` 是共享库
- `pnpm-workspace.yaml`: `["app-*", "packages/*"]`
- 包名: `@opentab/extension`, `@opentab/server`, `@opentab/shared`

### 2. Turborepo 配置

- 使用 v2 `tasks` 格式（不是已废弃的 `pipeline`）
- `dev`: `persistent: true`, `cache: false`（shared 导出 raw TS，dev 时不需要先 build）
- `build`: `dependsOn: ["^build"]`, outputs: `[".output/**", "dist/**"]`
- `lint`: `dependsOn: ["^build"]`

### 3. TypeScript 配置

- `tsconfig.base.json` 共享配置：`target: ES2022`, `moduleResolution: bundler`, `strict: true`, `verbatimModuleSyntax: true`
- 各包 extends base，添加各自特定配置

### 4. Shared 包消费方式

- **TS 源码直接导入**：`exports` 字段指向 `./src/index.ts`
- WXT (Vite) 和 server (tsx) 都能直接消费 TS 源文件
- 零构建步骤，dev 体验最好
- `build` script 保留（`tsc`），用于 CI 类型检查

### 5. WXT 扩展

- `srcDir: 'src'`：所有源码在 src/ 下，根目录干净
- `@wxt-dev/module-react`：自动注册 React Vite 插件
- `@tailwindcss/vite`：Tailwind v4 通过 Vite 插件集成
- `@` alias：在 `wxt.config.ts`（Vite）和 `tsconfig.json`（TS）双重配置
- 入口点：
  - `popup/` — 弹窗，Button 跳转到全页面
  - `tabs/` — 全页面骨架，展示 Card + Button 验证 shadcn 工作
  - `background.ts` — service worker，处理 icon click

### 6. shadcn/ui 初始化

- 使用 `pnpm dlx shadcn@latest init` 生成配置
- 调整路径适配 WXT + srcDir 结构
- `rsc: false`（非 Next.js 环境）
- 添加 Button + Card 组件验证集成

### 7. Hono 后端

- `tsx watch` 做 dev server
- Port 3001（避免和 WXT dev server 冲突）
- 唯一端点：`GET /api/health` → `{ status: "ok", timestamp: number }`
- 导入 `@opentab/shared` 的 `HealthResponse` 类型

## 依赖清单

### Root devDependencies
- `turbo`, `typescript`

### app-extension dependencies
- `react`, `react-dom` (v19)
- `@opentab/shared` (workspace:*)

### app-extension devDependencies
- `wxt`, `@wxt-dev/module-react`
- `tailwindcss`, `@tailwindcss/vite`
- `tw-animate-css`
- `class-variance-authority`, `clsx`, `tailwind-merge`
- `lucide-react`
- `@types/react`, `@types/react-dom`

### app-server dependencies
- `hono`, `@hono/node-server`
- `@opentab/shared` (workspace:*)

### app-server devDependencies
- `tsx`, `@types/node`

## 验收标准

1. `pnpm dev` 同时启动 WXT dev server + Hono server
2. `curl http://localhost:3001/api/health` 返回 `{"status":"ok","timestamp":...}`
3. 扩展可加载到 Chrome（chrome://extensions 开发者模式，load unpacked `.output/chrome-mv3`）
4. 点击扩展图标弹出 popup，点击 popup 中按钮跳转到 tabs 全页面
5. tabs 全页面展示 shadcn Card + Button（验证 Tailwind + shadcn 集成）
6. `@opentab/shared` 类型在 extension 和 server 中均可导入，无 TS 错误

## 注意事项

- WXT entrypoints 在 `src/entrypoints/` 下（因为 `srcDir: 'src'`）
- `@` alias 必须在 wxt.config.ts 和 tsconfig.json 双重配置
- Tailwind v4 不需要 `tailwind.config.js`
- shadcn/ui `rsc: false` 必须设置
- `@opentab/shared` 放 `dependencies`（不是 devDependencies）
- WXT 构建输出在 `.output/` 而非 `dist/`
- React 19 必需（shadcn/ui v4 不再使用 forwardRef）
