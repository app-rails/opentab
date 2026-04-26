import { SyncErrorCode } from "@opentab/protocol";
import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "~/services/protocol-compat.server";
import { requireProtocolVersion } from "../protocol-version";

function makeRequest(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/sync/push", { headers });
}

async function expectRejectWith(req: Request, status: number, code: string): Promise<void> {
  try {
    requireProtocolVersion(req);
    throw new Error("should have thrown");
  } catch (e) {
    const res = e as Response;
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(status);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe(code);
  }
}

describe("requireProtocolVersion", () => {
  it("throws 426 when protocol header is missing", async () => {
    const req = makeRequest({});
    await expectRejectWith(req, 426, SyncErrorCode.API_VERSION_MISMATCH);
  });

  it("throws 426 when client protocol is below minimum", async () => {
    const req = makeRequest({ "x-opentab-protocol-version": "0.9.0" });
    await expectRejectWith(req, 426, SyncErrorCode.API_VERSION_MISMATCH);
  });

  it("throws 426 when client major exceeds server major", async () => {
    const serverMajor = Number.parseInt(PROTOCOL_VERSION.split(".")[0] ?? "0", 10);
    const futureMajor = `${serverMajor + 1}.0.0`;
    const req = makeRequest({ "x-opentab-protocol-version": futureMajor });
    await expectRejectWith(req, 426, SyncErrorCode.API_VERSION_MISMATCH);
  });

  it("passes silently when protocol is in range", () => {
    const req = makeRequest({ "x-opentab-protocol-version": PROTOCOL_VERSION });
    expect(() => requireProtocolVersion(req)).not.toThrow();
  });
});
