import { describe, expect, it } from 'vitest'
import type { AppEnv } from '../src/config/env.js'
import { strategyIngestionCapabilities } from '../src/modules/strategy-engine/ingestion.js'

describe('strategy ingestion capabilities', () => {
  it('expõe somente capacidade e prontidão, sem valores secretos', () => {
    const capabilities = strategyIngestionCapabilities({
      STRATEGY_INGESTION_MAX_MB: 150,
      KNOWLEDGE_CURATION_ENABLED: true,
      YUX_AGENT_RUNTIME_URL: 'https://runtime.internal',
      YUX_AGENT_RUNTIME_TOKEN: 'runtime-secret',
      OPENROUTER_API_KEY: 'openrouter-secret',
    } as AppEnv)

    expect(capabilities).toEqual({
      maxBytes: 150 * 1024 * 1024,
      maxMb: 150,
      acceptedMimeTypes: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'text/markdown',
      ],
      structuredIngestion: {
        curationEnabled: true,
        runtimeConfigured: true,
        embeddingConfigured: true,
        ready: true,
      },
    })
    expect(JSON.stringify(capabilities)).not.toContain('secret')
  })

  it('diferencia configuração incompleta de indisponibilidade do fluxo', () => {
    const capabilities = strategyIngestionCapabilities({
      KNOWLEDGE_CURATION_ENABLED: true,
      YUX_AGENT_RUNTIME_URL: 'https://runtime.internal',
    } as AppEnv)

    expect(capabilities.structuredIngestion).toEqual({
      curationEnabled: true,
      runtimeConfigured: false,
      embeddingConfigured: false,
      ready: false,
    })
  })
})
