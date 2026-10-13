import {normalizeRadarText} from './search-configuration.js'

export function classifyRadarSource(value:string,evidence:{title?:string;text?:string;html?:string}={}) {
  const result=(kind:'institutional_candidate'|'directory'|'social'|'third_party',reason:string)=>({kind,reasons:[reason]})
  try{
    const url=new URL(value),host=url.hostname.toLowerCase(),path=decodeURIComponent(url.pathname)
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return result('third_party','Endereço público inválido.')
    if(/(^|\.)(instagram\.com|facebook\.com|linkedin\.com|youtube\.com|tiktok\.com|wa\.me|whatsapp\.com)$/.test(host))return result('social','Perfil social exige associação de titularidade.')
    if(/(^|\.)(google\.[a-z.]+|maps\.apple\.com|jusbrasil\.com\.br)$/.test(host))return result('third_party','Referência externa; não é o site institucional.')
    const known=/(^|\.)(serasaexperian\.com\.br|empresadois\.com\.br|dardus\.com\.br|econodata\.com\.br|cnpja\.com|cnpj\.biz|casadosdados\.com\.br|solutudo\.com\.br|telelistas\.net|cadastroempresa\.com\.br|restaurantepertodemim\.com)$/.test(host)
    const structured=/\/(?:cnpj|consulta[-_]?gratis|consulta[-_]?empresa|consulta[-_]?cnpj|empresas?\/\d)(?:\/|-|$|\d)/i.test(path)
      ||/\/(?:fornecedor|empresa)\/[^/]*\d{14}/i.test(path)
    const text=normalizeRadarText(`${evidence.title??''} ${evidence.text??''}`)
    const directoryText=/consulta (?:gratis|gratuita|cnpj)|consultar cnpj|dados cadastrais da empresa|este nao e o site da empresa/.test(text)
    if(known||structured||directoryText)return result('directory','Cadastro de terceiro: citar o CNPJ não comprova propriedade da página ou de seus contatos.')
    return result('institutional_candidate','Domínio candidato; identidade e titularidade ainda precisam de evidência.')
  }catch{return result('third_party','Endereço inválido ou ilegível.')}
}

export function isRadarInstitutionalSource(url:string,evidence:{title?:string;text?:string;html?:string}={}) {
  return classifyRadarSource(url,evidence).kind==='institutional_candidate'
}
