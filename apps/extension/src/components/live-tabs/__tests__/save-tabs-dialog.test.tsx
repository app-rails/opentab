import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "@/lib/settings";

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  saveTabsAsCollection: vi.fn(),
  tabsRemove: vi.fn(),
  onOpenChange: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/settings", () => ({
  getSettings: mocks.getSettings,
  updateSettings: mocks.updateSettings,
}));

vi.mock("@/stores/app-store", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({ saveTabsAsCollection: mocks.saveTabsAsCollection }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars?.count != null ? `${key}:${vars.count}` : key,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

vi.mock("@/components/tab-favicon", () => ({
  TabFavicon: () => <span data-testid="favicon" />,
}));

vi.mock("@opentab/ui/components/button", () => ({
  Button: ({
    children,
    variant: _variant,
    size: _size,
    asChild: _asChild,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
    asChild?: boolean;
  }) => <button {...props}>{children}</button>,
}));

vi.mock("@opentab/ui/components/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("@opentab/ui/components/checkbox", () => ({
  Checkbox: ({
    checked,
    disabled,
    onCheckedChange,
  }: {
    checked?: boolean | "indeterminate";
    disabled?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <input
      aria-label="checkbox"
      checked={checked === true}
      disabled={disabled}
      type="checkbox"
      onChange={(event) => onCheckedChange?.(event.currentTarget.checked)}
    />
  ),
}));

vi.mock("@opentab/ui/components/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

import { SaveTabsDialog } from "@/components/live-tabs/save-tabs-dialog";

const defaultSettings: AppSettings = {
  server_enabled: false,
  server_url: "",
  theme: "system",
  locale: "en",
  welcome_dismissed: false,
  sidebar_collapsed: false,
  right_panel_collapsed: false,
  sync_polling_interval: 600_000,
  active_workspace_id: null,
  save_tabs_close_after: false,
};

const tabs = [
  {
    id: 10,
    url: "https://example.com",
    title: "Example",
    favIconUrl: "https://example.com/favicon.ico",
  },
] as chrome.tabs.Tab[];

beforeEach(() => {
  mocks.getSettings.mockReset();
  mocks.updateSettings.mockReset();
  mocks.saveTabsAsCollection.mockReset();
  mocks.tabsRemove.mockReset();
  mocks.onOpenChange.mockReset();
  mocks.toastSuccess.mockReset();
  mocks.toastError.mockReset();
  mocks.updateSettings.mockResolvedValue(undefined);
  mocks.saveTabsAsCollection.mockResolvedValue(true);
  mocks.tabsRemove.mockResolvedValue(undefined);

  globalThis.chrome = {
    runtime: {
      getURL: () => "chrome-extension://self/",
    },
    tabs: {
      remove: mocks.tabsRemove,
    },
  } as unknown as typeof chrome;
});

afterEach(() => {
  cleanup();
  (globalThis as { chrome?: unknown }).chrome = undefined;
});

describe("SaveTabsDialog", () => {
  it("waits for settings before saving, then closes tabs when the stored preference is enabled", async () => {
    let resolveSettings: (settings: AppSettings) => void = () => {};
    mocks.getSettings.mockReturnValue(
      new Promise<AppSettings>((resolve) => {
        resolveSettings = resolve;
      }),
    );

    render(<SaveTabsDialog open onOpenChange={mocks.onOpenChange} tabs={tabs} />);
    fireEvent.change(screen.getByPlaceholderText("dialog.save_tabs.name_placeholder"), {
      target: { value: "Saved Tabs" },
    });

    const saveButton = screen.getByRole("button", { name: "dialog.save_tabs.save" });
    expect(saveButton).toBeDisabled();

    fireEvent.click(saveButton);
    expect(mocks.saveTabsAsCollection).not.toHaveBeenCalled();

    resolveSettings({ ...defaultSettings, save_tabs_close_after: true });
    await waitFor(() => expect(saveButton).toBeEnabled());

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mocks.saveTabsAsCollection).toHaveBeenCalledWith("Saved Tabs", [
        {
          url: "https://example.com",
          title: "Example",
          favIconUrl: "https://example.com/favicon.ico",
        },
      ]);
    });
    expect(mocks.tabsRemove).toHaveBeenCalledWith([10]);
  });
});
