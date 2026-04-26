import { parseWorkerEnv, type WorkerEnv } from "@opentab/config/env/worker";
import { createRequestHandler, RouterContextProvider } from "react-router";
import { corsHeadersFor } from "../app/lib/cors";

declare module "react-router" {
  export interface RouterContextProvider {
    cloudflare: {
      env: WorkerEnv & Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

// Cache the parse result per worker isolate. The CF Workers runtime keeps
// `env` referentially stable for the lifetime of the isolate, so a single
// parse covers every subsequent request.
let parsedEnvCheckedFor: unknown = null;
const ensureWorkerEnv = (env: unknown): void => {
  if (parsedEnvCheckedFor !== env) {
    parseWorkerEnv(env);
    parsedEnvCheckedFor = env;
  }
};

export default {
  async fetch(request, env, ctx) {
    ensureWorkerEnv(env);

    // CORS for /api/* — extension calls the worker cross-origin from
    // chrome-extension://<id>. Trust list is shared with BetterAuth via
    // getExtensionOrigins(env). Returns null when origin is missing
    // (same-origin) or untrusted, in which case we add no CORS headers and
    // let the browser block the response per its default policy.
    const url = new URL(request.url);
    const isApi = url.pathname.startsWith("/api/");
    const cors = isApi ? corsHeadersFor(request.headers.get("origin"), env) : null;

    // Preflight: short-circuit before hitting the router. react-router has
    // no OPTIONS loader, so reaching the router would 405.
    if (isApi && request.method === "OPTIONS" && cors) {
      return new Response(null, { status: 204, headers: cors });
    }

    const context = new RouterContextProvider();
    const response = await requestHandler(
      request,
      Object.assign(context, {
        cloudflare: { env, ctx },
      }),
    );

    if (!cors) return response;
    // Merge CORS into a fresh Response — Headers may be immutable on some
    // response sources (e.g. Response.redirect), so cloning is safer than
    // mutating in place.
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
} satisfies ExportedHandler<Env>;
