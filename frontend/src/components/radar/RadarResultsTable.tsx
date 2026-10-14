import { Fragment,useEffect,useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { RadarCandidateRecord } from '@/types/radar'
import {RadarCandidateSummary} from './RadarCandidateSummary'
import {buildRadarPresenceSummary} from '@/lib/radar/radarPresenceSummary'

export function RadarResultsTable({candidates,revision,selectedIds,approvedIds=[],onSelect,onOpen}:{candidates:RadarCandidateRecord[];revision:number;selectedIds:string[];approvedIds?:string[];onSelect:(ids:string[])=>void;onOpen:(id:string)=>void}) {
  const [query,setQuery]=useState(''),[page,setPage]=useState(0)
  const [expandedId,setExpandedId]=useState<string|null>(null)
  useEffect(()=>{setExpandedId(current=>candidates.some(item=>item.id===current)?current:null)},[candidates])
  useEffect(()=>setExpandedId(null),[revision])
  const filtered=candidates.filter(item=>`${item.title} ${item.normalizedPayload.cnpj??''} ${item.normalizedPayload.city??''}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')))
  const currentPage=Math.min(page,Math.max(0,Math.ceil(filtered.length/20)-1)),rows=filtered.slice(currentPage*20,currentPage*20+20)
  const selected=new Set(selectedIds),all=rows.length>0&&rows.every(item=>selected.has(item.id))
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3"><Input aria-label="Filtrar empresas" placeholder="Nome, CNPJ ou cidade" value={query} onChange={event=>{setQuery(event.target.value);setPage(0);setExpandedId(null)}} className="sm:max-w-sm"/><p className="text-sm text-slate-600">{filtered.length} empresas · {selectedIds.length} selecionadas</p></div>
    <div className="relative overflow-x-auto rounded-md border"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr>
      <th className="p-3"><input type="checkbox" aria-label="Selecionar empresas desta página" checked={all} onChange={()=>onSelect(all?selectedIds.filter(id=>!rows.some(item=>item.id===id)):[...new Set([...selectedIds,...rows.map(item=>item.id)])])}/></th>
      <th className="p-3">Empresa</th><th className="p-3">Localização</th><th className="p-3">Site e contatos</th><th className="p-3">Situação</th><th className="p-3"><span className="sr-only">Detalhes</span></th>
    </tr></thead><tbody className="divide-y">{rows.map(item=>{const data=item.normalizedPayload,current=Number(data.researchRevision??0)===revision
      const summary=buildRadarPresenceSummary(item,revision),contacts=summary.contacts.filter(contact=>contact.association==='confirmed')
      const emails=contacts.filter(contact=>contact.kind==='email').map(contact=>contact.value).join(', ')
      const phones=contacts.filter(contact=>contact.kind==='phone'||contact.kind==='whatsapp').map(contact=>contact.value).join(', ')
      return <Fragment key={item.id}><tr className={selected.has(item.id)?'bg-sky-50/40':'bg-white'}>
        <td className="p-3"><input type="checkbox" aria-label={`Selecionar ${item.title}`} checked={selected.has(item.id)} onChange={()=>onSelect(selected.has(item.id)?selectedIds.filter(id=>id!==item.id):[...selectedIds,item.id])}/></td>
        <td className="p-3"><p className="font-medium text-slate-950">{item.title}</p><p className="text-xs text-slate-500">{String(data.cnpj??'CNPJ não informado')}</p></td>
        <td className="p-3">{String(data.city??'')} / {String(data.state??'')}</td>
        <td className="max-w-xs p-3"><p className="break-all">{summary.website?.url??summary.presenceLabel}</p>{summary.website&&<p className="text-xs text-muted-foreground">{summary.website.label}</p>}<p className="break-all text-xs text-slate-500">{emails||(summary.contacts.some(contact=>contact.kind==='email')?'E-mail encontrado — associação pendente':'E-mail público não identificado')}</p>{phones&&<p className="text-xs text-slate-500">{phones}</p>}</td>
        <td className="p-3">{data.crmLeadId?'Enviado ao CRM':item.status==='discarded'?'Descartada':approvedIds.includes(item.id)?'Aprovada':current?'Dados pesquisados':data.researchRevision?'Requer atualização':'Aguardando pesquisa'}<p className="text-xs text-slate-500">{({high:'Boa aderência',possible:'Possível aderência',low:'Baixa aderência',unknown:'Adequação não confirmada'} as Record<string,string>)[String(data.productFit??'unknown')]??'Revisão necessária'}</p>{data.researchAssociationNeedsReview===true&&<p className="text-xs text-amber-800">Vínculo antigo precisa de revisão — atualize ou reavalie os dados salvos.</p>}</td>
        <td className="p-3"><Button size="sm" variant="outline" aria-expanded={expandedId===item.id} aria-controls={`radar-summary-${item.id}`} onClick={()=>setExpandedId(current=>current===item.id?null:item.id)}>{expandedId===item.id?'Ocultar resumo':'Ver detalhes'}</Button></td>
      </tr>{expandedId===item.id&&<tr id={`radar-summary-${item.id}`}><td colSpan={6} className="p-0"><div className="sticky left-0 w-[min(100%,calc(100vw-5rem))]"><RadarCandidateSummary candidate={item} revision={revision} onOpenFull={onOpen}/></div></td></tr>}</Fragment>})}</tbody></table></div>
    {!rows.length&&<p className="text-sm text-slate-500">Nenhuma empresa encontrada para este filtro.</p>}
    <div className="flex items-center justify-between gap-3"><Button size="sm" variant="outline" disabled={currentPage===0} onClick={()=>{setPage(current=>current-1);setExpandedId(null)}}>Anterior</Button><span className="text-xs text-slate-500">Página {currentPage+1} de {Math.max(1,Math.ceil(filtered.length/20))}</span><Button size="sm" variant="outline" disabled={(currentPage+1)*20>=filtered.length} onClick={()=>{setPage(current=>current+1);setExpandedId(null)}}>Próxima</Button></div>
  </div>
}
