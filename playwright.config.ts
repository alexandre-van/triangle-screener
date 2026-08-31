import { defineConfig, devices } from "@playwright/test";

// A fixed, project-specific port: 3000 is routinely occupied by another app,
// and reusing whatever answers there silently tests the wrong thing.
const PORT = 3117;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // One worker, always. Every spec triggers a scan of the whole universe, and
  // those all queue behind one server-side rate limiter — running specs in
  // parallel just makes each of them three times slower.
  workers: 1,
  reporter: process.env.CI ? [["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
