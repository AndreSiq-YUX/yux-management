import {useRef,useState} from 'react'
import {RefreshCw} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {radarService,type LeadRadarPreview} from '@/services/radarService'

const labels:Record<string,string>={websiteUrl:'Site',whatsappPhone:'WhatsApp',city:'Cidade',state:'UF',address:'Endereço',cnpj:'CNPJ',email:'E-mail',phone:'Telefone'}
export function LeadRadarReconciliation({leadId,onSaved}:{leadId:string;onSaved:()=>void}){
 const [preview,setPreview]=useState<LeadRadarPreview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
 const requestId=useRef(crypto.randomUUID())
 const load=async()=>{setBusy(true);setError('');setMessage('');try{setPreview(await radarService.previewLeadData(leadId));requestId.current=crypto.randomUUID()}catch(reason){setError(reason instanceof Error?reason.message:'Não foi possível consultar a pesquisa salva.')}finally{setBusy(false)}}
 const apply=async()=>{if(!preview)return;setBusy(true);setError('');try{await radarService.applyLeadData(leadId,preview.previewRevision,requestId.current);setPreview(null);setMessage('Dados atualizados. Informações existentes preservadas.');onSaved()}catch(reason){setError(reason instanceof Error?reason.message:'Não foi possível atualizar. Confira novamente a prévia.')}finally{setBusy(false)}}
 return <section className="flex flex-col gap-3" aria-label="Dados salvos do Radar">
  <Button size="sm" variant="outline" disabled={busy} onClick={()=>void load()}><RefreshCw className="mr-2 size-4"/>Consultar dados salvos do Radar</Button>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{message&&<p role="status" className="text-sm">{message}</p>}
  {preview&&<div className="flex flex-col gap-3 rounded-md border p-3"><p className="text-sm">Apenas campos vazios serão preenchidos. A pesquisa salva também ficará disponível na ficha.</p><dl className="flex flex-col gap-2 text-sm">{preview.proposals.map(p=><div key={p.field}><dt className="font-medium">{labels[p.field]||p.field}</dt><dd className="break-words text-muted-foreground">{String(p.incomingValue)} · {p.decision==='fill'?'Preencher':'Preservar dado cadastrado'}</dd></div>)}</dl><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={()=>void apply()}>Preencher lacunas</Button><Button disabled={busy} variant="ghost" onClick={()=>setPreview(null)}>Cancelar</Button></div></div>}
 </section>
}
