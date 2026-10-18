import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Check, Clipboard, FileInput, Plus, Power, RefreshCw, Save, Settings2, Trash2, X } from 'lucide-react'
import { ConfirmDialog, EmptyState, PendingAction, PendingBadge, ResponsiveTable, SectionCard, StatusChip, portalButtonClasses } from '@/components/portal-ui'
import { PortalPage } from '@/components/client-portal/PortalPage'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { formatPortalDateTime } from '@/lib/client-portal/portalDisplay'
import { cn } from '@/lib/utils'
import {
  buildCurlExample,
  buildHtmlSnippet,
  extractFormKey,
  internalMappings,
  resolveSnippetFields,
} from './leadFormSnippet'
import type { LandingPageForm, LandingPageFormSubmission } from '@/types/landingPage'

type CreateExternalFormInput = {
  name: string
  allowedOrigins: string[]
  consentCode: string
  consentVersion: string
  privacyPolicyVersion: string
  pipelineId?: string
  initialStageId?: string
}

type FormPipelineOption = {
  id: string
  name: string
  stages?: Array<{ id: string; name: string; isActive?: boolean }>
}

type FieldInput = { fieldName: string; crmFieldKey: string; required: boolean }

interface ExternalLeadFormsWorkspaceProps {
  contractName: string
  forms: LandingPageForm[]
  pipelines?: FormPipelineOption[]
  onCreate: (input: CreateExternalFormInput) => Promise<unknown>
  onRotate: (formId: string) => Promise<unknown>
  onToggle: (formId: string, isActive: boolean) => Promise<unknown>
  onUpdateOrigins: (formId: string, allowedOrigins: string[]) => Promise<unknown>
  onUpdateFields: (formId: string, fields: FieldInput[]) => Promise<unknown>
  /** Recarrega os formulários e os leads recebidos recentemente. */
  onRefresh?: () => void | Promise<void>
}

type InstallTab = 'html' | 'wordpress' | 'webflow' | 'advanced'

const INSTALL_TABS: Array<{ key: InstallTab; label: string }> = [
  { key: 'html', label: 'HTML' },
  { key: 'wordpress', label: 'WordPress / Elementor' },
  { key: 'webflow', label: 'Webflow' },
  { key: 'advanced', label: 'Avançado (webhook)' },
]

const inputClasses =
  'h-10 w-full rounded-lg border border-yx-line-strong bg-yx-surface px-3 text-sm font-normal text-yx-fg outline-none placeholder:text-yx-fg-3 focus-visible:ring-2 focus-visible:ring-yx-blue disabled:opacity-60'
const labelClasses = 'grid gap-1.5 text-[13px] font-medium text-yx-fg'
const eyebrowClasses = 'font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-yx-fg-3'

/** Copia com a API de área de transferência; se falhar, seleciona o texto para o usuário copiar. */
async function copyWithFallback(text: string, element: HTMLElement | null): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // segue para o plano B
  }
  if (element) {
    try {
      const range = document.createRange()
      range.selectNodeContents(element)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      if (typeof document.execCommand === 'function' && document.execCommand('copy')) return true
    } catch {
      // a seleção permanece para cópia manual
    }
  }
  return false
}

