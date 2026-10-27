import {useRef,useState} from 'react'
import {Button} from '@/components/ui/button'
import {radarService} from '@/services/radarService'
export function RadarCampaignExclusions({organizationId,campaignId,candidateIds,canManage,onChanged,compact=false}:{organizationId:string;campaignId:string;candidateIds:string[];canManage:boolean;onChanged:()=>void;compact?:boolean}){
 const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[open,setOpen]=useState(false)
 const [items,setItems]=useState<Array<{id:string;title:string;candidateId:string|null;createdAt:string}>>([])
 const pending=useRef<{requestId:string;candidateIds:string[]}>(),sending=useRef(false)
 const scope=useRef('');scope.current=`${organizationId}:${campaignId}`
 async function reload(){setItems(await radarService.getCampaignExclusions(organizationId,campaignId))}
 async function exclude(){
  if(!canManage||sending.current||!(pending.current?.candidateIds??candidateIds).length)return
  const originalScope=scope.current;sending.current=true;setBusy(true);setError('')
  pending.current??={requestId:crypto.randomUUID(),candidateIds:[...candidateIds]}
  try{await radarService.excludeCampaignCandidates(organizationId,campaignId,pending.current.candidateIds,pending.current.requestId);if(scope.current!==originalScope)return;pending.current=undefined;setConfirm(false);onChanged();if(open)await reload()}
  catch{if(scope.current===originalScope)setError('Não foi possível confirmar a exclusão. Tente novamente para recuperar o mesmo pedido.')}
  finally{sending.current=false;setBusy(false)}
 }
 async function restore(id:string){if(!canManage||sending.current)return;const originalScope=scope.current;sending.current=true;setBusy(true);setError('');try{await radarService.restoreCampaignExclusion(organizationId,campaignId,id);if(scope.current!==originalScope)return;await reload();onChanged()}catch{setError('Não foi possível restaurar a empresa. Tente novamente.')}finally{sending.current=false;setBusy(false)}}
 return <section className="my-2 flex flex-wrap items-center gap-2" aria-label={compact?'Excluir empresa':'Exclusões da campanha'}>
  {canManage&&<Button size="sm" variant="outline" disabled={busy||confirm||!candidateIds.length} onClick={()=>{pending.current={requestId:crypto.randomUUID(),candidateIds:[...candidateIds]};setConfirm(true)}}>{compact?'Excluir da campanha':'Excluir selecionadas da campanha'}</Button>}
  {!compact&&<Button size="sm" variant="outline" disabled={busy} onClick={async()=>{setOpen(value=>!value);if(!open)try{await reload()}catch{setError('Não foi possível abrir as exclusões desta campanha.')}}}>{open?'Ocultar excluídas':'Excluídas desta campanha'}</Button>}
  {confirm&&<div role="alertdialog" aria-label="Confirmar exclusão da campanha" className="w-full rounded-md border bg-background p-3 text-sm"><p>Excluir {pending.current?.candidateIds.length??candidateIds.length} empresa(s) desta campanha? Elas não voltarão nas próximas buscas desta campanha. Outras campanhas não serão afetadas. A confirmação mantém a seleção original.</p><div className="mt-2 flex gap-2"><Button size="sm" disabled={busy} onClick={exclude}>Confirmar exclusão</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>{setConfirm(false);pending.current=undefined}}>Cancelar</Button></div></div>}
  {error&&<p role="alert" className="w-full text-sm text-destructive">{error}</p>}
  {open&&<div className="w-full rounded-md border p-3 text-sm"><h4 className="font-medium">Excluídas desta campanha</h4>{!items.length&&<p>Nenhuma empresa excluída.</p>}{items.map(item=><div key={item.id} className="mt-2 flex flex-wrap items-center justify-between gap-2"><span>{item.title}</span>{canManage&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>restore(item.id)}>Restaurar para revisão</Button>}</div>)}</div>}
 </section>
}
