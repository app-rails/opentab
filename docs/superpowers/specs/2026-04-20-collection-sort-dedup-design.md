# Collection Sort & Dedup — Design

**Date:** 2026-04-20
**Branch:** `feat/collection-sort-dedup`
**Owner:** zhaolion

## Goal

Let users tidy up a single collection's tabs with two one-shot operations:

1. **Sort** — rearrange the current tabs by a chosen key and direction. Future tabs still append to the end (no persistent sort mode).
2. **Dedupe** — remove tabs whose URL is an exact duplicate of an earlier tab in the same collection, keeping the oldest.

These are per-collection actions triggered from the collection card header. No cross-collection behavior.

## Non-Goals (YAGNI)

- Persistent sort mode (sort rule stored on collection; new tabs auto-insert)
- URL normalization for dedup (strip fragments / UTM / trailing slash)
- Undo for dedup (consistent with existing delete behavior; may revisit later)
- Domain descending (A→Z is sufficient)
- Sort across multiple collections / whole workspace
- Default/remembered sort per collection

## User Experience

### Toolbar Placement

Two new icon buttons live in the collection-card header, on the hover-visible action row, grouped with vertical separators:

```
[grip] Collection name  ▶  ...  [+ tab] [open all] | [sort] [dedupe] | [move] [delete] [⋮]
```

Separators make the three groups semantically distinct: **content entry** / **content maintenance** / **collection lifecycle**.

Both new buttons are disabled when the collection has fewer than 2 tabs (nothing to sort, nothing to dedupe).

### Sort Dropdown

Clicking the Sort icon opens a dropdown menu:

- **Sort tabs by** (radio group, single select):
  - Title
  - Domain
  - Date added
- **Order** segmented control: `Asc` / `Desc`
- **Apply sort** button — applies and closes the dropdown.
- Below a divider: **Reverse current order** — independent one-click action, does not read the radio selection.

Radios and the direction toggle do NOT trigger sorting on change — only the explicit `Apply sort` button does. This avoids applying a sort by accident while browsing options.

Dropdown closes on: click outside, `Esc`, `Apply sort`, or `Reverse current order`.

Default state when opened: last selected key/direction is not remembered — always resets to `Title` + `Asc`. (Matches "one-time" semantics; nothing persisted.)

### Dedupe Confirm Dialog

Clicking the Dedupe icon first computes duplicates.

**If duplicates found:** open a Radix Dialog.

- Title: `Remove duplicate tabs`
- Description: `Keeping the earliest copy of each URL.`
- Summary banner: `Will remove N tabs across M URLs`
- Scrollable list: each duplicated URL shown with favicon, URL (truncated), and count badge `N → 1`
- Actions: `Cancel` (secondary) / `Remove N tabs` (danger)

Must follow project conventions:
- Include a `DialogDescription` inside `DialogContent`
- Use `onCloseAutoFocus` with a ref to prevent focus returning to the trigger button

**If no duplicates found:** skip the dialog, show a toast `No duplicates found — all tabs in this collection are unique.`

## Data Model

**No schema changes.** Keep using `CollectionTab.order: string` with fractional indexing.

Existing fields used:
- `url`, `title`, `createdAt` — sort keys and dedup grouping key
- `order` — rewritten by sort
- `deletedAt` — set by dedup (soft delete)
- `updatedAt`, `lastOpId`, `syncId` — updated per mutation for LWW sync

## Store Actions

Two new actions on the Zustand app store (`apps/extension/src/stores/app-store.ts`), both wrapped with the existing `mutateWithOutbox()` helper so sync ops are staged inside the same transaction.

### `sortCollectionTabs(collectionId, key, direction)`

Signature:

```ts
type SortKey = "title" | "domain" | "dateAdded" | "reverse";
type SortDirection = "asc" | "desc";

sortCollectionTabs(
  collectionId: number,
  key: SortKey,
  direction: SortDirection, // ignored when key === "reverse"
): Promise<void>;
```

Algorithm:

1. Load live tabs (`deletedAt == null`) for the collection from the store's `tabsByCollection` map.
2. Compute the target ordering:
   - `title` — `(a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true })`; empty titles sort last.
   - `domain` — hostname via `new URL(url).hostname.toLowerCase()`; invalid URLs sort last. Direction applied after grouping.
   - `dateAdded` — numeric compare on `createdAt`.
   - `reverse` — take current order array, reverse it.
3. Apply `direction` (multiply compare result by `-1` when `desc`). `reverse` ignores direction.
4. Generate fresh fractional-indexing keys spaced out along the full range: iterate and call `generateKeyBetween(prevKey, null)` so each tab gets a new monotonically-increasing `order`.
5. One DB transaction: `db.collectionTabs.bulkPut()` with updated rows (new `order`, bumped `updatedAt`, new `lastOpId`).
6. Stage N `update` SyncOps (one per tab) via `mutateWithOutbox`, each carrying the new `order`.
7. Update in-memory `tabsByCollection` map.

Notes:
- The sort is stable for tabs with equal keys — preserve their current relative order as tiebreaker so the outcome is deterministic.
- Reverse is a first-class branch because it doesn't depend on any key and should cost exactly one pass.

### `dedupeCollectionTabs(collectionId)`

Signature:

```ts
type DedupeResult = {
  removedCount: number;           // total tabs soft-deleted
  affectedUrls: Array<{
    url: string;
    favIconUrl?: string;          // favicon of the kept tab
    originalCount: number;        // e.g. 3
    keptTabId: number;            // id of the one that stays (earliest createdAt)
  }>;
};

dedupeCollectionTabs(collectionId: number): Promise<DedupeResult>;
```

