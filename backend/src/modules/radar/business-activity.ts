import type { RadarSiteEvidence } from './site-evidence.js'
export function assessRadarBusinessActivity(evidence: RadarSiteEvidence[]) {
  const signals: Array<{ kind: 'operation' | 'closure'; sourceUrl: string; observedAt: string; excerpt: string; publishedDate?: string }> = []
  for (const page of evidence) {
    const closure = /(?:encerramos (?:nossas )?atividades|permanentemente fechad[oa]|permanently closed|empresa encerrada)/i.exec(page.text)
    const operating = /(?:estamos atendendo|inauguramos|nova unidade|novos clientes|inscri[çc][õo]es abertas)/i.exec(page.text)
    const dated = /\b(20\d{2}-\d{2}-\d{2})\b/.exec(page.text)
    if (closure) signals.push({ kind: 'closure', sourceUrl: page.url, observedAt: page.observedAt,
      excerpt: page.text.slice(Math.max(0, closure.index - 50), closure.index + 180), publishedDate: dated?.[1] })
    if (operating && dated && Date.parse(dated[1]) <= Date.parse(page.observedAt)
      && Date.parse(page.observedAt) - Date.parse(dated[1]) < 366 * 86400000) signals.push({ kind: 'operation',
      sourceUrl: page.url, observedAt: page.observedAt, publishedDate: dated[1], excerpt: page.text.slice(Math.max(0, operating.index - 50), operating.index + 180) })
  }
  const closure = signals.some(item => item.kind === 'closure'), operating = signals.some(item => item.kind === 'operation')
  return { status: closure && operating ? 'conflicting' as const : closure ? 'possible_closure' as const : operating ? 'public_signals' as const : 'inconclusive' as const,
    signals, limitation: 'Sinais públicos não comprovam funcionamento atual, telefone atendido ou disponibilidade comercial.' }
}
