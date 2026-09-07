import { defineConfig } from "vite";

function githubBase() {
  if (process.env.VITE_BASE_PATH) return process.env.VITE_BASE_PATH;
  if (!process.env.GITHUB_ACTIONS) return "/";
  const repository = process.env.GITHUB_REPOSITORY?.split("/")[1];
  return repository ? `/${repository}/` : "/";
}

export default defineConfig({
  base: githubBase(),
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
