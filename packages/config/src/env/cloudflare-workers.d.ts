// Minimal ambient declaration for the `cloudflare:workers` module so this
// package's own tsc can type-check `worker.ts`. The runtime shape comes
// from the CF Workers runtime (apps/cloud) or the vitest shim — both
// provide `env`. WorkerEnvSchema validates the actual fields, so the raw
// import type is intentionally `unknown`.
//
// We deliberately do NOT depend on `@cloudflare/workers-types` because its
// `declare module "cloudflare:workers" { export = ... }` form conflicts
// with consumers that hand-maintain a stricter `export const env: Env`
// declaration (e.g. apps/cloud/worker-configuration.d.ts).
declare module "cloudflare:workers" {
  export const env: unknown;
}
