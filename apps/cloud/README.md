# @opentab/cloud

Full-stack server for OpenTab: BetterAuth-based Web UI + sync API for the
Chrome extension. Deployed on Cloudflare Workers (D1 + KV) via Alchemy IaC.

## Architecture

- React Router v7 (SSR) on Cloudflare Workers
- BetterAuth (email/password + GitHub OAuth + admin plugin)
- Drizzle ORM → Cloudflare D1 (SQLite)
- KV namespace for BetterAuth session cache
- Alchemy IaC manages all CF resources, bindings, and migrations
- Env validation via `@opentab/config/env/*` (zod)

## Quick start (local)

1. `cp .env.example .env` and fill values (see comments for each).
2. `pnpm install` at the repo root.
3. `pnpm --filter @opentab/cloud dev` (= `alchemy dev`).
4. Open http://localhost:5173.

`alchemy dev` writes `.alchemy/local/wrangler.jsonc` (gitignored), starts
local D1 + KV emulators, applies pending migrations from
`./drizzle/migrations`, and runs `react-router dev`.

## Database

- Schema lives in `./drizzle/schema/`.
- Add a migration: edit schema → `pnpm db:generate`.
- Local migrations apply automatically on next `alchemy dev`.
- Remote migrations apply automatically on `alchemy deploy`.
- Inspect data: `pnpm db:studio`.
- Seed local DB with admin user: `pnpm db:seed:local` (requires
  `alchemy dev` to have run at least once).

## Deploy

Two paths, both via GitHub Actions. You do **not** run `alchemy deploy`
directly except in emergencies.

| Target | Trigger | Workflow |
|---|---|---|
| `dev` (https://opentab-dev.apprails.io) | Manual on `main` | Actions → Deploy → Run workflow |
| `prod` (https://opentab.apprails.io) | Push tag `v*.*.*` | Auto (waits for `production` reviewer approval) |

Required GitHub Secrets are listed in
[`docs/superpowers/specs/2026-04-24-apps-cloud-deployment-alchemy-design.md`](../../docs/superpowers/specs/2026-04-24-apps-cloud-deployment-alchemy-design.md)
§6.3.

## Emergency deploy from a laptop

```bash
ALCHEMY_STAGE=prod CI=true pnpm --filter @opentab/cloud deploy
```

You must hold `CLOUDFLARE_API_TOKEN`, `ALCHEMY_PASSWORD`,
`ALCHEMY_STATE_TOKEN`, and the production secrets locally. Prefer the GH
Actions path.

## Runbook

| Symptom | Cause | Fix |
|---|---|---|
| `alchemy deploy` 401 / 403 on first run | API token missing scopes | Add `D1:Edit`, `Workers Scripts:Edit`, `Workers KV:Edit`, `Workers Routes:Edit`, `DNS:Edit` (apprails.io zone) |
| State unreadable after first deploy | `ALCHEMY_PASSWORD` was changed | Restore old password, or set `forceUpdate: true` in `alchemy.run.ts` once to re-adopt resources |
| `CustomDomain` create fails | `apprails.io` zone not on CF | Add the zone to CF dashboard first |
| `pnpm db:seed:local` errors with "Local D1 file not found" | Never ran `alchemy dev` | Run `pnpm dev` once to materialize the local emulator |
| New developer cannot run `pnpm dev` | Missing or incomplete `.env` | `cp .env.example .env` and fill secrets; the parse error names the missing keys |
| Build fails with `cloudflare:workers` not resolved | `.alchemy/local/wrangler.jsonc` missing AND vite SSR builtins fallback misconfigured | Run `alchemy dev` once, or check `vite.config.ts`'s fallback `environments.ssr.resolve.builtins` |

## Destroy

```bash
pnpm --filter @opentab/cloud destroy
```

Deletes **all** resources for the current `ALCHEMY_STAGE` including D1
data. Manual only — never wired to CI. D1 has no point-in-time restore;
treat this command as permanent.
