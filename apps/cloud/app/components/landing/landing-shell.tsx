import type { ReactNode } from "react";
import { LandingHeader } from "~/components/landing/landing-header";

/**
 * Layout shell for public marketing pages. Wraps the landing routes with
 * the shared header and reserves a slot for the footer that arrives in
 * Task 20. The footer placeholder is intentionally empty so Task 20's
 * test can assert it has been replaced by the real `<Footer/>`.
 */
export function LandingShell({ children }: { children: ReactNode }) {
  return (
    <>
      <LandingHeader />
      <main>{children}</main>
      {/* TODO: replace with <Footer/> from Task 20 */}
      <div data-testid="footer-placeholder" />
    </>
  );
}
