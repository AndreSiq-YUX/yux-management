import {Fragment,useState,type ReactNode} from 'react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Progress} from '@/components/ui/progress'
import {RadarResearchMetrics} from './RadarResearchMetrics'
import {RadarResearchOutcome} from './RadarResearchOutcome'
import {RadarCampaignCriteriaEditor} from './RadarCampaignCriteriaEditor'
import type {RadarScreen} from './RadarCampaignPage'
import type {RadarCommercialCampaign,RadarCommercialCandidate,RadarCommercialCapture,RadarCommercialFacts,RadarCommercialResearch,CommercialHistory,CommercialOpportunity,CommercialClaim} from '@/types/radarCommercial'

const statuses:Record<string,string>={queued:'Pesquisa na fila',discovering:'Encontrando empresas',researching:'Completando dados',running:'Completando dados',blocked:'Pesquisa aguardando a equipe responsável',failed:'Pesquisa aguardando a equipe responsável',completed:'Pesquisa concluída',succeeded:'Pesquisa concluída',partial:'Pesquisa encerrada com dados parciais',pending_review:'Revisão pendente',approved:'Aprovada',converted:'Enviada ao CRM',discarded:'Descartada',raw:'Aguardando pesquisa',diagnosing:'Analisando',diagnosed:'Análise disponível'}
const status=(value?:string)=>statuses[value??'']??'Revisão necessária'
const date=(value?:string)=>value&&Number.isFinite(Date.parse(value))?new Date(/^\d{4}-\d{2}-\d{2}$/.test(value)?`${value}T12:00:00`:value).toLocaleDateString('pt-BR'):'Data não informada'
export function CommercialSource({url,label='Ver evidência pública'}:{url?:string;label?:string}){
 if(!url)return null
 try{const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)return null}catch{return null}
 return <a className="break-all text-primary underline" href={url} target="_blank" rel="noreferrer">{label}</a>
}
function Claim({claim}:{claim:CommercialClaim}){return <p>{claim.value} {claim.sourceUrl&&<CommercialSource url={claim.sourceUrl}/>}</p>}
export function RadarPreservedResearchFacts({previous}:{previous:NonNullable<RadarCommercialFacts['previousResearch']>}){
 return <section className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3" aria-label="Dados anteriores preservados"><h4 className="font-semibold">Dados anteriores preservados</h4><p>A tentativa mais recente ficou incompleta. Estas informações mantêm a data original e não representam uma nova confirmação.</p>
  {previous.websiteUrl&&<p><CommercialSource url={previous.websiteUrl} label="Abrir site encontrado anteriormente"/> · observado em {date(previous.observedAt)}</p>}
  {previous.contacts?.map((contact,index)=><p key={index} className="break-all">{contact.value} · observado em {date(contact.observedAt)} <CommercialSource url={contact.sourceUrl}/></p>)}
 </section>
}
export function RadarCommercialCompanyDetails({facts,assessment,feedback}:{facts:RadarCommercialFacts;assessment?:RadarCommercialResearch['assessment'];feedback?:RadarCommercialResearch['feedback']}){
 return <div className="flex min-w-0 flex-col gap-4 text-sm">
  <RadarResearchOutcome feedback={feedback}/>
  {facts.refreshIncomplete&&facts.previousResearch&&<RadarPreservedResearchFacts previous={facts.previousResearch}/>}
  <div><p>{facts.legalName}</p><p>CNPJ: {facts.cnpj??'Não identificado'} · {[facts.city,facts.state].filter(Boolean).join(' / ')}</p>{facts.address&&<p>{facts.address}</p>}
   {facts.registrationStatus&&<p>Situação cadastral: {facts.registrationStatus}. Não comprova funcionamento atual.</p>}
   {facts.openingDate&&<p>Abertura: {date(facts.openingDate)}</p>}
   {facts.websiteUrl?<p><CommercialSource url={facts.websiteUrl} label="Abrir site da empresa"/> · {facts.websiteStatus==='verified_present'?'Identidade corroborada':'Identificação pendente'}{facts.siteObservedAt&&` · observado em ${date(facts.siteObservedAt)}`}</p>:facts.previousResearch?.websiteUrl?<p>Nenhum site novo confirmado nesta tentativa; o site anterior permanece disponível acima.</p>:<p>Site não encontrado nas fontes consultadas.</p>}
  </div>
  <div><h4 className="font-semibold">Contatos e canais</h4>{facts.registryPhone&&<p>Telefone cadastral: {facts.registryPhone} — não validado por atendimento.</p>}
   {!facts.contacts?.length&&<p>Nenhum contato público identificado até esta etapa.</p>}
   {facts.contacts?.map((contact,index)=><div key={index} className="mt-2 flex flex-col gap-1 rounded-md border bg-background p-3">
    <p className="break-all font-medium">{({email:'E-mail',phone:'Telefone público',whatsapp:'WhatsApp publicado',social:'Rede social',contact_form:'Formulário de contato',business_person:'Contato profissional'} as Record<string,string>)[contact.kind??'']??'Contato'}: {contact.value}</p>
    <p>{contact.association==='confirmed'?'Identidade corroborada':'Associação pendente'}{contact.scope==='group'?' — contato do grupo; não confirma a filial':''}</p>
    <p>Finalidade: {({suppliers:'fornecedores/compras',sales:'comercial',finance:'financeiro',recruitment:'recrutamento',general:'geral'} as Record<string,string>)[contact.purpose??'']??'não identificada'}{contact.preferred?' · prioritário para esta pesquisa':''}</p>
    <CommercialSource url={contact.sourceUrl}/>{contact.observedAt&&<p className="text-xs text-muted-foreground">Observado em {date(contact.observedAt)}</p>}
    {contact.sources?.map((source,i)=><CommercialSource key={i} url={source.sourceUrl} label="Outra evidência deste contato"/>)}
   </div>)}
  </div>
  {facts.profile&&<div className="flex flex-col gap-3"><h4 className="font-semibold">Perfil da empresa</h4>{facts.profile.summary&&<Claim claim={facts.profile.summary}/>}
   {([['services','Soluções e serviços'],['customerSegments','Públicos atendidos'],['operatingRegions','Regiões de atuação'],['scaleSignals','Sinais de escala publicados']] as const).map(([key,label])=>facts.profile?.[key]?.length?<div key={key}><h5 className="font-medium">{label}</h5>{facts.profile[key]!.map((claim,i)=><Claim key={i} claim={claim}/>)}</div>:null)}
  </div>}
  {facts.sizeAssessment&&<div><h4 className="font-semibold">Avaliação de porte</h4><p>{facts.sizeAssessment.score===undefined?'Sem evidência suficiente para pontuar':`${facts.sizeAssessment.score}/100`} · Cobertura: {facts.sizeAssessment.evidenceCoverage??0}%.</p>
   {(facts.sizeAssessment.evidenceCoverage??0)<50&&<p>Cobertura baixa: não compare empresas só por esta pontuação.</p>}
   {facts.sizeAssessment.contributions?.map((item,i)=><p key={i}>{({employees:'Colaboradores',units:'Unidades',annualRevenue:'Receita anual',annualMeals:'Refeições anuais',capital:'Capital social',yearsActive:'Anos de atividade'} as Record<string,string>)[item.metric??'']??'Indicador publicado'}: {item.amount?.toLocaleString('pt-BR')} {item.referenceDate&&`· referência ${date(item.referenceDate)}`} <CommercialSource url={item.sourceUrl}/></p>)}
  </div>}
  {facts.activity&&<div><h4 className="font-semibold">Sinais de atividade</h4>{[...(facts.activity.presenceSignals??[]),...(facts.activity.signals??[])].map((signal,i)=><p key={i}>{signal.excerpt} <CommercialSource url={signal.sourceUrl}/></p>)}<p className="text-muted-foreground">Sinais públicos não comprovam atendimento ou funcionamento atual.</p></div>}
  {!!facts.documents?.length&&<div><h4 className="font-semibold">Documentos públicos encontrados</h4>{facts.documents.map((item,i)=><p key={i}><CommercialSource url={item.url} label="Abrir documento"/> · <CommercialSource url={item.sourceUrl} label="Página que publicou o documento"/></p>)}<p>Encontrar um documento não significa que seu conteúdo foi analisado.</p></div>}
  {(assessment||facts.targetStatus)&&<div><h4 className="font-semibold">Avaliação comercial</h4><p>{({confirmed:'Público confirmado',not_target:'Fora do público',review:'Requer revisão',insufficient:'Evidência insuficiente'} as Record<string,string>)[assessment?.targetStatus??facts.targetStatus??'']??'Requer revisão'} · {({high:'Boa aderência',possible:'Possível aderência',low:'Baixa aderência'} as Record<string,string>)[assessment?.productFit??facts.productFit??'']??'Adequação não confirmada'}</p>{(assessment?.reasons??facts.reasons)?.map((reason,i)=><p key={i}>{reason}</p>)}</div>}
  <p className="text-xs text-muted-foreground">Dados públicos não comprovam consentimento ou intenção de compra. Nenhuma mensagem é enviada.</p>
 </div>
}
type Props={campaign:RadarCommercialCampaign;candidates:RadarCommercialCandidate[];operation:RadarCommercialCapture|null;screen:RadarScreen;history?:CommercialHistory[];opportunities?:CommercialOpportunity[];researchActions?:ReactNode;
 onCriteriaUpdated?:()=>void;
 onNavigate:(path:string)=>void;onOpenDetails:(id:string)=>void;onSelect?:(ids:string[])=>void;selectedIds?:string[];onSendCrm?:()=>void;canReview?:boolean;busy?:boolean;
 onOpportunityAction?:(id:string,action:'analyze'|'approve'|'reject'|'optOut'|'convert')=>void;
 onCandidateAction?:(id:string,action:'import'|'discard'|'restore-profile',input:{analyzeAfterImport:boolean})=>void}
