import { resolve } from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // `cloudflare:workers` is only resolvable inside the Worker runtime.
      // Shim it in tests so modules that read `env` at import time still load.
      "cloudflare:workers": resolve(__dirname, "./app/test/cloudflare-workers-shim.ts"),
    },
  },
  test: {
    environment: "happy-dom",
    include: ["app/**/*.test.{ts,tsx}", "app/**/__tests__/**/*.test.{ts,tsx}"],
    setupFiles: ["./app/test/setup-dom.ts"],
  },
});
