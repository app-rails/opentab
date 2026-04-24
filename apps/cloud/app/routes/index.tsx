import { href, redirect } from "react-router";
import { ThemeSwitcher } from "~/components/theme";
import { buttonVariants } from "~/components/ui/button";
import { appDescription, appName } from "~/lib/config";
import { cn } from "~/lib/utils";
import { auth } from "~/services/auth/auth.server";
import type { Route } from "./+types/index";

export function meta() {
  return [{ title: appName, description: appDescription }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (session) {
    throw redirect("/dash");
  }

  return null;
}

export default function IndexRoute() {
  return (
    <>
      <div className="flex h-[calc(100vh-300px)] flex-col items-center justify-center">
        <section className="flex flex-col items-center gap-8">
          <div className="text-center">
            <h1 className="mb-2 font-bold text-5xl">{appName} Cloud</h1>
            <p className="text-lg text-muted-foreground">{appDescription}</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <a href={href("/auth/sign-in")} className={cn(buttonVariants({ variant: "default" }))}>
              Sign In
            </a>

            <a href={href("/auth/sign-up")} className={cn(buttonVariants({ variant: "outline" }))}>
              Sign Up
            </a>
          </div>

          <button type="button" className="text-primary text-sm hover:underline">
            Install the Chrome extension
          </button>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-4 space-y-2 md:bottom-8">
        <div className="flex justify-center gap-x-2">
          <ThemeSwitcher />
        </div>
      </div>
    </>
  );
}
