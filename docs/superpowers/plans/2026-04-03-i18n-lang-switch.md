# i18n Language Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Chinese/English language switching to OpenTab Chrome extension with sidebar quick toggle and Settings language list.

**Architecture:** i18next + react-i18next for runtime translation. Locale preference persisted via existing `AppSettings` / IndexedDB. Cross-tab sync via existing `SETTINGS_CHANGED` broadcast. Translation files are inline-imported JSON (no lazy loading — total ~80 strings).

**Tech Stack:** i18next, react-i18next, TypeScript, React 19, WXT

---

### Task 1: Install Dependencies

**Files:**
- Modify: `app-extension/package.json`

- [ ] **Step 1: Install i18next and react-i18next**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/phoenix-v1 && pnpm add -w --filter @opentab/extension i18next react-i18next
```

- [ ] **Step 2: Verify installation**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/phoenix-v1 && cat app-extension/package.json | grep -E "i18next|react-i18next"
```

Expected: both `i18next` and `react-i18next` appear in dependencies.

- [ ] **Step 3: Commit**

```bash
git add app-extension/package.json pnpm-lock.yaml
git commit -m "feat(i18n): install i18next and react-i18next"
```

---

### Task 2: Add Locale to AppSettings

**Files:**
- Modify: `app-extension/src/lib/settings.ts`

- [ ] **Step 1: Add Locale type and update AppSettings interface**

In `app-extension/src/lib/settings.ts`, add the `Locale` type export and the `locale` field:

```typescript
export type Locale = "en" | "zh";

export type ThemeMode = "light" | "dark" | "system";

export interface AppSettings {
  server_enabled: boolean;
  server_url: string;
  theme: ThemeMode;
  locale: Locale;
  welcome_dismissed: boolean;
  sidebar_collapsed: boolean;
  right_panel_collapsed: boolean;
}
```

- [ ] **Step 2: Update DEFAULTS constant**

Add the `locale` field to `DEFAULTS` with a static `"en"` default. Browser language detection is handled in `initLocale()` (Task 4) as a one-time fallback when no persisted locale exists — this avoids issues with service worker contexts where `navigator.language` may behave differently.

```typescript
const DEFAULTS: AppSettings = {
  server_enabled: false,
  server_url: "http://localhost:3001",
  theme: "system",
  locale: "en" as Locale,
  welcome_dismissed: false,
  sidebar_collapsed: false,
  right_panel_collapsed: false,
};
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/phoenix-v1/app-extension && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app-extension/src/lib/settings.ts
git commit -m "feat(i18n): add locale field to AppSettings"
```

---

### Task 3: Create Translation Files

**Files:**
- Create: `app-extension/src/locales/en.json`
- Create: `app-extension/src/locales/zh.json`

- [ ] **Step 1: Create en.json**

Create `app-extension/src/locales/en.json`:

