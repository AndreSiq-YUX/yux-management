import { useEffect, useRef, useState } from 'react'
import { radarService } from '@/services/radarService'
import type { RadarProfileClaim, RadarResearchAvailability, RadarResearchResult } from '@/types/radarResearch'
import { radarSizeMetricLabels, type RadarSizeMetric } from '@/lib/radar/radarSearchConfiguration'
import { radarResearchMessage } from '@/lib/radar/radarResearchMessages'
import {Button} from '@/components/ui/button'
import {RadarQualitySummary} from './RadarQualitySummary'

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
export function RadarCandidateResearchPanel({candidateId,organizationId,configurationRevision,availability,availabilityError,showTechnical=true,initialOpen=false,canStart=true,approved=false,onCompleted}:{
  candidateId:string;organizationId:string;configurationRevision:number;availability?:RadarResearchAvailability|null;availabilityError?:string|null;showTechnical?:boolean;initialOpen?:boolean;canStart?:boolean;approved?:boolean;onCompleted?:()=>void
}) {
  const [open,setOpen]=useState(initialOpen),[result,setResult]=useState<RadarResearchResult|null>(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[refresh,setRefresh]=useState(0)
  const [available,setAvailable]=useState(availability)
  const [allowSemanticRefresh,setAllowSemanticRefresh]=useState(false)
  const [tlsConsent,setTlsConsent]=useState(''),[tlsMessage,setTlsMessage]=useState<string|null>(null)
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
      } catch {if(active){setAvailable(null);setError('Não foi possível verificar a disponibilidade ou carregar o resultado. Tente novamente; seus dados foram preservados.')}}
    }
    void load()
    return()=>{active=false;clearTimeout(timer)}
  },[open,candidateId,organizationId,refresh])
  async function start(operation:'complete'|'resume'|'refresh'|'reanalyze'='complete') {
    if(!available||submitted.current||!(operation==='refresh'?available.operations?.refresh?.allowed??available.allowed:operation==='reanalyze'?available.operations?.reanalyze.allowed??available.allowed:available.allowed)||approved||!canStart)return
    const route=available.semantic??available.presence
    const semantic=available.semanticQualificationEnabled?` A etapa de IA poderá consumir créditos conforme a rota e fallbacks autorizados no Admin.${showTechnical&&route?` Modelo: ${route.model??'rota ainda não configurada'}. Limites: ${route.maxInputTokens} tokens de entrada e ${route.maxOutputTokens} de saída. ${route.fallbackCount} fallback(s) autorizado(s).`:''} Não há estimativa monetária do provedor nesta tela; o valor das buscas abaixo não inclui IA.`:''
    if(!window.confirm(operation==='reanalyze'?`Reavaliar com os dados salvos, sem novas buscas?${semantic}`:`${operation==='refresh'?'Fazer uma nova coleta, mesmo com pesquisa recente?':'Pesquisar esta empresa sem enviar mensagens?'} Máximo de ${available.maxQueriesPerCandidate} consultas de busca; estimativa máxima ${money(available.maximumCostPerCandidate)}.${semantic}`))return
    submitted.current=true;setBusy(true);setError(null);setOpen(true)
    try {await radarService.startCandidateResearch(candidateId,{organizationId,configurationRevision,requestId:crypto.randomUUID(),allowSemanticRefresh,operation});setAllowSemanticRefresh(false);setRefresh(value=>value+1)}
    catch {setError('Não foi possível iniciar. Atualize a disponibilidade; confira configuração, quota e orçamento. Seus dados foram preservados.');setRefresh(value=>value+1)}
    finally {submitted.current=false;setBusy(false)}
  }
  async function changeTls(diagnosticId?:string,grantId?:string) {
    if(!result?.run||!result.tlsCanAuthorize||submitted.current||running&&!grantId||!canStart)return
    if(diagnosticId&&(approved||tlsConsent!==`${result.run.id}:${diagnosticId}`))return
    submitted.current=true;setBusy(true);setError(null);setTlsMessage(null)
    try {
      if(grantId)await radarService.revokeTlsException(candidateId,organizationId,grantId)
      else if(diagnosticId)await radarService.authorizeTlsException(candidateId,{organizationId,runId:result.run.id,
        configurationRevision,diagnosticId,confirmed:true})
      setTlsConsent('');setTlsMessage(grantId?'Autorização revogada. Novas leituras excepcionais estão bloqueadas.':'Autorização registrada. Use Retomar pesquisa desta empresa para continuar; nenhuma busca ou análise foi iniciada por esta autorização.')
      setRefresh(value=>value+1)
    }catch{setError('Não foi possível atualizar a autorização. Atualize o dossiê: o certificado, as permissões ou a pesquisa podem ter mudado.')}
    finally{submitted.current=false;setBusy(false)}
  }
  const output=result?.run?.output
  const historical=!!result?.run&&result.run.configuration_revision!==configurationRevision
  return <section className="mt-3 min-w-0 space-y-3 rounded-md border border-sky-200 bg-sky-50/40 p-3" aria-label="Pesquisa automática da empresa">
    <div className="flex flex-wrap gap-2">
      <button type="button" className={`${buttonClass} bg-slate-900 text-white`} disabled={!available?.allowed||busy||running||approved||!canStart} onClick={()=>start(result?.run&&['partial','blocked','failed'].includes(result.run.status)?'resume':'complete')}>
        {busy?'Iniciando...':running?'Pesquisa em andamento':result?.run&&['partial','blocked','failed'].includes(result.run.status)?'Retomar pesquisa desta empresa':'Completar dados desta empresa'}</button>
      <button type="button" className={buttonClass} onClick={()=>setOpen(value=>!value)} aria-expanded={open}>{open?'Ocultar dossiê':'Ver dossiê da empresa'}</button>
      {result?.run&&!running&&<><button type="button" className={buttonClass} disabled={!(available?.operations?.refresh?.allowed??available?.allowed)||busy||approved||!canStart} onClick={()=>start('refresh')}>Atualizar pesquisa</button>
        <button type="button" className={buttonClass} disabled={!(available?.operations?.reanalyze.allowed??available?.allowed)||busy||approved||!canStart} onClick={()=>start('reanalyze')}>Reavaliar com os dados salvos</button></>}
    </div>
    {!available && !error && !availabilityError && <p className="text-xs text-slate-600">Conferindo disponibilidade da pesquisa...</p>}
    {availabilityError && !available && !error && <p role="alert" className="text-sm text-red-700">{availabilityError}</p>}
    {(error||availabilityError)&&<button type="button" className={buttonClass} onClick={()=>{setOpen(true);setRefresh(value=>value+1)}}>Tentar novamente</button>}
    {approved && <p className="text-xs text-amber-800">Registro aprovado preservado. A pesquisa não altera silenciosamente uma aprovação.</p>}
    {!canStart && <p className="text-xs text-slate-600">Somente um administrador autorizado pode iniciar pesquisas pagas.</p>}
    {available?.reasons.map((reason,index)=><p key={`${reason.code}-${index}`} className="text-xs text-amber-900">{showTechnical?`${reason.message} Caminho: ${reason.resolution}.`:'Pesquisa indisponível: solicite ao responsável a revisão da configuração ou dos limites da campanha.'}</p>)}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {open && <div className="space-y-3 text-sm">
      {output&&<RadarQualitySummary quality={historical?undefined:output.quality}/>}
      {tlsMessage&&<p role="status">{tlsMessage}</p>}
      {result?.tlsDiagnostics?.map(diagnostic=>{
        const active=result.tlsExceptions?.find(grant=>grant.hostname===diagnostic.hostname&&grant.fingerprint256===diagnostic.fingerprint256&&!grant.revokedAt&&Date.parse(grant.expiresAt)>Date.now())
        const consentKey=`${result.run?.id}:${diagnostic.diagnosticId}`
        return <fieldset key={diagnostic.diagnosticId} className="flex min-w-0 flex-col gap-3 rounded border border-amber-200 bg-amber-50 p-3">
          <legend className="px-1 font-medium">Leitura pendente: certificado vencido</legend>
          <p className="break-all">{diagnostic.hostname} — certificado vencido em {new Date(diagnostic.validTo).toLocaleDateString('pt-BR')}.</p>
          <p>Não foi possível garantir a autenticidade da conexão. A exceção permite apenas leitura pública deste site e desta pesquisa por uma hora, sem login ou envio de dados.</p>
          {active?<p>Leitura excepcional autorizada até {new Date(active.expiresAt).toLocaleString('pt-BR')}. Retome a pesquisa para continuar.</p>
            :result.tlsCanAuthorize&&canStart&&!approved?<>
              <label className="flex items-start gap-2"><input type="checkbox" checked={tlsConsent===consentKey} disabled={busy||running} onChange={event=>setTlsConsent(event.target.checked?consentKey:'')}/>Autorizo a leitura pública deste site apesar do certificado vencido.</label>
              <Button type="button" className="h-auto self-start whitespace-normal" disabled={tlsConsent!==consentKey||busy||running} onClick={()=>changeTls(diagnostic.diagnosticId)}>Autorizar leitura deste site</Button>
            </>:<p>Solicite a autorização ao administrador YUX para retomar a leitura.</p>}
        </fieldset>
      })}
      {!!result?.tlsExceptions?.length&&<div className="flex flex-col gap-2 rounded border bg-white p-3"><h4 className="font-medium">Histórico de autorizações de leitura</h4>
        {result.tlsExceptions.map(grant=><div key={grant.id} className="flex flex-col gap-2"><p className="break-all">{grant.hostname}: autorizada em {new Date(grant.approvedAt).toLocaleString('pt-BR')}; {grant.revokedAt?'revogada':Date.parse(grant.expiresAt)<=Date.now()?'expirada':`válida até ${new Date(grant.expiresAt).toLocaleString('pt-BR')}`}.</p>
          {showTechnical&&<p className="text-xs">Admin responsável: {grant.approvedBy}</p>}
          {result.tlsCanAuthorize&&canStart&&!grant.revokedAt&&Date.parse(grant.expiresAt)>Date.now()&&<Button type="button" variant="outline" className="self-start" disabled={busy} onClick={()=>changeTls(undefined,grant.id)}>Revogar autorização deste site</Button>}
        </div>)}
      </div>}
      {output?.pages?.some(page=>page.tlsException)&&<p className="rounded border border-amber-200 bg-amber-50 p-3">Este dossiê contém páginas lidas com certificado vencido, mediante autorização do Admin. A ressalva permanece nas evidências e no CRM; não confirma titularidade de contatos nem funcionamento da empresa.</p>}
      {showTechnical&&available?.semanticQualificationEnabled&&<p className="text-xs text-slate-600">IA: {available.semantic?.model??'confira a rota no Admin'}; a estimativa de buscas não inclui tokens da IA nem tentativas de fallback. {available.semantic?.budgetReferenceBrl?`Referência de orçamento no Admin: ${money(available.semantic.budgetReferenceBrl)} — não é cotação do consumo.`:''}</p>}
      {showTechnical&&available?.presenceResolutionEnabled&&<p className="text-xs text-slate-600">Identificação de presença: {available.presence?.model??'configure a rota Radar — identificação de site e canais oficiais no Admin'}. Não inventa páginas nem contatos; usa as evidências coletadas.</p>}
      {showTechnical&&(available?.presenceResolutionEnabled&&!available.presence?.routeConfigured||output?.limitations?.some(item=>/radar_(presence|qualification)_explicit_route_required/.test(item)))&&<p className="text-sm">A análise por IA aguarda configuração. <a className="text-primary underline" href="/admin/ai">Configurar modelos do Radar no Admin</a>. Os fatos encontrados continuam disponíveis; abrir esta página não consome créditos.</p>}
      {result?.run&&available?.semanticQualificationEnabled&&['partial','blocked','failed'].includes(result.run.status)&&<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={allowSemanticRefresh} onChange={e=>setAllowSemanticRefresh(e.target.checked)}/>Autorizo nova análise por IA se as evidências mudaram (pode consumir créditos; buscas concluídas serão reaproveitadas).</label>}
      <button type="button" className={buttonClass} onClick={()=>setRefresh(value=>value+1)}>Atualizar dossiê</button>
      {result?.run ? <><p role="status" className="font-semibold">{statusLabel[result.run.status]??result.run.status}</p>
        {historical&&<p className="rounded border bg-background p-3 text-sm">Dossiê histórico — revisão {result.run.configuration_revision}. A configuração atual é a revisão {configurationRevision}; os vínculos e avaliações abaixo não estão confirmados para ela.</p>}
        {(result.run.output.methodVersion??0)<(result.methodVersion??0)&&<p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm">Esta pesquisa foi feita pelo método anterior. Retomar não refaz as buscas nem reinicia o limite de consultas. Use Atualizar pesquisa para aplicar a nova descoberta com confirmação de custo, ou Reavaliar com os dados salvos para rever somente as evidências existentes. Canais de diretórios não são exibidos como contatos da empresa; o histórico foi preservado.</p>}
        <ol className="grid gap-2 sm:grid-cols-2">{stages.map(([key,label],index)=><li key={key} className="rounded border bg-white p-2">{index+1}. {label}{result.run?.stage===key?' — etapa atual':''}</li>)}</ol>
        {result.run.error_code && <p className="text-amber-900">Pendência: {radarResearchMessage(result.run.error_code)}. Nenhum contato foi realizado.</p>}
        {output?.discovery && <p>Associação da presença pública: {historical?'histórica — confirmar na configuração atual':output.siteAssociation==='confirmed'?'corroborada':'site encontrado ou sugerido, confirmação pendente'}. {output.discovery.websiteUrl&&<SafeSource url={output.discovery.websiteUrl} label="Ver site encontrado"/>}</p>}
        {output?.presenceResolution&&<div className="rounded border bg-white p-3"><p>{historical?'Associação histórica da pesquisa anterior':output.presenceResolution.scope==='group'?'Presença institucional do grupo — não confirma a filial':output.presenceResolution.scope==='establishment'?'Presença associada ao estabelecimento':'Identificação ainda inconclusiva'}</p><p>{output.presenceResolution.reason}</p>
          <details><summary>Por que o site foi associado</summary>{output.presenceResolution.claims.map((claim,index)=><blockquote key={index} className="mt-2 border-l-2 pl-2">{claim.excerpt} <SafeSource url={claim.sourceUrl}/> · {new Date(claim.observedAt).toLocaleDateString('pt-BR')}</blockquote>)}</details></div>}
        {output?.pages?.some(page=>!!page.text&&!page.limitation)&&<p className="text-xs text-slate-600">Presença pública acessível: {output.pages.filter(page=>!!page.text&&!page.limitation).length} página(s) lida(s). Isso não confirma atendimento ou operação atual.</p>}
        <div className="rounded border bg-white p-3"><h4 className="font-medium">Contatos e canais encontrados</h4>
          {output?.registryPhone&&<p className="mt-2 break-all">Telefone cadastral: {output.registryPhone} — não validado por atendimento.</p>}
          {!output?.contacts?.length&&<p className="mt-2 text-slate-600">Nenhum contato público encontrado até esta etapa.</p>}
          <ul className="space-y-2">{output?.contacts?.map((contact,index)=><li key={`${contact.kind}-${index}`} className="mt-2 break-words rounded border p-2">
            <p className="break-all font-medium">{({phone:'Telefone público',email:'E-mail',whatsapp:'WhatsApp publicado',social:'Rede social',business_person:'Contato profissional',contact_form:'Formulário de contato'})[contact.kind]}: {contact.value}</p>
            <p className="text-xs">{historical?'Vínculo histórico — confirmar nesta configuração':contact.association==='confirmed'?'Identidade corroborada':'Associação pendente'} · <SafeSource url={contact.sourceUrl}/> · Observado em {new Date(contact.observedAt).toLocaleDateString('pt-BR')}</p>
            <p className="text-xs">Finalidade: {({general:'geral',suppliers:'fornecedores/compras',sales:'comercial/vendas',finance:'financeiro',recruitment:'recrutamento',privacy:'privacidade/proteção de dados',unknown:'não identificada'})[contact.purpose??'unknown']}{contact.preferred?' — prioritário para esta pesquisa':''}. {contact.scope==='group'?'Contato do grupo; não confirma a filial.':''}</p>
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
        {!!output?.activity?.presenceSignals?.length&&<div className="rounded border bg-background p-3"><h4 className="font-medium">Sinais de presença pública encontrados</h4>
          <ul className="flex flex-col gap-2">{output.activity.presenceSignals.map((item,index)=><li key={`${item.kind}-${index}`} className="text-sm">
            {({accessible_site:'Site acessível',published_contact:'Canal publicado',contact_form:'Formulário disponível',linked_profile:'Perfil vinculado pelo site'} as Record<string,string>)[item.kind]??'Sinal público'}: {item.excerpt} <SafeSource url={item.sourceUrl}/> · Observado em {new Date(item.observedAt).toLocaleDateString('pt-BR')} · {item.association==='review'?'Vínculo com a empresa pendente':item.scope==='group'?'Presença do grupo, não confirma a filial':'Associado à empresa'}.
          </li>)}</ul></div>}
        {output?.activity&&<div className="rounded border bg-white p-3"><h4 className="font-medium">{activityLabel[output.activity.status]??output.activity.status}</h4><p className="text-xs text-slate-600">{output.activity.limitation}</p>
          {output.activity.signals.map((item,index)=><p key={index} className="mt-2">{item.excerpt} <SafeSource url={item.sourceUrl}/> {item.publishedDate?`Data publicada: ${item.publishedDate}`:'Sem data publicada comprovada'}</p>)}</div>}
        {output?.qualification&&<div className="rounded border bg-white p-3"><h4 className="font-medium">Avaliação para a oferta: {({confirmed:'Público confirmado',review:'Requer revisão',not_target:'Fora do público',insufficient:'Evidência insuficiente'} as Record<string,string>)[output.qualification.targetStatus]??'Requer revisão'} · {({high:'Boa aderência',possible:'Possível aderência',low:'Baixa aderência',unknown:'Adequação não confirmada'} as Record<string,string>)[output.qualification.productFit]??'Requer revisão'}</h4>
          {output.qualification.reasons.map((reason,index)=><p key={index}>{reason}</p>)}
          {output.qualification.evidenceSources?.map(source=><p key={source.id}><SafeSource url={source.sourceUrl} label={`Evidência ${source.id}`}/></p>)}
          {showTechnical&&<p className="text-xs">Modelo configurado pelo Admin: {output.qualification.model??'não informado'}</p>}</div>}
        {output?.limitations?.length ? <div className="rounded border border-amber-200 bg-amber-50 p-3"><h4 className="font-medium">O que ainda precisa de conferência</h4>
          {(['Associação à empresa','Análise comercial','Leitura e outras pendências'] as const).map((label,group)=>{
            const items=output.limitations!.filter(item=>{const category=/radar_presence|identidade|identifica[çc][ãa]o|associa[çc][ãa]o/i.test(item)?0:/radar_qualification|radar_profile|perfil|qualifica[çc][ãa]o/i.test(item)?1:2;return category===group})
            return items.length?<div key={label} className="mt-2"><h5 className="text-sm font-medium">{label}</h5>{items.map((item,index)=><p key={index}>{showTechnical?radarResearchMessage(item):/explicit_route_required/.test(item)?'Aguarda configuração da análise pelo responsável pela campanha.':radarResearchMessage(item)}</p>)}</div>:null
          })}</div>:null}
        {output?.pages?.length ? <details><summary className="cursor-pointer">Páginas e evidências consultadas</summary>{output.pages.map(page=><div key={page.url} className="mt-2 rounded border bg-white p-2">
          <SafeSource url={page.url} label={page.url}/><p className="mt-1">{page.text.slice(0,1000)}</p>
          {page.limitation&&<p>{radarResearchMessage(page.limitation)}</p>}
          {page.tlsException&&<p className="text-xs text-amber-800">Página lida sob autorização excepcional por certificado vencido em {new Date(page.tlsException.observedAt).toLocaleString('pt-BR')}.</p>}
        </div>)}</details>:null}
      </>:<p className="text-slate-600">Ainda não há pesquisa automática registrada. Não é necessário informar URL para iniciar.</p>}
      <p className="text-xs text-slate-500">Dados públicos observados não comprovam consentimento, número atendido ou intenção de compra. Nenhuma mensagem é enviada.</p>
    </div>}
  </section>
}
