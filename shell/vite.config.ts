import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import federation from "@originjs/vite-plugin-federation";

// Dev-mode remote: each MFE is its own dev server on its own port (see docker-compose.dev.yml),
// so the shell fetches remoteEntry.js cross-origin. A literal "localhost" baked in here only
// works when the browser is on the same machine as the dev server — from any other device on
// the LAN (phone/tablet hitting the shell by the host's IP), "localhost" resolves to THAT
// device instead, every remote silently fails to load, and the shell never renders past its
// blank background (the bug this was written to fix).
//
// @originjs/vite-plugin-federation supports a "dynamic remote" form (a string of runtime JS,
// resolved in the browser) that would sidestep this — but only for its build-time federation
// loader. In `vite dev` (what the shell actually runs, per docker-compose.dev.yml) its virtual
// `__federation__` module interpolates the remote value directly into a quoted JS string
// (`url:'<value>'`), so it has to be a literal URL, not runtime code — confirmed by the dev
// server erroring on invalid syntax when a dynamic-remote string was tried here. So the host
// has to be resolved at config-eval time instead: VITE_DEV_HOST (see .env.example) defaults to
// "localhost" and is overridden to the machine's LAN IP for LAN/tablet/phone testing.
const DEV_HOST = process.env.VITE_DEV_HOST || "localhost";

//
// `make up-dev` avoids the host issue altogether: it sets VITE_MFE_MODE=relative (same as the prod
// nginx image), so remotes load from `/mfe/<name>/…` on the shell's own origin and the dev
// server below proxies that prefix to each `<name>-dev` container. Works from any IP/hostname,
// including a dynamic LAN IP, with nothing to configure. VITE_DEV_HOST stays as an override for
// running the shell outside docker.
const MFES: Record<string, { port: string; path: string; host: string }> = Object.fromEntries(
  [
    ["config", "3010"],
    ["auth", "3001"],
    ["stock", "3002"],
    ["sales", "3003"],
    ["purchasing", "3004"],
    ["assets", "3006"],
    ["cashflow", "3007"],
    ["invoicing", "3005"],
    ["bi", "3008"],
    ["reports", "3009"],
  ].map(([name, port]) => [name, { port, path: name, host: `${name}-dev` }]),
);

const mfeProxy =
  process.env.VITE_MFE_MODE === "relative"
    ? Object.fromEntries(
        Object.values(MFES).map(({ port, path, host }) => [`/mfe/${path}/`, { target: `http://${host}:${port}` }]),
      )
    : {};

const remote = (name: string, port: string, path: string) =>
  process.env[`VITE_REMOTE_${name.toUpperCase()}`] ||
  (process.env.VITE_MFE_MODE === "relative"
    ? `/mfe/${path}/assets/remoteEntry.js?v=${process.env.VITE_MFE_VERSION || "46"}`
    : `http://${DEV_HOST}:${port}/assets/remoteEntry.js`);

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: "shell",
      remotes: {
        config: remote("config", "3010", "config"),
        auth: remote("auth", "3001", "auth"),
        stock: remote("stock", "3002", "stock"),
        sales: remote("sales", "3003", "sales"),
        purchasing: remote("purchasing", "3004", "purchasing"),
        assets: remote("assets", "3006", "assets"),
        cashflow: remote("cashflow", "3007", "cashflow"),
        invoicing: remote("invoicing", "3005", "invoicing"),
        bi: remote("bi", "3008", "bi"),
        reports: remote("reports", "3009", "reports"),
      },
      shared: {
        react: { singleton: true, requiredVersion: "^18.3.1" },
        "react-dom": { singleton: true, requiredVersion: "^18.3.1" },
        "react-router-dom": { singleton: true, requiredVersion: "^6.28.0" },
      },
    }),
  ],
  server: {
    port: 3000,
    proxy: {
      ...mfeProxy,
      "/api": { target: process.env.VITE_API_PROXY_TARGET || "http://localhost:8086" },
    },
  },
  build: { target: "esnext", modulePreload: false, minify: process.env.VITE_MINIFY === "1", cssCodeSplit: false },
});