```json
{
  "sidebar": {
    "spaces": "Spaces",
    "settings": "Settings",
    "expand_sidebar": "Expand sidebar",
    "toggle_sidebar": "Toggle sidebar",
    "theme_light": "Light",
    "theme_dark": "Dark",
    "theme_system": "System",
    "theme_label": "Theme: {{mode}}",
    "language_en": "EN",
    "language_zh": "中",
    "language_label_en": "Language: English",
    "language_label_zh": "Language: 中文"
  },
  "collection_panel": {
    "view_default": "Default view",
    "view_compact": "Compact view",
    "view_list": "List view",
    "zen_mode": "Zen mode",
    "toggle_zen_mode": "Toggle zen mode",
    "search_tabs": "Search Tabs",
    "add_collection": "Add collection",
    "more_actions": "More actions",
    "rename_space": "Rename Space",
    "delete_space": "Delete Space"
  },
  "search": {
    "close": "Close search",
    "label": "Search saved tabs",
    "placeholder": "Search saved tabs...",
    "no_results": "No results found"
  },
  "collection_card": {
    "expand": "Expand collection",
    "collapse": "Collapse collection",
    "open_all": "Open all tabs",
    "delete": "Delete collection",
    "more_actions": "More actions",
    "rename": "Rename",
    "delete_menu": "Delete",
    "drag_tabs_here": "Drag tabs here"
  },
  "collection_tab": {
    "open": "Open",
    "copy_url": "Copy URL",
    "remove": "Remove"
  },
  "add_tab": {
    "add_url": "Add URL",
    "placeholder": "https://example.com",
    "invalid_url": "Please enter a valid URL"
  },
  "workspace_item": {
    "change_name": "Change Name",
    "change_icon": "Change Icon",
    "delete": "Delete",
    "last": "last",
    "rename_tooltip": "Double-click to rename"
  },
  "dialog": {
    "cancel": "Cancel",
    "create_workspace": {
      "title": "New Workspace",
      "description": "Create a new workspace to organize your tabs",
      "name_label": "Name",
      "name_placeholder": "Workspace name",
      "icon_label": "Icon",
      "submit": "Create"
    },
    "delete_workspace": {
      "title": "Delete \"{{name}}\"?",
      "description": "This will permanently delete this workspace and all its collections. This action cannot be undone.",
      "submit": "Delete"
    },
    "create_collection": {
      "title": "New Collection",
      "description": "Create a new tab collection in this workspace.",
      "name_placeholder": "Collection name",
      "submit": "Create"
    },
    "delete_collection": {
      "title": "Delete \"{{name}}\"?",
      "description": "This collection and all its saved tabs will be permanently deleted. This action cannot be undone.",
      "submit": "Delete"
    },
    "save_tabs": {
      "title": "Save as Collection",
      "description": "Save selected tabs as a new collection in the current workspace.",
      "name_placeholder": "Collection name",
      "new_tab": "New Tab",
      "deselect_all": "Deselect all",
      "select_all": "Select all",
      "selected_count": "{{selected}} of {{total}} selected",
      "save": "Save",
      "toast_success": "Saved {{count}} tab(s) to \"{{name}}\""
    }
  },
  "live_tab": {
    "new_tab": "New Tab",
    "expand_panel": "Expand panel",
    "collapse_panel": "Collapse panel",
    "tabs": "Tabs",
    "toggle_sort": "Toggle sort order",
    "save": "Save",
    "no_tabs": "No session tabs"
  },
  "welcome": {
    "title": "Welcome to OpenTab",
    "description": "Organize your browser tabs into workspaces and collections. Drag tabs from the right panel to get started.",
    "dismiss": "Dismiss"
  },
  "empty": {
    "title": "Get started",
    "description": "Drag tabs from the right panel or save your open tabs as a collection.",
    "save_current": "Save Current Tabs"
  },
  "about": {
    "title": "About OpenTab",
    "description": "OpenTab is a tab management tool",
    "info_badge": "OpenTab Info",
    "feature_sidebar": "The left sidebar shows all workspaces. Click <strong>+</strong> to create a new space",
    "feature_drag": "The right side of the workspace shows currently open tabs in the browser. You can drag them to the space area to add to favorites",
    "docs_prefix": "For more information, please refer to ",
    "docs_link": "OpenTab Docs",
    "changelog": "ChangeLog",
    "latest_version": "Latest Version Info",
    "contact": "Contact us"
  },
  "settings": {
    "title": "Settings",
    "loading": "Loading...",
    "nav": {
      "general": "General",
      "import_export": "Import / Export"
    },
    "appearance": {
      "title": "Appearance",
      "theme": "Theme",
      "theme_light": "Light",
      "theme_dark": "Dark",
      "theme_system": "System",
      "language": "Language",
      "lang_en": "English",
      "lang_zh": "中文",
      "lang_en_native": "English",
      "lang_zh_native": "中文"
    },
    "server": {
      "title": "Server Sync",
      "enable": "Enable Server Sync",
      "url_label": "Server URL",
      "url_placeholder": "http://localhost:3001",
      "test": "Test Connection",
      "testing": "Testing...",
      "status": {
        "not_enabled": "Not enabled",
        "testing": "Testing...",
        "connected": "Connected",
        "disconnected": "Disconnected"
      }
    },
    "export": {
      "title": "Export",
      "description": "Export all your workspaces, collections, and tabs as a JSON file.",
      "button": "Export All Data",
      "exporting": "Exporting..."
    },
    "import": {
      "title": "Import",
      "description": "Import data from a TabTab or OpenTab JSON backup file. You'll be able to preview and select what to import before any changes are made.",
      "button": "Import Data",
      "unsupported_format": "Unsupported file format. Please select a TabTab or OpenTab JSON file.",
      "read_error": "Failed to read file. Please ensure it is a valid JSON file."
    }
  },
  "import_page": {
    "no_session": "No import session found. Please start import from Settings.",
    "expired": "Import session expired. Please start import from Settings.",
    "load_error": "Failed to load import data.",
    "loading": "Loading import data...",
    "complete": "Import complete. This tab will close shortly.",
    "title": "Import Preview",
    "cancel": "Cancel",
    "select_collection": "Select a collection to view details",
    "toast_success": "Successfully imported {{workspaces}} workspaces, {{collections}} collections, {{tabs}} tabs",
    "toast_error": "Import failed. No changes were made.",
    "workspaces": "Workspaces"
  },
  "import_detail": {
    "identical": "This collection is identical — nothing to import.",
    "merge": "Merge",
    "create_new": "Create New",
    "skip": "Skip",
    "new_count": "+{{count}} new",
    "extra_count": "-{{count}} extra existing",
    "unchanged_count": "{{count}} unchanged",
    "tabs_to_import": "Tabs to import ({{count}})",
    "new_tabs": "New tabs (will be added)",
    "extra_tabs": "Extra existing tabs (in your data but not in import)",
    "create_message": "A new collection \"{{name}}\" will be created with all imported tabs.",
    "skip_message": "This collection will be skipped."
  },
  "import_summary": {
    "summary": "Will import: {{workspaces}} new workspaces, {{collections}} collections, {{tabs}} tabs",
    "importing": "Importing...",
    "import": "Import"
  },
  "tab_diff": {
    "keep_all": "Keep All",
    "delete_all": "Delete All",
    "keep": "Keep",
    "delete": "Delete"
  },
  "dnd": {
    "picked_up": "Picked up {{title}}",
    "over_target": "{{title}} is over drop target",
    "not_over_target": "{{title}} is no longer over a drop target",
    "dropped": "{{title}} was dropped",
    "dropped_outside": "{{title}} was dropped outside a target",
    "cancelled": "Dragging {{title}} was cancelled"
  }
}
```

- [ ] **Step 2: Create zh.json**

Create `app-extension/src/locales/zh.json` with the same structure, Chinese translations:

