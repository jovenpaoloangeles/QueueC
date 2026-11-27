import "@fontsource-variable/onest";
import "@fontsource-variable/spline-sans-mono";
import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { ToastProvider } from "./components/Toast.jsx";
import { initSkillPrivacy, initTheme } from "./lib/theme.js";

initTheme();
initSkillPrivacy();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
