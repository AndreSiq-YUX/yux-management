import { useEffect, useMemo, useState } from 'react'
import { CopyPlus, MailCheck, RefreshCw, Save, Send, UploadCloud } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmailTemplateEditor } from './EmailTemplateEditor'
import {
  extractEmailTemplateVariables,
  getEmailTemplateStatusLabel,
  validateEmailTemplateDraft,
} from '@/lib/email/emailTemplateRules'
import { emailTemplateService } from '@/services/emailTemplateService'
import type {
  EmailTemplate,
  EmailTemplateInput,
  EmailTemplateKind,
  EmailTemplateSendRequest,
  EmailTemplateStatus,
} from '@/types/emailTemplate'

interface EmailTemplateWorkspaceProps {
  mode: 'admin' | 'portal'
  templates: EmailTemplate[]
  sendRequests?: EmailTemplateSendRequest[]
  onReload: () => Promise<void>
}

type FilterValue = 'all' | string

const kindLabels: Record<EmailTemplateKind, string> = {
  transactional: 'Transacional',
  operational: 'Operacional',
  marketing: 'Marketing',
}

const statusOrder: EmailTemplateStatus[] = ['draft', 'published', 'paused', 'archived']

export function EmailTemplateWorkspace({ mode, templates, sendRequests = [], onReload }: EmailTemplateWorkspaceProps) {
  const [selectedId, setSelectedId] = useState<string | null>(templates[0]?.id ?? null)
  const [draft, setDraft] = useState<EmailTemplateInput | null>(() => (templates[0] ? toInput(templates[0]) : null))
  const [isCreating, setIsCreating] = useState(false)
  const [hasDetachedDraft, setHasDetachedDraft] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<FilterValue>('all')
  const [statusFilter, setStatusFilter] = useState<FilterValue>('all')
  const [kindFilter, setKindFilter] = useState<FilterValue>('all')
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [testRecipient, setTestRecipient] = useState('')
  const [testVariables, setTestVariables] = useState<Record<string, string>>({})

  const selectedTemplate = useMemo(
    () => templates.find(template => template.id === selectedId) ?? null,
    [selectedId, templates],
  )

  useEffect(() => {
    if (isCreating) return

    if (hasDetachedDraft) {
      const syncedTemplate = templates.find(template => template.id === selectedId)
      if (!syncedTemplate) return

      setDraft(toInput(syncedTemplate))
      setHasDetachedDraft(false)
      return
    }

    if (selectedId) {
      const currentTemplate = templates.find(template => template.id === selectedId)
      if (currentTemplate) {
        setDraft(toInput(currentTemplate))
        return
      }
    }

    const nextTemplate = templates[0] ?? null
    setSelectedId(nextTemplate?.id ?? null)
    setDraft(nextTemplate ? toInput(nextTemplate) : null)
  }, [hasDetachedDraft, isCreating, selectedId, templates])

  const filteredTemplates = useMemo(() => {
    return templates.filter(template => {
      const categoryMatches = categoryFilter === 'all' || template.category === categoryFilter
      const statusMatches = statusFilter === 'all' || template.status === statusFilter
      const kindMatches = kindFilter === 'all' || template.emailKind === kindFilter
      return categoryMatches && statusMatches && kindMatches
    })
  }, [categoryFilter, kindFilter, statusFilter, templates])

  const categories = useMemo(() => uniqueSorted(templates.map(template => template.category)), [templates])
  const usedVariables = useMemo(() => {
    if (!draft) return []

    const schemaVariables = Object.keys(draft.variablesSchema ?? {})
    const contentVariables = extractEmailTemplateVariables(draft.subject, draft.bodyHtml)
    return uniqueSorted([...(draft.requiredVariables ?? []), ...schemaVariables, ...contentVariables])
  }, [draft])

  useEffect(() => {
    setTestVariables(current => {
      const next: Record<string, string> = {}
      for (const variable of usedVariables) {
        next[variable] = current[variable] ?? sampleValueForVariable(variable)
      }
      return next
    })
  }, [usedVariables])

  const copy = mode === 'admin'
    ? {
        title: 'Modelos de email do sistema',
        subtitle: 'Gerencie templates transacionais e operacionais enviados pela infraestrutura YUX.',
        empty: 'Nenhum modelo de email do sistema encontrado.',
        newLabel: 'Novo modelo do sistema',
      }
    : {
        title: 'Meus modelos de email',
        subtitle: 'Personalize modelos da sua organizacao sem alterar os emails globais da YUX.',
        empty: 'Nenhum modelo proprio encontrado.',
        newLabel: 'Novo modelo de email',
      }

  const portalBlueprintSelected = mode === 'portal' && selectedTemplate?.scope === 'blueprint'
  const validation = draft
    ? validateEmailTemplateDraft({
        subject: draft.subject,
        bodyHtml: draft.bodyHtml,
        emailKind: draft.emailKind,
        requiredVariables: draft.requiredVariables ?? [],
      })
    : { ok: true as const }

  function selectTemplate(template: EmailTemplate) {
    setSelectedId(template.id)
    setDraft(toInput(template))
    setIsCreating(false)
    setHasDetachedDraft(false)
    setError(null)
    setNotice(null)
  }

  function startNewTemplate() {
    setSelectedId(null)
    setDraft(createEmptyDraft())
    setIsCreating(true)
    setHasDetachedDraft(false)
    setError(null)
    setNotice(null)
  }

  function updateDraft<K extends keyof EmailTemplateInput>(field: K, value: EmailTemplateInput[K]) {
    setDraft(current => (current ? { ...current, [field]: value } : current))
  }

  async function runAction(action: string, work: () => Promise<void>) {
    setBusyAction(action)
    setError(null)
    setNotice(null)
    try {
      await work()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nao foi possivel concluir a acao.')
    } finally {
      setBusyAction(null)
    }
  }

  async function handleReload() {
    await runAction('reload', async () => {
      await onReload()
      setNotice('Lista atualizada.')
    })
  }

  async function handleSave() {
    if (!draft || portalBlueprintSelected) return

    await runAction('save', async () => {
      const saved = mode === 'admin'
        ? await emailTemplateService.saveAdminTemplate(draft)
        : await emailTemplateService.savePortalTemplate(draft)

      setSelectedId(saved.id)
      setDraft(toInput(saved))
      setIsCreating(false)
      setHasDetachedDraft(true)
      setNotice('Modelo salvo.')
      await onReload()
    })
  }

  async function handlePublish() {
    if (!draft?.id || portalBlueprintSelected || !validation.ok) return

    await runAction('publish', async () => {
      const published = mode === 'admin'
        ? await emailTemplateService.publishAdminTemplate(draft.id!)
        : await emailTemplateService.publishPortalTemplate(draft.id!)

      setSelectedId(published.id)
      setDraft(toInput(published))
      setHasDetachedDraft(true)
      setNotice('Modelo publicado.')
      await onReload()
    })
  }

  async function handleTestSend() {
    if (!draft?.id || portalBlueprintSelected || !testRecipient.trim()) return

    await runAction('test', async () => {
      const input = { to: testRecipient.trim(), variables: testVariables }
      const result = mode === 'admin'
        ? await emailTemplateService.testAdminTemplate(draft.id!, input)
        : await emailTemplateService.testPortalTemplate(draft.id!, input)

      setNotice(result.message || (result.sent ? 'Email de teste enviado.' : 'Solicitacao de teste concluida.'))
      await onReload()
    })
  }

  async function handleCloneBlueprint() {
    if (mode !== 'portal' || selectedTemplate?.scope !== 'blueprint') return

    await runAction('clone', async () => {
      const cloned = await emailTemplateService.cloneBlueprint(selectedTemplate.id)
      setSelectedId(cloned.id)
      setDraft(toInput(cloned))
      setIsCreating(false)
      setHasDetachedDraft(true)
      setNotice('Blueprint clonado para seus modelos.')
      await onReload()
    })
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">{copy.title}</h1>
          <p className="text-sm text-slate-600">{copy.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" title="Atualizar modelos" onClick={handleReload} disabled={busyAction !== null}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
          <Button type="button" title={copy.newLabel} onClick={startNewTemplate} disabled={busyAction !== null}>
            <MailCheck className="mr-2 h-4 w-4" />
            {copy.newLabel}
          </Button>
        </div>
      </div>

      {(error || notice || !validation.ok) && (
        <div className="space-y-2">
          {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {notice && <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
          {!validation.ok && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {validationMessage(validation.reason, validation.missingVariables)}
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-3 rounded-md border bg-white p-4">
          <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
            <FilterSelect label="Categoria" value={categoryFilter} onChange={setCategoryFilter} options={categories} />
            <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={statusOrder} labelForOption={value => getEmailTemplateStatusLabel(value as EmailTemplateStatus)} />
            <FilterSelect label="Tipo" value={kindFilter} onChange={setKindFilter} options={Object.keys(kindLabels)} labelForOption={value => kindLabels[value as EmailTemplateKind]} />
          </div>

          <div className="space-y-2">
            {filteredTemplates.length === 0 ? (
              <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">{copy.empty}</p>
            ) : (
              filteredTemplates.map(template => (
                <button
                  key={template.id}
                  type="button"
                  className={`w-full rounded-md border p-3 text-left transition hover:border-sky-300 hover:bg-sky-50 ${
                    selectedId === template.id ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white'
                  }`}
                  onClick={() => selectTemplate(template)}
                >
                  <span className="block truncate text-sm font-semibold text-slate-950">{template.name}</span>
                  <span className="mt-1 block truncate text-xs text-slate-500">{template.subject}</span>
                  <span className="mt-3 flex flex-wrap gap-1.5">
                    <Badge variant={template.status === 'published' ? 'default' : 'secondary'}>{getEmailTemplateStatusLabel(template.status)}</Badge>
                    <Badge variant="outline">{kindLabels[template.emailKind]}</Badge>
                    {template.scope === 'blueprint' && <Badge variant="outline">Blueprint</Badge>}
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        {draft ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <main className="space-y-4 rounded-md border bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">
                    {isCreating ? copy.newLabel : selectedTemplate?.name ?? 'Modelo selecionado'}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {portalBlueprintSelected
                      ? 'Clone o blueprint antes de editar este modelo.'
                      : 'Edite conteudo, variaveis e metadados principais.'}
                  </p>
                </div>
                {portalBlueprintSelected && (
                  <Button type="button" variant="outline" title="Clonar blueprint" onClick={handleCloneBlueprint} disabled={busyAction !== null}>
                    <CopyPlus className="mr-2 h-4 w-4" />
                    Clonar blueprint
                  </Button>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <TextField label="Nome" value={draft.name} onChange={value => updateDraft('name', value)} disabled={portalBlueprintSelected} />
                <TextField label="Categoria" value={draft.category} onChange={value => updateDraft('category', value)} disabled={portalBlueprintSelected} />
                <SelectField
                  label="Tipo de email"
                  value={draft.emailKind}
                  onChange={value => updateDraft('emailKind', value as EmailTemplateKind)}
                  options={Object.keys(kindLabels)}
                  labelForOption={value => kindLabels[value as EmailTemplateKind]}
                  disabled={portalBlueprintSelected}
                />
                <TextField label="Modulo" value={draft.moduleKey} onChange={value => updateDraft('moduleKey', value)} disabled={portalBlueprintSelected} />
                <TextField label="Trigger" value={draft.triggerKey ?? ''} onChange={value => updateDraft('triggerKey', value || null)} disabled={portalBlueprintSelected} />
                <TextField label="Preheader" value={draft.preheader ?? ''} onChange={value => updateDraft('preheader', value || null)} disabled={portalBlueprintSelected} />
              </div>

              <TextAreaField label="Descricao" value={draft.description ?? ''} onChange={value => updateDraft('description', value || null)} disabled={portalBlueprintSelected} rows={2} />
              <TextField label="Assunto" value={draft.subject} onChange={value => updateDraft('subject', value)} disabled={portalBlueprintSelected} />
              <TextAreaField
                label="Variaveis obrigatorias"
                value={(draft.requiredVariables ?? []).join(', ')}
                onChange={value => updateDraft('requiredVariables', parseVariableList(value))}
                disabled={portalBlueprintSelected}
                rows={2}
              />

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Corpo HTML</label>
                <EmailTemplateEditor
                  value={draft.bodyHtml}
                  variables={usedVariables}
                  onChange={value => updateDraft('bodyHtml', value)}
                  disabled={portalBlueprintSelected}
                />
              </div>

              <TextAreaField label="Texto alternativo" value={draft.bodyText ?? ''} onChange={value => updateDraft('bodyText', value || null)} disabled={portalBlueprintSelected} rows={4} />
            </main>

            <aside className="space-y-4">
              <div className="rounded-md border bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-950">Acoes</h3>
                <div className="mt-3 grid gap-2">
                  <Button type="button" title="Salvar modelo" onClick={handleSave} disabled={busyAction !== null || portalBlueprintSelected}>
                    <Save className="mr-2 h-4 w-4" />
                    {busyAction === 'save' ? 'Salvando...' : 'Salvar'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    title="Publicar modelo"
                    onClick={handlePublish}
                    disabled={busyAction !== null || portalBlueprintSelected || !draft.id || !validation.ok}
                  >
                    <UploadCloud className="mr-2 h-4 w-4" />
                    {busyAction === 'publish' ? 'Publicando...' : 'Publicar'}
                  </Button>
                </div>
              </div>

              <div className="rounded-md border bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-950">Preview</h3>
                <div className="mt-3 rounded-md border bg-slate-50 p-3">
                  <p className="text-xs font-medium uppercase text-slate-500">Assunto</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">{draft.subject || 'Sem assunto'}</p>
                  {draft.preheader && <p className="mt-1 text-xs text-slate-500">{draft.preheader}</p>}
                </div>
                <iframe
                  title="Preview do email"
                  sandbox=""
                  className="mt-3 h-64 w-full rounded-md border bg-white"
                  srcDoc={buildPreviewDocument(draft.bodyHtml)}
                />
              </div>

              <div className="rounded-md border bg-white p-4">
                <h3 className="text-sm font-semibold text-slate-950">Enviar teste</h3>
                <div className="mt-3 space-y-3">
                  <TextField label="Destinatario" type="email" value={testRecipient} onChange={setTestRecipient} disabled={portalBlueprintSelected || !draft.id} />
                  {usedVariables.map(variable => (
                    <TextField
                      key={variable}
                      label={`{{${variable}}}`}
                      value={testVariables[variable] ?? ''}
                      onChange={value => setTestVariables(current => ({ ...current, [variable]: value }))}
                      disabled={portalBlueprintSelected || !draft.id}
                    />
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    title="Enviar teste"
                    onClick={handleTestSend}
                    disabled={busyAction !== null || portalBlueprintSelected || !draft.id || !testRecipient.trim()}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    {busyAction === 'test' ? 'Enviando...' : 'Enviar teste'}
                  </Button>
                </div>
              </div>
            </aside>
          </div>
        ) : (
          <div className="rounded-md border bg-white p-8 text-center">
            <p className="text-sm text-slate-500">{copy.empty}</p>
            <Button type="button" className="mt-4" onClick={startNewTemplate}>
              <MailCheck className="mr-2 h-4 w-4" />
              {copy.newLabel}
            </Button>
          </div>
        )}
      </div>

      <EmailSendHistory requests={sendRequests} />
    </section>
  )
}

function toInput(template: EmailTemplate): EmailTemplateInput {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    emailKind: template.emailKind,
    moduleKey: template.moduleKey,
    triggerKey: template.triggerKey,
    subject: template.subject,
    preheader: template.preheader,
    bodyHtml: template.bodyHtml,
    bodyText: template.bodyText,
    variablesSchema: template.variablesSchema,
    requiredVariables: template.requiredVariables,
    editableByClient: template.editableByClient,
  }
}

function createEmptyDraft(): EmailTemplateInput {
  return {
    name: '',
    description: null,
    category: 'general',
    emailKind: 'transactional',
    moduleKey: 'email',
    triggerKey: null,
    subject: '',
    preheader: null,
    bodyHtml: '<p></p>',
    bodyText: null,
    variablesSchema: {},
    requiredVariables: [],
    editableByClient: false,
  }
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b))
}

function parseVariableList(value: string) {
  return uniqueSorted(value.split(/[,\n]/).map(item => item.trim()).filter(Boolean))
}

function validationMessage(reason: string, missingVariables?: string[]) {
  if (reason === 'subject_required') return 'Informe um assunto antes de publicar.'
  if (reason === 'body_required') return 'Informe o corpo HTML antes de publicar.'
  if (reason === 'marketing_requires_unsubscribe_url') return 'Modelos de marketing precisam usar a variavel {{unsubscribe_url}}.'
  if (reason === 'required_variable_missing') {
    return `Variaveis obrigatorias ausentes no conteudo: ${(missingVariables ?? []).map(variable => `{{${variable}}}`).join(', ')}.`
  }
  return 'Revise o modelo antes de publicar.'
}

function sampleValueForVariable(variable: string) {
  if (variable.includes('url')) return 'https://hub.yux.com.br'
  if (variable.includes('email')) return 'cliente@example.com'
  if (variable.includes('company')) return 'Cliente YUX'
  if (variable.includes('contact') || variable.includes('name')) return 'Andre'
  return 'valor de teste'
}

function buildPreviewDocument(bodyHtml: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Inter,Arial,sans-serif;margin:16px;color:#0f172a;font-size:14px;line-height:1.5}a{color:#0369a1}</style></head><body>${bodyHtml}</body></html>`
}

function EmailSendHistory({ requests }: { requests: EmailTemplateSendRequest[] }) {
  return (
    <section className="rounded-md border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Historico de envios</h2>
          <p className="text-sm text-slate-500">Ultimos testes e solicitacoes registradas pelos modelos desta area.</p>
        </div>
        <Badge variant="outline">{requests.length} registros</Badge>
      </div>

      {requests.length === 0 ? (
        <p className="mt-4 rounded-md bg-slate-50 p-3 text-sm text-slate-500">Nenhum envio registrado ainda.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Destinatario</th>
                <th className="px-3 py-2">Assunto</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Modulo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.map(request => (
                <tr key={request.id}>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatDateTime(request.createdAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-900">{request.recipientEmail}</td>
                  <td className="max-w-[360px] truncate px-3 py-2 text-slate-700" title={request.subject}>{request.subject}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <Badge variant={request.status === 'sent' ? 'default' : request.status === 'failed' || request.status === 'rejected' ? 'destructive' : 'secondary'}>
                      {sendStatusLabel(request.status)}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{request.moduleKey}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function sendStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: 'Pendente',
    queued: 'Na fila',
    sent: 'Enviado',
    failed: 'Falhou',
    rejected: 'Rejeitado',
  }
  return labels[status] ?? status
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  labelForOption,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
  labelForOption?: (value: string) => string
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <select
        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
        value={value}
        onChange={event => onChange(event.target.value)}
      >
        <option value="all">Todos</option>
        {options.map(option => (
          <option key={option} value={option}>{labelForOption ? labelForOption(option) : option}</option>
        ))}
      </select>
    </label>
  )
}

function TextField({
  label,
  value,
  onChange,
  disabled = false,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  type?: string
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <input
        type={type}
        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
        value={value}
        onChange={event => onChange(event.target.value)}
        disabled={disabled}
      />
    </label>
  )
}

function TextAreaField({
  label,
  value,
  onChange,
  disabled = false,
  rows,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  rows: number
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <textarea
        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
        value={value}
        onChange={event => onChange(event.target.value)}
        disabled={disabled}
        rows={rows}
      />
    </label>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
  labelForOption,
  disabled = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
  labelForOption: (value: string) => string
  disabled?: boolean
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <select
        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
        value={value}
        onChange={event => onChange(event.target.value)}
        disabled={disabled}
      >
        {options.map(option => (
          <option key={option} value={option}>{labelForOption(option)}</option>
        ))}
      </select>
    </label>
  )
}