export function RadarCommercialResults({campaign,candidates,operation,screen,history=[],opportunities=[],researchActions,onNavigate,onOpenDetails,onSelect,selectedIds=[],onSendCrm,onOpportunityAction,onCandidateAction,busy=false,canReview=false,onCriteriaUpdated}:Props){
 const [query,setQuery]=useState(''),[page,setPage]=useState(0),[expanded,setExpanded]=useState<string|null>(null)
 const [analyzeAfterImport,setAnalyzeAfterImport]=useState(false)
 const [showOutside,setShowOutside]=useState(false)
 const isOutside=(item:RadarCommercialCandidate)=>item.facts.outsideProfile===true&&item.facts.outsideProfileRevision===campaign.configurationRevision
 const filtered=candidates.filter(item=>(showOutside||!isOutside(item))&&`${item.title} ${item.facts.cnpj} ${item.facts.city} ${item.facts.state}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')))
 const pageCount=Math.max(1,Math.ceil(filtered.length/25)),currentPage=Math.min(page,pageCount-1),visible=filtered.slice(currentPage*25,(currentPage+1)*25)
 const c=operation?.counts,canonical=c?.completedWithGaps!==undefined,finished=(c?.completed??0)+(canonical?(c?.completedWithGaps??0)+(c?.outsideProfile??0):0),total=canonical?Math.max(c?.requested??0,c?.admitted??0):c?.requested??0
 return <div className="flex min-w-0 flex-col gap-5">
  <header className="flex flex-col gap-4 rounded-md border bg-background p-4"><Button size="sm" variant="ghost" className="self-start" onClick={()=>onNavigate('')}>Voltar às campanhas</Button>
   <div><h2 className="text-xl font-semibold">{campaign.name}</h2><p className="text-sm text-muted-foreground">{campaign.targetSegment} · {campaign.offerType}</p></div>
   <nav aria-label="Navegação da campanha" className="flex flex-wrap gap-2">{([['results','Resultados',''],['configuration','Critérios da campanha','/configuracoes'],['history','Histórico','/historico']] as const).map(([key,label,suffix])=><Button key={key} variant={screen===key?'default':'outline'} onClick={()=>campaign.id&&onNavigate(`${campaign.id}${suffix}`)}>{label}</Button>)}</nav>
   {screen==='results'&&campaign.id&&campaign.organizationId&&<RadarResearchMetrics campaignId={campaign.id} organizationId={campaign.organizationId} showCosts={false}/>}
  </header>
  {screen==='configuration'?<><section className="flex flex-col gap-3 rounded-md border bg-background p-4"><h3 className="font-semibold">Critérios da campanha</h3><p>Público: {campaign.targetSegment}</p><p>Oferta: {campaign.offerType}</p><p>Regiões: {campaign.criteria.cities?.length?campaign.criteria.cities.map(item=>`${item.city}/${item.state}`).join(', '):campaign.targetStates?.join(', ')||[campaign.targetCity,campaign.targetState].filter(Boolean).join('/')}</p>
   <p>CNAEs: {campaign.targetCnaes?.join(', ')||'Sem filtro'}</p><p>Produtos e serviços: {campaign.productFocus?.join(', ')||'Não informados'}</p>
   {([['includeAnyTerms','Termos desejados'],['includeAllTerms','Termos obrigatórios'],['excludeTerms','Exclusões'],['productTerms','Critérios da oferta']] as const).map(([key,label])=>campaign.criteria[key]?.length?<p key={key}>{label}: {campaign.criteria[key]!.join(', ')}</p>:null)}
   {campaign.criteria.targets?.map((target,index)=><p key={target.key??index}>{target.label}: {target.definition}</p>)}
  </section>{canReview&&<RadarCampaignCriteriaEditor key={campaign.id} campaign={campaign} canEdit={canReview} onSaved={()=>onCriteriaUpdated?.()}/>}</>:screen==='history'?<section className="flex flex-col gap-3 rounded-md border bg-background p-4"><h3 className="font-semibold">Histórico da pesquisa</h3>{history.length?history.map((item,i)=><p key={item.id??i}>{item.companyName} · {item.actionLabel} · {status(item.status)} · {date(item.updatedAt)}</p>):<p>Ainda não há pesquisas registradas.</p>}</section>:<>
   {operation&&<section className="flex flex-col gap-3 rounded-md border bg-background p-4"><h3 className="font-semibold" role="status">{status(operation.status)}</h3><Progress value={total?Math.min(100,finished/total*100):0} aria-valuenow={total?Math.min(100,finished/total*100):0} aria-label={canonical?'Empresas pesquisadas':'Empresas com dados necessários concluídos'}/>
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[['Solicitadas',c?.requested],['Empresas encontradas',c?.admitted],...(canonical?[['Passaram pela triagem inicial',c?.passedInitialTriage],['Aderentes confirmadas',c?.confirmedFit],['Fora do perfil',c?.outsideProfile]]:operation.countingMode==='qualified'?[['Aderentes novas',c?.qualified],['Fora do perfil',c?.outsideProfile]]:[]),['Em pesquisa',c?.researching],['Concluídas',c?.completed],[canonical?'Concluídas com lacunas':'Dados insuficientes',canonical?c?.completedWithGaps:c?.insufficient],['Aguardando a equipe',canonical?c?.technicalFailures:c?.blocked]].map(([label,value])=><div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="text-lg font-semibold">{value??0}</dd></div>)}</dl>
    {operation.pendingMessage&&<p>{operation.pendingMessage}</p>}{operation.status==='partial'&&<p>Algumas empresas terminaram sem todos os dados necessários. Confira os resultados antes de agir.</p>}
   </section>}
   <section className="min-w-0 rounded-md border bg-background p-4"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Empresas encontradas</h3><Input aria-label="Filtrar empresas" placeholder="Nome, CNPJ ou cidade" className="sm:max-w-sm" value={query} onChange={event=>{setQuery(event.target.value);setPage(0);setExpanded(null)}}/></div>
    {researchActions}
    {onSendCrm&&<Button size="sm" disabled={!selectedIds.length||selectedIds.length>25} onClick={onSendCrm}>Enviar ao CRM</Button>}
    {onCandidateAction&&campaign.campaignType!=='regional_b2b'&&<label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={analyzeAfterImport} disabled={busy} onChange={event=>setAnalyzeAfterImport(event.target.checked)}/>Analisar após importar</label>}
    {selectedIds.length>25&&<p>Selecione até 25 empresas por envio.</p>}
    <div className="mt-3"><table className="block w-full text-left text-sm sm:table"><thead className="hidden sm:table-header-group"><tr>{onSelect&&<th className="p-3">Selecionar</th>}<th className="p-3">Empresa</th><th className="p-3">Localização</th><th className="p-3">Site e contatos</th><th className="p-3">Detalhes</th></tr></thead><tbody className="block sm:table-row-group">
     {visible.map((item,index)=>{const id=item.id??String(index),open=expanded===id,contact=item.facts.contacts?.find(contact=>contact.association==='confirmed')??item.facts.contacts?.[0]
      return <Fragment key={id}><tr className="mt-3 block rounded-md border sm:mt-0 sm:table-row sm:rounded-none sm:border-x-0 sm:border-b-0">{onSelect&&<td className="block p-3 sm:table-cell"><input type="checkbox" aria-label={`Selecionar ${item.title}`} checked={selectedIds.includes(id)} onChange={event=>onSelect(event.target.checked?[...selectedIds,id]:selectedIds.filter(value=>value!==id))}/></td>}
       <td className="block break-words p-3 sm:table-cell"><p className="font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.facts.cnpj}</p></td><td className="block p-3 sm:table-cell"><span className="text-xs text-muted-foreground sm:hidden">Localização: </span>{[item.facts.city,item.facts.state].filter(Boolean).join(' / ')}</td>
       <td className="block p-3 sm:table-cell"><p>{item.facts.websiteUrl?'Site encontrado':'Site ainda não identificado'}</p><p className="break-all text-xs text-muted-foreground">{contact?.value??'Contato público não identificado'}</p>{item.pendingMessage&&<p>{item.pendingMessage}</p>}</td>
       <td className="block p-3 sm:table-cell"><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" aria-expanded={open} onClick={()=>setExpanded(open?null:id)}>{open?'Ocultar detalhes':'Ver detalhes'}</Button>
        {onCandidateAction&&item.id&&<>{campaign.campaignType!=='regional_b2b'&&<Button size="sm" variant="outline" disabled={busy||item.status!=='pending_review'||!!item.importedOpportunityId} onClick={()=>onCandidateAction(item.id!,'import',{analyzeAfterImport})}>Importar</Button>}<Button size="sm" variant="outline" disabled={busy||item.status!=='pending_review'} onClick={()=>onCandidateAction(item.id!,'discard',{analyzeAfterImport:false})}>Descartar</Button></>}
       </div></td></tr>
       {open&&<tr className="block sm:table-row"><td colSpan={onSelect?5:4} className="block break-words border-t bg-muted/20 p-4 sm:table-cell"><section aria-label={`Resumo de ${item.title}`}><RadarCommercialCompanyDetails facts={item.facts}/>{item.id&&<Button size="sm" variant="outline" className="mt-4" onClick={()=>onOpenDetails(item.id!)}>Ver detalhes completos</Button>}</section></td></tr>}
      </Fragment>})}
    </tbody></table></div>
    {candidates.some(isOutside)&&<label className="mt-3 flex gap-2 text-sm"><input type="checkbox" checked={showOutside} onChange={event=>{setShowOutside(event.target.checked);setPage(0)}}/>Incluir empresas fora do público</label>}
    {showOutside&&onCandidateAction&&candidates.filter(isOutside).map(item=><div key={item.id} className="mt-2 flex flex-wrap items-center gap-2 text-sm"><span>{item.title} · Fora do público</span><Button size="sm" variant="outline" disabled={busy||item.facts.reviewRequested} onClick={()=>onCandidateAction(item.id!,'restore-profile',{analyzeAfterImport:false})}>{item.facts.reviewRequested?'Revisão solicitada à equipe responsável':item.facts.requiresScopedReview?'Solicitar revisão':'Reincluir para revisão'}</Button></div>)}
    {!filtered.length&&<p className="mt-3 text-sm text-muted-foreground">Nenhuma empresa encontrada para este filtro.</p>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><Button size="sm" variant="outline" disabled={!currentPage} onClick={()=>setPage(currentPage-1)}>Anterior</Button><p className="text-sm">Página {currentPage+1} de {pageCount} · {filtered.length} empresas</p><Button size="sm" variant="outline" disabled={currentPage+1>=pageCount} onClick={()=>setPage(currentPage+1)}>Próxima</Button></div>
   </section>
   {opportunities.length>0&&<section className="flex flex-col gap-3 rounded-md border bg-background p-4"><h3 className="font-semibold">Oportunidades</h3>{opportunities.map((item,i)=><article key={item.id??i} className="rounded-md border p-3"><h4 className="font-medium">{item.company?.tradeName||item.company?.legalName||'Empresa'}</h4><p>{status(item.status)}</p><p>{item.latestDiagnostic?.summary}</p>{item.latestDiagnostic?.recommendedOffer&&<p>Oferta recomendada: {item.latestDiagnostic.recommendedOffer}</p>}<p>{item.latestScore?.explanation}</p>{item.latestMessageSuggestion?.body&&<p>{item.latestMessageSuggestion.body}</p>}
    {onOpportunityAction&&item.id&&<div className="mt-3 flex flex-wrap gap-2">{([['analyze','Analisar oportunidade'],['approve','Aprovar'],['reject','Rejeitar'],['optOut','Não contatar'],['convert','Enviar ao CRM']] as const).map(([action,label])=><Button key={action} size="sm" variant="outline" disabled={busy||action==='analyze'&&item.status==='diagnosing'||(action==='approve'||action==='reject')&&item.status!=='review_pending'||action==='convert'&&(!item.canConvertToLead||!onSendCrm)} onClick={()=>onOpportunityAction(item.id!,action)}>{label}</Button>)}</div>}
   </article>)}</section>}
  </>}
 </div>
}