```json
{
  "sidebar": {
    "spaces": "空间",
    "settings": "设置",
    "expand_sidebar": "展开侧边栏",
    "toggle_sidebar": "切换侧边栏",
    "theme_light": "浅色",
    "theme_dark": "深色",
    "theme_system": "跟随系统",
    "theme_label": "主题: {{mode}}",
    "language_en": "EN",
    "language_zh": "中",
    "language_label_en": "Language: English",
    "language_label_zh": "语言: 中文"
  },
  "collection_panel": {
    "view_default": "默认视图",
    "view_compact": "紧凑视图",
    "view_list": "列表视图",
    "zen_mode": "专注模式",
    "toggle_zen_mode": "切换专注模式",
    "search_tabs": "搜索标签页",
    "add_collection": "添加集合",
    "more_actions": "更多操作",
    "rename_space": "重命名空间",
    "delete_space": "删除空间"
  },
  "search": {
    "close": "关闭搜索",
    "label": "搜索已保存的标签页",
    "placeholder": "搜索已保存的标签页...",
    "no_results": "没有找到结果"
  },
  "collection_card": {
    "expand": "展开集合",
    "collapse": "折叠集合",
    "open_all": "打开所有标签页",
    "delete": "删除集合",
    "more_actions": "更多操作",
    "rename": "重命名",
    "delete_menu": "删除",
    "drag_tabs_here": "将标签页拖放到这里"
  },
  "collection_tab": {
    "open": "打开",
    "copy_url": "复制链接",
    "remove": "移除"
  },
  "add_tab": {
    "add_url": "添加链接",
    "placeholder": "https://example.com",
    "invalid_url": "请输入有效的链接"
  },
  "workspace_item": {
    "change_name": "修改名称",
    "change_icon": "修改图标",
    "delete": "删除",
    "last": "最后一个",
    "rename_tooltip": "双击重命名"
  },
  "dialog": {
    "cancel": "取消",
    "create_workspace": {
      "title": "新建工作空间",
      "description": "创建新的工作空间来组织你的标签页",
      "name_label": "名称",
      "name_placeholder": "工作空间名称",
      "icon_label": "图标",
      "submit": "创建"
    },
    "delete_workspace": {
      "title": "删除「{{name}}」？",
      "description": "这将永久删除该工作空间及其所有集合。此操作无法撤销。",
      "submit": "删除"
    },
    "create_collection": {
      "title": "新建集合",
      "description": "在当前工作空间中创建新的标签页集合。",
      "name_placeholder": "集合名称",
      "submit": "创建"
    },
    "delete_collection": {
      "title": "删除「{{name}}」？",
      "description": "该集合及其所有已保存的标签页将被永久删除。此操作无法撤销。",
      "submit": "删除"
    },
    "save_tabs": {
      "title": "保存为集合",
      "description": "将选中的标签页保存为当前工作空间中的新集合。",
      "name_placeholder": "集合名称",
      "new_tab": "新标签页",
      "deselect_all": "取消全选",
      "select_all": "全选",
      "selected_count": "已选 {{selected}} / {{total}}",
      "save": "保存",
      "toast_success": "已保存 {{count}} 个标签页到「{{name}}」"
    }
  },
  "live_tab": {
    "new_tab": "新标签页",
    "expand_panel": "展开面板",
    "collapse_panel": "折叠面板",
    "tabs": "标签页",
    "toggle_sort": "切换排序方式",
    "save": "保存",
    "no_tabs": "没有会话标签页"
  },
  "welcome": {
    "title": "欢迎使用 OpenTab",
    "description": "将浏览器标签页组织到工作空间和集合中。从右侧面板拖拽标签页即可开始。",
    "dismiss": "关闭"
  },
  "empty": {
    "title": "开始使用",
    "description": "从右侧面板拖拽标签页，或将当前打开的标签页保存为集合。",
    "save_current": "保存当前标签页"
  },
  "about": {
    "title": "关于 OpenTab",
    "description": "OpenTab 是一款标签页管理工具",
    "info_badge": "OpenTab 信息",
    "feature_sidebar": "左侧边栏显示所有工作空间。点击 <strong>+</strong> 创建新空间",
    "feature_drag": "工作空间右侧显示浏览器中当前打开的标签页。你可以将它们拖到空间区域添加到收藏",
    "docs_prefix": "如需了解更多信息，请参阅 ",
    "docs_link": "OpenTab 文档",
    "changelog": "更新日志",
    "latest_version": "最新版本信息",
    "contact": "联系我们"
  },
  "settings": {
    "title": "设置",
    "loading": "加载中...",
    "nav": {
      "general": "通用",
      "import_export": "导入 / 导出"
    },
    "appearance": {
      "title": "外观",
      "theme": "主题",
      "theme_light": "浅色",
      "theme_dark": "深色",
      "theme_system": "跟随系统",
      "language": "语言",
      "lang_en": "English",
      "lang_zh": "中文",
      "lang_en_native": "English",
      "lang_zh_native": "中文"
    },
    "server": {
      "title": "服务器同步",
      "enable": "启用服务器同步",
      "url_label": "服务器地址",
      "url_placeholder": "http://localhost:3001",
      "test": "测试连接",
      "testing": "测试中...",
      "status": {
        "not_enabled": "未启用",
        "testing": "测试中...",
        "connected": "已连接",
        "disconnected": "未连接"
      }
    },
    "export": {
      "title": "导出",
      "description": "将所有工作空间、集合和标签页导出为 JSON 文件。",
      "button": "导出所有数据",
      "exporting": "导出中..."
    },
    "import": {
      "title": "导入",
      "description": "从 TabTab 或 OpenTab 的 JSON 备份文件导入数据。在进行任何更改之前，你可以预览并选择要导入的内容。",
      "button": "导入数据",
      "unsupported_format": "不支持的文件格式。请选择 TabTab 或 OpenTab 的 JSON 文件。",
      "read_error": "读取文件失败。请确保文件为有效的 JSON 格式。"
    }
  },
  "import_page": {
    "no_session": "未找到导入会话。请从设置中开始导入。",
    "expired": "导入会话已过期。请从设置中重新开始导入。",
    "load_error": "加载导入数据失败。",
    "loading": "正在加载导入数据...",
    "complete": "导入完成。此标签页将在短时间内关闭。",
    "title": "导入预览",
    "cancel": "取消",
    "select_collection": "选择一个集合查看详情",
    "toast_success": "成功导入 {{workspaces}} 个工作空间、{{collections}} 个集合、{{tabs}} 个标签页",
    "toast_error": "导入失败。未做任何更改。",
    "workspaces": "工作空间"
  },
  "import_detail": {
    "identical": "此集合完全相同——无需导入。",
    "merge": "合并",
    "create_new": "新建",
    "skip": "跳过",
    "new_count": "+{{count}} 个新增",
    "extra_count": "-{{count}} 个已有多余",
    "unchanged_count": "{{count}} 个未变更",
    "tabs_to_import": "待导入标签页 ({{count}})",
    "new_tabs": "新标签页（将被添加）",
    "extra_tabs": "已有多余标签页（存在于你的数据中但不在导入文件中）",
    "create_message": "将创建新集合「{{name}}」并导入所有标签页。",
    "skip_message": "此集合将被跳过。"
  },
  "import_summary": {
    "summary": "将导入：{{workspaces}} 个新工作空间、{{collections}} 个集合、{{tabs}} 个标签页",
    "importing": "导入中...",
    "import": "导入"
  },
  "tab_diff": {
    "keep_all": "全部保留",
    "delete_all": "全部删除",
    "keep": "保留",
    "delete": "删除"
  },
  "dnd": {
    "picked_up": "已拾起 {{title}}",
    "over_target": "{{title}} 在放置目标上方",
    "not_over_target": "{{title}} 已离开放置目标",
    "dropped": "{{title}} 已放置",
    "dropped_outside": "{{title}} 被放置在目标外部",
    "cancelled": "拖拽 {{title}} 已取消"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/locales/
git commit -m "feat(i18n): add en.json and zh.json translation files"
```

