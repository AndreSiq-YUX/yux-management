import {it,expect} from 'vitest'
import {radarResearchMessage} from './radarResearchMessages'
it('distinguishes missing YUX wallet, internal balance and provider credits',()=>{
  const missing=radarResearchMessage('radar_ai_wallet_missing')
  expect(missing).toContain('carteira');expect(missing).toContain('YUX')
  expect(missing).not.toContain('Configure');expect(missing).not.toContain('disponibilidade do modelo')
  expect(radarResearchMessage('radar_ai_credits_insufficient')).toContain('créditos internos')
  expect(radarResearchMessage('openrouter_credit_required')).toContain('OpenRouter')
  expect(radarResearchMessage('agent_runtime_402')).toContain('Não repita')
})
it('distinguishes expired certificates, transport failures and explicit robots prohibition',()=>{
  expect(radarResearchMessage('robots_tls_expired')).toContain('certificado vencido')
  expect(radarResearchMessage('tls_invalid')).toContain('certificado inválido')
  expect(radarResearchMessage('robots_connection_reset')).toContain('interrompeu')
  expect(radarResearchMessage('robots_disallow')).toContain('não permite')
  expect(radarResearchMessage('radar_presence_waiting_public_read')).not.toContain('Configure')
  expect(radarResearchMessage('radar_profile_waiting_identity')).toContain('identidade')
})
