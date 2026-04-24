import type { ExchangeConsumeResponse } from "@opentab/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AnyActorRef, createActor, fromPromise } from "xstate";
import {
  createNoopActors,
  createSetupMachine,
  type SetupMachineActors,
} from "@/lib/sync-setup/state-machine";
import type {
  CheckHealthInput,
  ConsumeExchangeInput,
  HealthCheckResult,
} from "@/lib/sync-setup/types";

const DEVICE_ID = "018f3b1e-9f4b-7aaa-8bbb-cccccccccccc";

function baseInput(overrides: Partial<Parameters<typeof createActor>[1]> = {}) {
  return {
    input: {
      deviceName: "Test Device",
      platform: "darwin",
      extensionVersion: "0.0.1",
      deviceId: DEVICE_ID,
      hasLocalData: true,
      ...overrides,
    },
  };
}

function stateValue(actor: AnyActorRef): string {
  const value = actor.getSnapshot().value;
  return typeof value === "string" ? value : JSON.stringify(value);
}

async function waitFor(actor: AnyActorRef, predicate: (state: string) => boolean): Promise<void> {
  if (predicate(stateValue(actor))) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      sub.unsubscribe();
      reject(new Error(`Timed out waiting for state; last=${stateValue(actor)}`));
    }, 1000);
    const sub = actor.subscribe((snap) => {
      const v = typeof snap.value === "string" ? snap.value : JSON.stringify(snap.value);
      if (predicate(v)) {
        clearTimeout(timeout);
        sub.unsubscribe();
        resolve();
      }
    });
  });
}

const EXCHANGE_RESPONSE: ExchangeConsumeResponse = {
  deviceId: DEVICE_ID,
  deviceToken: "tok_test",
  deviceName: "Test Device",
  user: { id: "u1", email: "u@example.com", name: null },
};

beforeEach(() => {
  // Ensure the crypto.randomUUID path in state-machine.ts has something to
  // call — jsdom provides it, but just in case.
});

afterEach(() => {});

// ---------------------------------------------------------------------------
// 1. Happy path
// ---------------------------------------------------------------------------

describe("setup machine — happy path", () => {
  it("walks START → backup → host → permission → health → authorization → exchange → direction → upload → complete", async () => {
    const actors = createNoopActors();
    const machine = createSetupMachine({ actors, generateNonce: () => "nonce-1" });
    const actor = createActor(machine, baseInput());
    actor.start();

    expect(stateValue(actor)).toBe("idle");

    actor.send({ type: "START" });
    // Runs backup actor, ends on backup_done
    await waitFor(actor, (v) => v === "backup_done");

    actor.send({ type: "HOST_SUBMITTED", host: "https://sync.example.com" });
    // permission_requesting invokes requestPermission (noop returns true),
    // then moves to health_checking, then awaiting_authorization.
    await waitFor(actor, (v) => v === "awaiting_authorization");

    const ctxAfterAuth = actor.getSnapshot().context;
    expect(ctxAfterAuth.host).toBe("https://sync.example.com");
    expect(ctxAfterAuth.nonce).toBe("nonce-1");

    actor.send({
      type: "AUTHORIZATION_CALLBACK",
      exchangeCode: "code-xyz",
      nonce: "nonce-1",
    });
    await waitFor(actor, (v) => v === "direction_choice");

    actor.send({ type: "CHOSE_UPLOAD" });
    await waitFor(actor, (v) => v === "complete");

    expect(actor.getSnapshot().context.direction).toBe("upload");
  });
});

// ---------------------------------------------------------------------------
// 2. RETRY from health_failed(extension_too_old) → health_checking
// ---------------------------------------------------------------------------

