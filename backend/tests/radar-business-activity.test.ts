import { expect, it } from 'vitest'
import { assessRadarBusinessActivity } from '../src/modules/radar/business-activity.js'
it('does_not_mark_http200_or_active_cnpj_or_copyright_as_operating', () => {
  expect(assessRadarBusinessActivity([{ url:'https://example.com', observedAt:'2026-10-08', text:'CNPJ ativo. Copyright 2026. HTTP 200' }]).status).toBe('inconclusive')
})
it('keeps_conflicting_closure_signals', () => {
  const result = assessRadarBusinessActivity([{ url:'https://example.com', observedAt:'2026-10-08', text:'Encerramos nossas atividades.' },
    { url:'https://example.com/noticia', observedAt:'2026-10-08', text:'2026-10-01: Estamos atendendo novos clientes.' }])
  expect(result.status).toBe('conflicting')
  expect(result.signals).toHaveLength(2)
})
