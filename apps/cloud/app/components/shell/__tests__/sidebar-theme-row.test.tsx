import { describe, expect, it } from "vitest";
import { SidebarThemeRow } from "~/components/shell/sidebar-theme-row";
import { renderWithRouter } from "~/test/render-with-router";

describe("SidebarThemeRow", () => {
  it("renders three theme submit buttons (light / dark / system)", async () => {
    const { container, findByLabelText } = renderWithRouter(<SidebarThemeRow />, {
      // ThemeSwitcher → useThemeMode → useRequestInfo reads `userPrefs.theme`
      // off the root route's loader data.
      rootLoaderData: { requestInfo: { userPrefs: { theme: "light" } } },
    });

    // Wait for RouterProvider's async hydration so the form is in the DOM.
    await findByLabelText("Light");

    const buttons = container.querySelectorAll<HTMLButtonElement>('button[type="submit"]');
    expect(buttons).toHaveLength(3);

    const values = Array.from(buttons, (b) => b.value);
    expect(values).toEqual(["light", "dark", "system"]);

    // Each button shares name="theme"; the discriminator is `value` + aria-label.
    for (const b of buttons) {
      expect(b).toHaveAttribute("name", "theme");
    }
    expect(buttons[0]).toHaveAttribute("aria-label", "Light");
    expect(buttons[1]).toHaveAttribute("aria-label", "Dark");
    expect(buttons[2]).toHaveAttribute("aria-label", "System");
  });
});
