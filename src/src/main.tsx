// react-scan must initialize before React renders so it can intercept
// the render pipeline. The import is statically dead in production builds
// (Vite replaces `import.meta.env.DEV` with `false` and tree-shakes the
// dynamic import), so it is never bundled into release artifacts produced
// by the GitHub Actions release workflow.
if (import.meta.env.DEV) {
  const { scan } = await import('react-scan');
  scan({ enabled: true });
}

import './wdyr';
import React from "react";
import ReactDOM from "react-dom/client";
import 'overlayscrollbars/overlayscrollbars.css';
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
