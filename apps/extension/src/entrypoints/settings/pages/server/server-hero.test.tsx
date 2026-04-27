import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Echo i18n keys back as their fallback so we can assert on the human-readable
// strings without booting up real i18next. Same trick as server-page.test.tsx.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === "string" ? fallback : key,
  }),
}));

import { ServerHero } from "./server-hero";

afterEach(() => {
  cleanup();
});

// Radix DropdownMenuTrigger opens on pointer-down (mouse) or Enter/Space.
// jsdom's PointerEvents are flaky and the trigger guards against synthetic
// `click` until pointer capture is released. Keyboard Enter is the most
// reliable path that also matches accessible behavior.
function openDropdown(trigger: HTMLElement) {
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter", code: "Enter" });
}

const HOST = "https://sync.example.com";
const onSwitchChange = vi.fn();
const onSyncNow = vi.fn();
const onForgetServer = vi.fn();
const onReconfigure = vi.fn();
const onCopyDeviceId = vi.fn();

afterEach(() => {
  onSwitchChange.mockReset();
  onSyncNow.mockReset();
  onForgetServer.mockReset();
  onReconfigure.mockReset();
  onCopyDeviceId.mockReset();
});

describe("<ServerHero>", () => {
  it("empty state: switch OFF, no sync now button, no overflow menu, status badge '未启用'", () => {
    render(
      <ServerHero state="empty" onSwitchChange={onSwitchChange} onForgetServer={onForgetServer} />,
    );

    const sw = screen.getByRole("switch");
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByTestId("server-hero-sync-now")).not.toBeInTheDocument();
    expect(screen.queryByTestId("server-hero-menu-trigger")).not.toBeInTheDocument();
    expect(screen.getByTestId("server-hero-status-badge")).toHaveTextContent("未启用");

    fireEvent.click(sw);
    expect(onSwitchChange).toHaveBeenCalledWith(true);
  });

  it("paused state: switch OFF, no sync now, overflow menu shows only '忘记此服务器', status '已暂停'", () => {
    render(
      <ServerHero
        state="paused"
        host={HOST}
        onSwitchChange={onSwitchChange}
        onForgetServer={onForgetServer}
      />,
    );

    const sw = screen.getByRole("switch");
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByTestId("server-hero-sync-now")).not.toBeInTheDocument();

    const trigger = screen.getByTestId("server-hero-menu-trigger");
    expect(trigger).toBeInTheDocument();
    openDropdown(trigger);

    expect(screen.getByTestId("server-hero-menu-forget")).toBeInTheDocument();
    expect(screen.queryByTestId("server-hero-menu-reconfigure")).not.toBeInTheDocument();
    expect(screen.queryByTestId("server-hero-menu-copy-device-id")).not.toBeInTheDocument();

    expect(screen.getByTestId("server-hero-status-badge")).toHaveTextContent("已暂停");
  });

  it("wizard state: switch ON, no sync now button, no overflow menu, status '配置中'", () => {
    render(<ServerHero state="wizard" host={HOST} onSwitchChange={onSwitchChange} />);

    const sw = screen.getByRole("switch");
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByTestId("server-hero-sync-now")).not.toBeInTheDocument();
    expect(screen.queryByTestId("server-hero-menu-trigger")).not.toBeInTheDocument();
    expect(screen.getByTestId("server-hero-status-badge")).toHaveTextContent("配置中");
  });

  it("reconnecting state: switch ON, sync now button rendered but disabled, overflow menu shows only '忘记此服务器'", () => {
    render(
      <ServerHero
        state="reconnecting"
        host={HOST}
        onSwitchChange={onSwitchChange}
        onSyncNow={onSyncNow}
        onForgetServer={onForgetServer}
      />,
    );

    const sw = screen.getByRole("switch");
    expect(sw).toHaveAttribute("aria-checked", "true");

    const syncBtn = screen.getByTestId("server-hero-sync-now");
    expect(syncBtn).toBeInTheDocument();
    expect(syncBtn).toBeDisabled();

    const trigger = screen.getByTestId("server-hero-menu-trigger");
    openDropdown(trigger);
    expect(screen.getByTestId("server-hero-menu-forget")).toBeInTheDocument();
    expect(screen.queryByTestId("server-hero-menu-reconfigure")).not.toBeInTheDocument();
    expect(screen.queryByTestId("server-hero-menu-copy-device-id")).not.toBeInTheDocument();
  });

  it("connected state: switch ON, primary sync now button enabled (calls onSyncNow), overflow menu has reconfigure / copy device id / forget", () => {
    render(
      <ServerHero
        state="connected"
        host={HOST}
        onSwitchChange={onSwitchChange}
        onSyncNow={onSyncNow}
        onForgetServer={onForgetServer}
        onReconfigure={onReconfigure}
        onCopyDeviceId={onCopyDeviceId}
      />,
    );

    const sw = screen.getByRole("switch");
    expect(sw).toHaveAttribute("aria-checked", "true");

    const syncBtn = screen.getByTestId("server-hero-sync-now");
    expect(syncBtn).toBeEnabled();
    fireEvent.click(syncBtn);
    expect(onSyncNow).toHaveBeenCalledTimes(1);

    fireEvent.click(sw);
    expect(onSwitchChange).toHaveBeenCalledWith(false);

    const trigger = screen.getByTestId("server-hero-menu-trigger");
    openDropdown(trigger);
    expect(screen.getByTestId("server-hero-menu-reconfigure")).toBeInTheDocument();
    expect(screen.getByTestId("server-hero-menu-copy-device-id")).toBeInTheDocument();
    expect(screen.getByTestId("server-hero-menu-forget")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("server-hero-menu-reconfigure"));
    expect(onReconfigure).toHaveBeenCalledTimes(1);
  });
});