---

### Task 4: Create i18n Initialization Module

**Files:**
- Create: `app-extension/src/lib/i18n.ts`

- [ ] **Step 1: Create i18n.ts**

Create `app-extension/src/lib/i18n.ts`:

```typescript
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en.json";
import zh from "@/locales/zh.json";
import type { Locale } from "./settings";
import { getSettings, saveSettings } from "./settings";

/** Detect browser language, falling back to "en". Only call in page contexts. */
function detectLocale(): Locale {
  return navigator.language?.startsWith("zh") ? "zh" : "en";
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

/**
 * Read persisted locale from settings and apply it. If no locale has been
 * persisted yet (first launch), detect from browser language and save it.
 * Returns a promise that resolves when i18n language is set.
 */
export async function initLocale(): Promise<void> {
  const settings = await getSettings();
  let locale = settings.locale;
  // First launch: DEFAULTS is static "en", detect from browser
  if (locale === "en" && !await hasPersistedLocale()) {
    locale = detectLocale();
    if (locale !== "en") {
      await saveSettings({ locale });
    }
  }
  await i18n.changeLanguage(locale);
}

/** Check if locale has been explicitly saved (vs just using DEFAULTS). */
async function hasPersistedLocale(): Promise<boolean> {
  const { db } = await import("./db");
  const row = await db.settings.get("locale");
  return row != null;
}

export default i18n;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/phoenix-v1/app-extension && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/lib/i18n.ts
git commit -m "feat(i18n): create i18n initialization module"
```

---

### Task 5: Add TypeScript Type Declarations

**Files:**
- Create: `app-extension/src/types/i18next.d.ts`

- [ ] **Step 1: Create type declaration file**

Create `app-extension/src/types/i18next.d.ts`:

```typescript
import type en from "@/locales/en.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: {
      translation: typeof en;
    };
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/phoenix-v1/app-extension && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/types/i18next.d.ts
git commit -m "feat(i18n): add i18next TypeScript type declarations"
```

---

### Task 6: Wire i18n into All Entrypoints

**Files:**
- Modify: `app-extension/src/entrypoints/tabs/main.tsx`
- Modify: `app-extension/src/entrypoints/settings/main.tsx`
- Modify: `app-extension/src/entrypoints/import/main.tsx`

Each entrypoint currently looks like:

```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/assets/main.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 1: Update tabs/main.tsx**

**Important:** `initLocale()` is async. We must wait for it to resolve before rendering to avoid a flash of English content for Chinese users. Defer `createRoot` into an async bootstrap:

```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/assets/main.css";
import "@/lib/i18n";
import { initLocale } from "@/lib/i18n";
import App from "./App";

initLocale().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
```

- [ ] **Step 2: Update settings/main.tsx**

Same deferred rendering pattern:

```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/assets/main.css";
import "@/lib/i18n";
import { initLocale } from "@/lib/i18n";
import App from "./App";

initLocale().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
```

- [ ] **Step 3: Update import/main.tsx**

Same deferred rendering pattern:

```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/assets/main.css";
import "@/lib/i18n";
import { initLocale } from "@/lib/i18n";
import App from "./App";

initLocale().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
```

- [ ] **Step 4: Verify build works**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/phoenix-v1/app-extension && pnpm tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add app-extension/src/entrypoints/tabs/main.tsx app-extension/src/entrypoints/settings/main.tsx app-extension/src/entrypoints/import/main.tsx
git commit -m "feat(i18n): wire i18n initialization into all entrypoints"
```

---

### Task 7: Create useLocale Hook

**Files:**
- Create: `app-extension/src/lib/locale.ts`

- [ ] **Step 1: Create locale.ts**

Create `app-extension/src/lib/locale.ts` following the exact pattern of `theme.ts`:

```typescript
import { useCallback, useEffect, useState } from "react";
import i18n from "i18next";
import { MSG } from "./constants";
import { getSettings, saveSettings, type Locale } from "./settings";

const LOCALE_CYCLE: Locale[] = ["en", "zh"];

export function useLocale() {
  // initLocale() guarantees i18n.language is correct before React renders,
  // so we read it synchronously here. No mount effect needed.
  const [locale, setLocaleState] = useState<Locale>(
    (i18n.language as Locale) || "en",
  );

  // Listen for cross-tab changes (when another tab changes locale)
  useEffect(() => {
    const handler = (message: { type: string }) => {
      if (message.type === MSG.SETTINGS_CHANGED) {
        getSettings().then((s) => {
          setLocaleState(s.locale);
          i18n.changeLanguage(s.locale);
        });
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const setLocale = useCallback(async (next: Locale) => {
    setLocaleState(next);
    await i18n.changeLanguage(next);
    await saveSettings({ locale: next });
  }, []);

  const cycleLocale = useCallback(async () => {
    const idx = LOCALE_CYCLE.indexOf(locale);
    const next = LOCALE_CYCLE[(idx + 1) % LOCALE_CYCLE.length];
    setLocaleState(next);
    await i18n.changeLanguage(next);
    await saveSettings({ locale: next });
  }, [locale]);

  return { locale, setLocale, cycleLocale };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/phoenix-v1/app-extension && pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/lib/locale.ts
git commit -m "feat(i18n): create useLocale hook with cross-tab sync"
```

---

### Task 8: Add Sidebar Language Toggle Button

**Files:**
- Modify: `app-extension/src/components/layout/workspace-sidebar.tsx`

- [ ] **Step 1: Add language toggle to sidebar footer**

In `workspace-sidebar.tsx`, add imports and the language cycle button:

1. Add imports at top:
```typescript
import { useTranslation } from "react-i18next";
import { useLocale } from "@/lib/locale";
```

2. Inside `WorkspaceSidebar` function, add hook calls alongside existing ones:
```typescript
const { locale, cycleLocale } = useLocale();
const { t } = useTranslation();
```

