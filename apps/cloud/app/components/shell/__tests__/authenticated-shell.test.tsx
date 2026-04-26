import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthenticatedShell } from "~/components/shell/authenticated-shell";
import { renderWithRouter } from "~/test/render-with-router";

const mockUser = {
  id: "u1",
  name: "Liang",
  email: "zhaolion@gmail.com",
  image: null,
  role: "user",
};

// `requestInfo` is consumed by ThemeSwitcher inside SidebarThemeRow via
// `useThemeMode → useRequestInfo` reading `userPrefs.theme`.
const rootLoaderData = {
  user: mockUser,
  requestInfo: { userPrefs: { theme: "system" } },
};

describe("AuthenticatedShell", () => {
  it("renders children inside the sidebar inset", async () => {
    renderWithRouter(
      <AuthenticatedShell>
        <div data-testid="content">page body</div>
      </AuthenticatedShell>,
      { rootLoaderData },
    );

    expect(await screen.findByTestId("content")).toBeInTheDocument();
  });

  it("exposes a skip-to-content link targeting the main content region", async () => {
    renderWithRouter(
      <AuthenticatedShell>
        <div data-testid="content">page body</div>
      </AuthenticatedShell>,
      { rootLoaderData },
    );

    const skipLink = await screen.findByRole("link", { name: /Skip to content/i });
    expect(skipLink).toHaveAttribute("href", "#main-content");
  });

  it("sets id=main-content on the inset region targeted by the skip link", async () => {
    renderWithRouter(
      <AuthenticatedShell>
        <div data-testid="content">page body</div>
      </AuthenticatedShell>,
      { rootLoaderData },
    );

    const main = await screen.findByRole("main");
    expect(main).toHaveAttribute("id", "main-content");
  });

  it("renders sidebar logo, nav items, theme row and user card", async () => {
    renderWithRouter(
      <AuthenticatedShell>
        <div data-testid="content" />
      </AuthenticatedShell>,
      { rootLoaderData },
    );

    // Logo: AppLogo renders an <img alt="OpenTab">
    const logoImg = await screen.findByAltText("OpenTab");
    expect(logoImg).toBeVisible();

    // Nav: at least the Dashboard item is present
    expect(screen.getByRole("link", { name: /Dashboard/ })).toBeVisible();

    // Theme row: 3 segmented buttons with aria-labels Light / Dark / System
    expect(screen.getByLabelText("Light")).toBeInTheDocument();
    expect(screen.getByLabelText("Dark")).toBeInTheDocument();
    expect(screen.getByLabelText("System")).toBeInTheDocument();

    // User card: name visible
    expect(screen.getByText("Liang")).toBeVisible();
  });
});
