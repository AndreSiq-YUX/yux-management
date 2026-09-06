import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const frontendDirectory = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  testDir: path.resolve(frontendDirectory, 'tests/journeys/browser'),
  testMatch: '**/*.pw.ts',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: path.resolve(frontendDirectory, 'test-results/yux-acceptance.json') }],
    ['html', { outputFolder: path.resolve(frontendDirectory, 'playwright-report'), open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER ? undefined : [
    {
      name: 'agent-runtime',
      command: 'python -m uvicorn yux_agent_runtime.api:app --host 127.0.0.1 --port 4001',
      cwd: path.resolve(frontendDirectory, '../workers/marketing-studio-agent-runtime'),
      env: {
        ...process.env,
        DATABASE_URL: 'postgresql://yux_runtime:integration-service-password@127.0.0.1:55432/yux_test_integration',
        YUX_AGENT_RUNTIME_TOKEN: 'integration-runtime-token',
      },
      url: 'http://127.0.0.1:4001/health',
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      name: 'backend',
      command: 'npx tsx tests/journeys/start-acceptance-server.ts',
      cwd: path.resolve(frontendDirectory, '../backend'),
      env: {
        ...process.env,
        YUX_AGENT_RUNTIME_URL: 'http://127.0.0.1:4001',
        YUX_AGENT_RUNTIME_TOKEN: 'integration-runtime-token',
      },
      url: 'http://127.0.0.1:4000/api/health',
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      name: 'frontend',
      command: 'npm run dev -- --host 127.0.0.1 --port 4173',
      cwd: frontendDirectory,
      env: { ...process.env, VITE_API_BASE_URL: 'http://127.0.0.1:4000/api' },
      url: 'http://127.0.0.1:4173/auth/login',
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
})
