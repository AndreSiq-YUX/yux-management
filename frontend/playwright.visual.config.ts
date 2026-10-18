import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

const frontendDirectory = path.dirname(fileURLToPath(import.meta.url))

/**
 * Harness de capturas visuais do portal do cliente.
 * Sem backend e sem runtime de agentes: todas as chamadas /api/** sao respondidas
 * por fixtures em tests/visual/fixtures (ver tests/visual/README.md).
 */
export default defineConfig({
  testDir: path.resolve(frontendDirectory, 'tests/visual'),
  testMatch: '**/*.visual.ts',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: path.resolve(frontendDirectory, 'test-results/visual-artifacts'),
  use: {
    channel: 'msedge',
    baseURL: 'http://127.0.0.1:4180',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4180',
    cwd: frontendDirectory,
    env: { ...process.env, VITE_API_BASE_URL: '/api' } as Record<string, string>,
    url: 'http://127.0.0.1:4180/auth/login',
    timeout: 120_000,
    reuseExistingServer: true,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
