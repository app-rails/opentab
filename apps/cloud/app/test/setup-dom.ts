import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest config does not enable globals, so React Testing Library's
// implicit `afterEach(cleanup)` (which runs when globals are on) never
// fires. Wire it up explicitly so each test starts with a fresh DOM.
afterEach(() => {
  cleanup();
});
