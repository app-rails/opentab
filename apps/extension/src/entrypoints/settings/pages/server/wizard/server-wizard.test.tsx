import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Echo i18n keys back as their fallback so labels stay deterministic without
// pulling in real i18next. Same pattern as welcome-page.test.tsx.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === "string" ? fallback : key,
  }),
}));

import { ServerWizard } from "./server-wizard";

afterEach(cleanup);

function renderWizard() {
  return render(<ServerWizard />);
}

describe("<ServerWizard>", () => {
  it("starts on the backup step", () => {
    renderWizard();
    expect(screen.getByTestId("wizard-step-backup")).toBeInTheDocument();
    expect(screen.queryByTestId("wizard-step-connect")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wizard-step-authorize")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wizard-step-transfer")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wizard-step-complete")).not.toBeInTheDocument();
  });

  it("advances to connect when next is clicked from backup", () => {
    renderWizard();
    fireEvent.click(screen.getByTestId("wizard-next"));
    expect(screen.getByTestId("wizard-step-connect")).toBeInTheDocument();
    expect(screen.queryByTestId("wizard-step-backup")).not.toBeInTheDocument();
  });

  it("returns to backup when prev is clicked from connect", () => {
    renderWizard();
    fireEvent.click(screen.getByTestId("wizard-next"));
    expect(screen.getByTestId("wizard-step-connect")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("wizard-prev"));
    expect(screen.getByTestId("wizard-step-backup")).toBeInTheDocument();
  });

  it("renders 5 step labels in the header in order", () => {
    renderWizard();
    // Header surfaces all 5 step titles regardless of which is active. Order
    // matches the defineStepper(...) declaration: backup → connect →
    // authorize → transfer → complete.
    const headerLabels = screen
      .getAllByTestId(/^wizard-header-step-/)
      .map((el) => el.getAttribute("data-step-id"));
    expect(headerLabels).toEqual(["backup", "connect", "authorize", "transfer", "complete"]);

    // The active step's title (backup at initial render) appears in both the
    // header strip AND the step body's <h2>, so getAllByText is the right
    // matcher here. Inactive titles only appear once (in the header).
    expect(screen.getAllByText("备份本地数据").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("连接服务器")).toBeInTheDocument();
    expect(screen.getByText("授权设备")).toBeInTheDocument();
    expect(screen.getByText("传输数据")).toBeInTheDocument();
    expect(screen.getByText("完成")).toBeInTheDocument();
  });
});
