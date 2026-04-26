import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearProgress, loadProgress, saveProgress, type WizardProgress } from "../wizard-progress";

const STORAGE_KEY = "opentab_sync_setup_progress_v1";

describe("wizard-progress", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("returns null when nothing is persisted", () => {
    expect(loadProgress()).toBeNull();
  });

  it("roundtrips a valid progress payload", () => {
    saveProgress({
      completedSteps: ["backup", "connect"],
      lastHost: "https://sync.example.com",
      backupFilename: "opentab-backup.json",
    });
    const loaded = loadProgress();
    expect(loaded).not.toBeNull();
    expect(loaded!.completedSteps).toEqual(["backup", "connect"]);
    expect(loaded!.lastHost).toBe("https://sync.example.com");
    expect(loaded!.backupFilename).toBe("opentab-backup.json");
    expect(typeof loaded!.updatedAt).toBe("number");
    expect(loaded!.updatedAt).toBeGreaterThan(0);
  });

  it("filters out unknown step ids — defends against an old client writing a step that no longer exists", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        completedSteps: ["backup", "ghost-step", "connect"],
        lastHost: null,
        backupFilename: null,
        updatedAt: 1,
      } satisfies Record<keyof WizardProgress, unknown>),
    );
    const loaded = loadProgress();
    expect(loaded?.completedSteps).toEqual(["backup", "connect"]);
  });

  it("returns null and clears the entry on corrupted JSON so the next save starts clean", () => {
    localStorage.setItem(STORAGE_KEY, "{this-isn't-json");
    expect(loadProgress()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("returns null when the persisted value isn't a JSON object", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify("just a string"));
    expect(loadProgress()).toBeNull();
  });

  it("normalises non-string lastHost / backupFilename to null", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        completedSteps: [],
        lastHost: 42,
        backupFilename: { wrong: "shape" },
        updatedAt: "not-a-number",
      }),
    );
    const loaded = loadProgress();
    expect(loaded?.lastHost).toBeNull();
    expect(loaded?.backupFilename).toBeNull();
    expect(loaded?.updatedAt).toBe(0);
  });

  it("clearProgress removes the persisted entry", () => {
    saveProgress({
      completedSteps: ["backup"],
      lastHost: "h",
      backupFilename: "f.json",
    });
    expect(loadProgress()).not.toBeNull();
    clearProgress();
    expect(loadProgress()).toBeNull();
  });
});
