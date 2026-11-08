import { preact } from "@preact/preset-vite";
import { defineConfig } from "vite";

export default defineConfig({
  root: "client",
  plugins: [preact()],
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
