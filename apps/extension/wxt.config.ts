import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    permissions: ["storage", "alarms", "tabs", "downloads"],
    action: {},
    chrome_url_overrides: { newtab: "tabs.html" },
  },
  vite: () => ({
    plugins: [tailwindcss()],
    define: {
      __BUILD_VERSION__: JSON.stringify(process.env.BUILD_VERSION || "dev"),
      __BUILD_COMMIT__: JSON.stringify(process.env.BUILD_COMMIT || "dev"),
      __BUILD_TIME__: JSON.stringify(
        process.env.BUILD_TIME || new Date().toISOString().slice(0, 10),
      ),
    },
    resolve: {
      alias: {
        "@": resolve(__dirname, "./src"),
      },
    },
  }),
});
