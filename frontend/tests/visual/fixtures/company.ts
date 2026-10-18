import { CLIENT, ids, uid } from './ids'
import { brandProfile } from './marketing'
import { daysAgo, hoursAgo } from './time'
import type { MockRoute } from './types'

const profile = {
  id: uid('company-profile'),
  organizationId: ids.organization,
  clientId: ids.client,
  legalName: 'Sorriso Pleno Odontologia Ltda.',
  tradeName: CLIENT.companyName,
  description: 'Clínica odontológica focada em implantes, ortodontia invisível e estética do sorriso, com atendimento acolhedor e tecnologia digital.',
  websiteUrl: CLIENT.site,
  industry: 'Saúde — Odontologia',
  positioning: 'A clínica que devolve a confiança de sorrir, sem medo e sem dor.',
  differentiators: ['Planejamento digital 3D', 'Implante com carga imediata', 'Atendimento sem dor', 'Parcelamento em até 24x'],
  emails: ['contato@sorrisopleno.example', CLIENT.email],
  phones: ['(11) 3333-4455', CLIENT.phone],
  address: { street: 'Av. Paulista, 1500 — conj. 82', city: 'São Paulo', state: 'SP', zip: '01310-200' },
  businessHours: { weekdays: '08h às 19h', saturday: '08h às 13h' },
  serviceRegions: ['São Paulo — zona sul', 'ABC paulista', 'Osasco'],
  socialLinks: { instagram: 'https://instagram.com/sorrisopleno', linkedin: 'https://linkedin.com/company/sorrisopleno' },
  createdAt: daysAgo(150),
  updatedAt: daysAgo(12),
}

const brand = {
  id: brandProfile.id,
  organizationId: ids.organization,
  clientId: ids.client,
  contractId: ids.contract,
  toneOfVoice: brandProfile.tone_of_voice,
  persona: brandProfile.persona,
  brandVoiceSummary: brandProfile.brand_voice_summary,
  vocabularyDo: brandProfile.vocabulary_do,
  vocabularyDont: brandProfile.vocabulary_dont,
  forbiddenTopics: brandProfile.forbidden_topics,
  priorityTopics: brandProfile.priority_topics,
  visualIdentity: {
    colors: ['#0e7c86', '#f4b942', '#f7fafa', '#16302f'],
    typography: ['Poppins', 'Inter'],
    designStyle: 'Limpo, acolhedor e luminoso',
    imageryStyle: 'Fotos reais, luz natural, pessoas sorrindo',
    graphicElements: ['Formas orgânicas', 'Linhas suaves'],
  },
  visualGuidelines: brandProfile.visual_guidelines,
  complianceNotes: brandProfile.compliance_notes,
  status: 'active',
  createdAt: brandProfile.created_at,
  updatedAt: brandProfile.updated_at,
}

const knowledgeDefs: Array<[string, string, string, string, string, string]> = [
  ['Manual de marca Sorriso Pleno', 'brand', 'published', 'file', 'external', 'Identidade, tom de voz e exemplos de comunicação.'],
  ['FAQ de atendimento — implantes', 'faq', 'published', 'faq', 'both', 'Perguntas frequentes sobre implantes, prazos e pós-operatório.'],
  ['Política de preços e parcelamento', 'policy', 'indexed', 'manual', 'internal', 'Faixas de valor, descontos e formas de pagamento.'],
  ['Cases: reabilitação oral', 'case', 'indexing', 'file', 'external', 'Três casos documentados com autorização do paciente.'],
  ['Site institucional', 'service', 'published', 'url', 'external', 'Conteúdo coletado de sorrisopleno.example.'],
  ['Convênios aceitos', 'other', 'draft', 'manual', 'internal', 'Lista de planos credenciados.'],
]