3. Update `THEME_LABEL` to use translation keys — replace the static object:
```typescript
const THEME_LABEL = { light: "Light", dark: "Dark", system: "System" } as const;
```
with dynamic lookup inside the component. The theme button's aria-label becomes:
```tsx
aria-label={t("sidebar.theme_label", { mode: t(`sidebar.theme_${mode}`) })}
title={t("sidebar.theme_label", { mode: t(`sidebar.theme_${mode}`) })}
```

4. Replace hardcoded "Spaces" (line 109) with `{t("sidebar.spaces")}`.

5. Replace hardcoded "Settings" (line 169) with `{t("sidebar.settings")}`.

6. Replace `aria-label="Expand sidebar"` with `aria-label={t("sidebar.expand_sidebar")}`.

7. Replace `aria-label="Toggle sidebar"` with `aria-label={t("sidebar.toggle_sidebar")}`.

8. Add language button after the theme button in the footer (inside the `flex items-center gap-0.5` div):
```tsx
<Button
  variant="ghost"
  size="icon-xs"
  onClick={cycleLocale}
  aria-label={locale === "en" ? t("sidebar.language_label_en") : t("sidebar.language_label_zh")}
  title={locale === "en" ? t("sidebar.language_label_en") : t("sidebar.language_label_zh")}
>
  <span className="text-xs font-medium text-sidebar-foreground/70">
    {locale === "en" ? t("sidebar.language_en") : t("sidebar.language_zh")}
  </span>
</Button>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/phoenix-v1/app-extension && pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/components/layout/workspace-sidebar.tsx
git commit -m "feat(i18n): add language cycle button to sidebar footer"
```

---

### Task 9: Add Settings Language List UI

**Files:**
- Modify: `app-extension/src/entrypoints/settings/App.tsx`

- [ ] **Step 1: Add language imports and hook**

Add imports at top of `settings/App.tsx`:
```typescript
import { useTranslation } from "react-i18next";
import { useLocale } from "@/lib/locale";
import type { Locale } from "@/lib/settings";
```

Inside `App()` function, add:
```typescript
const { locale, setLocale } = useLocale();
const { t } = useTranslation();
```

Add language options constant (replace existing `THEME_OPTIONS` with translated version and add language options):
```typescript
const LANGUAGE_OPTIONS: { value: Locale; native: string; nameKey: string }[] = [
  { value: "en", native: "English", nameKey: "settings.appearance.lang_en" },
  { value: "zh", native: "中文", nameKey: "settings.appearance.lang_zh" },
];
```

- [ ] **Step 2: Add Language list in Appearance section**

Below the Theme radio group (after the closing `</div>` of the theme section), add:

```tsx
<div className="space-y-2">
  <span className="text-sm font-medium">{t("settings.appearance.language")}</span>
  <div className="rounded-lg border border-border">
    {LANGUAGE_OPTIONS.map((opt) => (
      <button
        key={opt.value}
        type="button"
        className="flex w-full items-center justify-between px-3 py-2.5 text-sm transition-colors hover:bg-accent first:rounded-t-lg last:rounded-b-lg [&:not(:last-child)]:border-b border-border"
        onClick={() => setLocale(opt.value)}
      >
        <div className="flex items-center gap-2">
          <span className="font-medium">{opt.native}</span>
          {locale !== opt.value && (
            <span className="text-muted-foreground">{t(opt.nameKey)}</span>
          )}
        </div>
        {locale === opt.value && (
          <span className="text-primary">✓</span>
        )}
      </button>
    ))}
  </div>
</div>
```

No separate `handleLocaleChange` is needed — `setLocale()` from the `useLocale` hook already handles local state update, `i18n.changeLanguage()`, and `saveSettings()` persistence in one call.

- [ ] **Step 3: Replace all hardcoded strings in settings/App.tsx**

Replace every hardcoded English string in the Settings component with `t()` calls. Key replacements:

- `"Loading..."` → `{t("settings.loading")}`
- `"Settings"` → `{t("settings.title")}`
- `"Import / Export"` → `{t("settings.nav.import_export")}`
- `"General"` (nav) → `{t("settings.nav.general")}`
- `"General"` (header) → `{t("settings.nav.general")}`
- `"Appearance"` → `{t("settings.appearance.title")}`
- `"Theme"` → `{t("settings.appearance.theme")}`
- Theme option labels: `"Light"` → `t("settings.appearance.theme_light")`, `"Dark"` → `t("settings.appearance.theme_dark")`, `"System"` → `t("settings.appearance.theme_system")`
- `"Server Sync"` → `{t("settings.server.title")}`
- `"Enable Server Sync"` → `{t("settings.server.enable")}`
- `"Server URL"` → `{t("settings.server.url_label")}`
- `"Test Connection"` / `"Testing..."` → `{connectionStatus === "testing" ? t("settings.server.testing") : t("settings.server.test")}`
- `"Export"` → `{t("settings.export.title")}`
- Export description → `{t("settings.export.description")}`
- `"Export All Data"` / `"Exporting..."` → `{isExporting ? t("settings.export.exporting") : t("settings.export.button")}`
- `"Import"` → `{t("settings.import.title")}`
- Import description → `{t("settings.import.description")}`
- `"Import Data"` → `{t("settings.import.button")}`
- Status indicator texts → `t("settings.server.status.not_enabled")`, etc.
- Alert messages → `t("settings.import.unsupported_format")`, `t("settings.import.read_error")`

Update `THEME_OPTIONS` to use translation keys:
```typescript
const THEME_OPTIONS: { value: ThemeMode; labelKey: string }[] = [
  { value: "light", labelKey: "settings.appearance.theme_light" },
  { value: "dark", labelKey: "settings.appearance.theme_dark" },
  { value: "system", labelKey: "settings.appearance.theme_system" },
];
```

And render with `{t(opt.labelKey)}` instead of `{opt.label}`.

