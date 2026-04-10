import type { Auth } from "@opentab/auth";

export interface Context {
  session: Awaited<ReturnType<Auth["api"]["getSession"]>>;
  user: NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>["user"] | null;
}

export function createContextFactory(auth: Auth) {
  return async function createContext(req: Request): Promise<Context> {
    const session = await auth.api.getSession({ headers: req.headers });
    return {
      session,
      user: session?.user ?? null,
    };
  };
}
