/// <reference types="@cloudflare/workers-types" />

// Hand-maintained mirror of the bindings declared in alchemy.run.ts.
// Keep in sync until Alchemy emits a generated equivalent.
interface Env {
  DB: D1Database;
  APP_KV: KVNamespace;
  APP_ENV: string;
  APP_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_ADMIN_USER_ID: string;
  CHROMIUM_EXTENSION_IDS?: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_SECRET: string;
}

declare module "cloudflare:workers" {
  interface Env {
    DB: D1Database;
    APP_KV: KVNamespace;
    APP_ENV: string;
    APP_URL: string;
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_ADMIN_USER_ID: string;
    CHROMIUM_EXTENSION_IDS?: string;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    SESSION_SECRET: string;
  }
  export const env: Env;
}

declare class ExecutionContext {
  passThroughOnException(): void;
  waitUntil(promise: Promise<any>): void;
}

declare interface ExportedHandler<E = unknown> {
  fetch(request: Request, env: E, ctx: ExecutionContext): Response | Promise<Response>;
}
