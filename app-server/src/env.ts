function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const trustedOrigins = [
  ...(process.env.TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  ...(process.env.TRUSTED_EXTENSION_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
];

export const env = {
  get BETTER_AUTH_SECRET() {
    return required("BETTER_AUTH_SECRET");
  },
  get BETTER_AUTH_URL() {
    return process.env.BETTER_AUTH_URL ?? "http://localhost:3001";
  },
  get TRUSTED_ORIGINS() {
    return trustedOrigins;
  },
} as const;
