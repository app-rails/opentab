# Coding Conventions

**Analysis Date:** 2026-03-28

## Naming Patterns

**Files:**
- PascalCase for component files: `CollectionCard.tsx`, `WorkspaceSidebar.tsx`, `Button.tsx`
- camelCase for utility and library files: `app-store.ts`, `auth-storage.ts`, `dnd-types.ts`, `utils.ts`
- Prefix pattern for related utilities: `auth-manager.ts`, `auth-storage.ts` (grouped by domain)
- Descriptive names with hyphens for readability: `create-collection-dialog.tsx`, `delete-workspace-dialog.tsx`

**Functions:**
- camelCase for all functions
- Descriptive names indicating purpose: `resolveAccountId()`, `validateName()`, `computeOrderBetween()`
- Prefix convention for async operations and handlers: `loadCollections()`, `loadTabsByCollection()`, `handleRenameConfirm()`, `handleOpenAll()`
- Helper functions in utility files use simple camelCase: `cn()`, `compareByOrder()`, `toPascalCase()`

**Variables:**
- camelCase for all variables and state properties
- Prefix convention for state getters: `activeWorkspaceId`, `tabsByCollection`, `isLoading`, `isOver`
- Destructure state selectors from Zustand: `const renameCollection = useAppStore((s) => s.renameCollection)`
- Event handler parameters follow React convention: `changeInfo`, `tabId`, `collectionId`
- Temp/local variables use descriptive names: `validName`, `prevTabs`, `newMap`, `lastOrder`, `newOrder`

**Types:**
- PascalCase for interfaces and types: `AppState`, `CollectionCardProps`, `AddTabInlineProps`, `DragData`
- Suffix convention: `*Props` for component prop types: `WorkspaceItemProps`, `CollectionTabItemProps`, `DeleteCollectionDialogProps`
- Suffix convention: `*Data` for drag-drop data types: `WorkspaceDragData`, `LiveTabDragData`, `CollectionDropData`, `CollectionTabDragData`
- `type` keyword preferred over `interface` for unions and discriminated types (see `AuthState`)
- `interface` used for structural types and object shapes that may be extended
- Imported types use `type` imports: `import type { CollectionTab, TabCollection } from "@/lib/db"`

## Code Style

**Formatting:**
- Tool: Biome 2.4.9
- Indentation: 2 spaces
- Line width: 100 characters
- Quotes: Double quotes
- Trailing commas: All
- Semicolons: Always

**Linting:**
- Tool: Biome with recommended ruleset
- Notable rule override: `noNonNullAssertion` is off (allows `!` operator)
- Type checking: TypeScript strict mode enabled
- JSX output: react-jsx (automatic runtime)

**Code structure in components:**
```typescript
// Imports first
import { ExternalLink, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { CollectionTab } from "@/lib/db";
import { useAppStore } from "@/stores/app-store";

// Props interface
interface CollectionCardProps {
  collection: TabCollection;
  tabs: CollectionTab[];
  canDelete: boolean;
  onRequestDelete: () => void;
}

// Component definition
export function CollectionCard({
  collection,
  tabs,
  canDelete,
  onRequestDelete,
}: CollectionCardProps) {
  // Hooks
  const renameCollection = useAppStore((s) => s.renameCollection);
  const [isRenaming, setIsRenaming] = useState(false);

  // Helper functions (inline)
  function handleRenameConfirm() {
    if (collection.id != null && renameValue.trim()) {
      renameCollection(collection.id, renameValue);
    }
    setIsRenaming(false);
  }

  // JSX return
  return (
    // ...
  );
}
```

## Import Organization

**Order:**
1. External libraries (React, third-party UI, icons)
   - `import React from "react"`
   - `import { useState } from "react"`
   - `import { ExternalLink } from "lucide-react"`
   - `import { SortableContext } from "@dnd-kit/sortable"`
2. Type imports
   - `import type { CollectionTab } from "@/lib/db"`
3. Internal components and utilities
   - `import { Button } from "@/components/ui/button"`
   - `import { useAppStore } from "@/stores/app-store"`
   - `import { DRAG_TYPES } from "@/lib/dnd-types"`
4. Same-directory components
   - `import { CollectionTabItem } from "./collection-tab-item"`

