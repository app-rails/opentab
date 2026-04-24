import { beforeEach, describe, expect, it, vi } from "vitest";
import { requiredAuthContext } from "~/middlewares/auth";

const { createExchangeMock } = vi.hoisted(() => ({ createExchangeMock: vi.fn() }));
vi.mock("~/services/extension-setup.server", () => ({
  createExchange: createExchangeMock,
}));

import { action, loader } from "../extension";

type LoaderArgs = Parameters<typeof loader>[0];
type ActionArgs = Parameters<typeof action>[0];

const SESSION = {
  user: {
    id: "user-a",
    email: "alice@example.com",
    name: "Alice",
    role: "user",
  },
  session: {
    userId: "user-a",
    token: "t",
    expiresAt: new Date(),
    ipAddress: null,
    userAgent: null,
  },
} as unknown as Parameters<typeof requiredAuthContext.defaultValue extends never ? never : never>;

function makeKv() {
  const store: Record<string, string> = {};
  return {
    get: async (key: string) => {
      const raw = store[key];
      return raw ? JSON.parse(raw) : null;
    },
    put: async (key: string, value: string) => {
      store[key] = value;
    },
  };
}

function makeContext() {
  // Minimal RouterContextProvider impl: a map of contexts. The real impl
  // exposes `get(ctx)` — we replicate it with a Map-backed stub.
  const store = new Map<unknown, unknown>();
  store.set(requiredAuthContext, SESSION);
  return {
    get: ((ctx: unknown) => store.get(ctx)) as <T>(ctx: unknown) => T,
    set: ((ctx: unknown, value: unknown) => {
      store.set(ctx, value);
    }) as <T>(ctx: unknown, value: T) => void,
    cloudflare: {
      env: { APP_KV: makeKv(), APP_ENV: "development" } as unknown as Env,
      ctx: {} as ExecutionContext,
    },
  } as unknown as LoaderArgs["context"];
}

function callLoader(request: Request, context: LoaderArgs["context"]) {
  return loader({ request, context, params: {} } as unknown as LoaderArgs);
}
function callAction(request: Request, context: ActionArgs["context"]) {
  return action({ request, context, params: {} } as unknown as ActionArgs);
}

describe("/connect/extension loader", () => {
  it("returns the query params + the authed user from the session context", async () => {
    const url =
      "http://localhost/connect/extension" +
      "?nonce=n1" +
      "&callback_url=chrome-extension%3A%2F%2Fabc%2Fcb" +
      "&device_name=Laptop" +
      "&platform=chromium" +
      "&extension_version=0.2.0";

    const data = (await callLoader(new Request(url), makeContext())) as {
      nonce: string;
      callbackUrl: string;
      deviceName: string;
      user: { email: string };
    };
    expect(data.nonce).toBe("n1");
    expect(data.callbackUrl).toBe("chrome-extension://abc/cb");
    expect(data.deviceName).toBe("Laptop");
    expect(data.user.email).toBe("alice@example.com");
  });

  it("throws 400 when nonce or callback_url are missing", async () => {
    const url = "http://localhost/connect/extension?nonce=n1"; // missing callback_url
    try {
      await callLoader(new Request(url), makeContext());
      throw new Error("should have thrown");
    } catch (e) {
      const res = e as Response;
      expect(res.status).toBe(400);
    }
  });
});

describe("/connect/extension action — approve", () => {
  beforeEach(() => createExchangeMock.mockReset());

  it("calls createExchange and 302s to the returned redirectUrl", async () => {
    createExchangeMock.mockResolvedValue({
      exchangeCode: "code-x",
      redirectUrl: "chrome-extension://abc/cb?exchange_code=code-x&nonce=n1",
    });

    const form = new FormData();
    form.set("decision", "approve");
    form.set("nonce", "n1");
    form.set("callback_url", "chrome-extension://abc/cb");
    form.set("device_name", "Laptop");
    form.set("platform", "chromium");
    form.set("extension_version", "0.2.0");

    const request = new Request("http://localhost/connect/extension", {
      method: "POST",
      body: form,
    });

    const res = (await callAction(request, makeContext())) as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "chrome-extension://abc/cb?exchange_code=code-x&nonce=n1",
    );

    expect(createExchangeMock).toHaveBeenCalledWith(
      { userId: "user-a" },
      expect.objectContaining({
        nonce: "n1",
        callbackUrl: "chrome-extension://abc/cb",
        deviceName: "Laptop",
      }),
      expect.objectContaining({ APP_ENV: "development" }),
    );
  });
});

describe("/connect/extension action — cancel", () => {
  beforeEach(() => createExchangeMock.mockReset());

  it("302s back to callback_url with error=access_denied and does not mint an exchange", async () => {
    const form = new FormData();
    form.set("decision", "cancel");
    form.set("nonce", "n1");
    form.set("callback_url", "chrome-extension://abc/cb");
    form.set("device_name", "Laptop");
    form.set("platform", "chromium");
    form.set("extension_version", "0.2.0");

    const request = new Request("http://localhost/connect/extension", {
      method: "POST",
      body: form,
    });

    const res = (await callAction(request, makeContext())) as Response;
    expect(res.status).toBe(302);
    const loc = res.headers.get("location") ?? "";
    expect(loc).toContain("error=access_denied");
    expect(loc).toContain("nonce=n1");

    expect(createExchangeMock).not.toHaveBeenCalled();
  });

  it("rejects unknown decision values with 400", async () => {
    const form = new FormData();
    form.set("decision", "hack");
    form.set("nonce", "n1");
    form.set("callback_url", "chrome-extension://abc/cb");
    const request = new Request("http://localhost/connect/extension", {
      method: "POST",
      body: form,
    });
    try {
      await callAction(request, makeContext());
      throw new Error("should have thrown");
    } catch (e) {
      const res = e as Response;
      expect(res.status).toBe(400);
    }
  });
});
