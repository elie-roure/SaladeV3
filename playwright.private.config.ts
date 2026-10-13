import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e-private',
  timeout: 60000,
  fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:3001' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Edge'], channel: 'msedge' } },
    { name: 'mobile', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium', channel: 'msedge' } },
  ],
  webServer: {
    command: 'npx tsx server/e2e-server.ts',
    url: 'http://127.0.0.1:3001/api/health',
    reuseExistingServer: false,
  },
})
