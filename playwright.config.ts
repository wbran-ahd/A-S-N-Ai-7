import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end smoke (task 4).
 *
 * Scope is deliberately tiny: add a record → undo it → download a backup. Those
 * three actions are the shopkeeper's core loop and the one place where a
 * regression silently loses money. Run with `bun run test:e2e` after
 * `bunx playwright install chromium`.
 */
const CHROME_DIR = process.env.PLAYWRIGHT_CHROMIUM_DIR
  ?? "/workspace/homes/b87a07b8b2747f7e32722206/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: process.env.CI ? "list" : "line",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    locale: "ur-PK",
    ...devices["Pixel 7"],
    launchOptions: { args: ['--no-sandbox'],
      executablePath: `${CHROME_DIR}/chrome-headless-shell`,
    },
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "bun run dev",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
