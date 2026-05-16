---
id: APP-0001/ISSUE-5
parent: APP-0001/PRODUCT
category: enhancement
status: needs-triage
---

# packages/ui 折叠进 apps/extension

## What to build

把 `packages/ui/src/components/*` 平铺到 `apps/extension/src/components/ui/`，`packages/ui/src/lib/utils.ts` 的 `cn` 迁到 `apps/extension/src/lib/utils.ts`，`packages/ui/src/styles/globals.css` 迁到 `apps/extension/src/styles/`。脚本化替换扩展端约 30+ 文件的 `@opentab/ui/...` import 为相对路径。运行时依赖（radix-ui、class-variance-authority、clsx、tailwind-merge、lucide-react、sonner）从 `packages/ui/package.json` 迁到 `apps/extension/package.json`。shadcn `components.json` 放到 `apps/extension/` 根，`aliases.ui` 指向 `@/components/ui`。`apps/extension/src/assets/main.css` 的 `@source` 指令同步更新去除指向已删 packages/ui 的引用。本切片不删 `packages/ui` 目录本身（删除留 ISSUE-6 一起做），但要让扩展不再依赖它。覆盖 PRODUCT.UserStory #8。

## Acceptance

- [ ] 覆盖 PRODUCT.Acceptance "User Story 8（`@opentab/ui` import 清零）" — 全仓（含 `.ts` / `.tsx` / `.css` / `tsconfig*.json` / `components.json` / `tailwind` 配置）grep `@opentab/ui` 与 `packages/ui` 路径引用全空，`apps/extension/src/assets/main.css` `@source` 指令更新到位
- [ ] 覆盖 PRODUCT.Acceptance "User Story 8（tabs / settings / import smoke test）" — tabs（newtab）/ settings / import 三个 entrypoint 手动 smoke：collection 卡片、save-tabs dialog、theme toggler 视觉与交互无回归
- [ ] 切片特有：`pnpm --filter @opentab/extension build` 通过，产物 chunk 体积无异常增长
- [ ] 切片特有：现有 `vi.mock("@opentab/ui/...")` 的测试同步改成 mock 相对路径或直接放行组件渲染
- [ ] 切片特有：`apps/extension/package.json` 含全部迁入的运行时依赖，`pnpm install` 无 unmet peer 警告

## Blocked by

- 无，可立即开始
