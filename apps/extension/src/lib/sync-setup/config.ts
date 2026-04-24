/**
 * Default sync host baked into the wizard's host-input step (spec §2.4.5).
 *
 * `import.meta.env.DEV` is Vite/WXT's dev-build flag; switching to the
 * production URL at build time means local development doesn't nag about
 * `https://opentab.dev` not running.
 */
export const DEFAULT_SYNC_HOST = import.meta.env.DEV
  ? "http://localhost:5173"
  : "https://opentab.dev";
