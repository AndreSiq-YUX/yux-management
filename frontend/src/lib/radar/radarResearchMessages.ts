import { radarSizeMetricLabels, type RadarSizeMetric } from './radarSearchConfiguration'
const explanations:Record<string,string>={
  robots_unavailable:'Não foi possível obter as regras públicas do site; a leitura poderá ser retomada.',
  robots_transport_failed:'Falha de conexão ao consultar as regras do site. Não significa proibição de leitura.',
  robots_timeout:'O site demorou a responder à consulta das regras públicas.',robots_disallow:'O site não permite a leitura automática desta página.',
  request_failed:'Falha de conexão ao ler a página.',timeout:'A página demorou a responder.',page_too_large:'A página ultrapassou o limite seguro de leitura.',
  empty_or_oversized_page:'A página veio vazia ou excedeu o limite de leitura da versão anterior.',response_interrupted:'O site interrompeu a resposta.',
  radar_qualification_explicit_route_required:'Configure a função Qualificação de empresas do Radar em Admin → Modelos de IA.',
  radar_qualification_previous_request_uncertain:'A resposta da análise anterior é incerta. Não repetimos a chamada para evitar cobrança duplicada; exige conferência pelo administrador.',
  radar_qualification_refresh_authorization_required:'As evidências mudaram. Autorize uma nova análise por IA no controle abaixo para atualizar a avaliação.',
  radar_profile_unverifiable:'A IA retornou um perfil sem evidências válidas. Os contatos e fatos coletados foram preservados.',
  radar_profile_required:'A IA não retornou o perfil solicitado. Os fatos coletados foram preservados.',
  radar_qualification_failed:'A análise por IA não terminou. Confira a disponibilidade do modelo no Admin; os fatos foram preservados.',
  radar_research_worker_interrupted_retry_available:'O processamento foi interrompido; retome para recuperar as etapas pendentes.',
  agent_runtime_402:'A análise por IA não foi autorizada por limite de créditos; confira o saldo e a configuração no Admin.',
  agent_runtime_401:'A autenticação entre o sistema e o serviço de IA falhou; precisa de correção técnica.',
  agent_runtime_403:'A análise foi negada pelo serviço de IA; confira as permissões e o provedor no Admin.',
  agent_runtime_429:'O serviço de IA atingiu um limite temporário de chamadas.',
  agent_runtime_503:'O serviço de IA está temporariamente indisponível.',
  agent_runtime_not_configured:'O serviço de IA do sistema não está configurado; precisa de correção técnica.',
}
export function radarResearchMessage(value:string) {
  return value.replace(/\b[a-z]+(?:_[a-z0-9]+)+\b/g,code=>explanations[code]??code)
    .replace(/\b(employees|units|annualRevenue|annualMeals|capital|yearsActive)\b/g,metric=>radarSizeMetricLabels[metric as RadarSizeMetric])
}
