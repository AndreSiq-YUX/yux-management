export type RadarReadDiagnostic = {
  stage: 'dns'|'robots'|'page'
  kind: 'tls_expired'|'tls_invalid'|'timeout'|'connection_reset'|'connection_refused'|'dns'|'transport'|'content'
  code: string
}
const tlsCodes=new Set(['CERT_NOT_YET_VALID','ERR_TLS_CERT_ALTNAME_INVALID','DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','CERT_SIGNATURE_FAILURE',
  'CERT_REVOKED','ERR_SSL_TLSV1_ALERT_UNKNOWN_CA','RADAR_TLS_EXCEPTION_INVALID','RADAR_TLS_VERIFIER_UNAVAILABLE'])
export function classifyRadarReadError(cause:unknown,stage:RadarReadDiagnostic['stage']):{reason:string;diagnostic:RadarReadDiagnostic} {
  const error=cause as {code?:unknown;message?:unknown}|null
  const raw=typeof error?.code==='string'?error.code:typeof error?.message==='string'?error.message:''
  let kind:RadarReadDiagnostic['kind']='transport',code='TRANSPORT_FAILED'
  if(raw==='CERT_HAS_EXPIRED'){kind='tls_expired';code=raw}
  else if(tlsCodes.has(raw)){kind='tls_invalid';code=raw}
  else if(['timeout','ETIMEDOUT','ESOCKETTIMEDOUT'].includes(raw)){kind='timeout';code='ETIMEDOUT'}
  else if(raw==='ECONNRESET'||raw==='response_interrupted'){kind='connection_reset';code=raw}
  else if(raw==='ECONNREFUSED'){kind='connection_refused';code=raw}
  else if(['ENOTFOUND','EAI_AGAIN'].includes(raw)){kind='dns';code=raw}
  else if(raw==='page_too_large'){kind='content';code=raw}
  const prefix=stage==='robots'?'robots_':stage==='dns'?'dns_':''
  const reason=kind==='transport'?(stage==='robots'?'robots_transport_failed':stage==='dns'?'dns_failed':'request_failed')
    :kind==='content'?'page_too_large':kind==='connection_reset'&&raw==='response_interrupted'&&stage==='page'?'response_interrupted':`${prefix}${kind}`
  return {reason,diagnostic:{stage,kind,code}}
}
