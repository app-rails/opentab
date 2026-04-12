import type { Auth } from "@opentab/auth";
import type { SyncRepository } from "@opentab/db/repo";

export interface Context {
  session: Awaited<ReturnType<Auth["api"]["getSession"]>>;
  user: NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>["user"] | null;
  syncRepo: SyncRepository;
}

export function createContextFactory({ auth, syncRepo }: { auth: Auth; syncRepo: SyncRepository }) {
  return async function createContext(req: Request): Promise<Context> {
    const session = await auth.api.getSession({ headers: req.headers });
    return {
      session,
      user: session?.user ?? null,
      syncRepo,
    };
  };
}
