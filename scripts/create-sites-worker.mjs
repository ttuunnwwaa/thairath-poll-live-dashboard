import { mkdir, writeFile } from "node:fs/promises";

const repository = process.env.GITHUB_REPOSITORY?.split("/")[1];
const configuredBase = process.env.VITE_BASE_PATH;
const base = configuredBase || (process.env.GITHUB_ACTIONS && repository ? `/${repository}/` : "/");

await mkdir(new URL("../dist/server/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../dist/server/index.js", import.meta.url),
  `export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404) return response;
    const url = new URL(request.url);
    url.pathname = "/";
    return env.ASSETS.fetch(new Request(url, request));
  }
};\n`,
  "utf8",
);

const safeBase = base.startsWith("/") ? base : `/${base}`;
await writeFile(
  new URL("../dist/404.html", import.meta.url),
  `<!doctype html><html><head><meta charset="utf-8"><script>
  var base=${JSON.stringify(safeBase)};
  var route=location.pathname.slice(base.length-1)+location.search+location.hash;
  location.replace(base+'?route='+encodeURIComponent(route));
  </script></head><body></body></html>`,
  "utf8",
);