describe("setup machine — RETRY recovers from health_failed", () => {
  it("loops back to health_checking after RETRY", async () => {
    let callCount = 0;
    const actors: SetupMachineActors = {
      ...createNoopActors(),
      checkHealth: fromPromise<HealthCheckResult, CheckHealthInput>(async () => {
        callCount++;
        if (callCount === 1) {
          return { kind: "extension_too_old", minRequired: "1.0.0" };
        }
        return {
          kind: "ok",
          response: {
            serverVersion: "1.0.0",
            protocolVersion: "1.0.0",
            minSupportedProtocolVersion: "1.0.0",
            minSupportedExtensionVersion: "0.0.1",
            recommendedExtensionVersion: null,
            serverTime: 1,
            timezone: "UTC",
          },
        };
      }),
    };
    const machine = createSetupMachine({ actors });
    const actor = createActor(machine, baseInput());
    actor.start();

    actor.send({ type: "START" });
    await waitFor(actor, (v) => v === "backup_done");
    actor.send({ type: "HOST_SUBMITTED", host: "https://x.example.com" });
    await waitFor(actor, (v) => v === "health_failed");

    actor.send({ type: "RETRY" });
    await waitFor(actor, (v) => v === "awaiting_authorization");
    expect(callCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 3. RETRY from authorization_timeout → awaiting_authorization
// ---------------------------------------------------------------------------

describe("setup machine — RETRY from authorization_timeout", () => {
  it("re-enters awaiting_authorization and mints a fresh nonce", async () => {
    let nonceCall = 0;
    const machine = createSetupMachine({
      actors: createNoopActors(),
      generateNonce: () => `nonce-${++nonceCall}`,
    });
    const actor = createActor(machine, baseInput());
    actor.start();

    actor.send({ type: "START" });
    await waitFor(actor, (v) => v === "backup_done");
    actor.send({ type: "HOST_SUBMITTED", host: "https://x.example.com" });
    await waitFor(actor, (v) => v === "awaiting_authorization");
    expect(actor.getSnapshot().context.nonce).toBe("nonce-1");

    actor.send({ type: "AUTHORIZATION_TIMEOUT" });
    expect(stateValue(actor)).toBe("authorization_timeout");

    actor.send({ type: "RETRY" });
    await waitFor(actor, (v) => v === "awaiting_authorization");
    expect(actor.getSnapshot().context.nonce).toBe("nonce-2");
  });
});

// ---------------------------------------------------------------------------
// 4. EXCHANGE_INVALID → exchange_invalid
// ---------------------------------------------------------------------------

describe("setup machine — EXCHANGE_INVALID routes to exchange_invalid", () => {
  it("transitions from consuming_exchange to exchange_invalid, and START returns to host_input", async () => {
    const actors: SetupMachineActors = {
      ...createNoopActors(),
      consumeExchange: fromPromise<ExchangeConsumeResponse, ConsumeExchangeInput>(async () => {
        throw new Error("invalid exchange");
      }),
    };
    const machine = createSetupMachine({ actors });
    const actor = createActor(machine, baseInput());
    actor.start();

    actor.send({ type: "START" });
    await waitFor(actor, (v) => v === "backup_done");
    actor.send({ type: "HOST_SUBMITTED", host: "https://x.example.com" });
    await waitFor(actor, (v) => v === "awaiting_authorization");
    actor.send({
      type: "AUTHORIZATION_CALLBACK",
      exchangeCode: "code-bad",
      nonce: actor.getSnapshot().context.nonce ?? "",
    });
    await waitFor(actor, (v) => v === "exchange_invalid");

    actor.send({ type: "START" });
    expect(stateValue(actor)).toBe("host_input");
  });
});

// ---------------------------------------------------------------------------
// 5. Direction choice respects hasLocalData / hasServerData
// ---------------------------------------------------------------------------

describe("setup machine — direction_choice guards", () => {
  async function driveToDirectionChoice(hasLocalData: boolean, hasServerData: boolean) {
    const actors: SetupMachineActors = {
      ...createNoopActors(),
      consumeExchange: fromPromise<ExchangeConsumeResponse, ConsumeExchangeInput>(
        async () => EXCHANGE_RESPONSE,
      ),
    };
    const machine = createSetupMachine({ actors });
    const actor = createActor(machine, {
      input: {
        deviceName: "D",
        platform: "darwin",
        extensionVersion: "0.0.1",
        deviceId: DEVICE_ID,
        hasLocalData,
      },
    });
    actor.start();
    actor.send({ type: "START" });
    await waitFor(actor, (v) => v === "backup_done");
    actor.send({ type: "HOST_SUBMITTED", host: "https://x.example.com" });
    await waitFor(actor, (v) => v === "awaiting_authorization");
    actor.send({
      type: "AUTHORIZATION_CALLBACK",
      exchangeCode: "c",
      nonce: actor.getSnapshot().context.nonce ?? "",
    });
    await waitFor(actor, (v) => v === "direction_choice");
    // Manually toggle server-data flag (wizard UI owns this in prod).
    if (hasServerData) {
      // biome-ignore lint/suspicious/noExplicitAny: test-only context poke
      (actor.getSnapshot().context as any).hasServerData = true;
    }
    return actor;
  }

  it("CHOSE_UPLOAD is blocked when hasLocalData is false", async () => {
    const actor = await driveToDirectionChoice(false, false);
    actor.send({ type: "CHOSE_UPLOAD" });
    expect(stateValue(actor)).toBe("direction_choice");
  });

  it("CHOSE_DOWNLOAD is blocked when hasServerData is false", async () => {
    const actor = await driveToDirectionChoice(true, false);
    actor.send({ type: "CHOSE_DOWNLOAD" });
    expect(stateValue(actor)).toBe("direction_choice");
  });

  it("CHOSE_UPLOAD is allowed when hasLocalData is true", async () => {
    const actor = await driveToDirectionChoice(true, false);
    actor.send({ type: "CHOSE_UPLOAD" });
    await waitFor(actor, (v) => v === "uploading" || v === "complete");
  });

  it("CHOSE_DOWNLOAD is allowed when hasServerData is true", async () => {
    const actor = await driveToDirectionChoice(true, true);
    actor.send({ type: "CHOSE_DOWNLOAD" });
    await waitFor(actor, (v) => v === "downloading" || v === "complete");
  });
});

// ---------------------------------------------------------------------------
// 6. CANCEL from a non-terminal state returns to idle
// ---------------------------------------------------------------------------

describe("setup machine — CANCEL", () => {
  it("CANCEL from awaiting_authorization returns to idle", async () => {
    const machine = createSetupMachine({ actors: createNoopActors() });
    const actor = createActor(machine, baseInput());
    actor.start();
    actor.send({ type: "START" });
    await waitFor(actor, (v) => v === "backup_done");
    actor.send({ type: "HOST_SUBMITTED", host: "https://x.example.com" });
    await waitFor(actor, (v) => v === "awaiting_authorization");
    actor.send({ type: "CANCEL" });
    expect(stateValue(actor)).toBe("idle");
  });

  it("CANCEL from host_input returns to idle and clears ephemeral context", async () => {
    const machine = createSetupMachine({ actors: createNoopActors() });
    const actor = createActor(machine, baseInput());
    actor.start();
    actor.send({ type: "START" });
    await waitFor(actor, (v) => v === "backup_done");
    actor.send({ type: "CANCEL" });
    expect(stateValue(actor)).toBe("idle");
    expect(actor.getSnapshot().context.nonce).toBeNull();
    expect(actor.getSnapshot().context.backupFilename).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 7. Backup failure returns to idle
// ---------------------------------------------------------------------------

describe("setup machine — backup failure", () => {
  it("returns to idle with an error when the backup actor rejects", async () => {
    const actors: SetupMachineActors = {
      ...createNoopActors(),
      exportBackup: fromPromise<{ filename: string }, unknown>(async () => {
        throw new Error("disk full");
      }),
    };
    const machine = createSetupMachine({ actors });
    const actor = createActor(machine, baseInput());
    actor.start();
    actor.send({ type: "START" });
    await waitFor(actor, (v) => v === "idle");
    expect(actor.getSnapshot().context.error).toContain("disk full");
  });
});

// ---------------------------------------------------------------------------
// 8. Health upgrade_recommended → health_recommended_upgrade → START → awaiting_authorization
// ---------------------------------------------------------------------------

describe("setup machine — upgrade_recommended soft gate", () => {
  it("lands on health_recommended_upgrade and START continues the flow", async () => {
    const actors: SetupMachineActors = {
      ...createNoopActors(),
      checkHealth: fromPromise<HealthCheckResult, CheckHealthInput>(async () => ({
        kind: "upgrade_recommended",
        recommended: "0.5.0",
        response: {
          serverVersion: "1.0.0",
          protocolVersion: "1.0.0",
          minSupportedProtocolVersion: "1.0.0",
          minSupportedExtensionVersion: "0.0.1",
          recommendedExtensionVersion: "0.5.0",
          serverTime: 1,
          timezone: "UTC",
        },
      })),
    };
    const machine = createSetupMachine({ actors });
    const actor = createActor(machine, baseInput());
    actor.start();

    actor.send({ type: "START" });
    await waitFor(actor, (v) => v === "backup_done");
    actor.send({ type: "HOST_SUBMITTED", host: "https://x.example.com" });
    await waitFor(actor, (v) => v === "health_recommended_upgrade");

    actor.send({ type: "START" });
    await waitFor(actor, (v) => v === "awaiting_authorization");
  });
});
