import {useState,type FormEvent} from 'react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Textarea} from '@/components/ui/textarea'
import {Field,FieldGroup,FieldLabel} from '@/components/ui/field'
import type {ActivityKind} from '@/hooks/useLeadOperations'
const titles:Record<ActivityKind,string>={note:'Registrar nota',call:'Registrar chamada',task:'Criar tarefa',meeting:'Agendar reunião'}
export function LeadActivityComposer({kind,busy,onSave,onCancel}:{kind:ActivityKind;busy:boolean;onSave:(kind:ActivityKind,input:{title:string;description:string;dueAt?:string})=>Promise<boolean>;onCancel:()=>void}){
 const [title,setTitle]=useState(kind==='note'?'Nota comercial':kind==='call'?'Chamada realizada':''),[description,setDescription]=useState(''),[dueAt,setDueAt]=useState(''),[error,setError]=useState('')
 const scheduled=kind==='task'||kind==='meeting'
 const submit=async(e:FormEvent)=>{e.preventDefault();if(!title.trim()||scheduled&&!dueAt||!scheduled&&!description.trim()){setError('Preencha o título e '+(scheduled?'a data e hora.':'o relato.'));return}setError('');await onSave(kind,{title:title.trim(),description:description.trim(),...(scheduled?{dueAt:new Date(dueAt).toISOString()}:{})})}
 return <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border bg-background p-4" aria-label={titles[kind]}>
  <h3 className="font-semibold">{titles[kind]}</h3><FieldGroup>
   <Field><FieldLabel htmlFor="activity-title">Título</FieldLabel><Input id="activity-title" autoFocus value={title} maxLength={200} onChange={e=>setTitle(e.target.value)} disabled={busy}/></Field>
   <Field><FieldLabel htmlFor="activity-description">{scheduled?'Detalhes':'Relato'}</FieldLabel><Textarea id="activity-description" value={description} onChange={e=>setDescription(e.target.value)} disabled={busy}/></Field>
   {scheduled&&<Field><FieldLabel htmlFor="activity-due">Data e hora</FieldLabel><Input id="activity-due" type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)} disabled={busy}/></Field>}
  </FieldGroup>
  {kind==='meeting'&&<p className="text-xs text-muted-foreground">A reunião ficará na agenda de atividades do CRM. Nenhum convite externo é enviado automaticamente.</p>}
  {kind==='call'&&<p className="text-xs text-muted-foreground">Salve o resultado após realizar a chamada.</p>}
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{busy?'Salvando...':scheduled?'Agendar':'Salvar registro'}</Button><Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>Cancelar</Button></div>
 </form>
}
