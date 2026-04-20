import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SVGProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockCycleTheme = vi.fn();
const mockSetTheme = vi.fn();
let currentMode: "system" | "light" | "dark" = "system";

vi.mock("@/lib/theme", () => ({
  useTheme: () => ({
    mode: currentMode,
    cycleTheme: mockCycleTheme,
    setTheme: mockSetTheme,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string>) => (vars?.mode ? `${key}:${vars.mode}` : key),
  }),
}));

vi.mock("lucide-react", () => ({
  Monitor: (props: SVGProps<SVGSVGElement>) => <svg data-icon="monitor" {...props} />,
  Sun: (props: SVGProps<SVGSVGElement>) => <svg data-icon="sun" {...props} />,
  Moon: (props: SVGProps<SVGSVGElement>) => <svg data-icon="moon" {...props} />,
}));

import { ThemeToggler } from "@/components/theme-toggler";

afterEach(() => {
  cleanup();
  mockCycleTheme.mockClear();
  mockSetTheme.mockClear();
  currentMode = "system";
});

describe('<ThemeToggler type="icon">', () => {
  it("renders the Monitor icon when mode is system", () => {
    currentMode = "system";
    const { container } = render(<ThemeToggler />);
    expect(container.querySelector('[data-icon="monitor"]')).not.toBeNull();
  });

  it("renders the Sun icon when mode is light", () => {
    currentMode = "light";
    const { container } = render(<ThemeToggler />);
    expect(container.querySelector('[data-icon="sun"]')).not.toBeNull();
  });

  it("renders the Moon icon when mode is dark", () => {
    currentMode = "dark";
    const { container } = render(<ThemeToggler />);
    expect(container.querySelector('[data-icon="moon"]')).not.toBeNull();
  });

  it("click invokes cycleTheme with the button element", () => {
    const { container } = render(<ThemeToggler />);
    const btn = container.querySelector("button");
    expect(btn).not.toBeNull();
    fireEvent.click(btn as HTMLButtonElement);
    expect(mockCycleTheme).toHaveBeenCalledTimes(1);
    expect(mockCycleTheme).toHaveBeenCalledWith(btn);
  });

  it("forwards aria-label prop to the root button", () => {
    render(<ThemeToggler aria-label="Toggle theme" />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-label", "Toggle theme");
  });
});
