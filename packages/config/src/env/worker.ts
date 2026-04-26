import { env as ctxEnv } from "cloudflare:workers";
import { type WorkerEnv, WorkerEnvSchema } from "./schemas.ts";

export type { WorkerEnv };

// Module-scope: parse runs once per isolate cold start. CF Workers keeps
// `ctxEnv` referentially stable for the lifetime of the isolate, so a single
// parse covers every subsequent request. Mirrors packages/config/src/env/node.ts
// which does the equivalent for process.env.
export const workerEnv: WorkerEnv = WorkerEnvSchema.parse(ctxEnv);

export const isDevEnv = workerEnv.APP_ENV === "development";
export const isProdEnv = workerEnv.APP_ENV === "production";
export const isTestEnv = workerEnv.APP_ENV === "test";

// For entrypoints that receive `env` as a parameter (e.g. workers/app.ts
// fetch handler) and want to validate the input explicitly. Tests also use
// this to feed mock env shapes through the schema.
export function parseWorkerEnv(input: unknown): WorkerEnv {
  return WorkerEnvSchema.parse(input);
}
