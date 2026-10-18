import { ids, uid } from './ids'
import { daysAgo, hoursAgo } from './time'
import { pipelineId, stages } from './crm'
import type { MockRoute } from './types'

const pageDefs: Array<[string, string, string, number, number, number]> = [
  ['Implantes — avaliação gratuita', 'implantes-avaliacao', 'active', 2410, 118, 0],
  ['Clareamento a laser', 'clareamento-laser', 'active', 1520, 64, 0],
  ['Ortodontia invisível', 'ortodontia-invisivel', 'pending_approval', 0, 0, 1],
  ['Lentes de contato dental', 'lentes-contato', 'draft', 0, 0, 0],
]

export const landingPages = pageDefs.map(([name, slug, status, visits, leadCount, pending], index) => {
  const id = uid('lp', index + 1)
  return {
    id,
    organization_id: ids.organization,
    client_id: ids.client,
    contract_id: ids.contract,
    campaign_id: index === 0 ? uid('campaign', 1) : null,
    pipeline_id: pipelineId,
    initial_stage_id: stages[0].id,
    name,
    slug,
    status,
    preview_url: `https://preview.sorrisopleno.example/${slug}`,
    published_url: status === 'active' ? `https://sorrisopleno.example/${slug}` : null,
    primary_cta_type: index === 1 ? 'whatsapp' : 'form',
    primary_cta_value: index === 1 ? '5511988881234' : 'Solicitar avaliação',
    visits,
    leads: leadCount,
    pending_approvals: pending,
    internal_notes: 'nota interna',
    created_at: daysAgo(60 - index * 10),
    updated_at: daysAgo(index + 1),
    landing_page_versions: [
      { id: uid('lpv', index * 2 + 1), landing_page_id: id, version_number: 2, title: 'Versão com depoimentos', status: index === 2 ? 'review' : 'published', preview_url: `https://preview.sorrisopleno.example/${slug}?v=2`, internal_only: false, created_at: daysAgo(8), updated_at: daysAgo(8) },
      { id: uid('lpv', index * 2 + 2), landing_page_id: id, version_number: 1, title: 'Versão inicial', status: 'archived', preview_url: `https://preview.sorrisopleno.example/${slug}?v=1`, internal_only: false, created_at: daysAgo(40), updated_at: daysAgo(40) },
    ],
    landing_page_forms: index < 2 ? [{
      id: uid('lpf', index + 1), landing_page_id: id, pipeline_id: pipelineId, initial_stage_id: stages[0].id, name: `Formulário — ${name}`,
      submit_label: 'Quero minha avaliação', success_message: 'Recebemos seu contato! Em breve falaremos com você.', is_active: true,
      allowed_origins: ['https://sorrisopleno.example'], has_public_token: true, submission_count: leadCount, created_at: daysAgo(55), updated_at: daysAgo(5),
      landing_page_field_mappings: [
        { id: uid('lpm', index * 3 + 1), form_id: uid('lpf', index + 1), field_name: 'nome', crm_field_key: 'name', required: true, created_at: daysAgo(55), updated_at: daysAgo(55) },
        { id: uid('lpm', index * 3 + 2), form_id: uid('lpf', index + 1), field_name: 'telefone', crm_field_key: 'phone', required: true, created_at: daysAgo(55), updated_at: daysAgo(55) },
        { id: uid('lpm', index * 3 + 3), form_id: uid('lpf', index + 1), field_name: 'interesse', crm_field_key: 'interest', required: false, created_at: daysAgo(55), updated_at: daysAgo(55) },
      ],
    }] : [],
    landing_page_change_requests: index === 1 ? [{ id: uid('lpcr', 1), landing_page_id: id, status: 'open', message: 'Trocar a foto do topo por uma da equipe.', created_at: daysAgo(3), updated_at: daysAgo(3) }] : [],
    landing_page_approvals: index === 2 ? [{ id: uid('lpa', 1), landing_page_id: id, version_id: uid('lpv', 5), status: 'pending', created_at: daysAgo(1), updated_at: daysAgo(1) }] : [],
  }
})

const publicForms = [0, 1].map(index => ({
  id: uid('lpf', index + 1),
  landingPageId: uid('lp', index + 1),
  landingPageName: pageDefs[index][0],
  organizationId: ids.organization,
  contractId: ids.contract,
  name: `Formulário — ${pageDefs[index][0]}`,
  submitLabel: 'Quero minha avaliação',
  successMessage: 'Recebemos seu contato!',
  isActive: true,
  allowedOrigins: ['https://sorrisopleno.example'],
  hasPublicToken: true,
  publicTokenRotatedAt: daysAgo(20),
  submissionCount: pageDefs[index][4],
  lastSubmissionAt: hoursAgo(6 + index * 20),
  publicEndpoint: 'https://api.yux.example/public/lead-forms/submit',
  mappings: [
    { id: uid('lpm', index * 3 + 1), formId: uid('lpf', index + 1), fieldName: 'nome', crmFieldKey: 'name', required: true, createdAt: daysAgo(55), updatedAt: daysAgo(55) },
    { id: uid('lpm', index * 3 + 2), formId: uid('lpf', index + 1), fieldName: 'telefone', crmFieldKey: 'phone', required: true, createdAt: daysAgo(55), updatedAt: daysAgo(55) },
  ],
  recentSubmissions: [
    { id: uid('sub', index * 3 + 1), name: 'Camila Rocha', email: 'camila.rocha@email.example', phone: '(11) 97000-1000', status: 'accepted', source: 'Meta Ads', utmSource: 'meta', utmMedium: 'paid', utmCampaign: 'implantes_out', createdAt: hoursAgo(6) },
    { id: uid('sub', index * 3 + 2), name: 'Eduardo Martins', email: 'eduardo.martins@email.example', status: 'accepted', source: 'Orgânico', createdAt: hoursAgo(28) },
  ],
  createdAt: daysAgo(55),
  updatedAt: daysAgo(5),
}))

export const landingRoutes: MockRoute[] = [
  { method: 'GET', path: '/landing-pages/portal/landing-pages', respond: () => landingPages },
  { method: 'GET', path: '/landing-pages/forms', respond: () => publicForms },
]
