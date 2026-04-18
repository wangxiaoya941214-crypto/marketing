import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT || "3101";
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ||
  process.env.APP_URL ||
  `http://127.0.0.1:${port}`;
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;

const config = defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || "test-results",
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME || "playwright-report/report.json",
      },
    ],
    [
      "html",
      {
        open: "never",
        outputFolder: process.env.PLAYWRIGHT_HTML_OUTPUT_DIR || "playwright-report/html",
      },
    ],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(browserChannel ? { channel: browserChannel } : {}),
      },
    },
  ],
});

if (!process.env.PLAYWRIGHT_DISABLE_WEB_SERVER) {
  config.webServer = {
    command: process.env.PLAYWRIGHT_WEB_SERVER_COMMAND || `env PORT=${port} npm start`,
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  };
}

export default config;
