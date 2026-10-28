import { defineConfig } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3410);

export default defineConfig({
  testDir: "tests",
  timeout: 90_000,
  use: { baseURL: `http://localhost:${port}`, viewport: { width: 1440, height: 1000 } },
  webServer: {
    command: `pnpm exec next dev --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { NEXT_PUBLIC_GOOGLE_CLIENT_ID: "test-client.apps.googleusercontent.com" },
  },
});
