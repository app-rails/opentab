import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import "@/assets/main.css";
import { initLocale } from "@/lib/i18n";
import { router } from "./routes";

const render = () =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );

initLocale().then(render, render);
