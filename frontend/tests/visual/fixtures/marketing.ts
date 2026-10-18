import { ids, uid } from './ids'
import { registerRpc, registerTable } from './query'
import { daysAgo, daysFromNow, hoursAgo } from './time'
import type { MockRoute } from './types'

const scope = {
  organization_id: ids.organization,
  client_id: ids.client,
  contract_id: ids.contract,
}

/* ------------------------------ Conteudos ------------------------------ */

const contentDefs: Array<[string, string, string, string, string, number, number | null]> = [
  ['Implantes: o que muda com a carga imediata', 'blog_article', 'blog', 'in_review', 'Artigo explicando carga imediata com linguagem acessível.', 1, null],
  ['5 sinais de que é hora de procurar um ortodontista', 'social_post', 'instagram', 'in_review', 'Carrossel educativo com CTA para avaliação.', 2, null],
  ['Clareamento: mitos e verdades', 'carousel_text', 'instagram', 'approved', 'Carrossel de 7 slides.', 5, 2],
  ['Campanha de outubro — Sorriso em foco', 'ad_copy', 'ad', 'scheduled', 'Anúncio de avaliação gratuita.', 6, 1],
  ['Newsletter: cuidados após cirurgia de implante', 'newsletter', 'newsletter', 'draft', 'Rascunho gerado pelo agente de conteúdo.', 3, null],
  ['Bastidores da clínica: conheça a equipe', 'social_post', 'linkedin', 'changes_requested', 'Ajustar tom: mais próximo e menos técnico.', 9, null],
  ['Por que a ortodontia invisível é para adultos', 'blog_article', 'blog', 'published', 'Artigo publicado e indexado.', 20, -6],
  ['Roteiro de vídeo: tour pela clínica', 'video_script', 'instagram', 'approved', 'Roteiro de 45 segundos.', 7, 4],
]

export const contents = contentDefs.map(([title, contentType, channel, status, brief, createdDaysAgo, scheduleOffset], index) => ({
  id: uid('content', index + 1),
  ...scope,
  title,
  content_type: contentType,
  channel,
  status,
  brief,
  body: `${brief}\n\nTexto completo do conteúdo "${title}" com orientações de marca e CTA para agendar avaliação.`,
  cta: 'Agende sua avaliação gratuita',
  campaign_id: index === 3 ? uid('campaign', 1) : null,
  scheduled_at: scheduleOffset !== null && scheduleOffset > 0 ? daysFromNow(scheduleOffset, 4) : null,
  published_at: status === 'published' ? daysAgo(-(scheduleOffset ?? 0)) : null,
  published_url: status === 'published' ? 'https://sorrisopleno.example/blog/ortodontia-invisivel' : null,
  internal_notes: 'nota interna (nao deve aparecer)',
  created_at: daysAgo(createdDaysAgo),
  updated_at: daysAgo(Math.max(0, createdDaysAgo - 1)),
}))

export const reviews = [
  { id: uid('review', 1), content_item_id: contents[0].id, content_version_id: uid('cversion', 1), status: 'pending', quality_score: 88, comments: null, checklist: {}, decided_at: null, created_at: daysAgo(1), updated_at: daysAgo(1) },
  { id: uid('review', 2), content_item_id: contents[1].id, content_version_id: uid('cversion', 2), status: 'pending', quality_score: 92, comments: null, checklist: {}, decided_at: null, created_at: daysAgo(2), updated_at: daysAgo(2) },
  { id: uid('review', 3), content_item_id: contents[2].id, content_version_id: uid('cversion', 3), status: 'approved', quality_score: 95, comments: 'Aprovado.', checklist: {}, decided_at: daysAgo(4), created_at: daysAgo(5), updated_at: daysAgo(4) },
  { id: uid('review', 4), content_item_id: contents[5].id, content_version_id: uid('cversion', 6), status: 'changes_requested', quality_score: 70, comments: 'Tom mais próximo e menos técnico.', checklist: {}, decided_at: daysAgo(8), created_at: daysAgo(9), updated_at: daysAgo(8) },
]

