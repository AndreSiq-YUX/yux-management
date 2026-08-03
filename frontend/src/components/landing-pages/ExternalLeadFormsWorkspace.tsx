import { useState } from 'react'
import { FileInput, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LeadFormManagementCard } from './PortalLandingPagesWorkspace'
import type { LandingPageForm } from '@/types/landingPage'

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

interface ExternalLeadFormsWorkspaceProps {
  contractName: string
  forms: LandingPageForm[]
  pipelines?: FormPipelineOption[]
  onCreate: (input: CreateExternalFormInput) => Promise<unknown>
  onRotate: (formId: string) => Promise<unknown>
  onToggle: (formId: string, isActive: boolean) => Promise<unknown>
  onUpdateOrigins: (formId: string, allowedOrigins: string[]) => Promise<unknown>
  onUpdateFields: (
    formId: string,
    fields: Array<{ fieldName: string; crmFieldKey: string; required: boolean }>,
  ) => Promise<unknown>
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
}: ExternalLeadFormsWorkspaceProps) {
  const [showCreate, setShowCreate] = useState(false)
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
      setShowCreate(false)
      setName('Formulário do site')
      setOrigins('')
      setPipelineId('')
      setInitialStageId('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Formulários externos</h1>
          <p className="mt-1 text-sm text-slate-600">
            Crie endpoints para receber leads de sites, landing pages e ferramentas externas no CRM de {contractName}.
          </p>
        </div>
        <Button type="button" onClick={() => setShowCreate(current => !current)}>
          {showCreate ? <X className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
          {showCreate ? 'Cancelar' : 'Novo formulário'}
        </Button>
      </div>

      {showCreate && (
        <section className="space-y-4 rounded-md border bg-white p-4">
          <div>
            <h2 className="font-semibold text-slate-950">Novo formulário externo</h2>
            <p className="text-xs text-slate-500">O endpoint e os campos padrão serão gerados assim que você salvar.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-xs font-medium text-slate-700">
              Nome
              <input aria-label="Nome do formulário" className="w-full rounded border px-3 py-2 text-sm font-normal" value={name} onChange={event => setName(event.target.value)} />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              Origens permitidas
              <textarea
                aria-label="Origens iniciais"
                className="min-h-20 w-full rounded border px-3 py-2 text-sm font-normal"
                placeholder={'https://www.seusite.com.br\nUma origem por linha'}
                value={origins}
                onChange={event => setOrigins(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              Código do consentimento
              <input className="w-full rounded border px-3 py-2 text-sm font-normal" value={consentCode} onChange={event => setConsentCode(event.target.value)} />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              Versão do consentimento
              <input className="w-full rounded border px-3 py-2 text-sm font-normal" value={consentVersion} onChange={event => setConsentVersion(event.target.value)} />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              Versão da política de privacidade
              <input className="w-full rounded border px-3 py-2 text-sm font-normal" value={privacyPolicyVersion} onChange={event => setPrivacyPolicyVersion(event.target.value)} />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              Funil inicial
              <select
                aria-label="Funil inicial"
                className="w-full rounded border px-3 py-2 text-sm font-normal"
                value={pipelineId}
                onChange={event => { setPipelineId(event.target.value); setInitialStageId('') }}
              >
                <option value="">Usar configuração padrão</option>
                {pipelines.map(pipeline => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-700">
              Etapa inicial
              <select
                aria-label="Etapa inicial"
                className="w-full rounded border px-3 py-2 text-sm font-normal"
                value={initialStageId}
                disabled={!pipelineId}
                onChange={event => setInitialStageId(event.target.value)}
              >
                <option value="">Primeira etapa ativa</option>
                {availableStages.map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
              </select>
            </label>
          </div>
          <p className="text-xs text-slate-500">
            Automações disparadas por <code>form.submitted</code> podem substituir esta rota e iniciar várias sequências ao mesmo tempo.
          </p>
          <Button type="button" disabled={submitting || !name.trim()} onClick={create}>
            {submitting ? 'Criando...' : 'Criar formulário e gerar endpoint'}
          </Button>
        </section>
      )}

      {forms.length === 0 && !showCreate ? (
        <div className="rounded-md border border-dashed bg-slate-50 px-6 py-12 text-center">
          <FileInput className="mx-auto h-9 w-9 text-slate-400" />
          <h2 className="mt-3 font-semibold text-slate-900">Nenhum formulário externo criado</h2>
          <p className="mt-1 text-sm text-slate-600">Crie o primeiro formulário para receber leads sem depender de uma Landing Page cadastrada na YUX.</p>
          <Button type="button" className="mt-4" onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Criar primeiro formulário
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {forms.map(form => (
            <article key={form.id} className="space-y-3 rounded-md border bg-white p-4">
              <div>
                <h2 className="font-semibold text-slate-950">{form.name}</h2>
                <p className="text-xs text-slate-500">
                  {form.landingPageName ? `Vinculado a ${form.landingPageName}` : 'Formulário independente'}
                </p>
              </div>
              <LeadFormManagementCard
                form={form}
                onCreate={async () => undefined}
                onRotate={onRotate}
                onToggle={onToggle}
                onUpdateOrigins={onUpdateOrigins}
                onUpdateFields={onUpdateFields}
              />
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
