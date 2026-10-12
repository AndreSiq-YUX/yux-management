import { useEffect, useRef, useState } from 'react'
import { radarService } from '@/services/radarService'
import type { RadarProfileClaim, RadarResearchAvailability, RadarResearchResult } from '@/types/radarResearch'
import { radarSizeMetricLabels, type RadarSizeMetric } from '@/lib/radar/radarSearchConfiguration'
import { radarResearchMessage } from '@/lib/radar/radarResearchMessages'

const stages = [['discovery','Presença pública'],['identity','Identidade'],['reading','Páginas e contatos'],['consolidation','Atividade e fontes'],['review','Qualificação e revisão']] as const
const statusLabel:Record<string,string> = {queued:'Na fila',running:'Pesquisando',partial:'Resultado parcial',succeeded:'Pesquisa concluída',blocked:'Pesquisa bloqueada',failed:'Falha na pesquisa'}
const activityLabel:Record<string,string> = {inconclusive:'Funcionamento inconclusivo',public_signals:'Sinais públicos de atividade',possible_closure:'Possível encerramento — conferir',conflicting:'Sinais contraditórios — conferir'}
const buttonClass='rounded-md border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50'
const money=(value:number)=>value.toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:4})
function SafeSource({url,label='Fonte'}:{url:string;label?:string}) {
  try {if(!['https:','http:'].includes(new URL(url).protocol))return <span>Fonte inválida</span>} catch{return <span>Fonte inválida</span>}
  return <a className="break-all text-sky-800 underline" href={url} target="_blank" rel="noreferrer">{label}</a>
}
function SourcedProfileClaim({claim}:{claim:RadarProfileClaim}) {
  return <div>{claim.value} <SafeSource url={claim.sourceUrl}/>
    <details className="mt-1 text-xs text-slate-600"><summary className="cursor-pointer">Trecho, data e escopo da evidência</summary>
      <blockquote className="my-1 border-l-2 pl-2">{claim.excerpt}</blockquote>
      <p>Observado em {new Date(claim.observedAt).toLocaleDateString('pt-BR')}; {claim.scope==='establishment'?'estabelecimento':claim.scope==='group'?'grupo — não confirma a filial':'escopo pendente'}.</p>
    </details></div>
}
export function RadarCandidateResearchPanel({candidateId,organizationId,configurationRevision,availability,canStart=true,approved=false,onCompleted}:{
  candidateId:string;organizationId:string;configurationRevision:number;availability?:RadarResearchAvailability|null;canStart?:boolean;approved?:boolean;onCompleted?:()=>void
}) {
  const [open,setOpen]=useState(false),[result,setResult]=useState<RadarResearchResult|null>(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[refresh,setRefresh]=useState(0)
  const [available,setAvailable]=useState(availability)
  const [allowSemanticRefresh,setAllowSemanticRefresh]=useState(false)
  const submitted=useRef(false),onCompletedRef=useRef(onCompleted),completedId=useRef('')
  onCompletedRef.current=onCompleted
  useEffect(()=>setAvailable(availability),[availability])
  const running=!!result?.run && ['queued','running'].includes(result.run.status)
  useEffect(()=>{
    if(!open)return
    let active=true,timer:ReturnType<typeof setTimeout>|undefined
    const load=async()=>{
      try {
        const value=await radarService.getCandidateResearch(candidateId,organizationId)
        if(!active)return
        setResult(value);setAvailable(value.availability);setError(null)
        if(value.run && ['queued','running'].includes(value.run.status))timer=setTimeout(load,4000)
        else if(value.run && value.run.id!==completedId.current) {completedId.current=value.run.id;onCompletedRef.current?.()}
      } catch {if(active)setError('Não foi possível carregar o resultado. Use Atualizar resultado para tentar novamente.')}
    }
    void load()
    return()=>{active=false;clearTimeout(timer)}
  },[open,candidateId,organizationId,refresh])
  async function start() {
    if(submitted.current||!available?.allowed||approved||!canStart)return
    const route=available.semantic
    const semantic=available.semanticQualificationEnabled?` A etapa de IA poderá consumir créditos conforme a rota e fallbacks autorizados no Admin.${route?` Modelo: ${route.model??'rota ainda não configurada'}. Limites: ${route.maxInputTokens} tokens de entrada e ${route.maxOutputTokens} de saída. ${route.fallbackCount} fallback(s) autorizado(s).`:''} Não há estimativa monetária do provedor nesta tela; o valor das buscas abaixo não inclui IA.`:''
    if(!window.confirm(`Pesquisar esta empresa sem enviar mensagens? Máximo de ${available.maxQueriesPerCandidate} consultas de busca; estimativa máxima ${money(available.maximumCostPerCandidate)}.${semantic}`))return
    submitted.current=true;setBusy(true);setError(null);setOpen(true)
    try {await radarService.startCandidateResearch(candidateId,{organizationId,configurationRevision,requestId:crypto.randomUUID(),allowSemanticRefresh});setAllowSemanticRefresh(false);setRefresh(value=>value+1)}
    catch {setError('Não foi possível iniciar. Atualize a disponibilidade; confira configuração, quota e orçamento. Seus dados foram preservados.');setRefresh(value=>value+1)}
    finally {submitted.current=false;setBusy(false)}
  }
  const output=result?.run?.output
  return <section className="mt-3 min-w-0 space-y-3 rounded-md border border-sky-200 bg-sky-50/40 p-3" aria-label="Pesquisa automática da empresa">
    <div className="flex flex-wrap gap-2">
      <button type="button" className={`${buttonClass} bg-slate-900 text-white`} disabled={!available?.allowed||busy||running||approved||!canStart} onClick={start}>
        {busy?'Iniciando...':running?'Pesquisa em andamento':result?.run&&['partial','blocked','failed'].includes(result.run.status)?'Retomar pesquisa automática':'Pesquisar e enriquecer automaticamente'}</button>
      <button type="button" className={buttonClass} onClick={()=>setOpen(value=>!value)} aria-expanded={open}>{open?'Ocultar resultado':'Ver resultado e disponibilidade'}</button>
    </div>
    {!available && <p className="text-xs text-slate-600">Conferindo disponibilidade. Abra o resultado para atualizar.</p>}
    {approved && <p className="text-xs text-amber-800">Registro aprovado preservado. A pesquisa não altera silenciosamente uma aprovação.</p>}
    {!canStart && <p className="text-xs text-slate-600">Somente um administrador autorizado pode iniciar pesquisas pagas.</p>}
    {available?.reasons.map((reason,index)=><p key={`${reason.code}-${index}`} className="text-xs text-amber-900">{reason.message} Caminho: {reason.resolution}.</p>)}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {open && <div className="space-y-3 text-sm">
      {available?.semanticQualificationEnabled&&<p className="text-xs text-slate-600">IA: {available.semantic?.model??'confira a rota no Admin'}; a estimativa de buscas não inclui tokens da IA nem tentativas de fallback. {available.semantic?.budgetReferenceBrl?`Referência de orçamento no Admin: ${money(available.semantic.budgetReferenceBrl)} — não é cotação do consumo.`:''}</p>}
      {result?.run&&available?.semanticQualificationEnabled&&['partial','blocked','failed'].includes(result.run.status)&&<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={allowSemanticRefresh} onChange={e=>setAllowSemanticRefresh(e.target.checked)}/>Autorizo nova análise por IA se as evidências mudaram (pode consumir créditos; buscas concluídas serão reaproveitadas).</label>}
      <button type="button" className={buttonClass} onClick={()=>setRefresh(value=>value+1)}>Atualizar resultado</button>
      {result?.run ? <><p role="status" className="font-semibold">{statusLabel[result.run.status]??result.run.status}</p>
        <ol className="grid gap-2 sm:grid-cols-2">{stages.map(([key,label],index)=><li key={key} className="rounded border bg-white p-2">{index+1}. {label}{result.run?.stage===key?' — etapa atual':''}</li>)}</ol>
        {result.run.error_code && <p className="text-amber-900">Pendência: {radarResearchMessage(result.run.error_code)}. Nenhum contato foi realizado.</p>}
        {output?.discovery && <p>Associação da presença pública: {output.siteAssociation==='confirmed'?'corroborada':'site encontrado ou sugerido, confirmação pendente'}. {output.discovery.websiteUrl&&<SafeSource url={output.discovery.websiteUrl} label="Ver site encontrado"/>}</p>}
        {output?.pages?.some(page=>!!page.text&&!page.limitation)&&<p className="text-xs text-slate-600">Presença pública acessível: {output.pages.filter(page=>!!page.text&&!page.limitation).length} página(s) lida(s). Isso não confirma atendimento ou operação atual.</p>}
        <div className="rounded border bg-white p-3"><h4 className="font-medium">Contatos e canais encontrados</h4>
          {output?.registryPhone&&<p className="mt-2 break-all">Telefone cadastral CNPJá: {output.registryPhone} — não validado por atendimento.</p>}
          {!output?.contacts?.length&&<p className="mt-2 text-slate-600">Nenhum contato público encontrado até esta etapa.</p>}
          <ul className="space-y-2">{output?.contacts?.map((contact,index)=><li key={`${contact.kind}-${index}`} className="mt-2 break-words rounded border p-2">
            <p className="break-all font-medium">{({phone:'Telefone público',email:'E-mail',whatsapp:'WhatsApp publicado',social:'Rede social',business_person:'Contato profissional'})[contact.kind]}: {contact.value}</p>
            <p className="text-xs">{contact.association==='confirmed'?'Identidade corroborada':'Associação pendente'} · <SafeSource url={contact.sourceUrl}/> · Observado em {new Date(contact.observedAt).toLocaleDateString('pt-BR')}</p>
            <p className="text-xs">Finalidade: {({general:'geral',suppliers:'fornecedores/compras',sales:'comercial/vendas',finance:'financeiro',recruitment:'recrutamento',unknown:'não identificada'})[contact.purpose??'unknown']}{contact.preferred?' — prioritário para esta pesquisa':''}. {contact.scope==='group'?'Contato do grupo; não confirma a filial.':''}</p>
            {contact.purposeEvidence&&<details className="text-xs"><summary>Contexto da finalidade</summary>{contact.purposeEvidence}</details>}
            {contact.note&&<p className="text-xs text-slate-600">{contact.note}</p>}</li>)}</ul>
        </div>
        {output?.profile&&<div className="space-y-3 rounded border bg-white p-3"><h4 className="font-medium">Perfil aprofundado da empresa</h4>
          {output.profile.summary&&<SourcedProfileClaim claim={output.profile.summary}/>}
          {([['services','Soluções e serviços'],['customerSegments','Públicos atendidos'],['operatingRegions','Regiões de atuação']] as const).map(([key,label])=><div key={key}><h5 className="font-medium">{label}</h5>
            {output.profile![key].length?<ul className="list-inside list-disc">{output.profile![key].map((claim,index)=><li key={index}><SourcedProfileClaim claim={claim}/></li>)}</ul>:<p className="text-xs text-slate-500">Não comprovado nas fontes consultadas.</p>}</div>)}
          {output.profile.scaleSignals.length>0&&<div><h5 className="font-medium">Sinais de escala publicados</h5>{output.profile.scaleSignals.map((fact,index)=><p key={index}>{fact.value} — {fact.referenceDate??'sem data de referência'}; {fact.scope==='establishment'?'estabelecimento':fact.scope==='group'?'grupo':'escopo pendente'}. <SafeSource url={fact.sourceUrl}/></p>)}</div>}
        </div>}
        {output?.sizeAssessment&&<div className="space-y-2 rounded border bg-white p-3"><h4 className="font-medium">Prioridade por porte — {output.sizeAssessment.direction==='larger'?'priorizar maiores':'priorizar menores'}</h4>
          <p>{output.sizeAssessment.score===null?'Sem evidência suficiente para pontuar':`Pontuação: ${output.sizeAssessment.score}/100`} · Cobertura dos critérios: {output.sizeAssessment.evidenceCoverage}%.</p>
          {output.sizeAssessment.evidenceCoverage<50&&<p className="text-xs text-amber-800">Cobertura baixa: não use esta pontuação isoladamente para comparar empresas.</p>}
          {output.sizeAssessment.contributions.map((item,index)=><p key={index}>{radarSizeMetricLabels[item.metric as RadarSizeMetric]??item.metric}: {item.amount.toLocaleString('pt-BR')} — {item.points} pontos, peso {item.weight}; referência {item.referenceDate??'desconhecida'}. <SafeSource url={item.sourceUrl}/></p>)}
          {output.sizeAssessment.limitations.map((item,index)=><p key={index} className="text-xs text-slate-600">{radarResearchMessage(item)}</p>)}
          <p className="text-xs text-slate-500">Porte, aderência à oferta e intenção de compra são avaliações distintas.</p>
        </div>}
        {!!output?.documents?.length&&<div className="rounded border bg-white p-3"><h4 className="font-medium">Documentos financeiros encontrados — conteúdo não analisado</h4>
          {output.documents.map(item=><p key={item.url}><SafeSource url={item.url} label="Ver documento público"/> · <SafeSource url={item.sourceUrl} label="Página que publicou o link"/></p>)}
          <p className="text-xs text-slate-500">Não usamos o conteúdo desses PDFs como evidência de faturamento ou porte sem leitura e validação.</p></div>}
        {output?.activity&&<div className="rounded border bg-white p-3"><h4 className="font-medium">{activityLabel[output.activity.status]??output.activity.status}</h4><p className="text-xs text-slate-600">{output.activity.limitation}</p>
          {output.activity.signals.map((item,index)=><p key={index} className="mt-2">{item.excerpt} <SafeSource url={item.sourceUrl}/> {item.publishedDate?`Data publicada: ${item.publishedDate}`:'Sem data publicada comprovada'}</p>)}</div>}
        {output?.qualification&&<div className="rounded border bg-white p-3"><h4 className="font-medium">Avaliação para a oferta: {output.qualification.targetStatus} · {output.qualification.productFit}</h4>
          {output.qualification.reasons.map((reason,index)=><p key={index}>{reason}</p>)}
          {output.qualification.evidenceSources?.map(source=><p key={source.id}><SafeSource url={source.sourceUrl} label={`Evidência ${source.id}`}/></p>)}
          <p className="text-xs">Modelo configurado pelo Admin: {output.qualification.model??'não informado'}</p></div>}
        {output?.limitations?.length ? <div className="rounded border border-amber-200 bg-amber-50 p-3"><h4 className="font-medium">O que ainda precisa de conferência</h4>{output.limitations.map((item,index)=><p key={index}>{radarResearchMessage(item)}</p>)}</div>:null}
        {output?.pages?.length ? <details><summary className="cursor-pointer">Páginas e evidências consultadas</summary>{output.pages.map(page=><div key={page.url} className="mt-2 rounded border bg-white p-2"><SafeSource url={page.url} label={page.url}/><p className="mt-1">{page.text.slice(0,1000)}</p>{page.limitation&&<p>{radarResearchMessage(page.limitation)}</p>}</div>)}</details>:null}
      </>:<p className="text-slate-600">Ainda não há pesquisa automática registrada. Não é necessário informar URL para iniciar.</p>}
      <p className="text-xs text-slate-500">Dados públicos observados não comprovam consentimento, número atendido ou intenção de compra. Nenhuma mensagem é enviada.</p>
    </div>}
  </section>
}
