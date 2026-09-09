import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const compose = readFileSync(new URL('../../docker-compose.dokploy.yml', import.meta.url), 'utf8')

function serviceBlock(serviceName: string, nextServiceName: string) {
  const start = compose.indexOf(`  ${serviceName}:`)
  const end = compose.indexOf(`\n  ${nextServiceName}:`, start)
  expect(start, `${serviceName} must exist`).toBeGreaterThanOrEqual(0)
  expect(end, `${nextServiceName} must follow ${serviceName}`).toBeGreaterThan(start)
  return compose.slice(start, end)
}

describe('Dokploy deployment contract', () => {
  it('runs migrations and volume preparation as isolated one-shot services', () => {
    expect(compose).toContain('  yux-backend-migrate:')
    expect(compose).toContain('  yux-volume-permissions:')
    expect(compose).toContain('condition: service_completed_successfully')
    expect(compose).toContain('condition: service_healthy')
  })

  it('requires distinct least-privilege database URLs for runtime services', () => {
    expect(compose).toContain('DATABASE_URL: ${YUX_API_DATABASE_URL:?YUX_API_DATABASE_URL is required}')
    expect(compose).toContain('DATABASE_URL: ${YUX_WORKER_DATABASE_URL:?YUX_WORKER_DATABASE_URL is required}')
    expect(compose).toContain('DATABASE_URL: ${YUX_RUNTIME_DATABASE_URL:?YUX_RUNTIME_DATABASE_URL is required}')
    expect(compose).not.toContain('${YUX_API_DATABASE_URL:-${DATABASE_URL}}')
    expect(compose).not.toContain('${YUX_WORKER_DATABASE_URL:-${DATABASE_URL}}')
    expect(compose).not.toContain('${YUX_RUNTIME_DATABASE_URL:-${DATABASE_URL}}')
  })

  it('does not expose migrator credentials to the API process', () => {
    const api = serviceBlock('yux-backend-api', 'yux-backend-worker')
    expect(api).not.toContain('MIGRATOR_DATABASE_URL')
  })

  it('prepares every application-owned persistent volume for uid 1000', () => {
    const initializer = serviceBlock('yux-volume-permissions', 'yux-backend-api')
    expect(initializer).toContain('user: "0:0"')
    expect(initializer).toContain('chown -R 1000:1000')
    expect(initializer).toContain('yux_materials_data:/app/storage/materials')
    expect(initializer).toContain('yux_omnichannel_attachments_data:/app/storage/omnichannel-attachments')
    expect(initializer).toContain('yux_company_knowledge_data:/app/storage/company-knowledge')
  })
})
