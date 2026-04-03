# i18n Language Switch — Design Spec

## Overview

Add Chinese/English language switching to OpenTab Chrome extension. Users can toggle language from the sidebar (quick cycle button) or select from a list in Settings. Uses `i18next` + `react-i18next` for runtime switching, persisted via existing settings infrastructure.

## Decisions

- **Library:** i18next + react-i18next (~22KB). Chosen for maturity, Chrome extension track record, and runtime switching support. Native `chrome.i18n` cannot switch at runtime.
- **Scope:** UI strings only. User content (workspace names, collection names, tab titles) and brand name "OpenTab" are not translated.
- **Languages:** English (en), Chinese (zh). List format in Settings makes future languages easy to add.

## UI Design

### A. Sidebar Quick Toggle

- New cycle button in sidebar footer, next to theme icon
- Displays current language abbreviation: `EN` or `中`
- Click cycles: EN → 中 → EN (same pattern as theme cycle button)
- Tooltip: "Language: English" / "语言: 中文"

### B. Settings Language List

- Located in Settings → General → Appearance, below Theme selector
- Rendered as a bordered list (not segmented control)
- Each row shows:
  - Native language name (e.g., "中文")
  - Translated name for non-current language (e.g., "Chinese" when in English mode)
  - Checkmark (✓) on the currently selected language
- Click a row → immediately saves preference and switches UI language
- No separate save/confirm button needed

## Technical Architecture

### Dependencies

```
i18next
react-i18next
```

### Translation Files

```
app-extension/src/locales/
  en.json
  zh.json
```

Nested JSON structure grouped by component area. No i18next namespaces (total string count is small). Dot-separated keys in code (e.g., `t("sidebar.spaces")`) map to nested JSON objects.

Key naming convention:
- `sidebar.spaces`, `sidebar.settings`
- `settings.general`, `settings.theme`, `settings.language`
- `dialog.create_workspace.title`, `dialog.create_workspace.name`
- `welcome.title`, `welcome.description`
- `toast.saved_tabs`

### Settings

Add `locale` field to `AppSettings`:

```typescript
export type Locale = "en" | "zh";

export interface AppSettings {
  // ... existing fields
  locale: Locale;
}
```

Default value: detect via inline expression in the `DEFAULTS` constant:

```typescript
const DEFAULTS: AppSettings = {
  // ... existing fields
  locale: (navigator.language?.startsWith("zh") ? "zh" : "en") as Locale,
};
```

This works because `settings.ts` is only imported in browser contexts (React entrypoints), never in the service worker. Both the `AppSettings` interface and the `DEFAULTS` constant must be updated — `getSettings()` derives its key list from `Object.keys(DEFAULTS)`.

### i18n Initialization

New file: `app-extension/src/lib/i18n.ts`

- Configures i18next with `initReactI18next` plugin
- Resources imported inline (both locale JSON files)
- Reads initial locale from `getSettings()`
- Exports initialized i18n instance

Each entrypoint (tabs, settings, import) imports this module to initialize i18n.

### useLocale Hook

New file: `app-extension/src/lib/locale.ts` (mirrors `theme.ts` pattern)

Provides:
- `locale: Locale` — current locale
- `cycleLocale(): Promise<void>` — cycles EN → ZH → EN, saves to settings, broadcasts change
- `setLocale(locale: Locale): Promise<void>` — sets specific locale, saves, broadcasts

Internally:
- Calls `i18n.changeLanguage()` for React re-render
- Calls `saveSettings({ locale })` to persist
- Listens to `SETTINGS_CHANGED` message for cross-tab sync

### Cross-Tab Sync

Reuses existing `SETTINGS_CHANGED` broadcast mechanism. When any tab changes locale:
1. `saveSettings({ locale })` writes to DB and broadcasts message
2. Other tabs receive message, read updated settings, call `i18n.changeLanguage()`
3. React re-renders with new language — no page reload needed

### TypeScript Integration

Use i18next's type declaration to enable autocomplete for `t()` keys:

```typescript
// app-extension/src/types/i18next.d.ts
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

## Translation Scope

### Components to translate (~80 strings total)

| Area | File | Strings |
|---|---|---|
| Sidebar | workspace-sidebar.tsx | ~6 |
| Settings | settings/App.tsx | ~20 |
| Dialogs | create-workspace-dialog, delete-workspace-dialog, create-collection-dialog, delete-collection-dialog, save-tabs-dialog | ~20 |
| Search | search-dialog.tsx | ~3 |
| Collection panel | collection-panel.tsx (view labels: Default/Compact/List/Zen) | ~5 |
| Live tabs | live-tab-item.tsx ("New Tab" fallback) | ~1 |
| Welcome | welcome-banner.tsx | ~3 |
| Empty state | empty-workspace.tsx | ~3 |
| Import | import page components | ~10 |
| Toasts | various | ~5 |

### Not translated

- User-created content (workspace names, collection names, tab titles/URLs)
- Brand name "OpenTab"
- URLs and technical identifiers

## Implementation Order

1. Install i18next + react-i18next
2. Create translation files (en.json, zh.json) with all strings
3. Create i18n.ts initialization module
4. Add `locale` field to both `AppSettings` interface and `DEFAULTS` constant in settings.ts
5. Create useLocale hook (locale.ts)
6. Add TypeScript type declarations
7. Add sidebar language cycle button
8. Add Settings language list UI
9. Replace hardcoded strings in all components with `t()` calls
10. Test cross-tab sync and language persistence
