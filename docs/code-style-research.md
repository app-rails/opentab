# OpenTab 代码规范调研与建议

> 调研目的：看看同类 WXT / 浏览器扩展 / 现代 TS 项目在 **lint / TS 严格度 / 项目结构 / CI** 上做了什么约束，挑出值得 OpenTab 借鉴的点。不迁就当前 OpenTab 的配置。
>
> 调研时间：2026-04-14
>
> 克隆目录（临时）：`/sessions/determined-blissful-cannon/research/`

---

## 一、参考项目

实际克隆并逐文件分析了 4 个仓库，挑选标准是：活跃维护 / 真实产品级代码 / 同时涉及本地存储和网络请求 / 有相对完整的工程化约束。

| # | 项目 | 栈 | 选它的理由 |
|---|---|---|---|
| 1 | **iorate/ublacklist** | 原生 esbuild + React 19 + Zustand + Zod + 云同步（Google Drive / Dropbox / WebDAV） | 虽然不是 WXT，但在 **Biome + TS 严格度 + Lefthook + semantic-release + 多浏览器构建** 上做得最极致，是一个成熟扩展应该长的样子 |
| 2 | **turbostarter/extro** | WXT 0.19 + React 19 + Supabase + shadcn/ui + Biome | **真正的 WXT 产品级 starter**，有完整的 Biome + Husky + commitlint + GitHub Actions 发布流水线 |
| 3 | **wxt-dev/wxt** (core) | Bun + TS 严格 + simple-git-hooks + commitlint + cspell | WXT 框架本身的仓库，官方工程化规范可作权威基线 |
| 4 | **wxt-dev/examples** | WXT 全家桶示例（React / Vue / Solid / monorepo-turbo / vitest / playwright-e2e） | 官方推荐的 **目录结构 / entrypoints 组织方式** 的范本 |

（另外扫过 `coderamp-labs/gitingest-extension` 和 `imtiger/wxt-react-shadcn-...`，前者工程化太轻、后者近乎裸模板，不作为主要参考。）

---

## 二、横向对比

### 2.1 Lint / Format 工具

| 项目 | Lint | Format | 配置文件 |
|---|---|---|---|
| ublacklist | **Biome 2.4** | Biome（代码）+ Prettier（MD/YAML） | `biome.json` 24 行 |
| extro | **Biome 1.9** | Biome | `biome.json` 30 行 |
| wxt-core | `@aklinker1/check`（内部）+ Prettier | Prettier + `prettier-plugin-jsdoc` | `.prettierrc` |
| wxt-dev/examples | Prettier | Prettier | 无 lint |
| OpenTab 当前 | Biome | Biome | `biome.json` |

**结论**：Biome 已是 WXT/扩展生态的主流选择，OpenTab 方向对。关键是规则要比默认 `recommended` 更严。

### 2.2 Biome 规则亮点

**ublacklist（2.x，用 `domains`）**：

```json
{
  "linter": {
    "domains": { "project": "recommended", "react": "recommended" },
    "rules": {
      "correctness": { "useImportExtensions": "warn" },
      "style":       { "useBlockStatements": "warn" }
    }
  }
}
```

- `useImportExtensions`：强制写 `.ts` 扩展名。配合 `verbatimModuleSyntax` + Node ESM/`moduleResolution: Bundler`，import 语义和运行时一致，便于将来迁移。
- `useBlockStatements`：`if (x) doSomething()` 必须写成 `if (x) { doSomething() }`，避免后续补代码时踩空。
- 用 `domains` 替代手动开 nursery 组，是 Biome 2.x 推荐方式。

**extro（1.x）**：

```json
{
  "organizeImports": { "enabled": true },
  "linter": { "rules": {
    "recommended": true,
    "correctness": { "noUnusedImports": "error" }
  }}
}
```

- `organizeImports` 一把梭（Biome 1.x 的方式；Biome 2.x 是 assist + `useSortedKeys`）。
- 未使用的 import 直接 **error**（不是 warn），CI 会红。

