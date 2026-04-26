import { type WorkerEnv, WorkerEnvSchema } from "./schemas.ts";

export type { WorkerEnv };

export function parseWorkerEnv(ctxEnv: unknown): WorkerEnv {
  return WorkerEnvSchema.parse(ctxEnv);
}
