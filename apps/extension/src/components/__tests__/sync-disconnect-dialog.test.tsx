import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MSG } from "@/lib/constants";

const clearSyncAuth = vi.fn(async () => {});
vi.mock("@/lib/sync-auth-storage", () => ({
  clearSyncAuth: () => clearSyncAuth(),
}));

const sendMessage = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: (msg: unknown) => {
        sendMessage(msg);
        return Promise.resolve();
      },
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function loadComponent() {
  const mod = await import("@/components/settings/sync-disconnect-dialog");
  return mod.SyncDisconnectDialog;
}

describe("SyncDisconnectDialog", () => {
  it("does nothing when the user cancels", async () => {
    const SyncDisconnectDialog = await loadComponent();
    const onOpenChange = vi.fn();
    const onDisconnected = vi.fn();

    render(
      <SyncDisconnectDialog
        open={true}
        onOpenChange={onOpenChange}
        onDisconnected={onDisconnected}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(clearSyncAuth).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(onDisconnected).not.toHaveBeenCalled();
  });

  it("clears auth, broadcasts SYNC_DISCONNECTED, and notifies on confirm", async () => {
    const SyncDisconnectDialog = await loadComponent();
    const onOpenChange = vi.fn();
    const onDisconnected = vi.fn();

    render(
      <SyncDisconnectDialog
        open={true}
        onOpenChange={onOpenChange}
        onDisconnected={onDisconnected}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /disconnect/i }));

    await waitFor(() => expect(clearSyncAuth).toHaveBeenCalledTimes(1));
    expect(sendMessage).toHaveBeenCalledWith({ type: MSG.SYNC_DISCONNECTED });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onDisconnected).toHaveBeenCalledTimes(1);
  });
});
