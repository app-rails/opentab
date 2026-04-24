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
    // Hosts are requested at runtime by the sync-setup wizard (spec §2.4.5).
    // Declaring this empty keeps the install-time prompt clean and forces an
    // explicit per-host permission dialog for the user-entered server URL.
    optional_host_permissions: [],
    action: {},
    chrome_url_overrides: { newtab: "tabs.html" },
    // The setup-callback bridge must be reachable as a web-accessible resource
    // so the `/connect/extension` redirect can land back on the extension URL.
    // Narrow `matches` to https + localhost to prevent arbitrary sites from
    // embedding or deep-linking to the callback page.
    web_accessible_resources: [
      {
        resources: ["setup-callback.html"],
        matches: ["https://*/*", "http://localhost/*"],
      },
    ],
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