**Path Aliases:**
- `@/*` resolves to `./src/*` (defined in `tsconfig.json`)
- Always use `@/` prefix for internal imports (components, lib, stores)
- Never use relative paths like `../lib/` or `./../../stores/`

## Error Handling

**Patterns:**
- Try-catch blocks wrap database and state mutations in Zustand actions
- Errors logged with context prefix: `console.error("[store] failed to rename workspace:", err)`
- Optimistic updates with rollback on error:
  ```typescript
  // Update state immediately
  set({ workspaces: workspaces.map(w => ({ ...w, name })) });

  try {
    await db.workspaces.update(id, { name });
  } catch (err) {
    console.error("[store] failed to rename workspace:", err);
    // Revert on failure
    set({ workspaces: workspaces.map(w => w.id === id ? prev : w) });
  }
  ```
- Validation functions return early with guard clauses:
  ```typescript
  function validateName(name: string): string | null {
    const trimmed = name.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.length > MAX_LENGTH) return trimmed.slice(0, MAX_LENGTH);
    return trimmed;
  }
  ```
- API errors handled at call site (see `app.ts` CORS setup)
- Missing required environment variables throw errors immediately: `throw new Error(`Missing required env var: ${name}`)`

## Logging

**Framework:** `console` object

**Patterns:**
- Only used in error scenarios within try-catch blocks
- Prefix with context scope: `[store]`, `[api]`, etc.
- Full error object passed: `console.error("[store] failed to...", err)`
- Informational logs in server startup: `console.log(`Server running at...`)`
- No debug or trace logging detected

## Comments

**When to Comment:**
- Inline comments used sparingly, only for non-obvious logic
- JSDoc/TSDoc not observed in codebase
- Explanation comments for workarounds (see `auth.test.ts`: `// better-auth returns null body when no valid session`)
- Section comments for grouped functionality (e.g., `// Live tabs`, `// Workspace CRUD`)

## Function Design

**Size:**
- Functions keep focused responsibility (single purpose)
- Zustand store actions typically 5-20 lines
- Helper functions 2-10 lines
- Component render functions kept under 100 lines by extracting sub-components

**Parameters:**
- Destructured props in component signatures
- Action parameters match database schema fields
- Optional parameters use nullish coalescing or optional chaining
- Rest parameters not used; explicit parameter lists preferred

**Return Values:**
- Async functions return `Promise<void>` for mutations (no return value needed)
- Validation functions return `string | null` (validated value or null)
- Computation functions return specific types: `string`, `number`, `Map<K, V>`
- Components export default as named exports: `export function CollectionCard()`

## Module Design

**Exports:**
- Named exports exclusively (no default exports)
- Components exported as `export function ComponentName()`
- Constants exported with `export const`
- Types exported with `export interface` or `export type`
- Utilities exported individually, not as namespace

**Barrel Files:**
- `components/ui/` has barrel pattern with shared UI exports
- Main `index.ts` in `@opentab/shared` re-exports types
- No barrel files observed in other directories
- Prefer explicit imports from source files

**Zustand Store Pattern:**
```typescript
interface AppState {
  // State
  workspaces: Workspace[];
  activeWorkspaceId: number | null;

  // Actions
  setActiveWorkspace: (id: number) => void;
  createWorkspace: (name: string, icon: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  workspaces: [],
  activeWorkspaceId: null,

  // Action implementations using set/get
  setActiveWorkspace: (id) => {
    set({ activeWorkspaceId: id });
  },
}));
```

## TypeScript Specific Patterns

**Strict Mode:** Enabled globally in `tsconfig.base.json`

**Type Safety:**
- Strict null checks require explicit `null` type unions: `activeWorkspaceId: number | null`
- Non-null assertions used cautiously with `!` operator (allowed by linter)
- Type guards used to narrow types: `(id): id is number => id != null`
- Generic type parameters for reusable functions:
  ```typescript
  async function loadTabsByCollection(
    collections: TabCollection[],
  ): Promise<Map<number, CollectionTab[]>>
  ```

**Branded Types:**
- Not used in codebase; simple type aliases preferred
- String orderings use plain strings: `order: string`

---

*Convention analysis: 2026-03-28*
