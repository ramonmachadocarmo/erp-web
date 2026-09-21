import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import federation from "@originjs/vite-plugin-federation";

export default function remoteConfig(name: string, port: number) {
  return defineConfig({
    base: process.env.VITE_BASE || "/",
    plugins: [
      react(),
      federation({
        name,
        filename: "remoteEntry.js",
        exposes: { "./App": "./src/App.tsx" },
        shared: {
          react: { singleton: true, requiredVersion: "^18.3.1" },
          "react-dom": { singleton: true, requiredVersion: "^18.3.1" },
          "react-router-dom": { singleton: true, requiredVersion: "^6.28.0" },
        },
      }),
    ],
    server: { port, cors: true, origin: `http://localhost:${port}` },
    preview: { port, cors: true },
    build: { target: "esnext", modulePreload: false, minify: process.env.VITE_MINIFY === "1", cssCodeSplit: false },
  });
}
