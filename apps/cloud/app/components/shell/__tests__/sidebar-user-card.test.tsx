import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SidebarUserCard } from "~/components/shell/sidebar-user-card";
import { SidebarProvider } from "~/components/ui/sidebar";
import { renderWithRouter } from "~/test/render-with-router";

// Spy on `useSubmit` so the Log out test can assert the sign-out form is
// posted. `importOriginal` keeps `MemoryRouter`/`createMemoryRouter`/`Link`
// real so the rest of the suite continues to render through the data router.
const submitSpy = vi.fn();
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useSubmit: () => submitSpy,
  };
});

const mockUser = {
  id: "u1",
  name: "Liang",
  email: "zhaolion@gmail.com",
  image: null,
  role: "user",
};

// `requestInfo` is consumed by ThemeSelectorRadioGroup (rendered inside the
// Appearance submenu) via `useThemeMode → useRequestInfo`. We don't need
// the real shape; just enough to satisfy `userPrefs.theme`.
const rootLoaderData = {
  user: mockUser,
  requestInfo: { userPrefs: { theme: "system" } },
};

function renderCard() {
  return renderWithRouter(
    <SidebarProvider>
      <SidebarUserCard />
    </SidebarProvider>,
    { rootLoaderData },
  );
}

describe("SidebarUserCard", () => {
  it("renders the user pill with name and email", async () => {
    renderCard();

    expect(await screen.findByText("Liang")).toBeVisible();
    expect(screen.getByText("zhaolion@gmail.com")).toBeVisible();
  });

  it("opens dropdown with Log out / Settings / Appearance menu items on trigger click", async () => {
    renderCard();

    const trigger = await screen.findByRole("button", { name: /Liang/ });
    // Radix DropdownMenu listens to pointer events to open. Fire pointerDown +
    // click in sequence so the trigger transitions to the open state.
    fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
    fireEvent.click(trigger);

    expect(await screen.findByText("Log out")).toBeVisible();
    expect(screen.getByText("Settings")).toBeVisible();
    expect(screen.getByText("Appearance")).toBeVisible();
  });

  it("submits the sign-out form when Log out is clicked", async () => {
    submitSpy.mockClear();
    renderCard();

    const trigger = await screen.findByRole("button", { name: /Liang/ });
    fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
    fireEvent.click(trigger);
    const logoutItem = await screen.findByText("Log out");
    fireEvent.click(logoutItem);

    // UserNavMenuContent wraps submit in a 100ms setTimeout so the
    // dropdown can finish closing before navigation. waitFor polls until
    // the spy is invoked (default 1s timeout, plenty of headroom).
    await waitFor(() => {
      expect(submitSpy).toHaveBeenCalledTimes(1);
    });
    expect(submitSpy).toHaveBeenCalledWith(null, {
      method: "POST",
      action: "/auth/sign-out",
    });
  });
});