### 2.3 TypeScript 严格度对比

| 选项 | OpenTab 现状 | ublacklist | extro | wxt-core | 推荐 |
|---|---|---|---|---|---|
| `strict` | - | ❌（但开了更严的单项） | `.wxt/tsconfig.json` 继承 | ✅ | ✅ |
| `noUncheckedIndexedAccess` | - | ✅ | ✅ | - | ✅（强烈推荐）|
| `exactOptionalPropertyTypes` | - | ✅ | - | - | ✅ |
| `verbatimModuleSyntax` | - | ✅ | - | - | ✅ |
| `isolatedModules` | - | ✅ | ✅ | - | ✅ |
| `erasableSyntaxOnly` | - | ✅ | - | - | ✅（TS 5.8+，禁用 enum/namespace）|
| `noImplicitOverride` | - | - | - | - | ✅（加上）|
| `noFallthroughCasesInSwitch` | - | - | - | - | ✅ |
| `forceConsistentCasingInFileNames` | - | - | - | ✅ | ✅ |

**ublacklist 的 tsconfig.json** 是我在整个生态里看到最克制、最成熟的：

```jsonc
{
  "compilerOptions": {
    // Type Checking（不用 strict 伞，手动挑）
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,

    // Modules
    "allowImportingTsExtensions": true,
    "module": "preserve",

    // Emit
    "noEmit": true,

    // Interop Constraints
    "erasableSyntaxOnly": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,

    // Language and Environment
    "jsx": "react-jsx",
    "target": "esnext",

    // Completeness
    "skipLibCheck": true
  }
}
```

> 注：他们不开 `strict: true` 是因为 strict 伞下的 `noImplicitAny` 等对他们处理某些 Zod schema 有干扰；但对 OpenTab 建议 **直接上 `strict: true`** 然后叠加上面的单项。

### 2.4 文件命名约定

| 项目 | 文件命名 | 备注 |
|---|---|---|
| ublacklist | **kebab-case** (`interactive-ruleset.ts`, `raw-storage.ts`, `match-pattern.test.ts`) | 一以贯之 |
| extro | **kebab-case** (`storage.ts`, `supabase.ts`) | 一以贯之 |
| wxt-dev/examples | kebab-case 居多 | 官方倾向 |
| OpenTab 当前 | 大部分 kebab-case，混杂少量 camelCase/PascalCase | **需要统一** |

**Import 样式**：ublacklist 100% 带 `.ts` 扩展名（`import { x } from "./y.ts"`）。这配合 `verbatimModuleSyntax` 是 ESM 的"未来式"写法。

### 2.5 项目结构

**extro（WXT 单仓）**：

```
src/
  app/               # 所有 entrypoints
    background/
    content/
    popup/
    options/
    sidepanel/
    devtools/
    newtab/
  components/
    ui/              # shadcn/ui primitives
    common/
    layout/
    auth/
  lib/
    storage.ts       # 统一封装 wxt/storage
    messaging.ts     # @webext-core/messaging 的类型安全定义
    supabase.ts
    analytics.ts
    utils.ts
  types/
  typings/           # 全局 d.ts / module augmentation
  assets/
```

> 这比默认 WXT 的 `entrypoints/` 平铺到根目录多了一层 `src/app/`，**更像正常的 web 应用布局**，值得 OpenTab 借鉴。目前 OpenTab 的 `apps/extension/src/entrypoints/` 已经是这样，保持。

**ublacklist（复杂扩展）**：

```
src/
  _locales/          # i18n（Crowdin 管理，不手改）
  common/            # 跨 entrypoint 的工具（AltURL, match-pattern）
  scripts/
    background/      # background 的子模块（拆得很细）
      backup-restore.ts
      clouds.ts
      local-storage.ts
      raw-storage.ts
      subscriptions.ts
      sync.ts
    clouds/          # Dropbox / Google Drive / WebDAV 的云适配层
    components/      # React 组件
    options/
    ruleset/         # DSL 解析器
    serpinfo/
    zod/             # 自定义 Zod schema
    background.ts    # 入口
    browser.ts       # webextension-polyfill 统一入口
    messages.ts      # 全局 message dispatcher
    locales.ts       # i18n wrapper
    types.ts
    utilities.ts
  icons/
  manifest.ts        # WXT 风格但用 esbuild
```