const calendarDefs: Array<[string, string, string, number, number]> = [
  ['Carrossel: mitos do clareamento', 'instagram', 'scheduled', 1, 2],
  ['Artigo: carga imediata', 'blog', 'planned', 3, 0],
  ['Anúncio: avaliação gratuita', 'ad', 'ready', 2, 3],
  ['Newsletter mensal', 'newsletter', 'planned', 8, 4],
  ['Vídeo: tour pela clínica', 'instagram', 'ready', 5, 7],
  ['Post: equipe em destaque', 'linkedin', 'scheduled', 6, 9],
  ['Artigo: ortodontia invisível', 'blog', 'published', -6, 20],
  ['Stories: promoção de outubro', 'instagram', 'published', -2, 10],
  ['Post: depoimento de paciente', 'instagram', 'missed', -4, 12],
  ['Artigo: cuidados pós-implante', 'blog', 'planned', 12, 1],
]

export const calendarItems = calendarDefs.map(([title, channel, status, offset, created], index) => ({
  id: uid('calendar', index + 1),
  ...scope,
  content_item_id: index < contents.length ? contents[index].id : null,
  title,
  channel,
  status,
  starts_at: offset >= 0 ? daysFromNow(offset, 3) : daysAgo(-offset, 2),
  ends_at: null,
  responsible_user_id: ids.user,
  metadata: {},
  created_at: daysAgo(created),
  updated_at: daysAgo(1),
}))

/* ------------------------------ Marca e conhecimento ------------------------------ */

export const brandProfile = {
  id: uid('brand'),
  ...scope,
  tone_of_voice: 'Acolhedor, claro e confiante. Fala como um profissional que cuida, sem jargão.',
  persona: 'Mulher e homem de 28 a 55 anos, moradores da zona sul e do ABC, que adiaram o tratamento por receio ou falta de tempo.',
  brand_voice_summary: 'A Clínica Sorriso Pleno transforma o medo do dentista em confiança, com atendimento humano e tecnologia.',
  vocabulary_do: ['cuidado', 'sorriso', 'avaliação gratuita', 'confiança', 'sem dor'],
  vocabulary_dont: ['barato', 'promoção imperdível', 'milagre'],
  forbidden_topics: ['antes e depois sem autorização', 'garantia de resultado'],
  priority_topics: ['implantes', 'ortodontia invisível', 'clareamento', 'saúde bucal preventiva'],
  visual_identity: { primaryColor: '#0e7c86', secondaryColor: '#f4b942', fontHeading: 'Poppins', fontBody: 'Inter', logoUrl: null },
  visual_guidelines: 'Fotos reais da equipe, luz natural, tons de verde-água e branco.',
  compliance_notes: 'Seguir resolução CFO sobre publicidade odontológica.',
  status: 'active',
  created_at: daysAgo(120),
  updated_at: daysAgo(12),
}

export const settings = {
  id: uid('mk-settings'),
  ...scope,
  operation_mode: 'managed_by_yux',
  monthly_credit_limit: 1000,
  current_credit_balance: 640,
  approval_policy: {},
  allowed_channels: ['instagram', 'blog', 'linkedin', 'newsletter', 'ad'],
  tone_of_voice: brandProfile.tone_of_voice,
  persona: brandProfile.persona,
  visual_preferences: brandProfile.visual_guidelines,
  forbidden_topics: brandProfile.forbidden_topics,
  priority_topics: brandProfile.priority_topics,
  created_at: daysAgo(120),
  updated_at: daysAgo(12),
}

const products = [
  ['Implantes dentários', 'Odontologia restauradora', 'Reposição de dentes com carga imediata e acompanhamento.', 'Sorriso funcional em até 48h', ['+1.200 implantes realizados', 'Garantia de 10 anos']],
  ['Ortodontia invisível', 'Ortodontia', 'Alinhadores transparentes para adultos.', 'Tratamento discreto e confortável', ['Planejamento 3D', 'Parcelamento em até 24x']],
  ['Clareamento a laser', 'Estética', 'Clareamento em consultório com resultado imediato.', 'Dentes até 8 tons mais claros', ['Sessão de 60 minutos']],
  ['Lentes de contato dental', 'Estética', 'Lentes ultrafinas de porcelana.', 'Sorriso harmônico sem desgaste excessivo', ['Moldagem digital']],
].map(([name, category, description, valueProposition, proofPoints], index) => ({
  id: uid('product', index + 1), ...scope, name, category, description, value_proposition: valueProposition,
  target_audience: 'Pacientes adultos da região metropolitana', proof_points: proofPoints, objections: ['Medo de dor', 'Preço'],
  cta: 'Agendar avaliação', status: 'active', metadata: {}, created_at: daysAgo(100), updated_at: daysAgo(15 + index),
}))

