#!/usr/bin/env node
/**
 * Source maps must never be served (task 9, hardened).
 *
 * `sourcemap: 'hidden'` still writes `*.js.map` into `dist/`. The Firebase
 * ignore list (`** /*.map`) only protects the Firebase path: the Sites/Workers
 * manifest (`deploy/manifest.json`) uploads `../dist` wholesale, and a manual
 * `firebase deploy` on a future config change could too. So the build now ends
 * with this script, which:
 *
 *   1. uploads the maps to Sentry when a token is present (so crash reports
 *      keep real line numbers), and
 *   2. deletes every `*.map` from dist, then verifies none is left.
 *
 * Usage:
 *   node scripts/finalize-dist.mjs              # upload (optional) + delete + verify
 *   node scripts/finalize-dist.mjs --verify-only  # fail if a map exists
 *
 * Environment (all optional):
 *   SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT  → enables the upload
 *   SENTRY_RELEASE (or VITE_SENTRY_RELEASE)        → release name; must match
 *                                                    the `release` the app sends
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";

const DIST = path.resolve("dist");
const verifyOnly = process.argv.includes("--verify-only");

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function findMaps() {
  return walk(DIST).filter((file) => file.endsWith(".map"));
}

function readVersion() {
  try {
    return JSON.parse(readFileSync("package.json", "utf8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function resolveRelease() {
  return (
    process.env.SENTRY_RELEASE ||
    process.env.VITE_SENTRY_RELEASE ||
    `sauti-baqaya@${readVersion()}`
  );
}

function reportMaps(maps) {
  for (const file of maps) {
    console.error(`  ✗ ${path.relative(process.cwd(), file)}`);
  }
}

if (!existsSync(DIST)) {
  console.error("✗ finalize-dist: dist/ not found — run `bun run build` first.");
  process.exit(1);
}

const before = findMaps();

if (verifyOnly) {
  if (before.length > 0) {
    console.error(`✗ ${before.length} source map(s) are still in dist — refusing to continue.`);
    reportMaps(before);
    process.exit(1);
  }
  console.log("✔ no source maps in dist");
  process.exit(0);
}

if (before.length === 0) {
  console.log("✔ finalize-dist: no source maps to remove");
  process.exit(0);
}

/* --- 1. Sentry upload (best effort, never blocks the deploy) -------------- */
const token = process.env.SENTRY_AUTH_TOKEN;
const org = process.env.SENTRY_ORG;
const project = process.env.SENTRY_PROJECT;

if (!token || !org || !project) {
  console.log(
    "… finalize-dist: SENTRY_AUTH_TOKEN/ORG/PROJECT not set — maps will be deleted without uploading.",
  );
} else {
  const release = resolveRelease();
  console.log(`… finalize-dist: uploading ${before.length} map(s) to Sentry (release ${release})`);
  const result = spawnSync(
    "npx",
    [
      "--yes",
      "@sentry/cli",
      "sourcemaps",
      "upload",
      "--org",
      org,
      "--project",
      project,
      "--release",
      release,
      "--url-prefix",
      "~/assets",
      "--validate",
      "./dist",
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) {
    /* A failed upload costs stack-trace detail, not security: the maps are
       deleted below either way. Surfaced as a CI warning, not a build failure. */
    console.warn(
      `::warning::Sentry source-map upload failed (exit ${result.status ?? "signal"}). Maps will still be deleted.`,
    );
  }
}

/* --- 2. Delete, then prove it -------------------------------------------- */
let removed = 0;
for (const file of before) {
  rmSync(file, { force: true });
  removed += 1;
}

const after = findMaps();
if (after.length > 0) {
  console.error(`✗ ${after.length} source map(s) survived deletion.`);
  reportMaps(after);
  process.exit(1);
}

console.log(`✔ finalize-dist: removed ${removed} source map(s); dist is clean`);
