import { describe, it, expect } from "vitest";
import { app } from "../app.js";

describe("anonymous auth", () => {
  it("POST /api/auth/sign-in/anonymous returns user and token", async () => {
    const res = await app.request("/api/auth/sign-in/anonymous", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.ok).toBe(true);

    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.id).toBeTypeOf("string");
    expect(body.user.isAnonymous).toBe(true);
    expect(body.token).toBeTypeOf("string");
  });

  it("GET /api/auth/get-session with Bearer token returns session", async () => {
    const signInRes = await app.request("/api/auth/sign-in/anonymous", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const signInBody = await signInRes.json();
    // bearer plugin exposes token in set-auth-token header and body.token
    const token = signInRes.headers.get("set-auth-token") ?? signInBody.token;

    const sessionRes = await app.request("/api/auth/get-session", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(sessionRes.ok).toBe(true);

    const sessionBody = await sessionRes.json();
    expect(sessionBody.user).toBeDefined();
    expect(sessionBody.session).toBeDefined();
  });

  it("GET /api/auth/get-session without token returns no session", async () => {
    const res = await app.request("/api/auth/get-session");
    const body = await res.json();
    // better-auth returns null body when no valid session
    expect(body === null || body?.session === null).toBe(true);
  });
});