export function ExternalLeadFormsWorkspace({
  contractName,
  forms,
  pipelines = [],
  onCreate,
  onRotate,
  onToggle,
  onUpdateOrigins,
  onUpdateFields,
  onRefresh,
}: ExternalLeadFormsWorkspaceProps) {
  const [showCreate, setShowCreate] = useState(false)
  const [selectedFormId, setSelectedFormId] = useState<string | undefined>(forms[0]?.id)

  useEffect(() => {
    if (forms.length === 0) {
      if (selectedFormId) setSelectedFormId(undefined)
      return
    }
    if (!selectedFormId || !forms.some(form => form.id === selectedFormId)) setSelectedFormId(forms[0].id)
  }, [forms, selectedFormId])

  const selectedForm = forms.find(form => form.id === selectedFormId) || forms[0]
  const totalLeads = forms.reduce((sum, form) => sum + form.submissionCount, 0)
  const creating = showCreate
  const stepState = !selectedForm ? 'create' : selectedForm.submissionCount > 0 ? 'done' : 'install'

  return (
    <PortalPage
      eyebrow={contractName || undefined}
      title="Formulários externos"
      description="Receba no seu CRM os leads de formulários do seu site, de landing pages e de outras ferramentas."
      help={[
        'Crie um formulário e escolha para qual funil os leads vão.',
        'Copie o código pronto e cole no seu site (HTML, WordPress, Elementor ou Webflow).',
        'Envie um teste pelo seu site e confira o lead em "Leads recebidos recentemente".',
      ]}
      metrics={
        forms.length > 0
          ? [
              { label: 'Formulários', value: String(forms.length) },
              { label: 'Leads recebidos', value: String(totalLeads) },
            ]
          : []
      }
      primaryAction={
        forms.length > 0 ? (
          <button type="button" onClick={() => setShowCreate(current => !current)} className={portalButtonClasses('primary')}>
            {showCreate ? <X aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {showCreate ? 'Cancelar' : 'Novo formulário'}
          </button>
        ) : undefined
      }
      related={[{ label: 'Landing pages', href: '/portal/marketing/landing-pages' }]}
    >
      <Steps state={stepState} />

      <SectionCard
        id="passo-1"
        title="1. Criar o formulário"
        description="Defina o nome e para onde os leads vão. O código para o seu site é gerado em seguida."
      >
        {creating ? (
          <CreateFormPanel
            pipelines={pipelines}
            hasForms={forms.length > 0}
            onCancel={() => setShowCreate(false)}
            onCreate={async input => {
              await onCreate(input)
              setShowCreate(false)
            }}
          />
        ) : forms.length === 0 ? (
          <EmptyState
            icon={FileInput}
            title="Nenhum formulário externo criado"
            description="Crie o primeiro formulário para receber leads sem depender de uma landing page cadastrada na YUX."
            action={{ label: 'Criar primeiro formulário', onClick: () => setShowCreate(true) }}
          />
        ) : (
          <p className="text-[13px] text-yx-fg-2">
            {forms.length === 1 ? 'Você tem 1 formulário criado.' : `Você tem ${forms.length} formulários criados.`} Use &quot;Novo formulário&quot; para criar outro.
          </p>
        )}
      </SectionCard>

      {selectedForm ? (
        <>
          {forms.length > 1 ? (
            <label className={cn(labelClasses, 'max-w-sm')}>
              Formulário
              <select
                value={selectedForm.id}
                onChange={event => setSelectedFormId(event.target.value)}
                className={inputClasses}
              >
                {forms.map(form => (
                  <option key={form.id} value={form.id}>{form.name}</option>
                ))}
              </select>
            </label>
          ) : null}

          <FormHeader form={selectedForm} onToggle={onToggle} />

          <SectionCard
            id="passo-2"
            title="2. Instalar no seu site"
            description="Copie o código e cole no seu site. Escolha a aba da plataforma que você usa."
          >
            <InstallTabs
              form={selectedForm}
              onRotate={onRotate}
              onUpdateOrigins={onUpdateOrigins}
              onUpdateFields={onUpdateFields}
            />
          </SectionCard>

          <SectionCard
            id="passo-3"
            title="3. Testar o envio"
            description="Envie um teste pelo seu próprio site e confira se o lead chegou."
          >
            <TestPanel form={selectedForm} onRefresh={onRefresh} />
          </SectionCard>
        </>
      ) : (
        <p className="text-[13px] text-yx-fg-3">Os passos 2 e 3 aparecem assim que você criar o primeiro formulário.</p>
      )}
    </PortalPage>
  )
}

function Steps({ state }: { state: 'create' | 'install' | 'done' }) {
  const steps = [
    { id: 'passo-1', title: 'Criar o formulário', status: state === 'create' ? 'active' : 'done' },
    { id: 'passo-2', title: 'Instalar no seu site', status: state === 'create' ? 'todo' : state === 'install' ? 'active' : 'done' },
    { id: 'passo-3', title: 'Testar o envio', status: state === 'done' ? 'done' : 'todo' },
  ] as const

  return (
    <ol aria-label="Passos" className="m-0 grid list-none gap-2 p-0 sm:grid-cols-3">
      {steps.map((step, index) => (
        <li key={step.id}>
          <a
            href={`#${step.id}`}
            aria-current={step.status === 'active' ? 'step' : undefined}
            className={cn(
              'flex min-h-12 items-center gap-3 rounded-lg border px-3.5 py-2.5 text-[13px] font-semibold no-underline transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue',
              step.status === 'active' && 'border-yx-blue bg-yx-blue-soft text-yx-fg',
              step.status === 'done' && 'border-yx-ok-line bg-yx-ok-soft text-yx-fg',
              step.status === 'todo' && 'border-yx-line bg-yx-surface text-yx-fg-2',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs',
                step.status === 'active' && 'border-yx-blue bg-yx-blue text-white',
                step.status === 'done' && 'border-yx-ok bg-yx-ok text-white',
                step.status === 'todo' && 'border-yx-line-strong text-yx-fg-3',
              )}
            >
              {step.status === 'done' ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <span>
              {index + 1}. {step.title}
            </span>
          </a>
        </li>
      ))}
    </ol>
  )
}

function CreateFormPanel({
  pipelines,
  hasForms,
  onCancel,
  onCreate,
}: {
  pipelines: FormPipelineOption[]
  hasForms: boolean
  onCancel: () => void
  onCreate: (input: CreateExternalFormInput) => Promise<void>
}) {
  const [submitting, setSubmitting] = useState(false)
  const [name, setName] = useState('Formulário do site')
  const [origins, setOrigins] = useState('')
  const [consentCode, setConsentCode] = useState('lead_capture')
  const [consentVersion, setConsentVersion] = useState('1.0')
  const [privacyPolicyVersion, setPrivacyPolicyVersion] = useState('1.0')
  const [pipelineId, setPipelineId] = useState('')
  const [initialStageId, setInitialStageId] = useState('')
  const selectedPipeline = pipelines.find(pipeline => pipeline.id === pipelineId)
  const availableStages = (selectedPipeline?.stages || []).filter(stage => stage.isActive !== false)

  const create = async () => {
    if (!name.trim()) return
    setSubmitting(true)
    try {
      const input: CreateExternalFormInput = {
        name: name.trim(),
        allowedOrigins: origins.split(/[\n,]/).map(value => value.trim()).filter(Boolean),
        consentCode: consentCode.trim() || 'lead_capture',
        consentVersion: consentVersion.trim() || '1.0',
        privacyPolicyVersion: privacyPolicyVersion.trim() || '1.0',
      }
      if (pipelineId) input.pipelineId = pipelineId
      if (initialStageId) input.initialStageId = initialStageId
      await onCreate(input)
      setName('Formulário do site')
      setOrigins('')
      setPipelineId('')
      setInitialStageId('')
    } catch {
      // A página que fornece a ação avisa o cliente; aqui só liberamos o botão.
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-[15px] font-semibold text-yx-fg">Novo formulário externo</h3>
        <p className="text-xs text-yx-fg-3">
          {hasForms ? 'Cada formulário tem o seu próprio código.' : 'O código para o seu site é gerado assim que você criar.'}
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className={labelClasses}>
          Nome
          <input aria-label="Nome do formulário" className={inputClasses} value={name} onChange={event => setName(event.target.value)} />
        </label>
        <label className={labelClasses}>
          Funil inicial
          <select
            aria-label="Funil inicial"
            className={inputClasses}
            value={pipelineId}
            onChange={event => {
              setPipelineId(event.target.value)
              setInitialStageId('')
            }}
          >
            <option value="">Usar configuração padrão</option>
            {pipelines.map(pipeline => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
          </select>
        </label>
        <label className={labelClasses}>
          Etapa inicial
          <select
            aria-label="Etapa inicial"
            className={inputClasses}
            value={initialStageId}
            disabled={!pipelineId}
            onChange={event => setInitialStageId(event.target.value)}
          >
            <option value="">Primeira etapa ativa</option>
            {availableStages.map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
          </select>
        </label>
      </div>

      <details className="rounded-lg border border-dashed border-yx-line-strong bg-yx-surface-2">
        <summary className="flex min-h-10 cursor-pointer items-center px-3 text-[13px] font-semibold text-yx-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue">
          Avançado
        </summary>
        <div className="grid gap-3 border-t border-yx-line p-3 md:grid-cols-2">
          <label className={cn(labelClasses, 'md:col-span-2')}>
            Origens permitidas (opcional)
            <textarea
              aria-label="Origens iniciais"
              className="min-h-20 w-full rounded-lg border border-yx-line-strong bg-yx-surface px-3 py-2 text-sm font-normal text-yx-fg outline-none placeholder:text-yx-fg-3 focus-visible:ring-2 focus-visible:ring-yx-blue"
              placeholder={'https://www.seusite.com.br\nUma origem por linha'}
              value={origins}
              onChange={event => setOrigins(event.target.value)}
            />
            <span className="text-xs font-normal text-yx-fg-3">Se informar, só estes sites conseguem enviar leads. Vazio libera qualquer site.</span>
          </label>
          <label className={labelClasses}>
            Código do consentimento
            <input className={inputClasses} value={consentCode} onChange={event => setConsentCode(event.target.value)} />
          </label>
          <label className={labelClasses}>
            Versão do consentimento
            <input className={inputClasses} value={consentVersion} onChange={event => setConsentVersion(event.target.value)} />
          </label>
          <label className={labelClasses}>
            Versão da política de privacidade
            <input className={inputClasses} value={privacyPolicyVersion} onChange={event => setPrivacyPolicyVersion(event.target.value)} />
          </label>
        </div>
      </details>

      <p className="text-xs text-yx-fg-3">Automações iniciadas pelo envio de formulário podem usar estes leads.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={submitting || !name.trim()} onClick={create} className={portalButtonClasses('primary')}>
          {submitting ? 'Criando...' : 'Criar formulário'}
        </button>
        <button type="button" disabled={submitting} onClick={onCancel} className={portalButtonClasses('ghost')}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

function FormHeader({ form, onToggle }: { form: LandingPageForm; onToggle: (formId: string, isActive: boolean) => Promise<unknown> }) {
  const [busy, setBusy] = useState(false)

  const toggle = async () => {
    if (busy) return
    setBusy(true)
    try {
      await onToggle(form.id, !form.isActive)
    } catch {
      // A página que fornece a ação avisa o cliente.
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-yx-line bg-yx-surface px-[18px] py-3.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-base font-semibold text-yx-fg">{form.name}</h2>
          <StatusChip variant={form.isActive ? 'ok' : 'neutral'}>{form.isActive ? 'Recebendo leads' : 'Captura pausada'}</StatusChip>
        </div>
        <p className="mt-0.5 text-xs text-yx-fg-3">
          {form.landingPageName ? `Vinculado a ${form.landingPageName}` : 'Formulário independente'}
          {' · '}
          {form.submissionCount === 1 ? '1 lead recebido' : `${form.submissionCount} leads recebidos`}
          {form.lastSubmissionAt ? ` · último em ${formatPortalDateTime(form.lastSubmissionAt)}` : ''}
        </p>
      </div>
      <button type="button" disabled={busy} onClick={toggle} className={portalButtonClasses('ghost')}>
        <Power aria-hidden="true" />
        {form.isActive ? 'Pausar captura' : 'Ativar captura'}
      </button>
    </div>
  )
}

function InstallTabs({
  form,
  onRotate,
  onUpdateOrigins,
  onUpdateFields,
}: {
  form: LandingPageForm
  onRotate: (formId: string) => Promise<unknown>
  onUpdateOrigins: (formId: string, allowedOrigins: string[]) => Promise<unknown>
  onUpdateFields: (formId: string, fields: FieldInput[]) => Promise<unknown>
}) {
  const [tab, setTab] = useState<InstallTab>('html')
  const baseId = useId()
  const [rotateOpen, setRotateOpen] = useState(false)
  const endpoint = form.publicEndpoint
  const snippet = buildHtmlSnippet(form, endpoint)

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + INSTALL_TABS.length) % INSTALL_TABS.length
    setTab(INSTALL_TABS[next].key)
    document.getElementById(`${baseId}-tab-${INSTALL_TABS[next].key}`)?.focus()
  }

  const codeNotice = !endpoint ? (
    <div role="note" className="rounded-lg border border-yx-warn-line bg-yx-warn-soft p-3 text-[13px] leading-snug text-yx-fg-2">
      <p className="mb-1.5">
        <PendingBadge code="B23" />
      </p>
      <p>
        O endereço completo de envio só aparece quando o formulário é criado ou quando você gera um novo. Para ter o código pronto para colar, gere um novo endereço.
        Os sites que usam o endereço anterior deixam de enviar leads.
      </p>
      <button type="button" onClick={() => setRotateOpen(true)} className={portalButtonClasses('ghost', 'mt-2')}>
        <RefreshCw aria-hidden="true" />
        Gerar novo endereço
      </button>
    </div>
  ) : null

  const code = (
    <>
      {codeNotice}
      <CodeBlock code={snippet} label="Código do formulário" copyLabel="Copiar código" disabled={!endpoint} />
    </>
  )

  return (
    <div>
      <div role="tablist" aria-label="Plataforma do seu site" className="flex gap-1 overflow-x-auto border-b border-yx-line">
        {INSTALL_TABS.map((item, index) => (
          <button
            key={item.key}
            id={`${baseId}-tab-${item.key}`}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            aria-controls={`${baseId}-panel-${item.key}`}
            tabIndex={tab === item.key ? 0 : -1}
            onClick={() => setTab(item.key)}
            onKeyDown={event => onKeyDown(event, index)}
            className={cn(
              '-mb-px min-h-10 shrink-0 whitespace-nowrap border-b-2 px-3.5 text-[13px] font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-yx-blue',
              tab === item.key ? 'border-yx-blue text-yx-blue' : 'border-transparent text-yx-fg-2 hover:text-yx-fg',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel-${tab}`}
        aria-labelledby={`${baseId}-tab-${tab}`}
        className="grid gap-3 pt-4"
      >
        {tab === 'html' ? (
          <>
            <p className="text-[13px] leading-snug text-yx-fg-2">
              Cole este código no ponto da página onde o formulário deve aparecer. Os campos são os configurados para este formulário
              {form.mappings.length > 0 ? ` (${resolveFieldSummary(form)})` : ''}.
            </p>
            {code}
            <p className="text-xs leading-snug text-yx-fg-3">
              O lead entra direto no seu CRM. Depois do envio, quem preencheu vê uma confirmação simples da YUX.
            </p>
          </>
        ) : null}

        {tab === 'wordpress' ? (
          <>
            <ol className="m-0 grid list-decimal gap-1.5 pl-5 text-[13px] leading-snug text-yx-fg-2">
              <li>No Elementor, arraste o widget <strong>HTML</strong> para o local do formulário. No editor de blocos do WordPress, use o bloco <strong>HTML personalizado</strong>.</li>
              <li>Cole o código abaixo (o mesmo da aba HTML).</li>
              <li>Atualize ou publique a página e abra-a para conferir o formulário.</li>
            </ol>
            {code}
          </>
        ) : null}

        {tab === 'webflow' ? (
          <>
            <ol className="m-0 grid list-decimal gap-1.5 pl-5 text-[13px] leading-snug text-yx-fg-2">
              <li>No Designer, abra a página e adicione o elemento <strong>Embed</strong> (código personalizado) onde o formulário deve ficar.</li>
              <li>Cole o código abaixo e clique em <strong>Save &amp; Close</strong>.</li>
              <li>Use este código no lugar do formulário nativo do Webflow e publique o site.</li>
            </ol>
            {code}
          </>
        ) : null}

        {tab === 'advanced' ? (
          <AdvancedPanel
            form={form}
            onOpenRotate={() => setRotateOpen(true)}
            onUpdateOrigins={onUpdateOrigins}
            onUpdateFields={onUpdateFields}
          />
        ) : null}
      </div>

      <ConfirmDialog
        open={rotateOpen}
        onOpenChange={setRotateOpen}
        tone="danger"
        title="Gerar novo endereço de envio?"
        description="O endereço atual deixa de funcionar. Atualize o código em todos os sites que usam este formulário, ou eles deixam de enviar leads."
        confirmLabel="Gerar novo endereço"
        onConfirm={async () => {
          await onRotate(form.id)
        }}
      />
    </div>
  )
}

function resolveFieldSummary(form: LandingPageForm) {
  return resolveSnippetFields(form.mappings).map(field => field.name).join(', ')
}

function CodeBlock({
  code,
  label,
  copyLabel,
  copiedMessage = 'Código copiado',
  disabled = false,
}: {
  code: string
  label: string
  copyLabel: string
  copiedMessage?: string
  disabled?: boolean
}) {
  const preRef = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    const ok = await copyWithFallback(code, preRef.current)
    if (ok) {
      setCopied(true)
      toast.success(copiedMessage)
      window.setTimeout(() => setCopied(false), 2000)
    } else {
      toast('Selecionamos o código. Pressione Ctrl+C para copiar.')
    }
  }

  return (
    <div className="min-w-0 rounded-lg border border-yx-line bg-yx-surface-2">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-yx-line px-3 py-2">
        <span className={eyebrowClasses}>{label}</span>
        <button
          type="button"
          onClick={copy}
          disabled={disabled}
          title={disabled ? 'Gere o endereço de envio para copiar o código pronto' : copyLabel}
          className={portalButtonClasses('ghost')}
        >
          {copied ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
          {copied ? 'Copiado' : copyLabel}
        </button>
      </div>
      <pre
        ref={preRef}
        tabIndex={0}
        aria-label={label}
        className="m-0 max-h-80 overflow-auto whitespace-pre p-3 font-mono text-xs leading-relaxed text-yx-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-yx-blue"
      >
        <code>{code}</code>
      </pre>
      {disabled ? (
        <p className="border-t border-yx-line px-3 py-2 text-xs text-yx-fg-3">
          O botão de copiar fica disponível quando o endereço de envio estiver completo.
        </p>
      ) : null}
    </div>
  )
}

function AdvancedPanel({
  form,
  onOpenRotate,
  onUpdateOrigins,
  onUpdateFields,
}: {
  form: LandingPageForm
  onOpenRotate: () => void
  onUpdateOrigins: (formId: string, allowedOrigins: string[]) => Promise<unknown>
  onUpdateFields: (formId: string, fields: FieldInput[]) => Promise<unknown>
}) {
  const endpoint = form.publicEndpoint
  const key = extractFormKey(endpoint)

  return (
    <div className="grid gap-4">
      <p className="text-[13px] leading-snug text-yx-fg-2">
        Para integrar com outra ferramenta (webhook), envie um <strong>POST</strong> com os campos do formulário em JSON ou como formulário comum
        para o endereço de envio abaixo. O aceite do consentimento (<code className="font-mono text-xs">consent_lgpd</code>) é obrigatório.
      </p>

      <div className="grid gap-3">
        <div>
          <p className={eyebrowClasses}>Endereço de envio</p>
          {endpoint ? (
            <ValueRow value={endpoint} copyLabel="Copiar endereço" copiedMessage="Endereço copiado" />
          ) : (
            <p className="mt-1 text-[13px] text-yx-fg-3">
              Disponível só quando o formulário é criado ou quando você gera um novo endereço.
            </p>
          )}
        </div>
        <div>
          <p className={eyebrowClasses}>Chave</p>
          {key ? (
            <ValueRow value={key} copyLabel="Copiar chave" copiedMessage="Chave copiada" />
          ) : (
            <p className="mt-1 text-[13px] text-yx-fg-3">
              {form.hasPublicToken
                ? 'A chave faz parte do endereço de envio e só é exibida ao criar ou renovar.'
                : 'Gere um endereço de envio para obter a chave.'}
            </p>
          )}
        </div>
        <div>
          <button type="button" onClick={onOpenRotate} className={portalButtonClasses('ghost')}>
            <RefreshCw aria-hidden="true" />
            Gerar novo endereço
          </button>
        </div>
      </div>

      <OriginsEditor form={form} onUpdateOrigins={onUpdateOrigins} />
      <FieldsEditor form={form} onUpdateFields={onUpdateFields} />

      <CodeBlock
        code={buildCurlExample(form, endpoint)}
        label="Exemplo de envio direto"
        copyLabel="Copiar exemplo"
        disabled={!endpoint}
      />
    </div>
  )
}

function ValueRow({ value, copyLabel, copiedMessage }: { value: string; copyLabel: string; copiedMessage: string }) {
  const codeRef = useRef<HTMLElement>(null)

  const copy = async () => {
    const ok = await copyWithFallback(value, codeRef.current)
    if (ok) toast.success(copiedMessage)
    else toast('Selecionamos o texto. Pressione Ctrl+C para copiar.')
  }

  return (
    <div className="mt-1 flex items-center gap-2">
      <code ref={codeRef} className="min-w-0 flex-1 break-all rounded-lg border border-yx-line bg-yx-surface-2 px-3 py-2 font-mono text-xs text-yx-fg">
        {value}
      </code>
      <button type="button" title={copyLabel} aria-label={copyLabel} onClick={copy} className={portalButtonClasses('ghost', 'shrink-0')}>
        <Clipboard aria-hidden="true" />
      </button>
    </div>
  )
}

function OriginsEditor({
  form,
  onUpdateOrigins,
}: {
  form: LandingPageForm
  onUpdateOrigins: (formId: string, allowedOrigins: string[]) => Promise<unknown>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const origins = draft.split(/[\n,]/).map(value => value.trim()).filter(Boolean)
      await onUpdateOrigins(form.id, origins)
      setEditing(false)
      toast.success('Origens atualizadas')
    } catch {
      toast.error('Não foi possível atualizar as origens')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-yx-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className={eyebrowClasses}>Origens permitidas</p>
          <p className="mt-1 break-words text-[13px] text-yx-fg-2">
            {form.allowedOrigins.length > 0 ? form.allowedOrigins.join(', ') : 'Qualquer site (não recomendado em produção)'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDraft(form.allowedOrigins.join('\n'))
            setEditing(true)
          }}
          className={portalButtonClasses('ghost')}
        >
          Configurar origens
        </button>
      </div>
      {editing ? (
        <div className="mt-3 grid gap-2">
          <textarea
            aria-label="Origens permitidas"
            className="min-h-20 w-full rounded-lg border border-yx-line-strong bg-yx-surface px-3 py-2 text-sm text-yx-fg outline-none placeholder:text-yx-fg-3 focus-visible:ring-2 focus-visible:ring-yx-blue"
            value={draft}
            placeholder={'https://www.seusite.com.br\nhttps://landing.seusite.com.br'}
            onChange={event => setDraft(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={saving} onClick={save} className={portalButtonClasses('primary')}>Salvar origens</button>
            <button type="button" onClick={() => setEditing(false)} className={portalButtonClasses('ghost')}>Cancelar</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

type DraftField = FieldInput & { draftId: string }

function FieldsEditor({
  form,
  onUpdateFields,
}: {
  form: LandingPageForm
  onUpdateFields: (formId: string, fields: FieldInput[]) => Promise<unknown>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<DraftField[]>([])
  const [saving, setSaving] = useState(false)

  const open = () => {
    setDraft(form.mappings.map(mapping => ({
      draftId: mapping.id,
      fieldName: mapping.fieldName,
      crmFieldKey: mapping.crmFieldKey,
      required: mapping.required,
    })))
    setEditing(true)
  }

  const save = async () => {
    const fields = draft
      .map(field => ({ fieldName: field.fieldName.trim(), crmFieldKey: field.crmFieldKey.trim(), required: field.required }))
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
    setSaving(true)
    try {
      await onUpdateFields(form.id, fields)
      setEditing(false)
      toast.success('Campos do formulário atualizados')
    } catch {
      toast.error('Não foi possível atualizar os campos')
    } finally {
      setSaving(false)
    }
  }

  const update = (index: number, patch: Partial<FieldInput>) =>
    setDraft(current => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)))

  return (
    <div className="rounded-lg border border-yx-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className={eyebrowClasses}>Campos configurados para este cliente</p>
          <p className="mt-1 text-xs text-yx-fg-3">Nome enviado pelo site → campo salvo no CRM. * = obrigatório.</p>
        </div>
        <button type="button" onClick={open} className={portalButtonClasses('ghost')}>
          <Settings2 aria-hidden="true" />
          Configurar campos
        </button>
      </div>
      {form.mappings.length > 0 ? (
        <ul className="m-0 mt-2 flex list-none flex-wrap gap-1.5 p-0">
          {form.mappings.map(mapping => (
            <li key={mapping.id}>
              <StatusChip>{mapping.fieldName} → {mapping.crmFieldKey}{mapping.required ? ' *' : ''}</StatusChip>
            </li>
          ))}
        </ul>
      ) : null}

      {editing ? (
        <div className="mt-3 grid gap-2 rounded-lg border border-yx-line bg-yx-surface-2 p-3">
          <div>
            <p className="text-xs font-semibold text-yx-fg">Mapeamento personalizado</p>
            <p className="text-xs text-yx-fg-3">Relacione o nome enviado pelo formulário ao campo salvo no CRM. Nome e e-mail são obrigatórios.</p>
          </div>
          {draft.map((field, index) => (
            <div key={field.draftId} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-center">
              <input
                aria-label={`Campo externo ${index + 1}`}
                className={inputClasses}
                value={field.fieldName}
                placeholder="Campo externo"
                onChange={event => update(index, { fieldName: event.target.value })}
              />
              <input
                aria-label={`Campo CRM ${index + 1}`}
                className={inputClasses}
                value={field.crmFieldKey}
                placeholder="Campo no CRM"
                onChange={event => update(index, { crmFieldKey: event.target.value })}
              />
              <label className="flex min-h-10 items-center gap-2 text-xs text-yx-fg-2">
                <input type="checkbox" checked={field.required} onChange={event => update(index, { required: event.target.checked })} />
                Obrigatório
              </label>
              <button
                type="button"
                title={`Remover campo ${field.fieldName || index + 1}`}
                aria-label={`Remover campo ${field.fieldName || index + 1}`}
                disabled={field.crmFieldKey === 'name' || field.crmFieldKey === 'email'}
                onClick={() => setDraft(current => current.filter((_, itemIndex) => itemIndex !== index))}
                className={portalButtonClasses('ghost', 'w-10 px-0')}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDraft(current => [...current, { draftId: `new-${Date.now()}-${current.length}`, fieldName: '', crmFieldKey: '', required: false }])}
              className={portalButtonClasses('ghost')}
            >
              <Plus aria-hidden="true" />
              Adicionar campo
            </button>
            <button type="button" disabled={saving} onClick={save} className={portalButtonClasses('primary')}>
              <Save aria-hidden="true" />
              Salvar campos
            </button>
            <button type="button" onClick={() => setEditing(false)} className={portalButtonClasses('ghost')}>Cancelar</button>
          </div>
        </div>
      ) : null}
      {internalMappings(form.mappings).length > 0 ? (
        <p className="mt-2 text-xs text-yx-fg-3">
          Campos de uso interno ({internalMappings(form.mappings).map(mapping => mapping.crmFieldKey).join(', ')}) ficam fora do código do site;
          envie-os pelo webhook se precisar.
        </p>
      ) : null}
    </div>
  )
}

function TestPanel({ form, onRefresh }: { form: LandingPageForm; onRefresh?: () => void | Promise<void> }) {
  const toWorkspace = usePortalWorkspacePath()
  const [refreshing, setRefreshing] = useState(false)

  const refresh = async () => {
    if (!onRefresh || refreshing) return
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="grid gap-4">
      <ol className="m-0 grid list-decimal gap-1.5 pl-5 text-[13px] leading-snug text-yx-fg-2">
        <li>Abra a página do seu site em que instalou o formulário.</li>
        <li>Preencha com dados de teste (por exemplo, o seu próprio e-mail) e marque o aceite.</li>
        <li>Envie e volte aqui. Clique em &quot;Atualizar&quot; para ver o lead em &quot;Leads recebidos recentemente&quot;.</li>
      </ol>
      <div>
        <PendingAction code="B22">Enviar teste</PendingAction>
      </div>
      <p className="text-xs leading-snug text-yx-fg-3">
        O teste é feito pelo formulário real do seu site e cria um lead de verdade no seu CRM. Não enviamos testes automáticos para não criar contatos falsos.
      </p>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-[15px] font-semibold text-yx-fg">Leads recebidos recentemente</h3>
          <div className="flex flex-wrap gap-2">
            {onRefresh ? (
              <button type="button" disabled={refreshing} aria-busy={refreshing} onClick={refresh} className={portalButtonClasses('ghost')}>
                <RefreshCw aria-hidden="true" className={cn(refreshing && 'animate-spin motion-reduce:animate-none')} />
                {refreshing ? 'Atualizando...' : 'Atualizar'}
              </button>
            ) : null}
            <Link to={toWorkspace('/portal/comercial/leads')} className={portalButtonClasses('ghost')}>
              Ver no CRM
            </Link>
          </div>
        </div>
        <div className="mt-3">
          <ResponsiveTable<LandingPageFormSubmission>
            caption="Leads recebidos recentemente"
            rows={form.recentSubmissions}
            getRowKey={row => row.id}
            empty={
              <p className="rounded-lg border border-dashed border-yx-line-strong px-4 py-6 text-center text-[13px] text-yx-fg-3">
                Nenhum lead recebido ainda. Depois do primeiro envio, ele aparece aqui.
              </p>
            }
            columns={[
              { key: 'name', header: 'Nome', render: row => <span className="font-medium">{row.name || 'Lead sem nome'}</span> },
              { key: 'contact', header: 'Contato', render: row => row.email || row.phone || 'Contato sem canal' },
              { key: 'origin', header: 'Origem', render: row => submissionOrigin(row) },
              { key: 'createdAt', header: 'Recebido em', render: row => formatPortalDateTime(row.createdAt) },
            ]}
          />
        </div>
      </div>
    </div>
  )
}

function submissionOrigin(submission: LandingPageFormSubmission): ReactNode {
  const parts = [submission.source, submission.utmCampaign ? `campanha ${submission.utmCampaign}` : undefined].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : '—'
}
