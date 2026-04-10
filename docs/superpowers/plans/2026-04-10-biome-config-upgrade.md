# Biome 配置升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 shiprails-ext 的 biome 配置中迁移有价值的规则和功能，提升代码质量和开发体验。

**Architecture:** 分 4 个原子提交：(1) 迁移 style 规则 (2) 增强 useSortedClasses 配置 (3) 添加 organizeImports + CSS Tailwind 解析 (4) 自动修复所有可修复的 warnings。

**Tech Stack:** Biome 2.4.9, pnpm

**前置调研结论：**
- 10 条 style 规则加入后 **0 个新违规** — 代码已自然符合
- `useSortedClasses` 增强后新增 1 个违规（128 vs 127），全部 FIXABLE
- `organizeImports` 无违规
- CSS `tailwindDirectives` 无违规
- 总计 128 个 warnings 全部为 `useSortedClasses`，全部可自动修复

---

### Task 1: 迁移 style lint 规则

**Files:**
- Modify: `biome.json`

- [ ] **Step 1: 添加 10 条 style 规则到 biome.json**

在 `linter.rules.style` 中保留 `noNonNullAssertion: "off"`，追加以下规则：

```json
"style": {
  "noNonNullAssertion": "off",
  "noParameterAssign": "error",
  "useAsConstAssertion": "error",
  "useDefaultParameterLast": "error",
  "useEnumInitializers": "error",
  "useSelfClosingElements": "error",
  "useSingleVarDeclarator": "error",
  "noUnusedTemplateLiteral": "error",
  "useNumberNamespace": "error",
  "noInferrableTypes": "error",
  "noUselessElse": "error"
}
```

- [ ] **Step 2: 添加 useExhaustiveDependencies 为 info 级别**

在 `linter.rules` 中新增 `correctness` 块：

```json
"correctness": {
  "useExhaustiveDependencies": "info"
}
```

- [ ] **Step 3: 运行 lint 验证无新 error**

Run: `pnpm biome lint --max-diagnostics=300 .`
Expected: 只有 `useSortedClasses` 的 warnings，无新 errors

- [ ] **Step 4: Commit**

```bash
git add biome.json
git commit -m "chore(biome): add strict style rules and useExhaustiveDependencies"
```

---

### Task 2: 增强 useSortedClasses 配置

**Files:**
- Modify: `biome.json`

- [ ] **Step 1: 升级 useSortedClasses 为带 fix 和 functions 的完整配置**

将 `linter.rules.nursery.useSortedClasses` 从 `"warn"` 改为：

```json
"useSortedClasses": {
  "level": "warn",
  "fix": "safe",
  "options": {
    "functions": ["clsx", "cva", "cn"]
  }
}
```

- [ ] **Step 2: 验证配置生效**

Run: `pnpm biome lint --max-diagnostics=5 .`
Expected: warnings 仍为 `useSortedClasses`，标记 FIXABLE

- [ ] **Step 3: Commit**

```bash
git add biome.json
git commit -m "chore(biome): enhance useSortedClasses with safe fix and cn/cva/clsx support"
```

---

### Task 3: 添加 organizeImports 和 CSS Tailwind 指令支持

**Files:**
- Modify: `biome.json`

- [ ] **Step 1: 添加 assist.actions 和 css.parser 配置**

在 biome.json 顶层添加两个新块（与 `linter`、`javascript` 同级）：

```json
"assist": {
  "actions": {
    "source": {
      "organizeImports": "on"
    }
  }
},
"css": {
  "parser": {
    "tailwindDirectives": true
  }
}
```

同时在 `files.includes` 中追加 `"**/*.css"` 让 biome 处理 CSS 文件：

```json
"includes": ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.json", "**/*.css"]
```

- [ ] **Step 2: 验证 check 无新 error**

Run: `pnpm biome check --max-diagnostics=300 .`
Expected: 无新 errors（warnings 仍为 useSortedClasses）

- [ ] **Step 3: Commit**

```bash
git add biome.json
git commit -m "chore(biome): add organizeImports and CSS tailwind directive support"
```

---

### Task 4: 自动修复所有 useSortedClasses warnings

**Files:**
- Modify: 多个 `.tsx` 文件（约 128 个 FIXABLE warnings）

- [ ] **Step 1: 运行 biome 自动修复**

Run: `pnpm biome check --write .`
Expected: ~128 个 fixes applied

- [ ] **Step 2: 验证修复后无残余 warnings**

Run: `pnpm biome check .`
Expected: 0 warnings, 0 errors

- [ ] **Step 3: 运行 TypeScript 类型检查确认无破坏**

Run: `pnpm lint`
Expected: 无错误

- [ ] **Step 4: Commit 所有自动修复**

```bash
git add -A
git commit -m "style: auto-fix all useSortedClasses warnings with biome"
```

---

## 最终 biome.json 预期结果

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.9/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "assist": {
    "actions": {
      "source": {
        "organizeImports": "on"
      }
    }
  },
  "linter": {
    "rules": {
      "recommended": true,
      "correctness": {
        "useExhaustiveDependencies": "info"
      },
      "style": {
        "noNonNullAssertion": "off",
        "noParameterAssign": "error",
        "useAsConstAssertion": "error",
        "useDefaultParameterLast": "error",
        "useEnumInitializers": "error",
        "useSelfClosingElements": "error",
        "useSingleVarDeclarator": "error",
        "noUnusedTemplateLiteral": "error",
        "useNumberNamespace": "error",
        "noInferrableTypes": "error",
        "noUselessElse": "error"
      },
      "nursery": {
        "useSortedClasses": {
          "level": "warn",
          "fix": "safe",
          "options": {
            "functions": ["clsx", "cva", "cn"]
          }
        }
      }
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "trailingCommas": "all",
      "semicolons": "always"
    }
  },
  "css": {
    "parser": {
      "tailwindDirectives": true
    }
  },
  "files": {
    "includes": ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.json", "**/*.css"],
    "ignoreUnknown": true
  },
  "overrides": [
    {
      "includes": ["**/routeTree.gen.ts"],
      "linter": { "enabled": false },
      "formatter": { "enabled": false },
      "assist": { "enabled": false }
    }
  ]
}
```
