import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      BETTER_AUTH_SECRET: "test-secret-for-vitest",
      BETTER_AUTH_URL: "http://localhost:3001",
      TRUSTED_ORIGINS: "http://localhost:5173",
    },
  },
});
