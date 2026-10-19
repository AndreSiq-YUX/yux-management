import type {CommercialResearchStatusV1} from '@/types/generated/radarResearch'
const fields:Record<CommercialResearchStatusV1['updatedFields'][number],string>={website:'Site',email:'E-mail',phone:'Telefone',whatsapp:'WhatsApp',social:'Rede social',supplierChannel:'Canal para fornecedores',companyProfile:'Perfil da empresa',companySize:'Porte da empresa',activity:'Sinais de atividade',identity:'Identificação da empresa',fit:'Adequação à campanha'}
const reasons={not_found:'Não encontrado nas páginas consultadas.',reading_restricted:'Não foi possível ler a página encontrada; este dado ainda não está confirmado.',identity_unresolved:'Depende de confirmar o vínculo das informações com esta empresa.',verification_pending:'Esta etapa ainda não foi concluída.',outside_profile:'Os dados indicam que a empresa não atende aos critérios desta campanha.'}
const statuses={researching:'Pesquisa em andamento',complete:'Dados necessários completos',incomplete:'Pesquisa com dados parciais',waiting:'Pesquisa aguardando continuidade',unchanged:'Nenhum dado novo nesta pesquisa'}
export function RadarResearchOutcome({feedback}:{feedback?:CommercialResearchStatusV1}){
 if(!feedback)return null
 const at=feedback.lastAttemptAt&&Number.isFinite(Date.parse(feedback.lastAttemptAt))?new Date(feedback.lastAttemptAt):null
 return <section aria-label="Resultado desta pesquisa" className="flex flex-col gap-2 rounded-md border bg-background p-3 text-sm">
  <h4 className="font-semibold">{statuses[feedback.status]??'Pesquisa aguardando conferência'}</h4>
  {feedback.updatedFields.length>0?<p>Atualizado nesta pesquisa: {feedback.updatedFields.map(field=>fields[field]??'Informação').join(', ')}.</p>:feedback.status!=='researching'&&<p>Nenhum dado novo confirmado nesta tentativa. Os dados anteriores foram preservados.</p>}
  {feedback.unresolvedFields.length>0&&<ul className="list-disc space-y-1 pl-5">{feedback.unresolvedFields.map((item,index)=><li key={`${item.field}-${index}`}><span className="font-medium">{fields[item.field]??'Informação'}:</span> {reasons[item.reason]??'Aguardando conferência.'}</li>)}</ul>}
  {feedback.nextAction==='continue'&&<p>Você pode retomar a pesquisa para tentar completar os dados pendentes.</p>}
  {feedback.nextAction==='review_result'&&<p>Confira o resultado antes de aprovar ou enviar ao CRM.</p>}
  {feedback.nextAction==='review_source'&&<p>A página encontrada precisa de conferência antes de confirmar seus dados.</p>}
  {feedback.status==='waiting'&&<p>A continuidade precisa de atenção da equipe responsável. Não é necessário criar outra empresa.</p>}
  {at&&<p className="text-xs text-muted-foreground">Última tentativa: {at.toLocaleString('pt-BR')}.</p>}
 </section>
}
