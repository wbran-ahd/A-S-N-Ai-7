#!/usr/bin/env node
/**
 * Bundle budget (task 1).
 *
 * The entry chunk is what a shopkeeper waits for on a 3G phone, and it grew
 * silently once already (a stale manualChunks list plus a transitive `zod`
 * added ~120 kB without anyone noticing). This check turns that into a CI
 * failure with the exact file and number.
 *
 * Run after `bun run build`:  node scripts/check-bundle-size.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

/** Budget in kB of gzip. Raise deliberately, never by accident. */
const BUDGET = {
  entryGzipKb: 200,
  largestChunkGzipKb: 220,
  totalJsGzipKb: 900,
  totalCssGzipKb: 40,
};

const DIST = path.resolve("dist");
const ASSETS = path.join(DIST, "assets");

function fail(message) {
  console.error(`✗ bundle budget: ${message}`);
  process.exitCode = 1;
}

function gzipKb(file) {
  return gzipSync(readFileSync(file)).length / 1000;
}

let html;
try {
  html = readFileSync(path.join(DIST, "index.html"), "utf8");
} catch {
  console.error("✗ bundle budget: dist/index.html not found — run `bun run build` first.");
  process.exit(1);
}

/* The entry is the module the HTML actually loads first. */
const entryMatch = html.match(/<script[^>]+src="\/(assets\/[^"]+\.js)"/);
if (!entryMatch) {
  console.error("✗ bundle budget: no entry script found in dist/index.html.");
  process.exit(1);
}
const entryFile = path.join(DIST, entryMatch[1]);
const entryKb = gzipKb(entryFile);

const jsFiles = readdirSync(ASSETS).filter((name) => name.endsWith(".js"));
const cssFiles = readdirSync(ASSETS).filter((name) => name.endsWith(".css"));

let totalJs = 0;
let largest = { name: "", kb: 0 };
for (const name of jsFiles) {
  const kb = gzipKb(path.join(ASSETS, name));
  totalJs += kb;
  if (kb > largest.kb) largest = { name, kb };
}
const totalCss = cssFiles.reduce((sum, name) => sum + gzipKb(path.join(ASSETS, name)), 0);

const rows = [
  ["entry", path.basename(entryFile), entryKb, BUDGET.entryGzipKb],
  ["largest chunk", largest.name, largest.kb, BUDGET.largestChunkGzipKb],
  ["all JS", `${jsFiles.length} files`, totalJs, BUDGET.totalJsGzipKb],
  ["all CSS", `${cssFiles.length} files`, totalCss, BUDGET.totalCssGzipKb],
];

let ok = true;
for (const [label, name, kb, budget] of rows) {
  const verdict = kb <= budget ? "✓" : "✗";
  if (kb > budget) ok = false;
  console.log(
    `${verdict} ${label.padEnd(14)} ${kb.toFixed(1).padStart(7)} kB gzip  (budget ${budget})  ${name}`,
  );
}

if (!ok) fail("one or more budgets were exceeded.");
else console.log("✔ bundle budget respected");