Algorithm:

1. Load live tabs for the collection.
2. Group by exact `url` (case-sensitive string equality — matches current `addTabToCollection` check).
3. For each group with size > 1: sort by `createdAt` ascending, keep the first, mark the rest for deletion.
4. Build the `DedupeResult` preview **first** (pure computation, no writes) so the UI can show the dialog.
5. The component, after user confirms, calls a follow-up action (or the same action with a `confirmed: true` flag) that actually performs the soft-delete:
   - One DB transaction: `db.collectionTabs.bulkUpdate()` to set `deletedAt`, bump `updatedAt`, new `lastOpId`.
   - Stage M `delete` SyncOps via `mutateWithOutbox`.
   - Update in-memory map.

**Preferred shape:** split into two exported helpers to keep the dry-run pure:

```ts
computeCollectionDuplicates(collectionId: number): DedupeResult;   // pure, synchronous
applyCollectionDedup(collectionId: number, result: DedupeResult): Promise<void>;
```

The dialog component calls `computeCollectionDuplicates` on click, decides whether to open the dialog or show a toast, and on confirm calls `applyCollectionDedup`.

## Sync Behavior

Uses the existing outbox pattern — no changes needed.

- Sort: one `update` SyncOp per tab (N ops, one collection). All staged inside the same DB transaction by `mutateWithOutbox`. Background sync engine pushes in batches of 10.
- Dedupe: one `delete` SyncOp per removed tab. Same transactional staging.
- Conflict resolution: LWW via `lastOpId` + `updatedAt` on pull, identical to existing reorder / remove flows.

Reason not to batch into a single custom op: the server doesn't currently know about bulk ops for tabs, and adding that would be a second cross-cutting change. The per-tab op count is acceptable — typical collections are tens of tabs.

## Components Changed or Added

- `apps/extension/src/components/collection/collection-card.tsx` — add two icon buttons with separators; wire to dropdown + dialog. Enforce `< 2 tabs` disabled state.
- `apps/extension/src/components/collection/collection-sort-menu.tsx` (new) — the Sort dropdown (radio group + segment + Apply + Reverse).
- `apps/extension/src/components/collection/dedup-confirm-dialog.tsx` (new) — Radix Dialog with the preview list and counts. Must include `DialogDescription` and `onCloseAutoFocus`.
- `apps/extension/src/stores/app-store.ts` — new actions `sortCollectionTabs`, `computeCollectionDuplicates`, `applyCollectionDedup`.
- `apps/extension/src/lib/collection-sort.ts` (new) — pure sort comparators and the fractional-order regenerator, unit-testable in isolation.
- `apps/extension/src/lib/collection-dedup.ts` (new) — pure `computeCollectionDuplicates` grouping logic.
- `apps/extension/src/locales/{en,zh}.json` — new strings under `collection_card.*` for sort/dedupe buttons, dropdown labels, dialog strings, toast.

Keeping the pure logic (`collection-sort.ts`, `collection-dedup.ts`) out of the store makes them trivially unit-testable without Dexie or Zustand.

## Edge Cases

| Case | Behavior |
|---|---|
| Collection has 0 or 1 tab | Both buttons disabled |
| Tab has empty title | Sort-by-title places it at the end |
| Tab URL is not parseable | Sort-by-domain places it at the end |
| Two tabs have identical key (e.g. same title) | Stable sort preserves current relative order |
| Dedupe finds no duplicates | Toast only, no dialog |
| User opens dropdown then clicks outside | Menu closes, nothing applied |
| Sort applied while drag is in progress | Not possible — buttons are in same hover row; the DnD overlay blocks this interaction naturally |
| Sync in progress when sort applied | Outbox staging is transactional with DB write; conflicts resolved by LWW on next pull |

## Testing

### Unit (vitest in `apps/extension`)

- `collection-sort.test.ts`
  - Each key × direction produces expected order on a fixture of ~8 tabs
  - Empty/invalid values sort to end, never throw
  - `reverse` inverts current order regardless of values
  - `generateKeyBetween` chain produces strictly increasing keys
  - Stable for equal keys
- `collection-dedup.test.ts`
  - Groups by exact URL, keeps earliest `createdAt`
  - Handles no duplicates (empty result)
  - Handles all tabs duplicates of one URL (keep 1, remove N-1)
  - Returns `keptTabId` matching the oldest tab

### Integration

- Store action tests: call `sortCollectionTabs` on a seeded Dexie and assert:
  - Live tabs reordered as expected
  - N `update` SyncOps staged with `status = pending`
  - `tabsByCollection` map updated
- Store action tests: `applyCollectionDedup` soft-deletes the right tabs, stages delete ops, doesn't touch the kept tab.

### Manual

- Load extension unpacked, seed a collection with known duplicates and varied titles/dates
- Exercise each sort key + both directions + reverse; confirm tab order matches expectation and the browser reflects it after refresh
- Dedup with duplicates: dialog shows correct counts; confirming removes correct tabs; "no duplicates" toast fires otherwise
- Verify `< 2 tab` disabled states
- Verify keyboard: Esc closes dropdown & dialog; focus does not leak back to trigger (onCloseAutoFocus)

## Open Questions — None

All decisions captured in the brainstorming session:
- Toolbar placement: grouped with separators (C)
- Sort UI: grouped + direction toggle (B)
- Sort semantics: one-time, new tabs append
- Dedup comparison: exact URL match
- Dedup keep policy: keep earliest
- Dedup confirm: preview list with per-URL counts (B)
- No undo for now (consistent with rest of the app)