const knowledgeDocs = [
  ['Manual de marca Sorriso Pleno', 'brand', 'indexed', 'Identidade, tom de voz e exemplos de comunicação.'],
  ['FAQ de atendimento — implantes', 'faq', 'indexed', 'Perguntas frequentes sobre implantes, prazos e pós-operatório.'],
  ['Política de preços e parcelamento', 'policy', 'published', 'Faixas de valor, descontos permitidos e formas de pagamento.'],
  ['Cases: reabilitação oral', 'case', 'indexing', 'Três casos documentados com autorização do paciente.'],
  ['Convênios aceitos', 'other', 'draft', 'Lista de planos odontológicos credenciados.'],
].map(([title, documentType, status, summary], index) => ({
  id: uid('kdoc', index + 1), ...scope, title, document_type: documentType, status, summary,
  storage_path: null, source_url: null, metadata: {}, created_at: daysAgo(80 - index * 9), updated_at: daysAgo(10 + index * 3),
}))

/* ------------------------------ Criativos / Studio ------------------------------ */

const suggestions = [
  ['Implantes — avaliação gratuita (3 variações)', 'in_review', 'lead_generation', 'consideration', 70, 4, 88],
  ['Clareamento — oferta de verão', 'draft', 'lead_generation', 'awareness', 40, 2, 76],
  ['Ortodontia invisível — carrossel', 'approved', 'traffic', 'consideration', 55, 6, 91],
].map(([title, status, objective, funnel, budget, created, quality], index) => ({
  id: uid('suggestion', index + 1), ...scope, source_content_item_id: contents[index].id, campaign_id: null, landing_page_id: null,
  status, provider: 'meta', objective, title, campaign_name: title, angle: 'Medo de dentista superado por atendimento acolhedor.',
  target_audience: 'Adultos 28–55, até 12 km da clínica', funnel_stage: funnel, cta: 'Agendar avaliação', daily_budget: budget,
  total_budget: Number(budget) * 30, starts_at: daysFromNow(2), ends_at: daysFromNow(32), utm_source: 'meta', utm_medium: 'paid', utm_campaign: `camp_${index}`,
  copy_variations: [
    { headline: 'Seu novo sorriso começa com uma avaliação gratuita', body: 'Atendimento acolhedor e sem dor. Agende hoje.' },
    { headline: 'Implante com carga imediata', body: 'Saia da clínica com dentes fixos.' },
  ],
  creative_concepts: [{ title: 'Paciente sorrindo na recepção', format: 'image' }, { title: 'Dentista explicando o tratamento', format: 'video' }],
  targeting_suggestions: {}, quality_score: quality, risk_flags: [], approval_required: true, metadata: {},
  created_at: daysAgo(Number(created)), updated_at: daysAgo(1),
}))

const workflowRuns = [
  ['succeeded', 'content_generation', 2], ['succeeded', 'content_generation', 6], ['waiting_approval', 'campaign_plan', 1], ['failed', 'publishing', 9], ['running', 'radar', 0],
].map(([status, runType, created], index) => ({
  id: uid('wfrun', index + 1), ...scope, workflow_id: uid('workflow', 1), status, run_type: runType, input_payload: {}, context_snapshot: {},
  result_payload: {}, credit_debit: 12, raw_cost_estimate: 0.4, error_message: status === 'failed' ? 'Conexão de publicação expirada.' : null,
  requested_by: ids.user, started_at: daysAgo(Number(created)), completed_at: status === 'running' ? null : daysAgo(Number(created)),
  created_at: daysAgo(Number(created)), updated_at: daysAgo(Number(created)),
}))

