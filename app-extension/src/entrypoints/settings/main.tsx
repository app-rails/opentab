import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/assets/main.css";
import "@/lib/i18n";
import { initLocale } from "@/lib/i18n";
import App from "./App";

initLocale().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
