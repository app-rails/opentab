// Phase 0: only a minimal health probe remains. The sign-in helper was
// removed along with the legacy auth-manager; Phase 1's sync client
// reintroduces authenticated endpoints via @opentab/protocol.
const DEFAULT_BASE = "http://localhost:3001";

export async function checkHealth(baseUrl = DEFAULT_BASE): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}
