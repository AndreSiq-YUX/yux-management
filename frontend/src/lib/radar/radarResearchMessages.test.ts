import {it,expect} from 'vitest'
import {radarResearchMessage} from './radarResearchMessages'
it('distinguishes expired certificates, transport failures and explicit robots prohibition',()=>{
  expect(radarResearchMessage('robots_tls_expired')).toContain('certificado vencido')
  expect(radarResearchMessage('tls_invalid')).toContain('certificado inválido')
  expect(radarResearchMessage('robots_connection_reset')).toContain('interrompeu')
  expect(radarResearchMessage('robots_disallow')).toContain('não permite')
  expect(radarResearchMessage('radar_presence_waiting_public_read')).not.toContain('Configure')
  expect(radarResearchMessage('radar_profile_waiting_identity')).toContain('identidade')
})
