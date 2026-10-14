import { describe, it, expect } from 'vitest'
import { inspectRadarBusinessSite } from '../src/modules/radar/b2b-site-inspection.js'
import { collectRadarSiteEvidence, isRetryableRadarPage } from '../src/modules/radar/site-evidence.js'

describe('public reader diagnostics', () => {
  it('never downgrades an HTTPS site to plaintext after a redirect',async()=>{
    const requested:string[]=[]
    const result=await inspectRadarBusinessSite('https://public.example/',{resolve:async()=>['8.8.8.8'],get:async url=>{
      requested.push(url.toString());return url.pathname==='/robots.txt'?{status:404}:{status:301,location:'http://public.example/'}
    }})
    expect(result).toMatchObject({status:'blocked',reason:'https_downgrade_blocked'})
    expect(requested).toEqual(['https://public.example/robots.txt','https://public.example/'])
  })
  it.each([
    ['CERT_HAS_EXPIRED','robots_tls_expired','tls_expired'],
    ['ERR_TLS_CERT_ALTNAME_INVALID','robots_tls_invalid','tls_invalid'],
    ['ECONNRESET','robots_connection_reset','connection_reset'],
    ['ECONNREFUSED','robots_connection_refused','connection_refused'],
    ['ETIMEDOUT','robots_timeout','timeout'],
    ['SECRET-token','robots_transport_failed','transport'],
  ])('preserves safe classification for %s without reading HTML', async (code,reason,kind) => {
    const requested:string[]=[]
    const result=await inspectRadarBusinessSite('https://public.example/',{resolve:async()=>['8.8.8.8'],get:async url=>{
      requested.push(url.pathname);throw Object.assign(new Error('SECRET-token path password'),{code})
    }})
    expect(result).toMatchObject({status:'unknown',reason,diagnostic:{stage:'robots',kind}})
    expect(JSON.stringify(result)).not.toContain('SECRET')
    expect(requested).toEqual(['/robots.txt'])
  })
  it('preserves diagnostics in saved pages and permits explicit retry',async()=>{
    const pages=await collectRadarSiteEvidence('https://public.example/',{maxPagesPerCandidate:2},{inspect:async()=>({
      status:'unknown',checkedAt:'2026-10-14T12:00:00Z',emails:[],phones:[],reason:'robots_tls_expired',
      diagnostic:{stage:'robots',kind:'tls_expired',code:'CERT_HAS_EXPIRED'},
    })})
    expect(pages[0]).toMatchObject({diagnostic:{kind:'tls_expired'}})
    expect(isRetryableRadarPage(pages[0])).toBe(true)
  })
})
