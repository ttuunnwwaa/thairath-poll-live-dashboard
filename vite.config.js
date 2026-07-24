import { defineConfig } from "vite";
import { sites } from "./build/sites-vite-plugin.ts";

export default defineConfig({
  base: "./",
  plugins: [sites()],
  build: {
    target: "es2020",
    sourcemap: false,
  },
  server: {
    port: 4173,
    strictPort: true,
  },
  preview: {
    port: 4174,
    strictPort: true,
  },
});
