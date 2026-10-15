import {normalizeRadarText} from './search-configuration.js'

export function classifyRadarSource(value:string,evidence:{title?:string;text?:string;html?:string}={}) {
  type Role='institutional_candidate'|'government_reference'|'directory_reference'|'editorial_reference'|'social_profile'|'external_reference'
  const result=(kind:'institutional_candidate'|'directory'|'social'|'third_party',reason:string,role:Role=kind==='directory'?'directory_reference':kind==='social'?'social_profile':kind==='third_party'?'external_reference':'institutional_candidate')=>({kind,role,reasons:[reason]})
  try{
    const url=new URL(value),host=url.hostname.toLowerCase(),path=decodeURIComponent(url.pathname)
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return result('third_party','Endereço público inválido.')
    if(/(^|\.)(instagram\.com|facebook\.com|linkedin\.com|youtube\.com|tiktok\.com|wa\.me|whatsapp\.com)$/.test(host))return result('social','Perfil social exige associação de titularidade.')
    if(/(^|\.)(google\.[a-z.]+|maps\.apple\.com|jusbrasil\.com\.br)$/.test(host))return result('third_party','Referência externa; não é o site institucional.')
    const text=normalizeRadarText(`${evidence.title??''} ${evidence.text??''}`)
    const government=/(^|\.)(?:gov\.br|leg\.br|jus\.br)$/.test(host)
    const governmentDocument=/\/(?:ata|atas|licitac(?:ao|oes)|pregao|bec_pregao_ui|transparencia|diario[-_]?oficial|contratos|documentos)(?:\/|_|\.|$)/i.test(path)
      ||/(?:aviso de licitacao|ata de (?:registro|pregao)|extrato de contrato|fornecedor contratado|empresa contratada|objeto da contratacao)/.test(text)
    if(government&&governmentDocument)return result('third_party','Documento governamental: citar uma empresa não demonstra titularidade da página.','government_reference')
    const thirdPartyProfile=/\/(?:associados?|associadas?|clientes?|parceiros?|empresas[-_]?listadas)(?:\/[^/]+|\.php)/i.test(path)
      ||/(?:conheca (?:nossa associada|nosso associado|nosso cliente|nosso parceiro)\b|contato do editor|(?:empresa|companhia) [^.]{0,100}(?:consta como associada|esta entre as associadas))/.test(text)
    if(thirdPartyProfile)return result('third_party','Perfil publicado por associação, cliente ou parceiro: identidade citada não comprova titularidade da página.')
    if(/(^|\.)(escavador\.com)$/.test(host)||/\/(?:diarios|noticias|reportagens)(?:\/|$)/i.test(path)
      &&/(?:diario oficial|publicado por|reportagem|noticia sobre)/.test(text))return result('third_party','Publicação de terceiro; usar como evidência, não como site da empresa.','editorial_reference')
    const known=/(^|\.)(serasaexperian\.com\.br|empresadois\.com\.br|dardus\.com\.br|econodata\.com\.br|cnpja\.com|cnpj\.biz|casadosdados\.com\.br|solutudo\.com\.br|telelistas\.net|cadastroempresa\.com\.br|restaurantepertodemim\.com|diariocidade\.com|balancos\.com\.br)$/.test(host)
    const structured=/\/(?:cnpj|consulta[-_]?gratis|consulta[-_]?empresa|consulta[-_]?cnpj|empresas?\/\d)(?:\/|-|$|\d)/i.test(path)
      ||/\/(?:fornecedor|empresa)\/[^/]*\d{14}/i.test(path)
      ||/\/(?:guia|diretorio|lista[-_]?completa)\/.+/i.test(path)
    const directoryText=/consulta (?:gratis|gratuita|cnpj)|consultar cnpj|dados cadastrais da empresa|este nao e o site da empresa/.test(text)
    if(known||structured||directoryText)return result('directory','Cadastro de terceiro: citar o CNPJ não comprova propriedade da página ou de seus contatos.')
    return result('institutional_candidate','Domínio candidato; identidade e titularidade ainda precisam de evidência.')
  }catch{return result('third_party','Endereço inválido ou ilegível.')}
}

export function isRadarInstitutionalSource(url:string,evidence:{title?:string;text?:string;html?:string}={}) {
  return classifyRadarSource(url,evidence).kind==='institutional_candidate'
}

// Identity citation and publisher ownership are different claims. A bare CNPJ
// on an unknown publisher cannot bypass the configured identity analysis.
export function hasRadarOwnershipSignal(url:string,identity:{name:string;legalName?:string;cnpj?:string},evidence:{text:string;html?:string}):boolean {
  if(!isRadarInstitutionalSource(url,evidence))return false
  const names=[identity.name,identity.legalName].filter((name):name is string=>!!name).map(normalizeRadarText)
  const generic=new Set(['empresa','companhia','brasileira','brasileiro','municipal','prefeitura','instituto','publico','publica','servicos','comercio','industria','grupo','ltda','limitada'])
  const brandTokens=names.flatMap(name=>name.split(/[^a-z0-9]+/).filter(token=>token.length>=4&&!generic.has(token)))
  const host=new URL(url).hostname.split('.').slice(0,-1).map(label=>label.replace(/[^a-z0-9]/g,''))
  if(brandTokens.some(token=>host.some(label=>label===token||label.startsWith(token)||label.endsWith(token))))return true
  const text=normalizeRadarText(evidence.text)
  if(names.some(name=>text.includes(`somos ${name}`)||text.includes(`${name} e nossa razao social`)))return true
  const footer=normalizeRadarText((evidence.html?.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/i)?.[1]??'').replace(/<[^>]+>/g,' '))
  const cnpj=identity.cnpj?.replace(/\D/g,'')
  return !!cnpj&&footer.replace(/\D/g,'').includes(cnpj)&&names.some(name=>footer.includes(name))
}
