import type { ReactNode } from "react";
import { Footer } from "~/components/landing/footer";
import { LandingHeader } from "~/components/landing/landing-header";

/**
 * Layout shell for public marketing pages. Wraps the landing routes with
 * the shared header and footer.
 */
export function LandingShell({ children }: { children: ReactNode }) {
  return (
    <>
      <LandingHeader />
      <main>{children}</main>
      <Footer />
    </>
  );
}
