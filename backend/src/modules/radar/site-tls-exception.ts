import tls, {type TLSSocket,type DetailedPeerCertificate} from 'node:tls'
import https from 'node:https'
import {X509Certificate} from 'node:crypto'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

export type RadarTlsExceptionGrant={id:string;organizationId:string;candidateId:string;runId:string;configurationRevision:number;
  hostname:string;fingerprint256:string;approvedBy:string;approvedAt:string;expiresAt:string;revokedAt?:string}
export type RadarTlsExceptionEvidence={grantId:string;hostname:string;fingerprint256:string;observedAt:string}
export type RadarExpiredCertificate={hostname:string;fingerprint256:string;validTo:string}
export type RadarTlsReadOptions={tlsException?:RadarTlsExceptionGrant;validateGrant?:(grant:RadarTlsExceptionGrant)=>Promise<boolean>;
  verifyCertificate?:typeof verifyRadarExpiredCertificate}
const invalid=()=>Object.assign(new Error('RADAR_TLS_EXCEPTION_INVALID'),{code:'RADAR_TLS_EXCEPTION_INVALID'})
const execute=promisify(execFile)
const openssl=process.platform==='win32'?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl'
function within(cert:X509Certificate,now:number){return Date.parse(cert.validFrom)<=now&&now<=Date.parse(cert.validTo)}

// Independent verification: Node may report expiry before a second certificate defect.
export async function verifyRadarExpiredCertificate(chain:Buffer[],hostname:string,now:Date,roots:readonly string[]=tls.rootCertificates):Promise<void> {
  if(!/^[a-z0-9.-]{1,253}$/i.test(hostname)||!chain.length||chain.length>10||chain.reduce((n,b)=>n+b.length,0)>65536)throw invalid()
  const certs=chain.map(value=>new X509Certificate(value)),leaf=certs[0],time=now.getTime()
  if(!Number.isFinite(time)||Date.parse(leaf.validFrom)>time||Date.parse(leaf.validTo)>=time||!leaf.checkHost(hostname))throw invalid()
  const trusted=roots.map(value=>new X509Certificate(value))
  for(let i=1;i<certs.length;i++)if(!certs[i-1].checkIssued(certs[i])||!certs[i-1].verify(certs[i].publicKey)||!within(certs[i],time))throw invalid()
  const last=certs[certs.length-1]
  const root=trusted.find(candidate=>candidate.fingerprint256===last.fingerprint256||last.checkIssued(candidate)&&last.verify(candidate.publicKey))
  if(!root||!within(root,time))throw invalid()
  const dir=await mkdtemp(join(tmpdir(),'yux-radar-tls-'))
  try {
    await Promise.all([writeFile(join(dir,'leaf.pem'),leaf.toString(),{mode:0o600}),writeFile(join(dir,'root.pem'),root.toString(),{mode:0o600}),
      writeFile(join(dir,'chain.pem'),certs.slice(1).map(c=>c.toString()).join('\n'),{mode:0o600})])
    const args=['verify','-no_check_time','-purpose','sslserver','-verify_hostname',hostname,'-CAfile',join(dir,'root.pem'),'-no-CApath','-no-CAstore']
    if(certs.length>1)args.push('-untrusted',join(dir,'chain.pem'))
    args.push(join(dir,'leaf.pem'))
    await execute(openssl,args,{timeout:2000,maxBuffer:4096,windowsHide:true})
  } catch(cause) {
    if((cause as NodeJS.ErrnoException)?.code==='ENOENT')throw Object.assign(new Error('RADAR_TLS_VERIFIER_UNAVAILABLE'),{code:'RADAR_TLS_VERIFIER_UNAVAILABLE'})
    throw invalid()
  } finally {await rm(dir,{recursive:true,force:true})}
}
function peerChain(socket:TLSSocket) {
  const result:Buffer[]=[],seen=new Set<string>()
  let cert=socket.getPeerCertificate(true) as DetailedPeerCertificate|undefined
  while(cert?.raw&&!seen.has(cert.fingerprint256)) {
    seen.add(cert.fingerprint256);result.push(cert.raw)
    if(result.length>10||result.reduce((n,b)=>n+b.length,0)>65536)throw invalid()
    cert=cert.issuerCertificate
  }
  if(!result.length)throw invalid()
  return result
}
function granted(grant:RadarTlsExceptionGrant,url:URL) {
  const now=Date.now(),start=Date.parse(grant.approvedAt),end=Date.parse(grant.expiresAt)
  return url.protocol==='https:'&&url.hostname===grant.hostname&&!grant.revokedAt&&Number.isFinite(start)&&Number.isFinite(end)
    &&start<=now&&now<end&&end-start<=3600000
}
async function checkedSocket(url:URL,address:string,verify:typeof verifyRadarExpiredCertificate,
  grant?:RadarTlsExceptionGrant,validate?:RadarTlsReadOptions['validateGrant']):Promise<{socket:TLSSocket;certificate:RadarExpiredCertificate}> {
  if(grant&&(!granted(grant,url)||validate&&!await validate(grant)))throw invalid()
  return new Promise((resolve,reject)=>{
    // No HTTP is sent on this socket until independent verification finishes.
    const socket=tls.connect({host:address,port:Number(url.port||443),servername:url.hostname,rejectUnauthorized:false,minVersion:'TLSv1.2'})
    const deadline=setTimeout(()=>socket.destroy(new Error('timeout')),8000)
    socket.once('close',()=>clearTimeout(deadline));socket.once('error',reject)
    socket.once('secureConnect',()=>{void (async()=>{
      const chain=peerChain(socket),leaf=new X509Certificate(chain[0])
      await verify(chain,url.hostname,new Date())
      if(socket.destroyed||grant&&(!granted(grant,url)||leaf.fingerprint256!==grant.fingerprint256||validate&&!await validate(grant)))throw invalid()
      clearTimeout(deadline)
      resolve({socket,certificate:{hostname:url.hostname,fingerprint256:leaf.fingerprint256,validTo:new Date(leaf.validTo).toISOString()}})
    })().catch(cause=>{socket.destroy();reject(cause)})})
  })
}
export async function probeRadarExpiredCertificate(url:URL,address:string):Promise<RadarExpiredCertificate> {
  const {socket,certificate}=await checkedSocket(url,address,verifyRadarExpiredCertificate)
  socket.destroy();return certificate
}
export function createRadarExpiredCertificateAgent(url:URL,address:string,options:RadarTlsReadOptions) {
  const agent=new https.Agent({keepAlive:false,maxCachedSessions:0})
  agent.createConnection=((_connectionOptions,callback)=>{
    const done=callback as ((error:Error|null,socket?:TLSSocket)=>void)|undefined
    void checkedSocket(url,address,options.verifyCertificate??verifyRadarExpiredCertificate,options.tlsException,options.validateGrant)
      .then(({socket})=>done?.(null,socket)).catch(cause=>done?.(cause))
    return undefined
  }) as typeof agent.createConnection
  return agent
}
