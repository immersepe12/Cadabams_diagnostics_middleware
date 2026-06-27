// Builds the Vercel Build Output API v3 directory (.vercel/output).
// API bundle + Vite frontend in one pass — no separate Vercel project needed.
//
// Output structure:
//   .vercel/output/
//     functions/index.func/   ← Hono API (Node serverless)
//     static/                 ← Vite SPA (CDN-served)
//     config.json             ← routing: API paths → function, rest → SPA
//
// Docs: https://vercel.com/docs/build-output-api/v3
import { mkdir, writeFile, rm, rename, cp } from "node:fs/promises";

const OUT = ".vercel/output";
const FUNC = `${OUT}/functions/index.func`;

await rm(OUT, { recursive: true, force: true });
await mkdir(FUNC, { recursive: true });

// ── 1. Bundle Hono API ───────────────────────────────────────────────────────
const apiResult = await Bun.build({
  entrypoints: ["./src/vercel-entry.ts"],
  outdir: FUNC,
  target: "node",
  format: "esm",
  minify: false,
});

if (!apiResult.success) {
  for (const log of apiResult.logs) console.error(log);
  process.exit(1);
}

await rename(`${FUNC}/vercel-entry.js`, `${FUNC}/index.mjs`);

await writeFile(
  `${FUNC}/.vc-config.json`,
  JSON.stringify({
    runtime: "nodejs22.x",
    handler: "index.mjs",
    launcherType: "Nodejs",
    shouldAddHelpers: true,
  }, null, 2)
);

console.log("✓ API bundle (Hono)");

// ── 2. Build Vite frontend ───────────────────────────────────────────────────
async function run(cmd: string[], cwd: string) {
  const proc = Bun.spawn(cmd, { cwd, stdout: "inherit", stderr: "inherit" });
  const code = await proc.exited;
  if (code !== 0) process.exit(code);
}

console.log("Installing apps/web dependencies...");
await run(["bun", "install", "--frozen-lockfile"], "apps/web");

console.log("Building frontend...");
await run(["bun", "run", "build"], "apps/web");

// Copy Vite dist → .vercel/output/static (Vercel serves these from its CDN)
await cp("apps/web/dist", `${OUT}/static`, { recursive: true });
console.log("✓ Frontend static files");

// ── 3. Routing config ────────────────────────────────────────────────────────
// API paths go to the Hono function. Static assets are served by the
// filesystem handler. Everything else (SPA client-side routes) falls back
// to index.html so react-router-dom can take over.
await writeFile(
  `${OUT}/config.json`,
  JSON.stringify({
    version: 3,
    routes: [
      { src: "^/health$",             dest: "/index" },
      { src: "^/bookings(/.*)?$",   dest: "/index" },
      { src: "^/webhook(/.*)?$",    dest: "/index" },
      { src: "^/catalogue(/.*)?$",  dest: "/index" },
      { src: "^/sync(/.*)?$",       dest: "/index" },
      { src: "^/actions(/.*)?$",    dest: "/index" },
      // Bare "/" is intercepted by the filesystem handler and 404s before the
      // SPA fallback below — rewrite it to index.html up front. (Sub-routes
      // like /bills already fall through to the wildcard.)
      { src: "^/$",                 dest: "/index.html" },
      { handle: "filesystem" },
      { src: "^/(.*)",             dest: "/index.html" },
    ],
  }, null, 2)
);

console.log("✓ Built .vercel/output (Build Output API v3)");
