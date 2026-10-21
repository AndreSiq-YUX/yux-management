import {Button} from '@/components/ui/button'
import {Card,CardHeader,CardTitle,CardDescription,CardContent,CardFooter} from '@/components/ui/card'
import {Progress} from '@/components/ui/progress'
import {Alert,AlertDescription} from '@/components/ui/alert'
import type {RadarCaptureOperation} from '@/types/radarResearch'
import {radarResearchMessage} from '@/lib/radar/radarResearchMessages'

const labels={queued:'Lote na fila',discovering:'Descobrindo novas empresas',researching:'Aprofundando a pesquisa',completed:'Pesquisa concluída com sucesso',partial:'Pesquisa encerrada com resultado parcial',blocked:'Pesquisa pausada — requer atenção'}
const reasons:Record<string,string>={source_exhausted:'A fonte não retornou mais empresas.',query_cap:'O limite de consultas deste lote foi atingido.',page_cap:'O limite de páginas por região foi atingido.'}
export function RadarCaptureProgress({operation,onRefresh,busy=false,error,showTechnical=false}:{operation:RadarCaptureOperation;onResume?:()=>void;onRefresh:()=>void;busy?:boolean;error?:string;showTechnical?:boolean}){
 const c=operation.counts,hasOutcomes=c.completedWithGaps!==undefined
 const processed=c.completed+(hasOutcomes?(c.completedWithGaps??0)+(c.outsideProfile??0):0)
 const percent=c.requested?Math.min(100,processed/Math.max(c.requested,c.admitted)*100):0
 const title=hasOutcomes&&operation.status==='completed'?'Pesquisa concluída — revise os resultados':labels[operation.status]
 const recovering=operation.discoveryStopped&&c.admitted>=c.requested
 const limited=operation.blockers.some(code=>['source_limit_exceeded','source_budget_exceeded','candidate_search_limit_reached'].includes(code))
 return <Card><CardHeader><CardTitle><span role="status">{operation.canContinue?'Pesquisa pausada — pode continuar este lote':title}</span></CardTitle><CardDescription>Este lote mantém a quantidade e as etapas da revisão {operation.configurationRevision}. Fechar esta página não interrompe a pesquisa.</CardDescription></CardHeader>
  <CardContent className="flex flex-col gap-4"><Progress value={percent} aria-valuenow={percent} aria-label={hasOutcomes?'Empresas com pesquisa encerrada':'Empresas com dados necessários concluídos'}/>
   <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[['Solicitadas',c.requested],['Novas encontradas',c.admitted],...(operation.countingMode==='qualified'?[['Aderentes novas',c.qualified??0]]:[]),...(hasOutcomes||operation.countingMode==='qualified'?[['Fora do perfil',c.outsideProfile??0]]:[]),['Em pesquisa',c.researching],['Concluídas',c.completed],...(hasOutcomes?[['Concluídas com lacunas',c.completedWithGaps??0],['Aguardam retomada',c.technicalFailures??0]]:[['Dados insuficientes',c.insufficient],['Bloqueadas',c.blocked]])].map(([label,value])=><div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="text-lg font-semibold">{value}</dd></div>)}</dl>
   {showTechnical&&operation.discoveryReason&&reasons[operation.discoveryReason]&&<p className="text-sm">{reasons[operation.discoveryReason]} Não aumentamos os limites automaticamente.</p>}
   {operation.canContinue?<p className="text-sm">{recovering?'Use Retomar pesquisa para recuperar as etapas pendentes das empresas deste lote, sem repetir a descoberta.':'Use Retomar pesquisa para conferir a capacidade e aprovar os limites deste mesmo lote. Não é necessário criar outra pesquisa.'}</p>:operation.status==='partial'&&<p className="text-sm">O lote não atingiu toda a quantidade ou algumas empresas terminaram sem os dados necessários. Revise os resultados antes de aprovar.</p>}
   {operation.status==='blocked'&&<Alert><AlertDescription className="flex flex-col gap-2">{showTechnical?operation.blockers.map((code,index)=>{const message=radarResearchMessage(code);return <p key={index}>{message===code?'Há uma etapa pendente. Confira os detalhes da empresa para identificar o impedimento.':message}</p>}):<p>Pesquisa aguardando a equipe responsável. As empresas e os dados encontrados foram preservados.</p>}</AlertDescription></Alert>}
   {showTechnical&&limited&&<p className="text-sm">As etapas com dados salvos podem continuar mesmo sem novas consultas. Para ampliar a pesquisa, <a href="/admin/integrations" className="text-primary underline">ajuste os limites no Admin</a>: quotas diárias das fontes e tetos operacionais; depois confira a configuração da campanha.</p>}
   {showTechnical&&operation.status==='blocked'&&<p className="text-sm">Retomar mantém este lote e recupera as etapas pendentes. Chamadas com cobrança incerta não são repetidas automaticamente. Autorizações de certificado continuam nos detalhes da empresa.</p>}
   {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </CardContent>{error&&<CardFooter><Button type="button" size="sm" variant="outline" disabled={busy} onClick={onRefresh}>Atualizar acompanhamento</Button></CardFooter>}
 </Card>
}
