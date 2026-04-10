import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/assets/main.css";
import { initLocale } from "@/lib/i18n";
import App from "./App";

const render = () =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

initLocale().then(render, render);