Update `StatusIndicator` to accept `t` function or use `useTranslation` inside it:
```typescript
function StatusIndicator({ status }: { status: ConnectionStatus }) {
  const { t } = useTranslation();
  const config = {
    not_enabled: { color: "bg-muted-foreground/40", text: t("settings.server.status.not_enabled") },
    testing: { color: "bg-[var(--status-yellow)]", text: t("settings.server.status.testing") },
    connected: { color: "bg-[var(--status-green)]", text: t("settings.server.status.connected") },
    disconnected: { color: "bg-[var(--status-red)]", text: t("settings.server.status.disconnected") },
  }[status];
  // ... rest unchanged
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/phoenix-v1/app-extension && pnpm tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add app-extension/src/entrypoints/settings/App.tsx
git commit -m "feat(i18n): add language list UI and translate settings page"
```

---

### Task 10: Translate Sidebar and Collection Panel

**Files:**
- Modify: `app-extension/src/components/layout/collection-panel.tsx`

- [ ] **Step 1: Translate collection-panel.tsx**

Add import:
```typescript
import { useTranslation } from "react-i18next";
```

Inside `CollectionPanel` function, add:
```typescript
const { t } = useTranslation();
```

Update `VIEW_MODE_OPTIONS` — change the `label` values to translation keys and render dynamically:
```typescript
const VIEW_MODE_OPTIONS: { mode: ViewMode; labelKey: string; btnClass: string; icon: ReactNode }[] = [
  { mode: "default", labelKey: "collection_panel.view_default", btnClass: "rounded-r-none", icon: /* same SVG */ },
  { mode: "compact", labelKey: "collection_panel.view_compact", btnClass: "rounded-none border-x border-border", icon: /* same SVG */ },
  { mode: "list", labelKey: "collection_panel.view_list", btnClass: "rounded-l-none", icon: /* same SVG */ },
];
```

Note: Since `VIEW_MODE_OPTIONS` is defined outside the component and `t()` must be called inside React, the `label` field should be a key. In the render, use `t(labelKey)` for `title` and `aria-label`:
```tsx
title={t(labelKey)}
aria-label={t(labelKey)}
```

Replace remaining hardcoded strings:
- `"Zen mode"` title → `t("collection_panel.zen_mode")`
- `aria-label="Toggle zen mode"` → `aria-label={t("collection_panel.toggle_zen_mode")}`
- `"Search Tabs"` → `{t("collection_panel.search_tabs")}`
- `"Add collection"` → `{t("collection_panel.add_collection")}`
- `aria-label="More actions"` → `aria-label={t("collection_panel.more_actions")}`
- `"Rename Space"` → `{t("collection_panel.rename_space")}`
- `"Delete Space"` → `{t("collection_panel.delete_space")}`

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/phoenix-v1/app-extension && pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/components/layout/workspace-sidebar.tsx app-extension/src/components/layout/collection-panel.tsx
git commit -m "feat(i18n): translate sidebar and collection panel"
```

---

### Task 11: Translate Dialog Components

**Files:**
- Modify: `app-extension/src/components/workspace/create-workspace-dialog.tsx`
- Modify: `app-extension/src/components/workspace/delete-workspace-dialog.tsx`
- Modify: `app-extension/src/components/collection/create-collection-dialog.tsx`
- Modify: `app-extension/src/components/collection/delete-collection-dialog.tsx`
- Modify: `app-extension/src/components/live-tabs/save-tabs-dialog.tsx`

For each dialog:

- [ ] **Step 1: Translate create-workspace-dialog.tsx**

Add `import { useTranslation } from "react-i18next";` and `const { t } = useTranslation();` inside component.

Replace:
- `"New Workspace"` → `{t("dialog.create_workspace.title")}`
- `"Create a new workspace to organize your tabs"` → `{t("dialog.create_workspace.description")}`
- `"Name"` → `{t("dialog.create_workspace.name_label")}`
- `"Workspace name"` placeholder → `t("dialog.create_workspace.name_placeholder")`
- `"Icon"` → `{t("dialog.create_workspace.icon_label")}`
- `"Cancel"` → `{t("dialog.cancel")}`
- `"Create"` → `{t("dialog.create_workspace.submit")}`

- [ ] **Step 2: Translate delete-workspace-dialog.tsx**

Add `useTranslation` import and hook.

Replace:
- Title with dynamic name → `{t("dialog.delete_workspace.title", { name: workspaceName })}`
- Description → `{t("dialog.delete_workspace.description")}`
- `"Cancel"` → `{t("dialog.cancel")}`
- `"Delete"` → `{t("dialog.delete_workspace.submit")}`

- [ ] **Step 3: Translate create-collection-dialog.tsx**

Add `useTranslation` import and hook.

Replace:
- `"New Collection"` → `{t("dialog.create_collection.title")}`
- `"Create a new tab collection in this workspace."` → `{t("dialog.create_collection.description")}`
- `"Collection name"` placeholder → `t("dialog.create_collection.name_placeholder")`
- `"Cancel"` → `{t("dialog.cancel")}`
- `"Create"` → `{t("dialog.create_collection.submit")}`

- [ ] **Step 4: Translate delete-collection-dialog.tsx**

Add `useTranslation` import and hook.

Replace:
- Title with dynamic name → `{t("dialog.delete_collection.title", { name: collectionName })}`
- Description → `{t("dialog.delete_collection.description")}`
- `"Cancel"` → `{t("dialog.cancel")}`
- `"Delete"` → `{t("dialog.delete_collection.submit")}`

- [ ] **Step 5: Translate save-tabs-dialog.tsx**

Add `useTranslation` import and hook.

Replace:
- `"Save as Collection"` → `{t("dialog.save_tabs.title")}`
- `"Save selected tabs..."` description → `{t("dialog.save_tabs.description")}`
- `"Collection name"` placeholder → `t("dialog.save_tabs.name_placeholder")`
- `"New Tab"` fallback → `t("dialog.save_tabs.new_tab")`
- `"Deselect all"` / `"Select all"` → `{allSelected ? t("dialog.save_tabs.deselect_all") : t("dialog.save_tabs.select_all")}`
- `"${selectedIds.size} of ${tabs.length} selected"` → `{t("dialog.save_tabs.selected_count", { selected: selectedIds.size, total: tabs.length })}`
- `"Cancel"` → `{t("dialog.cancel")}`
- `"Save"` → `{t("dialog.save_tabs.save")}`
- Toast message → `t("dialog.save_tabs.toast_success", { count: selectedTabs.length, name: trimmedName })`

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/phoenix-v1/app-extension && pnpm tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add app-extension/src/components/workspace/ app-extension/src/components/collection/create-collection-dialog.tsx app-extension/src/components/collection/delete-collection-dialog.tsx app-extension/src/components/live-tabs/save-tabs-dialog.tsx
git commit -m "feat(i18n): translate all dialog components"
```