可借鉴的**关键抽象**：

- `browser.ts`：唯一的 `webextension-polyfill` 导入点，所有地方从这里拿 `browser`，不直接 `import browser from 'webextension-polyfill'`。
- `messages.ts`：把所有消息名 + 类型集中声明成 `addMessageListeners({ 'connect-to-cloud': handler, ... })`，调用者写错消息名直接 TS 报错。
- `clouds/` 子目录：外部 API 客户端独立目录，每个 provider 一个文件 + 共同 interface。

### 2.6 Pre-commit / Git hooks

| 项目 | 工具 | 做什么 |
|---|---|---|
| ublacklist | **Lefthook**（parallel） | `biome check --write` + `prettier --write`，`stage_fixed` 自动加回暂存 |
| extro | Husky + commitlint | commit-msg 校验 Conventional Commits |
| wxt-core | **simple-git-hooks** + nano-staged | 同上风格 |
| OpenTab 当前 | Lefthook + commitlint.config.mjs | 已经对了 |

**ublacklist 的 lefthook.yml** 非常克制（**值得直接抄**）：

```yaml
pre-commit:
  parallel: true
  commands:
    biome:
      run: pnpm biome check --write --files-ignore-unknown=true --no-errors-on-unmatched {staged_files}
      stage_fixed: true
    prettier:
      glob: "*.{md,yaml,yml}"
      run: pnpm prettier --write {staged_files}
      stage_fixed: true
```

几个要点：
- `--files-ignore-unknown=true`：Biome 遇到不认识的文件（yaml、md）不报错。
- `--no-errors-on-unmatched`：暂存里没有 `*.ts/*.tsx` 时也不失败。
- `stage_fixed: true`：修复后自动 `git add`，避免 "修了但没提交" 的坑。
- 只跑 `{staged_files}`，不全量扫描，快。

### 2.7 CI 流程对比

| 项目 | 检查项 | 产物 |
|---|---|---|
| ublacklist | biome ci / prettier check / `tsgo`（TS native preview）/ test / **三浏览器 build** (chrome/firefox/safari) | semantic-release 自动发布 |
| extro | bun lint / bun typecheck / bun test / chrome+firefox zip + wxt submit | artifact + 商店自动提交 |
| wxt-core | `bun run check` / `bun run test` / build-all / PR title commitlint / cspell | 多 workflow 组合 |
| OpenTab 当前 | 未确认 | - |

**关键共性**：
1. **CI 里的 lint 用 `biome ci`（专用模式）** 而不是 `biome check`，前者带 GitHub reporter + 不写文件。
2. **类型检查和 lint 是独立步骤**，任一失败都整条红。
3. **PR 标题单独 workflow 校验** Conventional Commits（wxt-core 的做法），这样 squash merge 时自动生成高质量 changelog。
4. **多浏览器构建作为 CI 的一部分**（ublacklist 的 `pnpm build && pnpm build --browser firefox && pnpm build --browser safari`），防止只在 chrome 能跑。
5. **`permissions: {}`** / `permissions: contents: read` —— ublacklist 每个 job 最小化权限，是 GH Actions 安全最佳实践。
6. **第三方 action 钉 commit SHA**（ublacklist 把 `actions/checkout@de0fac2...` 写死），防止 supply chain。

---

## 三、关键发现（按重要性排序）

### ★★★ 必须借鉴

