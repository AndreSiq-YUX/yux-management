import type {CommercialResearchStatusV1} from '@/types/generated/radarResearch'
export const radarAttentionLabels={identity_analysis_incomplete:'Identificação do site não concluída',commercial_analysis_incomplete:'Análise de aderência não concluída',attempt_confirmation_pending:'Uma tentativa anterior precisa de conferência antes de continuar',public_research_interrupted:'Pesquisa complementar interrompida'}
export function RadarResearchAttention({attention,compact=false}:{compact?:boolean;attention?:CommercialResearchStatusV1['attention']}){
 if(!attention)return null
 return <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="status"><p className="font-medium">Aguardando retomada</p><p>{radarAttentionLabels[attention.reason]}</p>{!compact&&<p>{attention.canResume?'Retome as etapas disponíveis desta empresa.':'Confira os detalhes desta empresa para resolver a pendência. Os dados encontrados foram preservados.'}</p>}</div>
}
