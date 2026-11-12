import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  expect: { timeout: 20000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: process.env.CI ? undefined : "chrome" },
    },
  ],
  webServer: {
    cwd: process.env.PLAYWRIGHT_APP_DIR ? resolve(process.env.PLAYWRIGHT_APP_DIR) : undefined,
    command: `npm run dev -- --hostname 127.0.0.1 --port ${new URL(baseURL).port || "3000"}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI && !process.env.PLAYWRIGHT_BASE_URL,
    timeout: 120000,
  },
});