---

### Task 12: Translate Collection Card, Tab Items, and Add Tab

**Files:**
- Modify: `app-extension/src/components/collection/collection-card.tsx`
- Modify: `app-extension/src/components/collection/collection-tab-item.tsx`
- Modify: `app-extension/src/components/collection/add-tab-inline.tsx`

- [ ] **Step 1: Translate collection-card.tsx**

Add `useTranslation` import and hook.

Replace:
- `"Expand collection"` / `"Collapse collection"` aria-labels → `aria-label={isCollapsed ? t("collection_card.expand") : t("collection_card.collapse")}`
- `"Open all tabs"` → `t("collection_card.open_all")`
- `"Delete collection"` → `t("collection_card.delete")`
- `"More actions"` → `t("collection_card.more_actions")`
- `"Rename"` → `{t("collection_card.rename")}`
- `"Delete"` (menu) → `{t("collection_card.delete_menu")}`
- `"Drag tabs here"` → `{t("collection_card.drag_tabs_here")}`

- [ ] **Step 2: Translate collection-tab-item.tsx**

Add `useTranslation` import and hook.

Replace:
- `"Open"` → `{t("collection_tab.open")}`
- `"Copy URL"` → `{t("collection_tab.copy_url")}`
- `"Remove"` → `{t("collection_tab.remove")}`

- [ ] **Step 3: Translate add-tab-inline.tsx**

Add `useTranslation` import and hook.

Replace:
- `"Add URL"` → `{t("add_tab.add_url")}`
- `"https://example.com"` placeholder → `t("add_tab.placeholder")`
- `"Please enter a valid URL"` → `t("add_tab.invalid_url")`

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/phoenix-v1/app-extension && pnpm tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add app-extension/src/components/collection/
git commit -m "feat(i18n): translate collection card, tab items, and add tab"
```

---

### Task 13: Translate Search, Welcome, Empty State, and About

**Files:**
- Modify: `app-extension/src/components/layout/search-dialog.tsx`
- Modify: `app-extension/src/components/layout/welcome-banner.tsx`
- Modify: `app-extension/src/components/layout/empty-workspace.tsx`
- Modify: `app-extension/src/components/layout/about-page.tsx`

- [ ] **Step 1: Translate search-dialog.tsx**

Add `useTranslation` import and hook.

Replace:
- `"Close search"` aria-label → `t("search.close")`
- `"Search saved tabs"` aria-label → `t("search.label")`
- `"Search saved tabs..."` placeholder → `t("search.placeholder")`
- `"No results found"` → `{t("search.no_results")}`

- [ ] **Step 2: Translate welcome-banner.tsx**

Add `useTranslation` import and hook.

Replace:
- `"Welcome to OpenTab"` → `{t("welcome.title")}`
- Description text → `{t("welcome.description")}`
- `"Dismiss"` aria-label → `t("welcome.dismiss")`

- [ ] **Step 3: Translate empty-workspace.tsx**

Add `useTranslation` import and hook.

Replace:
- `"Get started"` → `{t("empty.title")}`
- Description text → `{t("empty.description")}`
- `"Save Current Tabs"` → `{t("empty.save_current")}`

- [ ] **Step 4: Translate about-page.tsx**

Add `useTranslation` import and hook. Use `Trans` component from react-i18next for HTML content.

Replace:
- `"About OpenTab"` → `{t("about.title")}`
- `"OpenTab is a tab management tool"` → `{t("about.description")}`
- `"OpenTab Info"` → `{t("about.info_badge")}`
- Feature bullets — use `Trans` component for the `<strong>` tag:
  ```tsx
  import { Trans, useTranslation } from "react-i18next";
  // ...
  <li><Trans i18nKey="about.feature_sidebar" components={{ strong: <span className="font-medium" /> }} /></li>
  ```
- `"For more information, please refer to "` → `{t("about.docs_prefix")}`
- `"OpenTab Docs"` → `{t("about.docs_link")}`
- `"ChangeLog"` → `{t("about.changelog")}`
- `"Latest Version Info"` → `{t("about.latest_version")}`
- `"Contact us"` → `{t("about.contact")}`

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/phoenix-v1/app-extension && pnpm tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add app-extension/src/components/layout/search-dialog.tsx app-extension/src/components/layout/welcome-banner.tsx app-extension/src/components/layout/empty-workspace.tsx app-extension/src/components/layout/about-page.tsx
git commit -m "feat(i18n): translate search, welcome, empty state, and about page"
```

---

### Task 14: Translate Live Tab Panel and Tab Item

**Files:**
- Modify: `app-extension/src/components/layout/live-tab-panel.tsx`
- Modify: `app-extension/src/components/live-tabs/live-tab-item.tsx`
- Modify: `app-extension/src/components/workspace/workspace-item.tsx`

- [ ] **Step 1: Translate live-tab-panel.tsx**

Add `useTranslation` import and hook.

Replace:
- `"Expand panel"` / `"Collapse panel"` → `t("live_tab.expand_panel")` / `t("live_tab.collapse_panel")`
- `"Tabs"` → `{t("live_tab.tabs")}`
- `"Toggle sort order"` → `t("live_tab.toggle_sort")`
- `"Save"` → `{t("live_tab.save")}`
- `"No session tabs"` → `{t("live_tab.no_tabs")}`

- [ ] **Step 2: Translate live-tab-item.tsx**

Add `useTranslation` import and hook.

Replace:
- `"New Tab"` fallback → `t("live_tab.new_tab")`

- [ ] **Step 3: Translate workspace-item.tsx**

Add `useTranslation` import and hook.

