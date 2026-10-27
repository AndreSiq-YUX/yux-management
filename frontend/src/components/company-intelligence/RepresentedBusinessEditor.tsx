import {TagListField} from './TagListField'
import {useState} from 'react'
import {SectionCard,portalButtonClasses,ErrorState,useUnsavedChangesWarning} from '@/components/portal-ui'
import type {RepresentedBusiness,RepresentedBusinessInput} from '@/types/companyIntelligence'
import {Field,TextAreaField} from './formParts'
const empty:RepresentedBusinessInput={name:'',relationshipType:'representation',description:'',serviceRegions:[],authorizedLines:[],commercialConditions:'',status:'active'}
export function RepresentedBusinessEditor({value,onSave,onCancel}:{value:RepresentedBusiness|null;onSave:(input:RepresentedBusinessInput)=>Promise<void>;onCancel:()=>void}){
 const [draft,setDraft]=useState<RepresentedBusinessInput>(value??empty),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null)
 const update=<K extends keyof RepresentedBusinessInput>(key:K,item:RepresentedBusinessInput[K])=>setDraft(current=>({...current,[key]:item}))
 useUnsavedChangesWarning(JSON.stringify(draft)!==JSON.stringify(value??empty))
 const save=async()=>{setBusy(true);setError(null);try{await onSave(draft)}catch{setError('Não foi possível salvar. Confira se outra pessoa alterou o cadastro. Seu texto foi preservado.')}finally{setBusy(false)}}
 return <SectionCard title={value?'Editar representada':'Adicionar representada'} description="Cadastre somente as linhas e condições que este cliente está autorizado a oferecer.">
 {error&&<ErrorState title="Não foi possível salvar" description={error}/>}
 <fieldset disabled={busy} className="space-y-4">
 <Field id="represented-name" label="Empresa ou marca" value={draft.name} onChange={v=>update('name',v)}/>
 <label className="block text-sm">Relação comercial<select aria-label="Relação comercial" className="ml-3 rounded-lg border border-yx-line p-2" value={draft.relationshipType} onChange={e=>update('relationshipType',e.target.value as RepresentedBusinessInput['relationshipType'])}><option value="representation">Representação</option><option value="distribution">Distribuição</option><option value="both">Representação e distribuição</option></select></label>
 <Field id="represented-site" label="Site da representada (opcional)" value={draft.websiteUrl??''} onChange={v=>update('websiteUrl',v||undefined)}/>
 <TextAreaField id="represented-description" label="Descrição" value={draft.description} onChange={v=>update('description',v)}/>
 <TagListField id="represented-regions" label="Regiões atendidas" value={draft.serviceRegions} onChange={v=>update('serviceRegions',v)}/>
 <TagListField id="represented-lines" label="Linhas autorizadas" value={draft.authorizedLines} onChange={v=>update('authorizedLines',v)}/>
 <TextAreaField id="represented-conditions" label="Condições e limites comerciais" value={draft.commercialConditions} onChange={v=>update('commercialConditions',v)}/>
 <label className="block text-sm">Situação<select aria-label="Situação da representada" className="ml-3 rounded-lg border border-yx-line p-2" value={draft.status} onChange={e=>update('status',e.target.value as RepresentedBusinessInput['status'])}><option value="active">Ativa</option><option value="paused">Pausada</option><option value="archived">Arquivada</option></select></label>
 <div className="flex gap-3"><button type="button" className={portalButtonClasses('primary')} disabled={draft.name.trim().length<2} onClick={()=>void save()}>Salvar representada</button><button type="button" className={portalButtonClasses('ghost')} onClick={onCancel}>Voltar</button></div>
 </fieldset></SectionCard>
}
