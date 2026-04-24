export interface HealthResponse {
  status: "ok";
  timestamp: number;
}

export type AuthState = {
  mode: "offline";
  localUuid: string;
};