const connections = [
  { id: uid('pubconn', 1), ...scope, provider: 'meta_instagram', name: '@sorrisopleno', status: 'connected', site_url: 'https://instagram.com/sorrisopleno', auth_type: 'oauth', last_verified_at: daysAgo(1), public_config: {}, metadata: {}, created_at: daysAgo(80), updated_at: daysAgo(1) },
  { id: uid('pubconn', 2), ...scope, provider: 'wordpress', name: 'Blog Sorriso Pleno', status: 'connected', site_url: 'https://sorrisopleno.example/blog', auth_type: 'application_password', last_verified_at: daysAgo(3), public_config: {}, metadata: {}, created_at: daysAgo(80), updated_at: daysAgo(3) },
  { id: uid('pubconn', 3), ...scope, provider: 'google_business_profile', name: 'Google Meu Negócio', status: 'needs_reauth', site_url: 'https://business.google.com', auth_type: 'oauth', public_config: {}, metadata: {}, created_at: daysAgo(80), updated_at: daysAgo(10) },
]

const agents = [
  ['Estrategista de conteúdo', 'content_strategist'], ['Redator multicanal', 'multichannel_writer'], ['Revisor de marca', 'brand_quality_reviewer'], ['Gestor de calendário', 'editorial_calendar_manager'],
].map(([name, type], index) => ({
  id: uid('agent', index + 1), organization_id: ids.organization, client_id: ids.client, contract_id: ids.contract, name, agent_type: type,
  description: `Agente de ${String(name).toLowerCase()}.`, status: 'active', allowed_tools: ['rag_search'], requires_human_approval: true,
  prompt_version: 1, created_at: daysAgo(90), updated_at: daysAgo(20),
}))

registerTable('marketing_studio_settings', [settings])
registerTable('content_items', contents)
registerTable('content_reviews', reviews)
registerTable('content_versions', contents.map((content, index) => ({
  id: uid('cversion', index + 1), content_item_id: content.id, version_number: 1, title: content.title, body: content.body, change_summary: 'Versão inicial', created_at: content.created_at,
})))
registerTable('editorial_calendar_items', calendarItems)
registerTable('marketing_brand_profiles', [brandProfile])
registerTable('marketing_products_services', products)
registerTable('marketing_knowledge_documents', knowledgeDocs)
registerTable('marketing_knowledge_chunks', [])
registerTable('marketing_campaign_creative_suggestions', suggestions)
registerTable('marketing_workflow_runs', workflowRuns)
registerTable('marketing_workflows', [{ id: uid('workflow', 1), ...scope, workflow_key: 'content_pipeline', name: 'Pipeline de conteúdo mensal', description: 'Pesquisa, redação, revisão e agenda.', status: 'active', trigger_type: 'schedule', config: {}, created_at: daysAgo(90), updated_at: daysAgo(10) }])
registerTable('publishing_connections', connections)
registerTable('publishing_runs', [])
registerTable('marketing_agents', agents)
registerTable('marketing_ideas', [])
registerTable('marketing_sources', [])
registerTable('marketing_source_items', [])
registerRpc('match_marketing_knowledge', () => [
  { chunk_id: uid('chunk', 1), document_id: knowledgeDocs[0].id, title: knowledgeDocs[0].title, body: 'Tom acolhedor e claro.', rank: 0.82 },
])

/* ------------------------------ Campanhas ------------------------------ */

const campaignDefs = [
  ['Implantes — Outubro', 'meta', 'active', 'lead_generation', 120, 4200, 128000, 3150, 46, 41200, 8.8, 9],
  ['Clareamento — Verão', 'meta', 'active', 'lead_generation', 70, 1800, 76000, 1900, 31, 11700, 5.5, 6],
  ['Google — Dentista perto de mim', 'google', 'paused', 'conversions', 90, 2600, 41000, 1380, 22, 9400, 2.6, 3],
  ['Ortodontia invisível — Remarketing', 'meta', 'pending_approval', 'lead_generation', 55, 0, 0, 0, 0, 0, 0, 1],
  ['Institucional — Reconhecimento', 'meta', 'draft', 'awareness', 40, 0, 0, 0, 0, 0, 0, 0],
]

