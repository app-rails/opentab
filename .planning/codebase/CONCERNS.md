# Codebase Concerns

**Analysis Date:** 2026-03-28

## Tech Debt

**Monolithic Store State Machine:**
- Issue: `app-store.ts` contains 446 lines with all CRUD operations for workspaces, collections, and tabs in a single file. Store manages complex state transitions with interdependent mutations.
- Files: `app-extension/src/stores/app-store.ts`
- Impact: Difficult to test individual mutations, high cognitive load for adding new features, risk of inconsistent state if mutations don't coordinate properly
- Fix approach: Extract domain-specific stores (WorkspaceStore, CollectionStore, TabStore) using Zustand composition, or implement command pattern for mutations with validation

**Silent Failures in Background Service Worker:**
- Issue: `chrome.runtime.sendMessage()` calls in background.ts catch all errors silently with empty `.catch(() => {})` handlers
- Files: `app-extension/src/entrypoints/background.ts` (lines 48, 53-54, 59-61)
- Impact: Tab creation/update/removal messages can silently fail without alerting UI; UI state becomes out of sync with actual browser tabs
- Fix approach: Log errors in catch blocks, implement retry mechanism, or add message ACK pattern to confirm delivery

**Empty Error Handlers Throughout:**
- Issue: Multiple `.catch(() => {})` patterns swallow errors silently instead of logging or handling them
- Files: `app-extension/src/entrypoints/background.ts` (3 instances)
- Impact: Makes debugging production issues impossible, breaks observability
- Fix approach: Replace all empty catch handlers with `catch(err => console.error(...))` at minimum; implement proper error boundary and recovery

**Uncontrolled Async Initialization:**
- Issue: Store initialization in `App.tsx` happens async without guaranteeing completion before rendering. `isLoading` flag can cause race conditions if state updates occur during initialization.
- Files: `app-extension/src/entrypoints/tabs/App.tsx` (lines 43-50)
- Impact: Components may render with stale data; drag operations on collections that haven't loaded yet can fail
- Fix approach: Wrap initialization in a loading boundary that prevents interaction until `isLoading === false`

**No Error Boundary for State Persistence:**
- Issue: Store mutations catch errors but continue silently with rollback logic. If rollback fails, state becomes corrupted without UI feedback.
- Files: `app-extension/src/stores/app-store.ts` (renameWorkspace, changeWorkspaceIcon, deleteWorkspace, etc.)
- Impact: User thinks action succeeded but database operation failed; data loss on multiple error scenarios
- Fix approach: Implement proper error boundaries with user-facing toast notifications; add retry queue for failed mutations

## Known Bugs

**Off-by-One in DND ID Matching:**
- Symptoms: Dragging collection tabs may target wrong tab if IDs change during drag operation
- Files: `app-extension/src/entrypoints/tabs/App.tsx` (lines 130-131)
- Trigger: Drag a tab, then rapidly delete/create same collection during drag
- Workaround: Complete drag operation before modifying collection structure; restart drag if collection changes

**Missing Tab ID Validation:**
- Symptoms: Chrome tabs without `id` property are added to liveTabs, causing key warnings and missed updates
- Files: `app-extension/src/components/layout/live-tab-panel.tsx` (line 14)
- Trigger: Devtools tabs or other special tabs from Chrome API
- Workaround: Filter out tabs where `tab.id` is falsy before rendering

**Favicon Fallback to Google:**
- Symptoms: All URLs with Google's favicon service may fail if Google blocks requests; extension shows broken images
- Files: `app-extension/src/components/collection/collection-card.tsx` (line 69)
- Trigger: Large number of unique domain URLs or requests blocked by CSP
- Workaround: Pre-cache favicons on add, use local favicon service as fallback

## Security Considerations

**Session Token Stored in Clear Text:**
- Risk: JWT/Bearer token stored in `browser.storage.local` without encryption
- Files: `app-extension/src/lib/auth-storage.ts` (line 11)
- Current mitigation: Browser storage is isolated per extension, HTTPS enforced in manifest
- Recommendations: Use `browser.storage.session` for tokens (cleared on extension reload); implement token refresh pattern; add pinning for API certificate

**Anonymous Account Creation Without Rate Limiting:**
- Risk: Client can create unlimited anonymous accounts via `signInAnonymous()` with no server-side rate limit
- Files: `app-extension/src/lib/auth-manager.ts` (lines 7-16), `app-server/src/auth.ts`
- Current mitigation: Better-auth plugin used but configuration not reviewed
- Recommendations: Implement per-extension rate limiting; add CORS origin validation on server; log account creation patterns

**Hardcoded API Base with Fallback:**
- Risk: `VITE_API_BASE` defaults to `http://localhost:3001` if env var missing; can cause dev config to leak to production
- Files: `app-extension/src/lib/api.ts` (line 1)
- Current mitigation: Vite environment variables should fail if not defined
- Recommendations: Change default to throw on undefined; use feature flag for localhost testing; add CSP headers

