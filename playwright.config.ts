import { defineConfig, devices } from "@playwright/test";

// A fixed, project-specific port: 3000 is routinely occupied by another app,
// and reusing whatever answers there silently tests the wrong thing.
const PORT = 3117;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
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