const knowledge = knowledgeDefs.map(([title, documentType, status, sourceType, visibility, summary], index) => ({
  id: uid('ci-doc', index + 1),
  organizationId: ids.organization,
  clientId: ids.client,
  contractId: ids.contract,
  sourceId: uid('ci-source', index + 1),
  title,
  documentType,
  status,
  sourceType,
  sourceStatus: 'active',
  visibility,
  allowedAgentProfileKeys: [],
  blockedAgentProfileKeys: [],
  governanceVersion: 1,
  sourceUrl: sourceType === 'url' ? CLIENT.site : undefined,
  mimeType: sourceType === 'file' ? 'application/pdf' : undefined,
  byteSize: sourceType === 'file' ? 482_000 : undefined,
  summary,
  bodyPreview: `${summary} Trecho de pré-visualização do conteúdo indexado.`,
  lastUsedAt: index < 3 ? hoursAgo(10 + index * 20) : undefined,
  metadata: {},
  createdAt: daysAgo(90 - index * 11),
  updatedAt: daysAgo(4 + index * 5),
}))

const emailTemplates = [
  ['Confirmação de consulta', 'transactional', 'crm', 'published', 'Sua consulta está confirmada, {{nome}}'],
  ['Lembrete 24h antes', 'operational', 'crm', 'published', 'Lembrete: sua avaliação é amanhã'],
  ['Pós-atendimento e avaliação', 'operational', 'support', 'draft', 'Como foi sua experiência na Sorriso Pleno?'],
  ['Newsletter mensal', 'marketing', 'marketing_studio', 'paused', 'Novidades da clínica neste mês'],
].map(([name, kind, moduleKey, status, subject], index) => ({
  id: uid('email-tpl', index + 1),
  scope: 'organization',
  organizationId: ids.organization,
  blueprintKey: null,
  name,
  description: `Modelo "${name}" enviado automaticamente.`,
  category: 'relacionamento',
  emailKind: kind,
  moduleKey,
  triggerKey: index < 2 ? 'appointment.scheduled' : null,
  status,
  subject,
  preheader: 'Clínica Sorriso Pleno',
  bodyHtml: '<p>Olá, {{nome}}!</p><p>Esperamos você na <strong>Clínica Sorriso Pleno</strong>.</p>',
  bodyText: 'Olá, {{nome}}! Esperamos você na Clínica Sorriso Pleno.',
  variablesSchema: {},
  requiredVariables: ['nome'],
  editableByClient: true,
  publishedVersionId: status === 'published' ? uid('email-tpl-v', index + 1) : null,
  createdAt: daysAgo(100),
  updatedAt: daysAgo(6 + index),
}))

const sendRequests = Array.from({ length: 6 }, (_, index) => ({
  id: uid('email-send', index + 1),
  templateId: emailTemplates[index % 2].id,
  templateVersionId: null,
  recipientEmail: `paciente${index + 1}@email.example`,
  emailKind: 'operational',
  moduleKey: 'crm',
  subject: emailTemplates[index % 2].subject,
  status: index === 4 ? 'failed' : 'sent',
  protectedError: null,
  createdAt: hoursAgo(3 + index * 9),
  updatedAt: hoursAgo(3 + index * 9),
}))

export const companyRoutes: MockRoute[] = [
  { method: 'GET', path: /^\/company-intelligence\/organizations\/[^/]+\/profile$/, respond: () => profile },
  { method: 'GET', path: /^\/company-intelligence\/organizations\/[^/]+\/brand$/, respond: () => brand },
  { method: 'GET', path: /^\/company-intelligence\/organizations\/[^/]+\/knowledge$/, respond: () => knowledge },
  { method: 'GET', path: /^\/company-intelligence\/organizations\/[^/]+\/knowledge\/upload-limit$/, respond: () => ({ limitMb: 10 }) },
  { method: 'GET', path: '/email-templates/portal/templates', respond: () => emailTemplates },
  { method: 'GET', path: '/email-templates/portal/send-requests', respond: () => sendRequests },
]