**CORS Configuration Accepts Any Origin with No Validation:**
- Risk: Server returns requested origin if it matches `TRUSTED_ORIGINS`, but parsing can be bypassed
- Files: `app-server/src/app.ts` (lines 12-16)
- Current mitigation: Whitelist check is enforced
- Recommendations: Use `new URL()` to validate origins; block subdomains unless explicitly whitelisted; log suspicious origins

**Unvalidated URLs in Drag-Drop:**
- Risk: `addTabToCollection()` accepts arbitrary URLs without validation; could store malicious URLs
- Files: `app-extension/src/entrypoints/tabs/App.tsx` (line 112), `app-extension/src/components/collection/collection-card.tsx` (line 66-70)
- Current mitigation: Chrome tabs API restricts what URLs can be created
- Recommendations: Validate URL scheme (block `javascript:`, `data:`, `about:`); reject URLs with XSS payloads in title

## Performance Bottlenecks

**N+1 Query Pattern on Workspace Switch:**
- Problem: `setActiveWorkspace()` loads collections, then separately loads tabs for each collection in parallel
- Files: `app-extension/src/stores/app-store.ts` (lines 132-143)
- Cause: `loadTabsByCollection()` makes separate async call per collection ID
- Improvement path: Batch query tabs by collection IDs in single Dexie query; prefetch in background

**Missing Indexes on Tab Queries:**
- Problem: `useDroppable` and drag handlers query tabs repeatedly during drag; no indexes on compound queries
- Files: `app-extension/src/stores/app-store.ts` (line 128 in handler), `app-extension/src/lib/db.ts` (lines 54-56)
- Cause: Database schema has indexes but they may not be used optimally for filtered queries
- Improvement path: Add composite index on `[collectionId+id]` for faster lookups; cache query results during drag

**Fractional Indexing Recalculation:**
- Problem: Every reorder operation recalculates all order keys; doesn't batch operations
- Files: `app-extension/src/stores/app-store.ts` (reorder functions)
- Cause: Each mutation calls `generateKeyBetween()` once instead of batch-generating
- Improvement path: Implement batch reorder that generates all keys in one pass; cache order index

**Full Array Sort on Every Mutation:**
- Problem: `sort(compareByOrder)` called on entire collection after each single update
- Files: `app-extension/src/stores/app-store.ts` (lines 274, 365, 431)
- Cause: Could use insertion sort or maintain order via data structure
- Improvement path: Use insertion-based updates instead of mutate-then-sort; consider LinkedList for ordered data

**Unoptimized Live Tab Sync:**
- Problem: `chrome.tabs.query()` fetches all tabs for current window every time component mounts
- Files: `app-extension/src/hooks/use-live-tab-sync.ts` (line 17)
- Cause: No caching; called on every useEffect without proper dependencies
- Improvement path: Cache query result; only sync on explicit user action or message event

## Fragile Areas

**Drag-and-Drop ID Encoding:**
- Files: `app-extension/src/entrypoints/tabs/App.tsx` (line 130: `col-tab-${t.id}`)
- Why fragile: ID matching relies on string prefix pattern; if ID generation changes, matching breaks silently
- Safe modification: Create constants for ID formats; use typed ID helpers instead of string interpolation
- Test coverage: No tests for drag-drop logic; only one test file in entire codebase

**Database Schema Migrations:**
- Files: `app-extension/src/lib/db.ts` (version 2 migration, lines 60-117)
- Why fragile: V2 migration depends on manual order recalculation; if `generateKeyBetween` API changes, migration fails
- Safe modification: Test migration path explicitly; add rollback checks; version migration code separately
- Test coverage: No migration tests; only tested via background.ts `seedDefaultData()` call

**Chrome API Message Broadcasting:**
- Files: `app-extension/src/entrypoints/background.ts` (lines 47-62)
- Why fragile: Relies on message type constants matching across background and popup/tabs; typo breaks communication
- Safe modification: Use TypeScript unions for message types; validate message structure at receiver
- Test coverage: No tests for message passing; manual testing only

**Optimistic Update Rollback:**
- Files: `app-extension/src/stores/app-store.ts` (all CRUD operations)
- Why fragile: Rollback saves previous state but doesn't handle case where DB mutation partially succeeds
- Safe modification: Use transaction-based approach; implement proper error recovery with conflict resolution
- Test coverage: No unit tests for rollback scenarios; only one auth test file

**Collection Name "Unsorted" Special Handling:**
- Files: `app-extension/src/stores/app-store.ts` (line 337), `app-extension/src/components/layout/collection-panel.tsx` (line 37)
- Why fragile: Magic string comparison; if name changes or is localized, delete protection breaks
- Safe modification: Use enum or constant for special collection types; don't rely on names
- Test coverage: No tests for special collection handling

## Scaling Limits

