const API_BASE = "http://localhost:3001";

interface SignInAnonymousResponse {
  token: string;
  user: { id: string; isAnonymous: boolean };
}

export async function signInAnonymous(): Promise<SignInAnonymousResponse> {
  const res = await fetch(`${API_BASE}/api/auth/sign-in/anonymous`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    throw new Error(`Sign-in failed: ${res.status}`);
  }

  return res.json();
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}