Replace:
- `"Change Name"` → `{t("workspace_item.change_name")}`
- `"Change Icon"` → `{t("workspace_item.change_icon")}`
- `"Delete"` → `{t("workspace_item.delete")}`
- `"last"` → `t("workspace_item.last")`
- `"Double-click to rename"` → `t("workspace_item.rename_tooltip")`

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/phoenix-v1/app-extension && pnpm tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add app-extension/src/components/layout/live-tab-panel.tsx app-extension/src/components/live-tabs/live-tab-item.tsx app-extension/src/components/workspace/workspace-item.tsx
git commit -m "feat(i18n): translate live tab panel, tab item, and workspace item"
```

---

### Task 15: Translate Import Page and Components

**Files:**
- Modify: `app-extension/src/entrypoints/import/App.tsx`
- Modify: `app-extension/src/components/import/import-detail.tsx`
- Modify: `app-extension/src/components/import/import-summary-bar.tsx`
- Modify: `app-extension/src/components/import/import-tree.tsx`
- Modify: `app-extension/src/components/import/tab-diff-list.tsx`

- [ ] **Step 1: Translate import/App.tsx**

Add `useTranslation` import and hook.

Replace:
- `"No import session found..."` → `{t("import_page.no_session")}`
- `"Import session expired..."` → `{t("import_page.expired")}`
- `"Failed to load import data."` → `{t("import_page.load_error")}`
- `"Loading import data..."` → `{t("import_page.loading")}`
- `"Import complete..."` → `{t("import_page.complete")}`
- `"Import Preview"` → `{t("import_page.title")}`
- `"Cancel"` → `{t("import_page.cancel")}`
- `"Select a collection to view details"` → `{t("import_page.select_collection")}`
- Toast success → `t("import_page.toast_success", { workspaces: result.workspaceCount, collections: result.collectionCount, tabs: result.tabCount })`
- Toast error → `t("import_page.toast_error")`

- [ ] **Step 2: Translate import-detail.tsx**

Add `useTranslation` import and hook.

Replace all hardcoded strings with corresponding `t()` calls from the `import_detail` namespace. Use interpolation for dynamic values like `{{count}}` and `{{name}}`.

- [ ] **Step 3: Translate import-summary-bar.tsx**

Add `useTranslation` import and hook.

Replace:
- Summary text → `{t("import_summary.summary", { workspaces, collections, tabs })}`
- `"Importing..."` / `"Import"` → `{isImporting ? t("import_summary.importing") : t("import_summary.import")}`

- [ ] **Step 4: Translate import-tree.tsx**

Add `useTranslation` import and hook.

Replace:
- `"Workspaces"` → `{t("import_page.workspaces")}`

- [ ] **Step 5: Translate tab-diff-list.tsx**

Add `useTranslation` import and hook.

Replace:
- `"Keep All"` → `{t("tab_diff.keep_all")}`
- `"Delete All"` → `{t("tab_diff.delete_all")}`
- `"Keep"` → `{t("tab_diff.keep")}`
- `"Delete"` → `{t("tab_diff.delete")}`

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/phoenix-v1/app-extension && pnpm tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add app-extension/src/entrypoints/import/App.tsx app-extension/src/components/import/
git commit -m "feat(i18n): translate import page and all import components"
```

---

### Task 16: Translate DnD Accessibility Announcements

**Files:**
- Modify: `app-extension/src/entrypoints/tabs/App.tsx`

- [ ] **Step 1: Translate DnD announcements in tabs/App.tsx**

**Important:** The `announcements` object is currently a module-level constant (outside any React component). Hooks like `useTranslation()` cannot be called at module scope. Move `announcements` inside the `App` component as a `useMemo`:

Add imports:
```typescript
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
```

Inside `App()`, add:
```typescript
const { t } = useTranslation();
```

Move the `announcements` constant from module scope into the component as a `useMemo`:
```typescript
const announcements: Announcements = useMemo(() => ({
  onDragStart({ active }) {
    const title = getDragTitle(active);
    return t("dnd.picked_up", { title });
  },
  onDragOver({ active, over }) {
    const title = getDragTitle(active);
    if (over) return t("dnd.over_target", { title });
    return t("dnd.not_over_target", { title });
  },
  onDragEnd({ active, over }) {
    const title = getDragTitle(active);
    if (over) return t("dnd.dropped", { title });
    return t("dnd.dropped_outside", { title });
  },
  onDragCancel({ active }) {
    const title = getDragTitle(active);
    return t("dnd.cancelled", { title });
  },
}), [t]);
```

The helper function `getDragTitle` (or whatever extracts the title from the active drag item) can remain at module scope since it doesn't use `t()`.

Also replace:
- `"Loading..."` → `{t("settings.loading")}` (or add a `common.loading` key if preferred)
- `"New Tab"` fallback → `t("live_tab.new_tab")`

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/phoenix-v1/app-extension && pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app-extension/src/entrypoints/tabs/App.tsx
git commit -m "feat(i18n): translate DnD accessibility announcements"
```

---

### Task 17: Final Verification

- [ ] **Step 1: Full TypeScript check**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/phoenix-v1/app-extension && pnpm tsc --noEmit
```

- [ ] **Step 2: Lint check**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/phoenix-v1/app-extension && pnpm lint
```

- [ ] **Step 3: Build extension**

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/phoenix-v1/app-extension && pnpm build
```

Expected: all pass with no errors.

- [ ] **Step 4: Verify translation file consistency**

Check that en.json and zh.json have the same keys:

```bash
cd /Users/liang.zhao/conductor/workspaces/opentab/phoenix-v1 && node -e "
const en = require('./app-extension/src/locales/en.json');
const zh = require('./app-extension/src/locales/zh.json');
function keys(obj, prefix='') {
  return Object.entries(obj).flatMap(([k,v]) =>
    typeof v === 'object' ? keys(v, prefix+k+'.') : [prefix+k]
  );
}
const enKeys = new Set(keys(en));
const zhKeys = new Set(keys(zh));
const missingInZh = [...enKeys].filter(k => !zhKeys.has(k));
const extraInZh = [...zhKeys].filter(k => !enKeys.has(k));
if (missingInZh.length) console.log('Missing in zh:', missingInZh);
if (extraInZh.length) console.log('Extra in zh:', extraInZh);
if (!missingInZh.length && !extraInZh.length) console.log('All keys match!');
"
```

Expected: "All keys match!"
