import { defineConfig } from '@playwright/test'
import local from './playwright.config'

export default defineConfig({
  ...local,
  timeout: 60000,
  webServer: {
    command: 'npm run preview -- --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
  },
})
