import {domainToASCII} from 'node:url'
import {isIP} from 'node:net'
export type RadarEmailDomainPolicy={genericProviders:string[];accountantTokens:string[]}
export type RadarEmailDomainSignal={domain?:string;kind:'absent'|'generic_provider'|'possible_accountant'|'corporate_candidate';outcome:'not_applicable'|'unconfirmed'|'confirmed'|'unreachable';messagePt:string;checkedAt?:string}
/** This is a hint only. Every public read still uses the existing DNS/SSRF/TLS reader. */
export function classifyRadarEmailDomain(email:unknown,policy:RadarEmailDomainPolicy):RadarEmailDomainSignal{
 const absent:RadarEmailDomainSignal={kind:'absent',outcome:'not_applicable',messagePt:'Sem e-mail cadastral válido para indicar o site.'}
 if(typeof email!=='string'||! /^[^\s@]+@[^\s@]+$/.test(email.trim()))return absent
 const raw=email.trim().split('@')[1]
 if(/[\/:?#\[\]\\%]/.test(raw))return absent
 const domain=domainToASCII(raw).toLowerCase()
 if(!domain||isIP(domain)||domain.length>253||!domain.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))||!domain.includes('.')||/\.(local|localhost|internal|test|invalid|example)$/.test(domain)||!/[a-z]/.test(domain.split('.').at(-1)!))return absent
 if(policy.genericProviders.some(value=>domain===value.trim().toLowerCase()))return{domain,kind:'generic_provider',outcome:'not_applicable',messagePt:'O e-mail cadastral usa um provedor genérico e não indica o site da empresa.'}
 if(policy.accountantTokens.some(value=>!!value.trim()&&domain.includes(value.trim().toLowerCase())))return{domain,kind:'possible_accountant',outcome:'unconfirmed',messagePt:'O domínio pode pertencer a uma assessoria; a relação com a empresa não foi confirmada.'}
 return{domain,kind:'corporate_candidate',outcome:'unconfirmed',messagePt:'Domínio do e-mail encontrado como candidato a site; identidade ainda não confirmada.'}
}
