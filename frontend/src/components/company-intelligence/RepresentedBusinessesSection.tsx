import {RepresentedProductsEditor} from './RepresentedProductsEditor'
import {useEffect,useRef,useState} from 'react'
import {SectionCard,ErrorState,portalButtonClasses} from '@/components/portal-ui'
import {companyIntelligenceService as service} from '@/services/companyIntelligenceService'
import type {BusinessModel,RepresentedBusiness,RepresentedBusinessInput} from '@/types/companyIntelligence'
import {RepresentedBusinessEditor} from './RepresentedBusinessEditor'
export function RepresentedBusinessesSection({organizationId,canWrite,businessModels}:{organizationId:string;canWrite:boolean;businessModels:BusinessModel[]}){
 const [items,setItems]=useState<RepresentedBusiness[]>([]),[editing,setEditing]=useState<RepresentedBusiness|null|undefined>(),[error,setError]=useState(false)
 const [portfolio,setPortfolio]=useState<RepresentedBusiness|null>(null)
 const scope=useRef(organizationId);scope.current=organizationId
 useEffect(()=>{let active=true;setItems([]);setEditing(undefined);setPortfolio(null);setError(false);service.listRepresentedBusinesses(organizationId).then(rows=>{if(active)setItems(rows)}).catch(()=>{if(active)setError(true)});return()=>{active=false}},[organizationId])
 const contextual=businessModels.some(model=>['commercial_representative','distributor'].includes(model))
 if(!contextual&&!items.length&&!error)return null
 const save=async(input:RepresentedBusinessInput)=>{const saved=await service.saveRepresentedBusiness(organizationId,editing??null,input);if(scope.current!==organizationId)return;setItems(current=>current.some(item=>item.id===saved.id)?current.map(item=>item.id===saved.id?saved:item):[...current,saved]);setEditing(undefined)}
 return <SectionCard title="Empresas e marcas representadas" description="O cliente continua sendo esta empresa. As marcas abaixo compõem seu portfólio comercial.">
 {error&&<ErrorState title="Não foi possível carregar as representadas" description="Tente atualizar a página."/>}
 {portfolio&&<><button type="button" className={portalButtonClasses('ghost')} onClick={()=>setPortfolio(null)}>Voltar às representadas</button><RepresentedProductsEditor key={portfolio.id} organizationId={organizationId} brand={portfolio} canWrite={canWrite}/></>}
 {!portfolio&&(editing!==undefined&&canWrite?<RepresentedBusinessEditor key={editing?.id??'new'} value={editing} onSave={save} onCancel={()=>setEditing(undefined)}/>:<div className="space-y-3">{items.map(item=><div key={item.id} className="rounded-lg border border-yx-line p-4"><p className="font-semibold">{item.name} <span className="text-xs font-normal">{item.status==='active'?'Ativa':item.status==='paused'?'Pausada':'Arquivada'}</span></p><p className="mt-1 text-sm text-yx-fg-2">{item.description}</p><p className="mt-1 text-xs">{item.productCount??0} produtos · {item.sourceCount??0} fontes</p><p className="mt-1 text-sm">{item.authorizedLines.join(' · ')}{item.serviceRegions.length?` · ${item.serviceRegions.join(', ')}`:''}</p>{canWrite&&<button type="button" className={portalButtonClasses('ghost')} onClick={()=>setEditing(item)}>Editar {item.name}</button>}<button type="button" className={portalButtonClasses('ghost')} onClick={()=>setPortfolio(item)}>Ver produtos de {item.name}</button></div>)}{canWrite&&<button type="button" className={portalButtonClasses('ghost')} onClick={()=>setEditing(null)}>Adicionar representada</button>}</div>)}
 </SectionCard>
}
