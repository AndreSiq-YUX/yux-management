import { radarSizeMetricLabels, type RadarSizeMetric, type RadarSizePolicy } from '@/lib/radar/radarSearchConfiguration'

export function RadarSizeConfiguration({value,onChange}:{value:RadarSizePolicy;onChange:(value:RadarSizePolicy)=>void}) {
  const change=(index:number,patch:Partial<RadarSizePolicy['criteria'][number]>)=>onChange({...value,criteria:value.criteria.map((item,i)=>i===index?{...item,...patch}:item)})
  return <fieldset className="space-y-3 rounded-md border p-3"><legend className="px-1 text-sm font-semibold">Porte e prioridade — opcional</legend>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.enabled} onChange={e=>onChange({...value,enabled:e.target.checked})}/>Avaliar porte com evidências e critérios desta campanha</label>
    <p className="text-xs text-slate-600">A IA extrai fatos quando autorizada no Admin; os critérios abaixo calculam a prioridade. Capital não é faturamento. Ser S.A. não gera pontos automaticamente. Informação ausente não significa empresa pequena.</p>
    {value.enabled&&<>
      <label className="block text-sm">Priorizar<select className="ml-2 rounded border p-2" value={value.direction} onChange={e=>onChange({...value,direction:e.target.value as RadarSizePolicy['direction']})}><option value="larger">Empresas maiores</option><option value="smaller">Empresas menores</option></select></label>
      {value.criteria.map((item,index)=><fieldset key={index} className="space-y-2 rounded border p-3"><legend>Critério {index+1}</legend>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">Métrica<select className="block rounded border p-2" value={item.metric} onChange={e=>change(index,{metric:e.target.value as RadarSizeMetric})}>
            {Object.entries(radarSizeMetricLabels).map(([key,label])=><option key={key} value={key} disabled={value.criteria.some((other,i)=>i!==index&&other.metric===key)}>{label}</option>)}</select></label>
          <label className="text-sm">Peso<input className="block w-24 rounded border p-2" type="number" min={0.01} max={1000} step="any" required value={item.weight} onChange={e=>change(index,{weight:Number(e.target.value)})}/></label>
          <label className="text-sm">Validade da métrica (dias)<input className="block w-24 rounded border p-2" type="number" min={1} max={3650} required value={item.maxAgeDays} onChange={e=>change(index,{maxAgeDays:Number(e.target.value)})}/></label>
          <button type="button" className="text-sm underline" onClick={()=>onChange({...value,criteria:value.criteria.filter((_,i)=>i!==index)})}>Remover critério {index+1}</button>
        </div>
        <p className="text-xs text-slate-500">Defina faixas de tamanho crescente. A prioridade é invertida automaticamente se escolher empresas menores.</p>
        {item.bands.map((band,bandIndex)=><div key={bandIndex} className="flex flex-wrap items-end gap-3">
          <label className="text-sm">A partir de<input className="block w-32 rounded border p-2" type="number" min={0} step="any" required value={band.min} onChange={e=>change(index,{bands:item.bands.map((other,i)=>i===bandIndex?{...other,min:Number(e.target.value)}:other)})}/></label>
          <label className="text-sm">Pontos de tamanho<input className="block w-24 rounded border p-2" type="number" min={0} max={100} step="any" required value={band.points} onChange={e=>change(index,{bands:item.bands.map((other,i)=>i===bandIndex?{...other,points:Number(e.target.value)}:other)})}/></label>
          <button type="button" className="text-sm underline" disabled={item.bands.length===1} onClick={()=>change(index,{bands:item.bands.filter((_,i)=>i!==bandIndex)})}>Remover faixa {bandIndex+1}</button>
        </div>)}
        <button type="button" className="text-sm underline" disabled={item.bands.length>=20} onClick={()=>change(index,{bands:[...item.bands,{min:(item.bands.at(-1)?.min??0)+1,points:item.bands.at(-1)?.points??0}]})}>Adicionar faixa</button>
      </fieldset>)}
      <button type="button" className="rounded border px-3 py-2 text-sm" disabled={value.criteria.length>=6} onClick={()=>{
        const metric=(Object.keys(radarSizeMetricLabels) as RadarSizeMetric[]).find(key=>!value.criteria.some(item=>item.metric===key))
        if(metric)onChange({...value,criteria:[...value.criteria,{metric,weight:1,maxAgeDays:365,bands:[{min:0,points:0}]}]})
      }}>Adicionar critério de porte</button>
      {!value.criteria.length&&<p className="text-sm text-amber-800">Nenhuma pontuação será emitida até você configurar os critérios.</p>}
    </>}
  </fieldset>
}
