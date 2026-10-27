import {RadarResearchAttention} from './RadarResearchAttention'
import {Button} from '@/components/ui/button'
import {buildRadarPresenceSummary,radarPublicLink} from '@/lib/radar/radarPresenceSummary'
import type {RadarCandidateRecord} from '@/types/radar'
import type {RadarResearchQuality} from '@/types/radarResearch'
import {RadarQualitySummary} from './RadarQualitySummary'
const radarChannelLabels={phone:'Telefone público',email:'E-mail',whatsapp:'WhatsApp publicado',social:'Rede social',business_person:'Contato profissional',contact_form:'Formulário de contato'} as const
export function RadarCandidateSummary({candidate,revision,onOpenFull}:{candidate:RadarCandidateRecord;revision:number;onOpenFull:(id:string)=>void}) {
  const summary=buildRadarPresenceSummary(candidate,revision)
  return <section aria-label={`Resumo de ${candidate.title}`} className="flex flex-col gap-3 p-4">
    <h4 className="font-semibold">{candidate.title}</h4><RadarResearchAttention attention={candidate.feedback?.attention}/>
    <RadarQualitySummary quality={Number(candidate.normalizedPayload.researchRevision)===revision&&candidate.normalizedPayload.researchAssociationNeedsReview!==true?candidate.normalizedPayload.researchQuality as RadarResearchQuality|undefined:undefined}/>
    <p className="text-sm text-muted-foreground">{String(candidate.normalizedPayload.city??'Localização não informada')} {String(candidate.normalizedPayload.state??'')}</p>
    {summary.website?<p className="break-words text-sm"><span className="font-medium">{summary.website.label}</span>: <a className="text-primary underline" href={summary.website.url} target="_blank" rel="noreferrer">{summary.website.url}</a></p>:<p className="text-sm">{summary.presenceLabel}</p>}
    <ul className="grid gap-3 sm:grid-cols-2">{summary.contacts.slice(0,6).map((contact,index)=><li key={`${contact.kind}-${contact.value}-${index}`} className="flex flex-col gap-1 break-words rounded-md border bg-background p-3 text-sm">
      <span className="font-medium">{radarChannelLabels[contact.kind]}{contact.purpose==='suppliers'?' — fornecedores':contact.purpose==='sales'?' — comercial':''}</span>
      {['social','contact_form'].includes(contact.kind)?<a className="break-all text-primary underline" href={radarPublicLink(contact.value)} target="_blank" rel="noreferrer">{contact.kind==='contact_form'?'Abrir formulário público':contact.value}</a>:<span className="break-all">{contact.value}</span>}
      <span className="text-xs text-muted-foreground">{contact.association==='review'?'Associação pendente':contact.scope==='group'?'Canal do grupo — filial a confirmar':'Publicado em fonte associada'} · <a className="text-primary underline" href={radarPublicLink(contact.sourceUrl)} target="_blank" rel="noreferrer">Fonte</a>{contact.observedAt?` · ${new Date(contact.observedAt).toLocaleDateString('pt-BR')}`:''}</span>
      {(contact.sources?.length??0)>1&&<span className="text-xs text-muted-foreground">Publicado em {contact.sources!.length} evidências; fontes preservadas no dossiê.</span>}
    </li>)}</ul>
    {summary.website&&<p className="text-xs text-muted-foreground">{summary.presenceLabel}. Isso não comprova funcionamento atual ou atendimento.</p>}
    {summary.pending.map(item=><p key={item} className="text-xs text-muted-foreground">{item}</p>)}
    {summary.contacts.length>6&&<p className="text-xs text-muted-foreground">Mais {summary.contacts.length-6} canais no dossiê completo.</p>}
    <div><Button type="button" size="sm" variant="outline" onClick={()=>onOpenFull(candidate.id)}>Ver detalhes completos</Button></div>
  </section>
}
