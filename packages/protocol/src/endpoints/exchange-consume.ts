import { z } from "zod";
import { uuidV7Schema } from "../entities";

/**
 * Request body for `POST /api/extension/exchange/consume`. The exchange
 * code + nonce are single-use; the server rejects replay with 409.
 * `deviceId` is client-generated once per install and persisted in
 * `chrome.storage.local` so re-authorization rotates the token on the same
 * audit row.
 */
export const exchangeConsumeRequestSchema = z.object({
  exchangeCode: z.string().min(1),
  nonce: z.string().min(1),
  deviceId: uuidV7Schema,
  deviceName: z.string().min(1).max(100),
  platform: z.string().min(1).max(200),
  extensionVersion: z.string().min(1).max(32),
});

export const exchangeConsumeResponseSchema = z.object({
  deviceId: uuidV7Schema,
  deviceToken: z.string().min(1),
  deviceName: z.string().min(1),
  user: z.object({
    id: z.string().min(1),
    email: z.string().min(1),
    name: z.string().nullable(),
  }),
});

export type ExchangeConsumeRequest = z.infer<typeof exchangeConsumeRequestSchema>;
export type ExchangeConsumeResponse = z.infer<typeof exchangeConsumeResponseSchema>;
