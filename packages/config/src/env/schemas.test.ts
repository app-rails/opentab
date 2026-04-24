import { describe, expect, it } from "vitest";
import { AlchemyEnvSchema, BaseSchema, WorkerEnvSchema } from "./schemas";

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
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_ADMIN_USER_ID: "user_abc",
  GITHUB_CLIENT_ID: "client-id",
  GITHUB_CLIENT_SECRET: "client-secret",
};

describe("WorkerEnvSchema", () => {
  it("accepts a complete valid env", () => {
    expect(() => WorkerEnvSchema.parse(validWorkerEnv)).not.toThrow();
  });

  it("rejects http:// APP_URL (must be https)", () => {
    expect(() => WorkerEnvSchema.parse({ ...validWorkerEnv, APP_URL: "http://x.example" })).toThrow(
      /https/i,
    );
  });

  it("rejects BETTER_AUTH_SECRET shorter than 32 chars", () => {
    expect(() => WorkerEnvSchema.parse({ ...validWorkerEnv, BETTER_AUTH_SECRET: "short" })).toThrow(
      /32/,
    );
  });

  it("rejects empty GITHUB_CLIENT_ID", () => {
    expect(() => WorkerEnvSchema.parse({ ...validWorkerEnv, GITHUB_CLIENT_ID: "" })).toThrow();
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

  it("rejects dev stage when APP_URL points to prod hostname", () => {
    expect(() =>
      AlchemyEnvSchema.parse({
        ...validAlchemyEnv,
        APP_URL: "https://opentab.apprails.io",
      }),
    ).toThrow(/APP_URL/);
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
