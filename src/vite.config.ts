import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

const isDev = process.env.NODE_ENV !== 'production';

// Plugin to inject React DevTools standalone (must load before React)
function reactDevToolsPlugin(): Plugin {
  return {
    name: 'react-devtools',
    transformIndexHtml(html, ctx) {
      if (!ctx.server) return html; // Only in dev mode
      
      const script = `
    <!-- React DevTools standalone -->
    <script src="http://localhost:8097" onerror="console.warn('[React DevTools] Failed to connect at localhost:8097. Run: npx react-devtools')"></script>`;
      
      return html.replace('</head>', script + '\n  </head>');
    }
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    reactDevToolsPlugin(),
    react({
      babel: isDev ? {
        presets: [
          ['@babel/preset-react', {
            runtime: 'automatic',
            development: true,
            importSource: '@welldone-software/why-did-you-render',
          }],
        ],
      } : undefined,
    }),
  ],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
