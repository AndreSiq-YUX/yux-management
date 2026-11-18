import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const frontendDirectory = path.dirname(fileURLToPath(import.meta.url))
const database = new URL(process.env.YUX_INTEGRATION_DATABASE_URL ?? 'postgresql://invalid/invalid')
if (database.hostname !== '127.0.0.1' || !/^\/yux_test_agent_pilot_browser(?:_\w+)?$/.test(database.pathname)) {
  throw new Error('Use YUX_INTEGRATION_DATABASE_URL with a dedicated loopback database named yux_test_agent_pilot_browser')
}
const runtimeDatabase = new URL(database)
runtimeDatabase.username = 'yux_runtime'
runtimeDatabase.password = 'integration-service-password'

export default defineConfig({
  testDir: path.resolve(frontendDirectory, 'tests/journeys/browser'),
  testMatch: 'agent-pilots.pilot.ts',
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    ...devices['Desktop Chrome'], channel: 'chrome', baseURL: 'http://127.0.0.1:4187',
    actionTimeout: 15_000, trace: 'retain-on-failure',
  },
  webServer: [
    {
      name: 'preview-runtime',
      command: 'python -m uvicorn yux_agent_runtime.api:app --host 127.0.0.1 --port 4189',
      cwd: path.resolve(frontendDirectory, '../workers/marketing-studio-agent-runtime'),
      env: { DATABASE_URL: runtimeDatabase.href, YUX_AGENT_RUNTIME_TOKEN: 'agent-pilot-browser-fixture', OPENROUTER_API_KEY: '', OPENAI_API_KEY: '' },
      url: 'http://127.0.0.1:4189/health', timeout: 120_000, stderr: 'pipe',
    },
    {
      name: 'pilot-backend',
      command: 'npx --no-install tsx tests/journeys/start-agent-pilot-server.ts',
      cwd: path.resolve(frontendDirectory, '../backend'),
      url: 'http://127.0.0.1:4188/api/health', timeout: 120_000, stderr: 'pipe',
    },
    {
      name: 'frontend',
      command: 'npm run dev -- --host 127.0.0.1 --port 4187 --strictPort',
      cwd: frontendDirectory,
      env: { VITE_API_BASE_URL: 'http://127.0.0.1:4188/api' },
      url: 'http://127.0.0.1:4187/auth/login', timeout: 120_000, stderr: 'pipe',
    },
  ],
})