**Single Workspace Loading:**
- Current capacity: Works with ~1000 tabs per collection before UI lag (estimated)
- Limit: `tabsByCollection` Map loaded entirely into memory; no pagination or virtual scrolling
- Scaling path: Implement virtual scrolling for collections with 100+ tabs; lazy-load tab details; use IndexedDB query pagination

**Fractional Indexing Key Collisions:**
- Current capacity: Can handle ~1000 inserts per collection before key generation space exhausted
- Limit: Very long collision chains reduce performance of `generateKeyBetween()` with many items
- Scaling path: Monitor key length; implement periodic reindexing when average key length exceeds threshold

**Browser Storage Limits:**
- Current capacity: Most browsers allow 5-10MB per extension
- Limit: IndexedDB quota can be exceeded with large favicons or URL metadata
- Scaling path: Implement quota checks before adding tabs; clean up old entries; stream favicons

**Concurrent Drag Operations:**
- Current capacity: Single active drag only (by design)
- Limit: If multiple drags attempted (cross-window or via script), state becomes inconsistent
- Scaling path: Add explicit drag lock; queue pending operations; implement undo queue

## Dependencies at Risk

**Better-auth Version Lock:**
- Risk: `better-auth` used as auth backend but version not pinned in `app-server/package.json`
- Impact: Breaking changes to anonymous plugin or bearer plugin API not caught
- Migration plan: Pin to specific version; set up automated security scanning; add tests for auth surface

**Fractional-indexing Edge Cases:**
- Risk: `generateKeyBetween()` behavior may change with edge cases (very long keys, null handling)
- Impact: Reordering logic depends on specific version; different builds may have different ordering
- Migration plan: Add tests for `generateKeyBetween()` with known edge cases; consider alternative ordering library

**Dexie V3+ Migration:**
- Risk: IndexedDB API changes; Dexie v3+ may have breaking changes
- Impact: Database schema queries rely on Dexie API; major version upgrade could break queries
- Migration plan: Pin Dexie version; test upgrade path with dummy migration; add integration tests for DB ops

## Missing Critical Features

**No Sync Across Devices:**
- Problem: Collections stored only locally in IndexedDB; no backend persistence or sync
- Blocks: Can't recover data if extension is uninstalled; can't access collections from other browsers
- Priority: Medium (affects user retention, but offline-first design intentional)

**No Undo/Redo:**
- Problem: No undo queue or transaction history
- Blocks: Users can't recover from accidental deletion of collections/tabs
- Priority: High (data loss is critical)

**No Import/Export:**
- Problem: Collections can't be exported to JSON or imported from other sources
- Blocks: Data portability, backup, sharing collections
- Priority: Medium

**No Search Within Collections:**
- Problem: No way to find tabs by title or URL within a collection
- Blocks: Large collections become unusable
- Priority: Medium

**No Conflict Resolution for Auth State:**
- Problem: If offline mode switches to online while sync is in progress, state can diverge
- Blocks: Data loss or duplication if account data exists on server
- Priority: High (security and data integrity concern)

## Test Coverage Gaps

**Store Mutations (No Tests):**
- What's not tested: All 20+ store mutation functions (createWorkspace, addTabToCollection, etc.)
- Files: `app-extension/src/stores/app-store.ts`
- Risk: Store is core to app; any bug breaks entire UI; no regression detection
- Priority: High

**Drag-and-Drop Logic (No Tests):**
- What's not tested: `handleDragStart`, `handleDragEnd`, collision detection, ID matching
- Files: `app-extension/src/entrypoints/tabs/App.tsx` (lines 59-136)
- Risk: Drag operations can silently fail or target wrong drop zone
- Priority: High

**Database Migrations (No Tests):**
- What's not tested: V2 migration path; whether existing data migrates correctly
- Files: `app-extension/src/lib/db.ts` (lines 60-117)
- Risk: Users with old DBs upgrading extension may lose data
- Priority: High

**Chrome Message Passing (No Tests):**
- What's not tested: Message routing between background and UI contexts
- Files: `app-extension/src/entrypoints/background.ts`, `app-extension/src/hooks/use-live-tab-sync.ts`
- Risk: Tab events can be lost or misrouted; UI state falls out of sync
- Priority: High

**Auth State Machine (Partial Tests):**
- What's not tested: Offline → online transition; token expiration; race conditions during init
- Files: `app-extension/src/lib/auth-manager.ts`
- Risk: Users stuck in offline mode; token refresh failures not detected
- Priority: Medium

**Error Scenarios (No Tests):**
- What's not tested: DB transaction failures, network errors, malformed data
- Files: All store mutations with try-catch blocks
- Risk: Silent failures and corrupted state not caught
- Priority: High

**Integration Tests (None):**
- What's not tested: End-to-end flows (create workspace → add tab → reorder → sync)
- Files: All integration points
- Risk: Subtle bugs in interactions between layers not caught
- Priority: Medium

---

*Concerns audit: 2026-03-28*
