import {beforeAll,afterAll,afterEach,it,expect,vi} from 'vitest'
import https from 'node:https'
import {X509Certificate} from 'node:crypto'
import {rmSync} from 'node:fs'
import type {AddressInfo} from 'node:net'
import {createRadarTlsFixtures} from './helpers/radar-tls-fixtures.js'
import {getRadarPublicPage} from '../src/modules/radar/b2b-site-inspection.js'
import {verifyRadarExpiredCertificate} from '../src/modules/radar/site-tls-exception.js'
let fixture:ReturnType<typeof createRadarTlsFixtures>
beforeAll(()=>{fixture=createRadarTlsFixtures()},20000)
afterAll(()=>rmSync(fixture.dir,{recursive:true,force:true}))
const servers:https.Server[]=[]
afterEach(async()=>{vi.restoreAllMocks();await Promise.all(servers.splice(0).map(server=>new Promise<void>(r=>{server.closeAllConnections();server.close(()=>r())})))})
const grant=()=>{const now=Date.now();return {id:'grant',organizationId:'org',candidateId:'candidate',runId:'run',configurationRevision:1,hostname:'public.example',
  fingerprint256:new X509Certificate(fixture.expired).fingerprint256,approvedBy:'admin',approvedAt:new Date(now).toISOString(),expiresAt:new Date(now+3600000).toISOString()}}
async function serve(cert=fixture.expired,hostname='public.example') {
  const requests:Array<{url?:string;headers:Record<string,unknown>}>=[]
  const server=https.createServer({key:fixture.key,cert},(req,res)=>{requests.push({url:req.url,headers:req.headers});res.writeHead(200,{'content-type':'text/html'});res.end('Public information for supplier contact')})
  servers.push(server);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r))
  return {requests,url:new URL(`https://${hostname}:${(server.address() as AddressInfo).port}/`)}
}
const verify=(chain:Buffer[],host:string,now:Date)=>verifyRadarExpiredCertificate(chain,host,now,[fixture.root])
it('verifies trusted chain ignoring only expired leaf and rejects combined hostname/trust/time failures',async()=>{
  await expect(verify([fixture.expired],'public.example',new Date())).resolves.toBeUndefined()
  await expect(verify([fixture.expired],'wrong.example',new Date())).rejects.toThrow()
  await expect(verifyRadarExpiredCertificate([fixture.expired],'public.example',new Date(),[])).rejects.toThrow()
  await expect(verify([fixture.future],'public.example',new Date())).rejects.toThrow()
  await expect(verify([fixture.chainLeaf,fixture.intermediate],'public.example',new Date())).rejects.toThrow()
})
it('sends no HTTP before approval and permits only public GET after independent verification',async()=>{
  const {url,requests}=await serve(),initial=process.env.NODE_TLS_REJECT_UNAUTHORIZED
  await expect(getRadarPublicPage(url,'127.0.0.1')).rejects.toThrow()
  expect(requests).toEqual([])
  const result=await getRadarPublicPage(url,'127.0.0.1',{tlsException:grant(),verifyCertificate:verify})
  expect(result.body).toContain('supplier contact');expect(result.tlsException?.grantId).toBe('grant')
  expect(requests).toHaveLength(1);expect(requests[0].headers.authorization).toBeUndefined();expect(requests[0].headers.cookie).toBeUndefined()
  expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe(initial)
})
it.each(['fingerprint','expired','revoked','hostname','revalidation'])('rejects %s authorization before GET',async invalid=>{
  const {url,requests}=await serve(),value=grant()
  if(invalid==='fingerprint')value.fingerprint256='00'
  if(invalid==='expired')value.expiresAt=new Date(Date.now()-1).toISOString()
  if(invalid==='revoked')Object.assign(value,{revokedAt:new Date().toISOString()})
  if(invalid==='hostname')value.hostname='other.example'
  await expect(getRadarPublicPage(url,'127.0.0.1',{tlsException:value,verifyCertificate:verify,
    validateGrant:async()=>invalid!=='revalidation'})).rejects.toThrow()
  expect(requests).toEqual([])
})
it('does not send HTTP when an approved expired certificate also has the wrong hostname',async()=>{
  const {url,requests}=await serve(fixture.expired,'wrong.example')
  await expect(getRadarPublicPage(url,'127.0.0.1',{tlsException:{...grant(),hostname:'wrong.example'},verifyCertificate:verify})).rejects.toThrow()
  expect(requests).toEqual([])
})
it('uses normal TLS without an exception when the owner has renewed the certificate',async()=>{
  const {url,requests}=await serve(fixture.valid)
  const request=https.request
  vi.spyOn(https,'request').mockImplementation(((target:URL,options:https.RequestOptions,callback:Parameters<typeof https.request>[1])=>request(target,{...options,ca:fixture.root},callback as never)) as unknown as typeof https.request)
  const result=await getRadarPublicPage(url,'127.0.0.1',{tlsException:grant(),verifyCertificate:verify})
  expect(result.body).toContain('supplier contact');expect(result.tlsException).toBeUndefined();expect(requests).toHaveLength(1)
})
it('rechecks revocation after the TLS handshake before sending HTTP',async()=>{
  const {url,requests}=await serve();let checks=0
  await expect(getRadarPublicPage(url,'127.0.0.1',{tlsException:grant(),verifyCertificate:verify,validateGrant:async()=>++checks===1})).rejects.toThrow()
  expect(requests).toEqual([]);expect(checks).toBe(2)
})
