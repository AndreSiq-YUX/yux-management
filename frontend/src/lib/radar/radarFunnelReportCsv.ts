import type {RadarFunnelReport} from '@/types/radarFunnel';
const percentage=new Intl.NumberFormat('pt-BR',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1});
export const radarFunnelProbabilityLabel=(value:number|null)=>value===null?'Indisponível':percentage.format(value);
export const radarFunnelCounterfactualLabel=(value:boolean|null)=>value===null?'Não avaliável (sem limiar calibrado registrado)':value?'Sim':'Não';
export function radarFunnelReportCsv(data:RadarFunnelReport):string{
 const rows:unknown[][]=[['Registro','Empresa','Execução','Situação','Etapa','Motivo','Classificação','Quantidade','Probabilidade da classificação (bruta)','Probabilidade fora do perfil (bruta)','Teria bloqueado','Limiar registrado','Request','Agent','Caminho']];
 for(const block of data.summary.blocksByReason)rows.push(['Resumo bloqueios','','','',block.stage,block.reason,'',block.count]);
 for(const choice of data.summary.classifications)rows.push(['Resumo IA','','','',choice.gate,'',choice.classification,choice.count]);
 const cf=data.summary.counterfactual;
 rows.push(['Resumo contrafactual','','','','','Decisões avaliáveis','',cf.evaluable]);
 rows.push(['Resumo contrafactual','','','','','Sem calibração histórica avaliável','',cf.notEvaluable]);
 rows.push(['Resumo contrafactual','','','','','Teriam bloqueado','',cf.evaluable?cf.wouldBlock:'Não avaliável']);
 for(const company of data.companies){
  const path=company.path.map(step=>`${step.gate}: ${step.mode}/${step.outcome}`).join(' → ');
  rows.push(['Empresa',company.name,company.runId,company.outcome,company.blocking?.stage??company.gate,company.blocking?.reason??company.reason,'',1,'','','','','',company.agentUsed?'sim':'não',path]);
  for(const step of company.path.filter(step=>step.gate==='g1'||step.gate==='g5'))rows.push(['Decisão',company.name,company.runId,step.mode,step.gate,step.reason,step.outcome,1,radarFunnelProbabilityLabel(step.selectedProbability),radarFunnelProbabilityLabel(step.outsideProbability),radarFunnelCounterfactualLabel(step.wouldBlock),radarFunnelProbabilityLabel(step.threshold),step.requestId,'',path]);
 }
 const cell=(value:unknown)=>`"${String(value??'').replace(/^[\s]*[=+@\-\t\r]/,"'$&").replace(/"/g,'""')}"`;
 return '\uFEFF'+rows.map(row=>Array.from({length:15},(_,index)=>cell(row[index])).join(';')).join('\r\n');
}
