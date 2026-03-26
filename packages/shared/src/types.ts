export interface HealthResponse {
  status: "ok";
  timestamp: number;
}

export type AuthState =
  | {
      mode: "online";
      accountId: string;
      sessionToken: string;
      localUuid?: string;
    }
  | {
      mode: "offline";
      localUuid: string;
    };
