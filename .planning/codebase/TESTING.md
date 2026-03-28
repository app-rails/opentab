# Testing Patterns

**Analysis Date:** 2026-03-28

## Test Framework

**Runner:**
- Vitest 4.1.1 (`app-server`)
- Config: `app-server/vitest.config.ts`
- No testing framework detected for extension (`app-extension`)

**Assertion Library:**
- Vitest's built-in assertions (expect API)

**Run Commands:**
```bash
pnpm test                  # Run all tests (app-server only)
npm run test               # Run tests in app-server/
vitest run                 # Run tests once
vitest                     # Watch mode (if configured in config)
```

**Test Environment:**
- Environment variables configured in `vitest.config.ts`:
  - `BETTER_AUTH_SECRET`: `"test-secret-for-vitest"`
  - `BETTER_AUTH_URL`: `"http://localhost:3001"`
  - `TRUSTED_ORIGINS`: `"http://localhost:5173"`

## Test File Organization

**Location:**
- Co-located in `__tests__` subdirectory
- Test file location: `app-server/src/__tests__/auth.test.ts`
- Pattern: Source tests kept near related code in subdirectory

**Naming:**
- Pattern: `[feature].test.ts`
- Example: `auth.test.ts` for authentication tests

**Structure:**
```
app-server/src/
├── __tests__/
│   └── auth.test.ts
├── app.ts
├── auth.ts
├── env.ts
└── index.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it } from "vitest";
import { app } from "../app.js";

describe("anonymous auth", () => {
  it("POST /api/auth/sign-in/anonymous returns user and token", async () => {
    // Test implementation
  });

  it("GET /api/auth/get-session with Bearer token returns session", async () => {
    // Test implementation
  });
});
```

**Patterns:**
- `describe()` for logical grouping of related tests
- `it()` for individual test cases with descriptive names
- Test names use present tense: "returns user and token"
- One assertion scope per test (though multiple expect calls allowed)
- Tests are async to handle API calls

## Mocking

**Framework:** None detected

**Patterns:**
- No mocking library imports in existing tests
- Tests use actual Hono app instance: `import { app } from "../app.js"`
- HTTP testing done via app.request() API (Hono's built-in):
  ```typescript
  const res = await app.request("/api/auth/sign-in/anonymous", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  ```

**What to Mock:**
- Not determined from codebase (tests appear to use real dependencies)
- Database tests would need Dexie mocking (not yet written)

**What NOT to Mock:**
- HTTP layer (tests make actual requests via Hono)
- Authentication flow (real better-auth instance)

## Fixtures and Factories

**Test Data:**
- No dedicated fixture files observed
- Test data created inline:
  ```typescript
  body: JSON.stringify({}),  // Empty payload for sign-in
  headers: { "Content-Type": "application/json" },
  ```

**Location:**
- Not applicable yet; would live in `app-server/src/__tests__/fixtures/` if needed

## Coverage

**Requirements:** None enforced

**View Coverage:**
```bash
vitest run --coverage  # If coverage plugin configured (not detected)
```

**Current State:**
- Only backend (`app-server`) has tests
- Frontend extension (`app-extension`) has zero test files
- Shared package (`@opentab/shared`) has no tests

## Test Types

**Unit Tests:**
- Not explicitly separated; integration tests below are closest
- Would test individual functions in isolation
- Example targets: `validateName()`, `computeOrderBetween()` in utils

**Integration Tests:**
- Observed pattern: End-to-end API tests
- Test full request/response cycle
- Example: `auth.test.ts` tests sign-in flow with session retrieval
- Uses real HTTP layer (Hono's request API)
- No database layer mocking (uses real database if app initializes it)

**E2E Tests:**
- Not implemented
- Would benefit extension (`app-extension`): browser automation for drag-drop, UI interactions

## Common Patterns

**Async Testing:**
```typescript
it("GET /api/auth/get-session with Bearer token returns session", async () => {
  const signInRes = await app.request("/api/auth/sign-in/anonymous", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  const signInBody = await signInRes.json();
  const token = signInRes.headers.get("set-auth-token") ?? signInBody.token;

  const sessionRes = await app.request("/api/auth/get-session", {
    headers: { Authorization: `Bearer ${token}` },
  });

  expect(sessionRes.ok).toBe(true);
  const sessionBody = await sessionRes.json();
  expect(sessionBody.user).toBeDefined();
});
```

**Response Assertions:**
- Check HTTP status: `expect(res.ok).toBe(true)`
- Parse JSON: `const body = await res.json()`
- Validate response structure:
  ```typescript
  expect(body.user).toBeDefined();
  expect(body.user.id).toBeTypeOf("string");
  expect(body.user.isAnonymous).toBe(true);
  expect(body.token).toBeTypeOf("string");
  ```

**Error Testing:**
```typescript
it("GET /api/auth/get-session without token returns no session", async () => {
  const res = await app.request("/api/auth/get-session");
  const body = await res.json();
  // better-auth returns null body when no valid session
  expect(body === null || body?.session === null).toBe(true);
});
```

**State Flow Testing:**
- Tests verify data flow through async operations
- Token extracted from response headers and reused in subsequent requests
- State transitions tested implicitly (sign-in → get-session)

## Test Organization by Responsibility

**Backend (`app-server`):**
- Testing entry: `app-server/src/__tests__/auth.test.ts`
- Focuses on HTTP endpoints and authentication flow
- Database state tested implicitly through response data
- Config: `app-server/vitest.config.ts`

**Extension (`app-extension`):**
- No tests currently implemented
- Candidates for testing:
  - Zustand store actions: `createWorkspace()`, `addTabToCollection()`, etc.
  - Drag-drop logic and reordering
  - Component interactions and state changes
  - Dexie database queries

**Shared (`@opentab/shared`):**
- Minimal code (only types)
- No tests needed

## Setup and Teardown

**Setup:**
- Environment variables configured via `vitest.config.ts`
- No explicit beforeEach/afterEach hooks observed
- Each test starts with fresh app instance

**Teardown:**
- No cleanup detected; tests appear stateless
- Database transactions in app-store likely provide isolation

## Running Tests

**Full Test Suite:**
```bash
pnpm test                # From root (runs turbo test)
npm run test             # From app-server/
```

**Watch Mode:**
Not configured in current setup; would require:
```bash
vitest --watch
```

**Specific Tests:**
```bash
vitest run auth.test.ts
vitest run --grep "Bearer token"
```

---

*Testing analysis: 2026-03-28*