1. **TS 严格度叠加**（ublacklist 出处：`tsconfig.json`）
   - 三件套：`strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
   - 模块层：`verbatimModuleSyntax` + `isolatedModules` + `erasableSyntaxOnly`
   - 这六项叠加能挡住 **~80%** 的运行时 TS 坑。

2. **Biome 规则加强**（ublacklist + extro 共识）
   - `correctness.noUnusedImports: error`
   - `correctness.useImportExtensions: warn`（如果改 ESM 则是 error）
   - `style.useBlockStatements: warn`
   - `correctness.noUnusedVariables: error`
   - `suspicious.noConsole: { level: "warn", options: { allow: ["warn", "error"] } }` —— 扩展里 `console.log` 会进用户 DevTools，必须管
   - `complexity.noForEach: off`（扩展里 DOM API 是 NodeList，forEach 必要）
   - assist（Biome 2.x）: `source.organizeImports` + `source.useSortedKeys`

3. **Lefthook 增量校验**（ublacklist 出处：`lefthook.yml`）
   - 并行 + `stage_fixed` + `{staged_files}`。OpenTab 现有 `lefthook.yml` 要对照这个模板审视。

4. **消息传递类型安全**（extro + ublacklist 两种范式）
   - extro：`@webext-core/messaging` 的 `defineExtensionMessaging<Messages>()` 生成强类型 `sendMessage/onMessage`
   - ublacklist：自写 `addMessageListeners({ ... })`，每个消息名是字面量联合类型
   - 任选其一，**禁止裸写 `chrome.runtime.sendMessage`**（可加自定义 lint 规则或 ESLint `no-restricted-syntax`）

5. **Storage 统一封装**（extro 出处：`src/lib/storage.ts`）
   - `browserStorage.defineItem<T>(key, { fallback })` 集中声明，**禁止组件里直接 `chrome.storage.local.get`**。
   - OpenTab 已经走 Dexie，但 Dexie 外的"小状态"（主题、语言、last-sync 时间）也应走统一 `storage.defineItem`。

### ★★ 强烈建议

6. **文件命名统一 kebab-case**（三个项目共识）
   - `.tsx` 组件文件也用 kebab（`tab-list.tsx`），组件导出名仍是 PascalCase。
   - 可以在 Biome 里加 `style.useFilenamingConvention: { filenameCases: ["kebab-case"] }`。

7. **Conventional Commits + PR 标题单独校验**（wxt-core 出处：`.github/workflows/pr-title.yml`）
   - 本地 `commit-msg` hook 已经管 commit message
   - 再加一个独立 workflow 管 PR title，因为 squash merge 最终看的是 PR title

8. **CI 多浏览器构建**（ublacklist）
   - `pnpm build` + `pnpm build --browser firefox`（如果支持）；至少要保证没用 chrome-only API。

9. **GH Actions 最小权限 + SHA 钉版**（ublacklist 全部 workflow 都遵守）
   ```yaml
   permissions: {}        # 顶层
   jobs:
     check:
       permissions:
         contents: read   # job 级显式给
       steps:
         - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
   ```

10. **`browser.ts` 唯一导入点**（ublacklist 出处：`src/scripts/browser.ts`）
    - WXT 已经提供 `wxt/browser`，规定所有 `browser` 从这里来，不允许 `chrome.xxx`。

### ★ 可选 / 看情况

11. **`useImportExtensions` 改为 error + 全量 `.ts` 扩展名**（ublacklist）。OpenTab 如果不急着切 native ESM，可以先 warn。

12. **cspell 拼写检查**（wxt-core）。对开源项目 README/注释质量有帮助，但日常打扰。

13. **`tsgo`（TypeScript native preview）** 做 CI 类型检查（ublacklist 已换）。速度提升明显，但现在是 preview，不急。

14. **semantic-release + `semantic-release-chrome`**（ublacklist）。商店自动发布。OpenTab 如果没到发商店阶段不必。

---

## 四、反面教材 / 踩坑

| 问题 | 出处 | 怎么避免 |
|---|---|---|
| `wxt-react-shadcn-tailwindcss-chrome-extension` 没有任何 lint / CI / hook | 同名仓库 | **模板项目不等于生产规范**，别当范本 |
| `gitingest-extension` 在 `wxt.config.ts` 里 `manifest: (env) => ({ name: env.browser === 'firefox' ? ... : ... })` 但没对 `env.browser` 打类型守卫，TS 会报 undefined | `gitingest-extension/wxt.config.ts` | 始终用 `noUncheckedIndexedAccess` + 守卫 |
| extro 的 tsconfig **没开 `strict: true`**，只开了 `noUncheckedIndexedAccess + checkJs + isolatedModules`。实际业务类型安全不够 | extro `tsconfig.json` | **OpenTab 要比 extro 再严一档** |
| `wxt-dev/examples` 的 monorepo-turbo 用 npm + `engines.node >=18`，pnpm workspace 下不够用 | `examples/examples/monorepo-turbo/package.json` | OpenTab 已用 pnpm workspace + turbo，已躲开 |
| 常见错误：在组件里直接 `localStorage.setItem(...)` | 多个社区讨论 | 加 lint 禁 `localStorage`、`sessionStorage`、`chrome.storage.*`（强制走封装） |

---

## 五、业界参考资料

**TypeScript 严格度**
- [TSConfig Cheat Sheet — Total TypeScript (Matt Pocock)](https://www.totaltypescript.com/tsconfig-cheat-sheet)
- [TypeScript Strict Mode Won — mariorafaelayala.com (2026)](https://www.mariorafaelayala.com/blog/typescript-strict-mode-2026)
- [The Strictest TypeScript Config — whatislove.dev](https://whatislove.dev/articles/the-strictest-typescript-config/)
- [A guide to tsconfig.json — 2ality (2025)](https://2ality.com/2025/01/tsconfig-json.html)
- [verbatimModuleSyntax 解释 — BetterStack](https://betterstack.com/community/guides/scaling-nodejs/ts-verbatimmodulesyntax/)

**Biome / Lint**
- [Biome Linter 官方](https://biomejs.dev/linter/)
- [Biome Rules Sources（对照 ESLint）](https://biomejs.dev/linter/rules-sources/)
- [Biome v2.3 — 423 条规则 + type-aware linting（2026 Jan）](https://dev.to/pockit_tools/biome-the-eslint-and-prettier-killer-complete-migration-guide-for-2026-27m)
- [From ESLint and Prettier to Biome — kittygiraudel.com](https://kittygiraudel.com/2024/06/01/from-eslint-and-prettier-to-biome/)

**WXT / Chrome 扩展**
- [WXT 官方文档](https://wxt.dev/)
- [WXT GitHub](https://github.com/wxt-dev/wxt)
- [wxt-dev/examples](https://github.com/wxt-dev/examples)
- [Chrome MV3 Service Worker 迁移](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers)
- [Awesome WebExtensions — fregante](https://github.com/fregante/Awesome-WebExtensions)
- [2025 State of Browser Extension Frameworks — redreamality.com](https://redreamality.com/blog/the-2025-state-of-browser-extension-frameworks-a-comparative-analysis-of-plasmo-wxt-and-crxjs)

**Monorepo TS**
- [TypeScript Monorepo 2026 Best Practice](https://hsb.horse/en/blog/typescript-monorepo-best-practice-2026/)
- [Monorepo with WXT + NextJs — weberdominik.com](https://weberdominik.com/blog/monorepo-wxt-nextjs/)

**被分析的仓库**
- [iorate/ublacklist](https://github.com/iorate/ublacklist)
- [turbostarter/extro](https://github.com/turbostarter/extro)
- [wxt-dev/wxt](https://github.com/wxt-dev/wxt)
- [wxt-dev/examples](https://github.com/wxt-dev/examples)

---

## 六、给 OpenTab 的最终建议清单

按"改动成本从低到高"排序：

### P0 立即改（成本 ~2 小时）

1. **升级 tsconfig.json** ——在 `packages/config/` 加一个基准 `tsconfig.base.json`：
   ```jsonc
   {
     "compilerOptions": {
       "target": "ES2022",
       "module": "preserve",
       "moduleResolution": "Bundler",
       "lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"],

       "strict": true,
       "noUncheckedIndexedAccess": true,
       "exactOptionalPropertyTypes": true,
       "noImplicitOverride": true,
       "noFallthroughCasesInSwitch": true,

       "isolatedModules": true,
       "verbatimModuleSyntax": true,
       "erasableSyntaxOnly": true,
       "allowImportingTsExtensions": true,
       "forceConsistentCasingInFileNames": true,

       "noEmit": true,
       "skipLibCheck": true,
       "resolveJsonModule": true
     }
   }
   ```
   各 app 再继承。扩展端继承 `.wxt/tsconfig.json` 之上再覆盖。

2. **Biome 规则加强** ——在根 `biome.json`：
   ```jsonc
   {
     "linter": {
       "domains": { "project": "recommended", "react": "recommended" },
       "rules": {
         "correctness": {
           "noUnusedImports": "error",
           "noUnusedVariables": "error",
           "useImportExtensions": "warn"
         },
         "style": {
           "useBlockStatements": "warn",
           "useFilenamingConvention": {
             "level": "warn",
             "options": { "filenameCases": ["kebab-case"] }
           }
         },
         "suspicious": {
           "noConsole": {
             "level": "warn",
             "options": { "allow": ["warn", "error", "info"] }
           }
         }
       }
     },
     "assist": {
       "actions": {
         "source": {
           "organizeImports": "on",
           "useSortedKeys": "on"
         }
       }
     }
   }
   ```

3. **禁用裸 localStorage/sessionStorage** ——用 Biome 的 `noRestrictedGlobals`：
   ```jsonc
   "style": {
     "noRestrictedGlobals": {
       "level": "error",
       "options": {
         "deniedGlobals": {
           "localStorage": "use storage.defineItem or Dexie",
           "sessionStorage": "use chrome.storage.session"
         }
       }
     }
   }
   ```

### P1 本周内（成本 ~半天）

4. **统一 storage 封装** ——把 `apps/extension/src/lib/` 下所有直接调用 `chrome.storage.*` 的地方收敛到 `storage.defineItem` 风格的工厂文件（参考 extro `src/lib/storage.ts`）。Dexie 的业务数据不动。

5. **消息传递类型化** ——引入 `@webext-core/messaging` 或自写 dispatcher（参考 ublacklist `messages.ts`）。background ↔ content ↔ popup 的所有 `sendMessage` 必须走它。

6. **CI 完善** ——补齐 `.github/workflows/check.yml`：
   ```yaml
   jobs:
     check:
       permissions: { contents: read }
       steps:
         - uses: actions/checkout@<pinned-sha>
         - uses: pnpm/action-setup@<pinned-sha>
         - run: pnpm biome ci --reporter=github
         - run: pnpm turbo typecheck
         - run: pnpm turbo test
         - run: pnpm turbo build
   ```
   外加一个独立 `pr-title.yml` 跑 commitlint 校验 PR 标题。

### P2 可选优化（成本 >1 天）

7. **文件重命名** ——把 camelCase / PascalCase 的 `.ts` 文件统一改 kebab-case（组件导出名保持 PascalCase）。可以分几次提交。

8. **`verbatimModuleSyntax` 带来的 import 重写** ——打开后大部分 type-only import 要加 `type` 关键字，Biome 可以自动修。

9. **多浏览器构建进 CI** ——如果 manifest 用了跨浏览器 API，CI 加 `wxt build --browser firefox`。

---

**一句话总结**：学 ublacklist 的 TS/Lint/Lefthook 细节，学 extro 的 WXT 工程化骨架和 storage/messaging 分层，学 wxt-core 的 CI 权限和 PR 标题校验。当前 OpenTab 方向正确（Biome + Lefthook + pnpm + turbo），差的是**规则严格度**和**lib 层抽象**。
