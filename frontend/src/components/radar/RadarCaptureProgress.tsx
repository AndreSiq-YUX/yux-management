import {Button} from '@/components/ui/button'
import {Card,CardHeader,CardTitle,CardDescription,CardContent,CardFooter} from '@/components/ui/card'
import {Progress} from '@/components/ui/progress'
import type {RadarCaptureOperation} from '@/types/radarResearch'
import {radarResearchMessage} from '@/lib/radar/radarResearchMessages'

const labels={queued:'Lote na fila',discovering:'Descobrindo novas empresas',researching:'Aprofundando a pesquisa',completed:'Pesquisa concluída com sucesso',partial:'Pesquisa encerrada com resultado parcial',blocked:'Pesquisa pausada — requer atenção'}
const reasons:Record<string,string>={source_exhausted:'A fonte não retornou mais empresas.',query_cap:'O limite de consultas deste lote foi atingido.',page_cap:'O limite de páginas por região foi atingido.'}
export function RadarCaptureProgress({operation,onRefresh,busy=false,error}:{operation:RadarCaptureOperation;onResume?:()=>void;onRefresh:()=>void;busy?:boolean;error?:string}){
 const c=operation.counts,finished=c.completed+c.insufficient+c.blocked
 return <Card><CardHeader><CardTitle><span role="status">{labels[operation.status]}</span></CardTitle><CardDescription>Este lote mantém a quantidade e as etapas da revisão {operation.configurationRevision}. Fechar esta página não interrompe a pesquisa.</CardDescription></CardHeader>
  <CardContent className="flex flex-col gap-4"><Progress value={c.requested?finished/c.requested*100:0} aria-label="Empresas com pesquisa encerrada"/>
   <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[['Solicitadas',c.requested],['Novas encontradas',c.admitted],['Em pesquisa',c.researching],['Concluídas',c.completed],['Dados insuficientes',c.insufficient],['Bloqueadas',c.blocked]].map(([label,value])=><div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="text-lg font-semibold">{value}</dd></div>)}</dl>
   {operation.discoveryReason&&reasons[operation.discoveryReason]&&<p className="text-sm">{reasons[operation.discoveryReason]} Não aumentamos os limites automaticamente.</p>}
   {operation.status==='partial'&&<p className="text-sm">O lote não atingiu toda a quantidade ou algumas empresas terminaram sem os dados necessários. Revise os resultados antes de aprovar.</p>}
   {operation.blockers.length>0&&<div role="alert" className="flex flex-col gap-2 text-sm">{operation.blockers.map((code,index)=>{const message=radarResearchMessage(code);return <p key={index}>{message===code?'Há uma etapa pendente. Confira a disponibilidade e os detalhes das empresas antes de retomar.':message}</p>})}</div>}
   {operation.status==='blocked'&&<p className="text-sm">Resolva a pendência indicada. Retomar mantém este lote e recupera as etapas pendentes; não refaz a descoberta nem repete chamadas com cobrança incerta. Autorizações de certificado continuam nos detalhes da empresa.</p>}
   {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </CardContent>{error&&<CardFooter><Button type="button" size="sm" variant="outline" disabled={busy} onClick={onRefresh}>Atualizar acompanhamento</Button></CardFooter>}
 </Card>
}
