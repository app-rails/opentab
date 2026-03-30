const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3001";

interface SignInAnonymousResponse {
  token: string;
  user: { id: string; isAnonymous: boolean };
}

export async function signInAnonymous(baseUrl?: string): Promise<SignInAnonymousResponse> {
  const base = baseUrl ?? API_BASE;
  const res = await fetch(`${base}/api/auth/sign-in/anonymous`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    throw new Error(`Sign-in failed: ${res.status}`);
  }

  return res.json();
}

export async function checkHealth(baseUrl?: string): Promise<boolean> {
  try {
    const base = baseUrl ?? API_BASE;
    const res = await fetch(`${base}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}
