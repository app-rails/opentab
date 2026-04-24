import { parseWorkerEnv, type WorkerEnv } from "@opentab/config/env/worker";
import { createRequestHandler, RouterContextProvider } from "react-router";

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

    const context = new RouterContextProvider();
    return await requestHandler(
      request,
      Object.assign(context, {
        cloudflare: { env, ctx },
      }),
    );
  },
} satisfies ExportedHandler<Env>;
