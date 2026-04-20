import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/settings", () => ({
  getSettings: vi.fn(),
  saveSettings: vi.fn().mockResolvedValue(undefined),
}));

const defaultSettings = {
  locale: "en" as const,
  server_enabled: false,
  server_url: "",
  welcome_dismissed: false,
  sidebar_collapsed: false,
  right_panel_collapsed: false,
  sync_polling_interval: 600_000,
};

import { getSettings, saveSettings } from "@/lib/settings";
import { useTheme } from "@/lib/theme";

function installMocks({
  initialTheme = "light" as "light" | "dark" | "system",
  reducedMotion = false,
  systemDark = false,
  supportsVT = true,
  transitionFinished = Promise.resolve(),
}: {
  initialTheme?: "light" | "dark" | "system";
  reducedMotion?: boolean;
  systemDark?: boolean;
  supportsVT?: boolean;
  transitionFinished?: Promise<void>;
} = {}) {
  vi.mocked(getSettings).mockResolvedValue({ ...defaultSettings, theme: initialTheme });

  window.matchMedia = vi.fn((query: string) => ({
    matches: query.includes("reduce") ? reducedMotion : query.includes("dark") ? systemDark : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as typeof window.matchMedia;

  document.documentElement.animate = vi.fn() as typeof document.documentElement.animate;

  // TS 5.9 lib.dom types `Document.startViewTransition` as non-optional, so we
  // can't assign a mock directly or delete it. Route through Object.defineProperty
  // to bypass type checking while preserving runtime behaviour.
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    writable: true,
    value: supportsVT
      ? vi.fn((cb: () => void) => {
          cb();
          return {
            ready: Promise.resolve(),
            finished: transitionFinished,
            updateCallbackDone: Promise.resolve(),
            skipTransition: vi.fn(),
          };
        })
      : undefined,
  });

  vi.stubGlobal("chrome", {
    runtime: {
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  });
}

function makeAnchor(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.getBoundingClientRect = () =>
    ({
      top: 100,
      left: 100,
      width: 24,
      height: 24,
      bottom: 124,
      right: 124,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    }) as DOMRect;
  document.body.appendChild(btn);
  return btn;
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  document.documentElement.classList.remove("dark");
});

describe("useTheme.cycleTheme", () => {
  it("no anchor → instant path (no startViewTransition call)", async () => {
    installMocks({ initialTheme: "light" });
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.mode).toBe("light"));

    await act(async () => {
      await result.current.cycleTheme();
    });

    expect(
      (document as Document & { startViewTransition?: { mock: unknown } }).startViewTransition,
    ).not.toHaveBeenCalled();
    expect(saveSettings).toHaveBeenCalledWith({ theme: "dark" });
  });

  it("anchor + VT + motion ok + color change → ripple path", async () => {
    installMocks({ initialTheme: "light" });
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.mode).toBe("light"));
    const anchor = makeAnchor();

    await act(async () => {
      await result.current.cycleTheme(anchor);
    });

    const startVT = (document as Document & { startViewTransition?: ReturnType<typeof vi.fn> })
      .startViewTransition;
    expect(startVT).toHaveBeenCalledTimes(1);
    expect(document.documentElement.animate).toHaveBeenCalled();
    expect(saveSettings).toHaveBeenCalledWith({ theme: "dark" });
  });

  it("reduced motion → instant path", async () => {
    installMocks({ initialTheme: "light", reducedMotion: true });
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.mode).toBe("light"));
    const anchor = makeAnchor();

    await act(async () => {
      await result.current.cycleTheme(anchor);
    });

    const startVT = (document as Document & { startViewTransition?: ReturnType<typeof vi.fn> })
      .startViewTransition;
    expect(startVT).not.toHaveBeenCalled();
  });

  it("no startViewTransition support → instant path", async () => {
    installMocks({ initialTheme: "light", supportsVT: false });
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.mode).toBe("light"));
    const anchor = makeAnchor();

    await act(async () => {
      await result.current.cycleTheme(anchor);
    });

    expect(document.documentElement.animate).not.toHaveBeenCalled();
    expect(saveSettings).toHaveBeenCalledWith({ theme: "dark" });
  });

  it("effective color unchanged → instant path", async () => {
    installMocks({ initialTheme: "system", systemDark: false });
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.mode).toBe("system"));
    const anchor = makeAnchor();

    await act(async () => {
      await result.current.cycleTheme(anchor);
    });

    const startVT = (document as Document & { startViewTransition?: ReturnType<typeof vi.fn> })
      .startViewTransition;
    expect(startVT).not.toHaveBeenCalled();
  });

  it("in-flight lock: second call while animating is dropped", async () => {
    let resolveFinished!: () => void;
    const finished = new Promise<void>((res) => {
      resolveFinished = res;
    });
    installMocks({ initialTheme: "light", transitionFinished: finished });
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.mode).toBe("light"));
    const anchor = makeAnchor();

    let firstCall!: Promise<void>;
    await act(async () => {
      firstCall = result.current.cycleTheme(anchor);
    });
    await act(async () => {
      await result.current.cycleTheme(anchor);
    });

    const startVT = (document as Document & { startViewTransition?: ReturnType<typeof vi.fn> })
      .startViewTransition;
    expect(startVT).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFinished();
      await firstCall;
    });
  });

  it("lock released after transition finished", async () => {
    installMocks({ initialTheme: "light" });
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.mode).toBe("light"));
    const anchor = makeAnchor();

    await act(async () => {
      await result.current.cycleTheme(anchor);
    });
    await act(async () => {
      await result.current.cycleTheme(anchor);
    });

    const startVT = (document as Document & { startViewTransition?: ReturnType<typeof vi.fn> })
      .startViewTransition;
    expect(startVT).toHaveBeenCalledTimes(2);
  });
});
