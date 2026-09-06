import { describe, expect, it } from 'vitest'
import { effectiveStrategyIngestionLimit, hasMeaningfulPdfText, STRATEGY_INGESTION_HARD_LIMIT_BYTES } from '../src/modules/strategy-engine/ingestion.js'

describe('strategy ingestion boundaries', () => {
  it('não trata o marcador de página do parser como texto extraído', () => {
    expect(hasMeaningfulPdfText('\n\n-- 1 of 1 --\n\n')).toBe(false)
    expect(hasMeaningfulPdfText('Conteúdo estratégico válido\n\n-- 1 of 1 --')).toBe(true)
  })

  it('limita a configuração efetiva ao teto de 50 MiB', () => {
    expect(effectiveStrategyIngestionLimit()).toBe(STRATEGY_INGESTION_HARD_LIMIT_BYTES)
    expect(effectiveStrategyIngestionLimit(10)).toBe(10 * 1024 * 1024)
    expect(effectiveStrategyIngestionLimit(200)).toBe(STRATEGY_INGESTION_HARD_LIMIT_BYTES)
  })
})
