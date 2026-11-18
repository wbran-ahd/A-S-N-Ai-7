import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Unit tests (task 4).
 *
 * These run on Bun (`bun run test:unit`) but use Vitest's runner so the same
 * files run in CI. The environment stays `node`: the pieces under test —
 * `khataReducer`, the upload/merge planners and the voice grammar — are pure
 * and must not need a DOM.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    reporters: ["default"],
  },
});
