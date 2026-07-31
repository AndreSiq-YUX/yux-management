import { useState } from 'react'
import { CheckCircle2, Clipboard, ExternalLink, MessageSquare, Plus, Power, RefreshCw, Save, Settings2, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { calculateLandingPageMetrics } from '@/lib/landing-pages/landingPageRules'
import type { PortalLandingPage } from '@/types/landingPage'
import type { ContractDetails } from '@/types/platform'

interface PortalLandingPagesWorkspaceProps {
  contract: ContractDetails
  pages: PortalLandingPage[]
  onRequestChange: (landingPageId: string) => void
  onApprove: (landingPageId: string) => void
  onCreateLeadForm?: (landingPageId: string) => Promise<unknown>
  onRotateLeadFormToken?: (formId: string) => Promise<unknown>
  onToggleLeadForm?: (formId: string, isActive: boolean) => Promise<unknown>
  onUpdateLeadFormFields?: (
    formId: string,
    fields: Array<{ fieldName: string; crmFieldKey: string; required: boolean }>,
  ) => Promise<unknown>
}

type LeadFormDraftField = {
  draftId: string
  fieldName: string
  crmFieldKey: string
  required: boolean
}

export function PortalLandingPagesWorkspace({
  contract,
  pages,
  onRequestChange,
  onApprove,
  onCreateLeadForm = async () => undefined,
  onRotateLeadFormToken = async () => undefined,
  onToggleLeadForm = async () => undefined,
  onUpdateLeadFormFields = async () => undefined,
}: PortalLandingPagesWorkspaceProps) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Landing Pages do contrato</h1>
        <p className="text-slate-600">{contract.name || contract.id}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {pages.map(page => {
          const metrics = calculateLandingPageMetrics(page)
          return (
            <article key={page.id} className="overflow-hidden rounded-md border bg-white">
              <div className="aspect-[16/7] bg-slate-100">
                {page.thumbnailUrl ? (
                  <img src={page.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">Preview indisponivel</div>
                )}
              </div>
              <div className="space-y-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-slate-950">{page.name}</h2>
                    <p className="text-sm text-slate-500">{page.primaryCtaValue}</p>
                  </div>
                  <Badge variant={page.status === 'active' ? 'default' : 'secondary'}>{page.status}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Metric label="Visitas" value={metrics.visits.toString()} />
                  <Metric label="Leads" value={metrics.leads.toString()} />
                  <Metric label="Conversao" value={`${metrics.conversionRate}%`} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {page.previewUrl && (
                    <Button title="Ver preview" variant="outline" size="sm" asChild>
                      <a href={page.previewUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-3.5 w-3.5" />Preview</a>
                    </Button>
                  )}
                  <Button title="Solicitar alteracao" variant="outline" size="sm" onClick={() => onRequestChange(page.id)}>
                    <MessageSquare className="mr-1 h-3.5 w-3.5" />
                    Solicitar ajuste
                  </Button>
                  <Button title="Aprovar publicacao" variant="outline" size="sm" onClick={() => onApprove(page.id)}>
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    Aprovar
                  </Button>
                </div>
                <LeadFormCaptureCard
                  page={page}
                  onCreate={onCreateLeadForm}
                  onRotate={onRotateLeadFormToken}
                  onToggle={onToggleLeadForm}
                  onUpdateFields={onUpdateLeadFormFields}
                />
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function LeadFormCaptureCard({
  page,
  onCreate,
  onRotate,
  onToggle,
  onUpdateFields,
}: {
  page: PortalLandingPage
  onCreate: (landingPageId: string) => Promise<unknown>
  onRotate: (formId: string) => Promise<unknown>
  onToggle: (formId: string, isActive: boolean) => Promise<unknown>
  onUpdateFields: (
    formId: string,
    fields: Array<{ fieldName: string; crmFieldKey: string; required: boolean }>,
  ) => Promise<unknown>
}) {
  const form = page.forms?.[0]
  const [isEditingFields, setIsEditingFields] = useState(false)
  const [draftFields, setDraftFields] = useState<LeadFormDraftField[]>([])

  const copyEndpoint = async (endpoint?: string) => {
    if (!endpoint) return
    await navigator.clipboard?.writeText(endpoint)
    toast.success('Endpoint copiado')
  }

  const openFieldEditor = () => {
    setDraftFields((form?.mappings || []).map(mapping => ({
      draftId: mapping.id,
      fieldName: mapping.fieldName,
      crmFieldKey: mapping.crmFieldKey,
      required: mapping.required,
    })))
    setIsEditingFields(true)
  }

  const saveFields = async () => {
    if (!form) return
    const fields = draftFields
      .map(field => ({
        fieldName: field.fieldName.trim(),
        crmFieldKey: field.crmFieldKey.trim(),
        required: field.required,
      }))
      .filter(field => field.fieldName && field.crmFieldKey)
    const keys = new Set(fields.map(field => field.crmFieldKey))
    if (!keys.has('name') || !keys.has('email')) {
      toast.error('Mantenha os mapeamentos de nome e e-mail')
      return
    }
    const fieldNames = new Set(fields.map(field => field.fieldName.toLowerCase()))
    if (keys.size !== fields.length || fieldNames.size !== fields.length) {
      toast.error('Os nomes externos e os campos do CRM não podem se repetir')
      return
    }
    try {
      await onUpdateFields(form.id, fields)
      setIsEditingFields(false)
      toast.success('Campos do formulário atualizados')
    } catch {
      toast.error('Não foi possível atualizar os campos')
    }
  }

  return (
    <section className="space-y-3 rounded-md border border-dashed bg-slate-50 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Captura de leads por formulário</h3>
          <p className="mt-1 text-xs text-slate-600">Receba leads de um formulário externo e envie-os para o CRM deste contrato.</p>
        </div>
        {form && <span className={`rounded-full px-2 py-1 text-xs font-medium ${form.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>{form.isActive ? 'Ativo' : 'Pausado'}</span>}
      </div>

      {!form ? (
        <Button type="button" size="sm" onClick={() => onCreate(page.id)}>
          Ativar captura de leads
        </Button>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            <Metric label="Submissões" value={String(form.submissionCount)} />
            <Metric label="Campos mapeados" value={String(form.mappings.length)} />
            <Metric label="Último lead" value={form.lastSubmissionAt ? formatDate(form.lastSubmissionAt) : 'Ainda não'} />
          </div>

          {form.mappings.length > 0 && (
            <div className="rounded border bg-white p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-600">Campos configurados para este cliente</p>
                <Button type="button" size="sm" variant="ghost" onClick={openFieldEditor}>
                  <Settings2 className="mr-1 h-3.5 w-3.5" />
                  Configurar campos
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {form.mappings.map(mapping => (
                  <span key={mapping.id} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-700">
                    {mapping.fieldName} → {mapping.crmFieldKey}{mapping.required ? ' *' : ''}
                  </span>
                ))}
              </div>
            </div>
          )}

          {isEditingFields && (
            <div className="space-y-2 rounded border bg-white p-3">
              <div>
                <p className="text-xs font-semibold text-slate-800">Mapeamento personalizado</p>
                <p className="text-[11px] text-slate-500">Relacione o nome enviado pelo formulário ao campo salvo no CRM. Nome e e-mail são obrigatórios.</p>
              </div>
              {draftFields.map((field, index) => (
                <div key={field.draftId} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                  <input
                    aria-label={`Campo externo ${index + 1}`}
                    className="rounded border px-2 py-1.5 text-xs"
                    value={field.fieldName}
                    placeholder="Campo externo"
                    onChange={event => setDraftFields(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, fieldName: event.target.value } : item))}
                  />
                  <input
                    aria-label={`Campo CRM ${index + 1}`}
                    className="rounded border px-2 py-1.5 text-xs"
                    value={field.crmFieldKey}
                    placeholder="Campo no CRM"
                    onChange={event => setDraftFields(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, crmFieldKey: event.target.value } : item))}
                  />
                  <label className="flex items-center gap-1 text-[11px] text-slate-600">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={event => setDraftFields(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, required: event.target.checked } : item))}
                    />
                    Obrigatório
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    title={`Remover campo ${field.fieldName || index + 1}`}
                    disabled={field.crmFieldKey === 'name' || field.crmFieldKey === 'email'}
                    onClick={() => setDraftFields(current => current.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setDraftFields(current => [...current, {
                    draftId: `new-${Date.now()}-${current.length}`,
                    fieldName: '',
                    crmFieldKey: '',
                    required: false,
                  }])}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Adicionar campo
                </Button>
                <Button type="button" size="sm" onClick={saveFields}>
                  <Save className="mr-1 h-3.5 w-3.5" />
                  Salvar campos
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setIsEditingFields(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {form.publicEndpoint && (
            <div className="rounded border bg-white p-2">
              <p className="text-xs font-medium text-slate-600">Endpoint gerado</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate text-xs text-slate-800">{form.publicEndpoint}</code>
                <Button type="button" size="sm" variant="ghost" title="Copiar endpoint" onClick={() => copyEndpoint(form.publicEndpoint)}>
                  <Clipboard className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">Use este endereço no seu formulário. O token é exibido apenas quando gerado ou renovado.</p>
            </div>
          )}

          {form.recentSubmissions.length > 0 && (
            <div className="rounded border bg-white p-2">
              <p className="text-xs font-medium text-slate-600">Leads recebidos recentemente</p>
              <div className="mt-2 space-y-2">
                {form.recentSubmissions.map(submission => (
                  <div key={submission.id} className="space-y-1.5 rounded bg-slate-50 p-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-slate-900">{submission.name || 'Lead sem nome'}</span>
                      <span className="text-slate-500">{submission.email || submission.phone || 'Contato sem canal'}</span>
                      <span className="text-slate-400">{formatDate(submission.createdAt)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-600">
                      {submission.source && <span>Origem: {submission.source}</span>}
                      {submission.profile && <span>Perfil: {submission.profile}</span>}
                      {submission.country && <span>País: {submission.country}</span>}
                      {submission.language && <span>Idioma: {submission.language}</span>}
                      {submission.utmCampaign && <span>UTM: {submission.utmCampaign}</span>}
                      {submission.fitScore != null && <span>Fit: {submission.fitScore}</span>}
                      {submission.intentScore != null && <span>Intenção: {submission.intentScore}</span>}
                      {submission.consentVersion && <span>Consentimento: {submission.consentCode || 'lead_capture'} v{submission.consentVersion}</span>}
                      {submission.privacyPolicyVersion && <span>Política: v{submission.privacyPolicyVersion}</span>}
                      {submission.crmContactId && <span>CRM: {submission.crmContactId}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => onRotate(form.id)}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              Gerar novo endpoint
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => onToggle(form.id, !form.isActive)}>
              <Power className="mr-1 h-3.5 w-3.5" />
              {form.isActive ? 'Pausar captura' : 'Ativar captura'}
            </Button>
          </div>
        </>
      )}
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-950">{value}</p>
    </div>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}