export const campaigns = campaignDefs.map(([name, provider, lifecycle, objective, daily, spend, impressions, clicks, leads, revenue, mroi, clients], index) => ({
  id: uid('campaign', index + 1), ...scope, name, provider, objective, lifecycle_status: lifecycle, daily_budget: daily,
  total_budget: Number(daily) * 30, starts_at: daysAgo(30 - index * 4), ends_at: daysFromNow(20), spend, attributed_revenue: revenue,
  impressions, clicks, leads, opportunities: Math.round(Number(leads) * 0.4), proposals: Math.round(Number(leads) * 0.2), clients,
  cpl: Number(leads) ? Number(spend) / Number(leads) : 0, mroi, utm_source: provider, utm_medium: 'paid', utm_campaign: `campanha_${index + 1}`,
  created_at: daysAgo(35 - index * 4), updated_at: daysAgo(1),
  campaign_creatives: index < 3 ? [{ id: uid('creative', index + 1), campaign_id: uid('campaign', index + 1), name: 'Criativo principal', format: 'image', headline: 'Avaliação gratuita', body: 'Agende hoje', created_at: daysAgo(20), updated_at: daysAgo(20) }] : [],
  campaign_recommendations: index === 0 ? [{ id: uid('reco', 1), campaign_id: uid('campaign', 1), title: 'Aumentar verba em 15%', description: 'CPL abaixo da meta com volume estável.', priority: 'medium' }] : [],
  campaign_alerts: index === 2 ? [{ id: uid('alert', 1), campaign_id: uid('campaign', 3), title: 'Sincronização desatualizada há 3 dias', severity: 'warning' }] : [],
  ad_provider_mutation_runs: [],
}))

registerTable('campaigns', campaigns)
registerTable('ad_provider_connections', [
  { id: uid('adconn', 1), ...scope, provider: 'meta', name: 'Meta Business — Sorriso Pleno', status: 'connected', provider_account_id: 'act_100200300', token_reference: 'ref', last_sync_at: hoursAgo(3), created_at: daysAgo(100), updated_at: hoursAgo(3) },
  { id: uid('adconn', 2), ...scope, provider: 'google', name: 'Google Ads — Sorriso Pleno', status: 'stale', provider_account_id: '123-456-7890', token_reference: 'ref', last_sync_at: daysAgo(3), created_at: daysAgo(100), updated_at: daysAgo(3) },
])

export const marketingRoutes: MockRoute[] = [
  { method: 'GET', path: '/marketing-studio/portal/contents', respond: () => contents },
  { method: 'GET', path: '/marketing-studio/portal/reviews', respond: () => reviews },
  { method: 'GET', path: '/campaigns/portal/campaigns', respond: () => campaigns },
  {
    method: 'GET',
    path: '/marketing-studio/journey/summary',
    respond: () => ({
      organizationId: ids.organization, contractId: ids.contract, clientId: ids.client,
      window: { since: daysAgo(30), until: new Date().toISOString() },
      counts: { activeFlows: 2, generatedAssets: contents.length, pendingReviews: 2, scheduledAssets: 3, failedPublications: 1 },
      links: { activeFlows: '/portal/marketing/studio', generatedAssets: '/portal/marketing/conteudo', pendingReviews: '/portal/marketing/conteudo', scheduledAssets: '/portal/marketing/calendario', failedPublications: '/portal/marketing/conteudo' },
      campaigns: [{ id: uid('campaign', 1), name: 'Implantes — Outubro', objective: 'lead_generation', status: 'active', provider: 'meta', createdAt: daysAgo(30), updatedAt: daysAgo(1) }],
      contents: contents.map(content => ({
        id: content.id, title: content.title, contentType: content.content_type, channel: content.channel, status: content.status,
        brief: content.brief, body: content.body, cta: content.cta, latestVersionNumber: 1, createdAt: content.created_at, updatedAt: content.updated_at,
        scheduledAt: content.scheduled_at ?? undefined,
      })),
      workflows: [{ id: uid('workflow', 1), workflowKey: 'content_pipeline', name: 'Pipeline de conteúdo mensal', status: 'active', triggerType: 'schedule', config: {}, createdAt: daysAgo(90), updatedAt: daysAgo(10) }],
      publishingRuns: [],
      calendarItems: calendarItems.slice(0, 6).map(item => ({ id: item.id, title: item.title, channel: item.channel, status: item.status, startsAt: item.starts_at })),
      connections: connections.map(connection => ({ id: connection.id, provider: connection.provider, name: connection.name, status: connection.status, siteUrl: connection.site_url, lastVerifiedAt: (connection as any).last_verified_at })),
    }),
  },
]
