import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
// DRAFTPIN dev tool (pin-to-comment review). Dev only; the file is local and git-ignored.
if (import.meta.env.DEV) {
  const script = document.createElement("script");
  script.src = "/draftpin.dev.js";
  document.body.append(script);
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
