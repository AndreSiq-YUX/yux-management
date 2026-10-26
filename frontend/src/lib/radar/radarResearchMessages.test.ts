import {it,expect} from 'vitest'
import {radarResearchMessage} from './radarResearchMessages'
it('explains invalid municipality preparation separately from an uncertain dispatched search',()=>{
 expect(radarResearchMessage('cnpja_municipality_not_found')).toContain('cidade')
 expect(radarResearchMessage('cnpja_municipality_not_found')).toContain('Nenhuma consulta foi enviada')
 expect(radarResearchMessage('cnpja_city_requires_state')).toContain('UF')
 expect(radarResearchMessage('radar_discovery_request_uncertain')).toContain('Não repita')
})
it('distinguishes a pre-provider authorization mismatch from an uncertain paid call',()=>{
 const message=radarResearchMessage('radar_analysis_retry_policy_changed');
 expect(message).toContain('limites ou modelos');expect(message).toContain('Nenhuma chamada ao modelo');expect(message).toContain('conciliação');
 expect(radarResearchMessage('decision_observation_capacity_reserved')).toContain('não foi executada');
})
it('explains a stale continuation confirmation without leaking technical codes',()=>{
  expect(radarResearchMessage('radar_capture_continuation_confirmation_stale')).toContain('Atualize')
  expect(radarResearchMessage('radar_capture_continuation_confirmation_required')).toContain('confirmação')
})
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
it('explains capture rejection, uncertain responses and active processing separately',()=>{
  expect(radarResearchMessage('radar_capture_discovery_request_rejected')).toContain('rejeitada')
  expect(radarResearchMessage('radar_capture_discovery_request_rejected')).toContain('Retomar')
  expect(radarResearchMessage('radar_capture_discovery_uncertain')).toContain('Não repita')
  expect(radarResearchMessage('radar_capture_discovery_uncertain')).not.toContain('rejeitada')
  expect(radarResearchMessage('provider_failed')).toContain('resposta')
  expect(radarResearchMessage('radar_capture_in_progress')).toContain('Aguarde')
  for(const code of ['radar_capture_research_unavailable','radar_capture_model_route_missing','radar_capture_queue_unavailable']){
    expect(radarResearchMessage(code)).not.toBe(code)
  }
})
