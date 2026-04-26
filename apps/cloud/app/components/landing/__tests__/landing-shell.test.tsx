import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingShell } from "~/components/landing/landing-shell";
import { renderWithRouter } from "~/test/render-with-router";

describe("LandingShell", () => {
  it("renders the OpenTab logo", () => {
    renderWithRouter(
      <LandingShell>
        <div>child</div>
      </LandingShell>,
    );
    expect(screen.getByAltText("OpenTab")).toBeVisible();
  });

  it("renders a Sign In link pointing to /auth/sign-in", () => {
    renderWithRouter(
      <LandingShell>
        <div>child</div>
      </LandingShell>,
    );
    const signIn = screen.getByRole("link", { name: /Sign In/i });
    expect(signIn).toHaveAttribute("href", "/auth/sign-in");
  });

  it("renders a Sign Up link pointing to /auth/sign-up", () => {
    renderWithRouter(
      <LandingShell>
        <div>child</div>
      </LandingShell>,
    );
    const signUp = screen.getByRole("link", { name: /Sign Up/i });
    expect(signUp).toHaveAttribute("href", "/auth/sign-up");
  });

  it("renders children inside <main>", () => {
    renderWithRouter(
      <LandingShell>
        <div data-testid="landing-child">hello</div>
      </LandingShell>,
    );
    const child = screen.getByTestId("landing-child");
    expect(child.closest("main")).not.toBeNull();
  });
});
