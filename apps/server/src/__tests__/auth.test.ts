import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";

let app: Awaited<ReturnType<typeof createApp>>;
beforeAll(async () => {
  app = await createApp();
});

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
    expect(body === null || body?.session === null).toBe(true);
  });

  it("GET /api/health returns ok", async () => {
    const res = await app.request("/api/health");
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeTypeOf("number");
  });

  it("GET /trpc/health.check returns ok via tRPC", async () => {
    const res = await app.request("/trpc/health.check");
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.result.data.status).toBe("ok");
  });
});
