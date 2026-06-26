// Builds the Vercel Build Output API v3 directory (.vercel/output).
// This bypasses Vercel's source-tree function auto-detection and gives us a
// single, fully-bundled Node serverless function — no runtime module resolution.
//
// Docs: https://vercel.com/docs/build-output-api/v3
import { mkdir, writeFile, rm, rename } from "node:fs/promises";

const OUT = ".vercel/output";
const FUNC = `${OUT}/functions/index.func`;

await rm(OUT, { recursive: true, force: true });
await mkdir(FUNC, { recursive: true });

// Bundle the entry + all of src/ into one file. Node-target packages
// (hono, @hono/node-server, @supabase/supabase-js) are inlined so the
// function needs no node_modules at runtime.
const result = await Bun.build({
  entrypoints: ["./src/vercel-entry.ts"],
  outdir: FUNC,
  target: "node",
  format: "esm",
  minify: false,
});

if (!result.success) {
  console.error("Bundle failed:");
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

// Bun emits vercel-entry.js — Vercel's launcher needs the handler filename to
// match .vc-config.json. Rename to index.mjs (ESM).
await rename(`${FUNC}/vercel-entry.js`, `${FUNC}/index.mjs`);

await writeFile(
  `${FUNC}/.vc-config.json`,
  JSON.stringify(
    {
      runtime: "nodejs20.x",
      handler: "index.mjs",
      launcherType: "Nodejs",
      shouldAddHelpers: true,
    },
    null,
    2
  )
);

await writeFile(
  `${OUT}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [{ src: "/(.*)", dest: "/index" }],
    },
    null,
    2
  )
);

console.log("Built .vercel/output (Build Output API v3)");
