import {it,expect} from 'vitest'
import {authorizeRadarTlsException,revokeRadarTlsException,radarTlsDiagnosticId} from '../src/modules/radar/tls-exception-service.js'
it.each(['client_admin','client_member','yux_operator'])('refuses %s approval/revocation without any mutation',async role=>{
  const pool={query:()=>{throw new Error('unexpected database access')}} as never,user={id:'user',role} as never
  await expect(authorizeRadarTlsException(pool,user,{} as never)).rejects.toMatchObject({statusCode:403})
  await expect(revokeRadarTlsException(pool,user,{} as never)).rejects.toMatchObject({statusCode:403})
})
it('binds a diagnostic to research, hostname and exact expired certificate',()=>{
  const page={url:'https://public.example/',certificate:{hostname:'public.example',fingerprint256:'AA',validTo:'2020-01-01'}}
  expect(radarTlsDiagnosticId('run',page)).toMatch(/^[a-f0-9]{64}$/)
  expect(radarTlsDiagnosticId('run',page)).not.toBe(radarTlsDiagnosticId('another',page))
  expect(radarTlsDiagnosticId('run',page)).not.toBe(radarTlsDiagnosticId('run',{...page,certificate:{...page.certificate,fingerprint256:'BB'}}))
})
