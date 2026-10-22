import { createHash } from 'node:crypto'

const proposals = [
  ['create_campaign', 'playbook', 'Preparar uma campanha comercial', 2],
  ['campaign_lot_lead', 'concept_card', 'Campanha, lote e lead são entidades diferentes', 1],
  ['resume_vs_new', 'playbook', 'Retomar o lote ou pesquisar novas empresas', 6],
  ['refresh_vs_reanalyze', 'concept_card', 'Atualizar pesquisa ou reavaliar dados salvos', 7],
  ['quality_review', 'rubric', 'Revisar identidade, aderência e suficiência', 8],
  ['contact_authority', 'concept_card', 'Contato público não autoriza mensagens', 9],
  ['available_actions', 'concept_card', 'Conhecimento não concede execução', 10],
  ['explain_outcome', 'playbook', 'Explicar conclusão, lacunas e pendências', 3],
] as const

/** A review package, never an approval, embedding, or runtime publication. */
export function prepareRadarKnowledgePublication(source: string) {
  const sections = new Map<number, string>()
  for (const match of source.matchAll(/^## (\d+)\.[^\n]*\n([\s\S]*?)(?=^## \d+\.|$(?![\s\S]))/gm)) {
    sections.set(Number(match[1]), match[2]!.trim())
  }
  const items = proposals.map(([key, kind, title, section]) => {
    const text = sections.get(section)
    if (!text) throw new Error('radar_knowledge_source_incomplete')
    return {
      key, kind, title, status: 'proposed' as const,
      evidence: { section: String(section), excerpt: text.slice(0, 1000) },
      sourceBody: text, reviewRequired: true,
    }
  })
  return {
    schemaVersion: 1,
    status: 'awaiting_review' as const,
    packKey: 'radar_commercial_operations',
    visibility: 'client_safe',
    source: {
      path: 'docs/knowledge/radar-commercial-action-engine.md',
      sha256: createHash('sha256').update(source).digest('hex'),
      byteSize: Buffer.byteLength(source),
    },
    bindings: [
      { profileKey: 'growth_strategist', moduleKey: 'marketing_studio', workflowKey: 'mission_intake_conversation' },
      { profileKey: 'growth_strategist', moduleKey: 'radar', workflowKey: 'radar_commercial_mission' },
    ],
    organizationBindingRequired: true,
    publicationRequires: ['actual_document_id', 'verified_evidence', 'curation_review', 'embeddings', 'human_approval', 'explicit_organization_binding'],
    items,
  }
}
