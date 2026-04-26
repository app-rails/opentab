import { describe, expect, it } from "vitest";
import { AlchemyEnvSchema, BaseSchema, WorkerEnvSchema } from "./schemas.ts";

describe("BaseSchema", () => {
  it("defaults NODE_ENV to development", () => {
    const out = BaseSchema.parse({});
    expect(out.NODE_ENV).toBe("development");
  });

  it("accepts NODE_ENV=production", () => {
    const out = BaseSchema.parse({ NODE_ENV: "production" });
    expect(out.NODE_ENV).toBe("production");
  });

  it("rejects unknown NODE_ENV values", () => {
    expect(() => BaseSchema.parse({ NODE_ENV: "staging" })).toThrow();
  });

  it("preserves CI as-is when set", () => {
    expect(BaseSchema.parse({ CI: "true" }).CI).toBe("true");
  });
});

const validWorkerEnv = {
  APP_URL: "https://opentab-dev.apprails.io",
  APP_ENV: "development",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_ADMIN_USER_ID: "user_abc",
  GITHUB_CLIENT_ID: "client-id",
  GITHUB_CLIENT_SECRET: "client-secret",
  SESSION_SECRET: "y".repeat(32),
};

describe("WorkerEnvSchema", () => {
  it("accepts a complete valid env", () => {
    expect(() => WorkerEnvSchema.parse(validWorkerEnv)).not.toThrow();
  });

  it("rejects malformed APP_URL", () => {
    expect(() => WorkerEnvSchema.parse({ ...validWorkerEnv, APP_URL: "not a url" })).toThrow();
  });

  it("rejects BETTER_AUTH_SECRET shorter than 32 chars", () => {
    expect(() => WorkerEnvSchema.parse({ ...validWorkerEnv, BETTER_AUTH_SECRET: "short" })).toThrow(
      /32/,
    );
  });

  it("rejects SESSION_SECRET shorter than 32 chars", () => {
    expect(() => WorkerEnvSchema.parse({ ...validWorkerEnv, SESSION_SECRET: "short" })).toThrow(
      /32/,
    );
  });

  it("rejects empty GITHUB_CLIENT_ID", () => {
    expect(() => WorkerEnvSchema.parse({ ...validWorkerEnv, GITHUB_CLIENT_ID: "" })).toThrow();
  });

  it("treats missing BETTER_AUTH_ADMIN_USER_ID as empty string", () => {
    const { BETTER_AUTH_ADMIN_USER_ID: _omit, ...withoutAdmin } = validWorkerEnv;
    expect(WorkerEnvSchema.parse(withoutAdmin).BETTER_AUTH_ADMIN_USER_ID).toBe("");
  });

  it("rejects invalid APP_ENV", () => {
    expect(() => WorkerEnvSchema.parse({ ...validWorkerEnv, APP_ENV: "prod" })).toThrow();
  });

  it("accepts APP_ENV=test for the vitest shim", () => {
    expect(WorkerEnvSchema.parse({ ...validWorkerEnv, APP_ENV: "test" }).APP_ENV).toBe("test");
  });

  it("defaults CHROMIUM_EXTENSION_IDS to empty string", () => {
    expect(WorkerEnvSchema.parse(validWorkerEnv).CHROMIUM_EXTENSION_IDS).toBe("");
  });
});

const validAlchemyEnv = {
  ...validWorkerEnv,
  ALCHEMY_STAGE: "dev",
  ALCHEMY_PASSWORD: "min8chars",
  ALCHEMY_STATE_TOKEN: "tok",
  CLOUDFLARE_ACCOUNT_ID: "acct",
  CLOUDFLARE_API_TOKEN: "tok",
  CLOUDFLARE_ZONE_ID: "zone",
};

describe("AlchemyEnvSchema", () => {
  it("accepts a complete valid env for dev", () => {
    expect(() => AlchemyEnvSchema.parse(validAlchemyEnv)).not.toThrow();
  });

  it("accepts prod stage when CI=true and APP_URL matches", () => {
    expect(() =>
      AlchemyEnvSchema.parse({
        ...validAlchemyEnv,
        ALCHEMY_STAGE: "prod",
        APP_URL: "https://opentab.apprails.io",
        CI: "true",
      }),
    ).not.toThrow();
  });

  it("rejects prod stage when CI is unset", () => {
    expect(() =>
      AlchemyEnvSchema.parse({
        ...validAlchemyEnv,
        ALCHEMY_STAGE: "prod",
        APP_URL: "https://opentab.apprails.io",
      }),
    ).toThrow(/CI/);
  });

  it("rejects prod stage when APP_URL points to dev hostname", () => {
    expect(() =>
      AlchemyEnvSchema.parse({
        ...validAlchemyEnv,
        ALCHEMY_STAGE: "prod",
        APP_URL: "https://opentab-dev.apprails.io",
        CI: "true",
      }),
    ).toThrow(/APP_URL/);
  });

  it("rejects dev stage when APP_URL host is not in DEV_APP_URL_LIST", () => {
    expect(() =>
      AlchemyEnvSchema.parse({
        ...validAlchemyEnv,
        APP_URL: "https://opentab.apprails.io",
      }),
    ).toThrow(/APP_URL/);
    expect(() =>
      AlchemyEnvSchema.parse({
        ...validAlchemyEnv,
        APP_URL: "https://random.example.com",
      }),
    ).toThrow(/not allowed/i);
  });

  it.each([
    "https://opentab-dev.apprails.io",
    "https://opentab-stage.apprails.io",
    "http://localhost:5173",
  ])("accepts dev stage APP_URL %s", (appUrl) => {
    expect(() => AlchemyEnvSchema.parse({ ...validAlchemyEnv, APP_URL: appUrl })).not.toThrow();
  });

  it("rejects dev stage when remote APP_URL uses http instead of https", () => {
    expect(() =>
      AlchemyEnvSchema.parse({
        ...validAlchemyEnv,
        APP_URL: "http://opentab-dev.apprails.io",
      }),
    ).toThrow(/scheme/i);
  });

  it("rejects dev stage when localhost APP_URL uses https", () => {
    expect(() =>
      AlchemyEnvSchema.parse({
        ...validAlchemyEnv,
        APP_URL: "https://localhost:5173",
      }),
    ).toThrow(/scheme/i);
  });

  it("rejects staging stage with a clear reserved-not-wired message", () => {
    expect(() =>
      AlchemyEnvSchema.parse({
        ...validAlchemyEnv,
        ALCHEMY_STAGE: "staging",
      }),
    ).toThrow(/staging is reserved/i);
  });

  it("rejects ALCHEMY_PASSWORD shorter than 8 chars", () => {
    expect(() => AlchemyEnvSchema.parse({ ...validAlchemyEnv, ALCHEMY_PASSWORD: "short" })).toThrow(
      /8/,
    );
  });
});
