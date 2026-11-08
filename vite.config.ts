import { preact } from "@preact/preset-vite";
import { defineConfig } from "vite";
import { guides } from "./tools/vite-guides.js";

export default defineConfig({
  root: "client",
  plugins: [preact(), guides()],
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": { target: "http://127.0.0.1:3000", ws: true },
    },
  },
});
