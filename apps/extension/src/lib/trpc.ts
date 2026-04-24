// Phase 0 stub — Phase 1 replaces this with a protocol-typed sync client.
// The return type is intentionally `any` so existing sync-engine call sites
// still type-check; at runtime the stub throws before any method is invoked.

// biome-ignore lint/suspicious/noExplicitAny: Phase 0 stub; typed client arrives in Phase 1.
export async function getExtensionTRPCClient(): Promise<any> {
  throw new Error(
    "Sync client not available in Phase 0. See docs/superpowers/specs/2026-04-24-apps-cloud-design.md",
  );
}
