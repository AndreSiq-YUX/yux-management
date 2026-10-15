import type {RadarResearchQuality} from '@/types/radarResearch'
export function RadarQualitySummary({quality}:{quality?:RadarResearchQuality}){
  return <dl aria-label="Qualidade da pesquisa" className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
    <div><dt className="text-muted-foreground">Identidade</dt><dd>{quality?.identity==='associated'?'Associada à empresa':'Confirmação pendente'}</dd></div>
    <div><dt className="text-muted-foreground">Contatabilidade</dt><dd>{quality?.contactability==='useful'?'Contato útil encontrado':quality?.contactability==='pending'?'Associação pendente':'Falta contato útil'}</dd></div>
    <div><dt className="text-muted-foreground">Aderência</dt><dd>{({high:'Boa aderência',possible:'Possível aderência',low:'Baixa aderência',unknown:'Não confirmada'})[quality?.fit??'unknown']}</dd></div>
    <div><dt className="text-muted-foreground">Potencial por porte</dt><dd>{typeof quality?.potential?.score==='number'?`${quality.potential.score}/100 · cobertura ${quality.potential.coverage??0}%`:'Não estimado'}</dd></div>
  </dl>
}
