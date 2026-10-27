import {businessModelLabels,type BusinessModel} from '@/types/companyIntelligence'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ImageOff } from 'lucide-react'
import { SectionCard, StatusChip, StickySaveBar, sectionLinkClasses, useUnsavedChangesWarning } from '@/components/portal-ui'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import { describeValue, keyLabel } from '@/lib/company-intelligence/describeValue'
import {
  BUSINESS_DAYS,
  asRecord,
  computeProfileCompleteness,
} from '@/lib/company-intelligence/profileCompleteness'
import { cn } from '@/lib/utils'
import type { CompanyProfile, CompanyProfileInput } from '@/types/companyIntelligence'
import { Field, TextAreaField, focusField } from './formParts'
import { TagListField } from './TagListField'

interface CompanyProfileFormProps {
  profile: CompanyProfile
  readOnly?:boolean
  saving?: boolean
  onSave: (input: CompanyProfileInput) => Promise<void>
  /** Logo cadastrado em "Marca e tom de voz", para pré-visualização. */
  logoUrl?: string
  /** Conteúdo exibido entre o medidor de preenchimento e as seções (ex.: "Preencher com o site"). */
  beforeSections?: ReactNode
}

const DEFAULT_OPEN = '09:00'
const DEFAULT_CLOSE = '18:00'

export function CompanyProfileForm({ profile, readOnly=false, saving = false, onSave, logoUrl, beforeSections }: CompanyProfileFormProps) {
  const initialDraft = editable(profile)
  const [draft, setDraft] = useState<CompanyProfileInput>(initialDraft)
  const [baseline, setBaseline] = useState(() => JSON.stringify(initialDraft))
  const persistedProfileFingerprint = useRef(JSON.stringify(initialDraft))
  const dirty = JSON.stringify(draft) !== baseline

  useUnsavedChangesWarning(dirty)

  useEffect(() => {
    const nextDraft = editable(profile)
    const nextFingerprint = JSON.stringify(nextDraft)
    if (persistedProfileFingerprint.current === nextFingerprint) return
    persistedProfileFingerprint.current = nextFingerprint
    setDraft(nextDraft)
    setBaseline(nextFingerprint)
  }, [profile])

  const update = <K extends keyof CompanyProfileInput>(key: K, value: CompanyProfileInput[K]) => {
    setDraft(current => ({ ...current, [key]: value }))
  }
  const address = asRecord(draft.address)
  const social = asRecord(draft.socialLinks)
  const updateAddress = (key: string, value: string) => update('address', { ...address, [key]: value })
  const updateSocial = (key: string, value: string) => update('socialLinks', { ...social, [key]: value })

  const completeness = computeProfileCompleteness(draft)

  const save = async () => {
    try {
      await onSave(draft)
      setBaseline(JSON.stringify(draft))
    } catch {
      // A página já avisou o erro; as alterações continuam na tela para tentar de novo.
    }
  }

  return (
    <div className="space-y-5">
      <CompletenessMeter percent={completeness.percent} missing={completeness.missing} />

      {beforeSections}

      <form
        className="space-y-5"
        noValidate
        onSubmit={event => {
          event.preventDefault()
          if (dirty && !saving && !readOnly) void save()
        }}
      >
        <fieldset disabled={readOnly} className="space-y-5">
        <SectionCard id="profile-identity" title="Identificação" description="Como a empresa se chama e em que atua.">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nome da marca" id="trade-name" value={draft.tradeName} onChange={value => update('tradeName', value)} />
            <Field label="Razão social" id="legal-name" value={draft.legalName} onChange={value => update('legalName', value)} />
            <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Como a empresa atua</legend>{Object.entries(businessModelLabels).map(([key,label])=><label key={key} className="mr-4 inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={(draft.businessModels??[]).includes(key as BusinessModel)} onChange={e=>update('businessModels',e.target.checked?[...(draft.businessModels??[]),key as BusinessModel]:(draft.businessModels??[]).filter(item=>item!==key))}/>{label}</label>)}</fieldset>
            <Field label="Segmento" id="industry" value={draft.industry} onChange={value => update('industry', value)} placeholder="Ex.: consultoria financeira" />
            <LogoPreview logoUrl={logoUrl} />
          </div>
        </SectionCard>

        <SectionCard id="profile-contact" title="Contato" description="Dados públicos que a YUX e os agentes podem informar aos seus clientes.">
          <div className="grid gap-4 md:grid-cols-2">
            <TagListField id="company-emails" label="E-mails públicos" value={draft.emails} onChange={value => update('emails', value)} hint="Separe por vírgulas." />
            <TagListField id="company-phones" label="Telefones" value={draft.phones} onChange={value => update('phones', value)} hint="Inclua o DDD. Separe por vírgulas." />
          </div>
        </SectionCard>

        <SectionCard id="profile-online" title="Presença online" description="Onde seus clientes encontram a empresa na internet.">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Site" id="website" type="url" inputMode="url" placeholder="https://suaempresa.com.br" value={draft.websiteUrl || ''} onChange={value => update('websiteUrl', value || undefined)} />
            <Field label="Instagram" id="instagram" placeholder="@suaempresa ou link do perfil" value={String(social.instagram || '')} onChange={value => updateSocial('instagram', value)} />
            <Field label="LinkedIn" id="linkedin" placeholder="Link da página da empresa" value={String(social.linkedin || '')} onChange={value => updateSocial('linkedin', value)} />
            <Field label="Facebook" id="facebook" placeholder="Link da página" value={String(social.facebook || '')} onChange={value => updateSocial('facebook', value)} />
          </div>
        </SectionCard>

        <SectionCard id="profile-positioning" title="Posicionamento" description="O que a empresa faz e por que escolher a sua.">
          <div className="space-y-4">
            <TextAreaField label="Descrição institucional" id="company-description" rows={4} value={draft.description} onChange={value => update('description', value)} />
            <TextAreaField label="Posicionamento" id="positioning" rows={3} value={draft.positioning} onChange={value => update('positioning', value)} hint="Em uma ou duas frases: para quem a empresa trabalha e o que a destaca." />
            <TagListField id="differentiators" label="Diferenciais" value={draft.differentiators} onChange={value => update('differentiators', value)} hint="Separe por vírgulas." />
          </div>
        </SectionCard>

        <SectionCard id="profile-service" title="Atendimento" description="Onde e quando a empresa atende.">
          <div className="space-y-6">
            <TagListField id="service-regions" label="Regiões atendidas" value={draft.serviceRegions} onChange={value => update('serviceRegions', value)} hint="Cidades, estados ou “todo o Brasil”. Separe por vírgulas." />

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-yx-fg">Endereço</legend>
              <div className="grid gap-4 md:grid-cols-6">
                <Field className="md:col-span-4" label="Rua" id="address-street" autoComplete="address-line1" value={String(address.street || '')} onChange={value => updateAddress('street', value)} />
                <Field className="md:col-span-2" label="Número" id="address-number" value={String(address.number || '')} onChange={value => updateAddress('number', value)} />
                <Field className="md:col-span-3" label="Bairro" id="address-district" value={String(address.district || '')} onChange={value => updateAddress('district', value)} />
                <Field className="md:col-span-3" label="Cidade" id="address-city" autoComplete="address-level2" value={String(address.city || '')} onChange={value => updateAddress('city', value)} />
                <Field className="md:col-span-3" label="Estado (UF)" id="address-state" autoComplete="address-level1" value={String(address.state || '')} onChange={value => updateAddress('state', value)} />
                <Field className="md:col-span-3" label="CEP" id="address-zip" inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" value={formatZip(String(address.zip || ''))} onChange={value => updateAddress('zip', formatZip(value))} />
              </div>
            </fieldset>

            <BusinessHoursEditor value={asRecord(draft.businessHours)} onChange={value => update('businessHours', value)} />
          </div>
        </SectionCard>

        <SectionCard id="profile-notes" title="Recados para a YUX" description="Informações que ajudam a equipe a atender melhor a sua empresa.">
          <TextAreaField
            label="Observações para a equipe YUX"
            id="internal-notes"
            rows={3}
            value={draft.internalNotes || ''}
            onChange={value => update('internalNotes', value)}
            placeholder="Ex.: clientes que não devem ser contatados, datas importantes, preferências de atendimento."
            hint="Quem vê: a equipe da YUX e os administradores da sua empresa. Os seus clientes não veem."
          />
        </SectionCard>
        </fieldset>
      </form>

      <StickySaveBar
        dirty={dirty&&!readOnly}
        saving={saving}
        onSave={() => void save()}
        onDiscard={() => setDraft(editable(profile))}
      />
    </div>
  )
}

function CompletenessMeter({ percent, missing }: { percent: number; missing: Array<{ key: string; label: string; fieldId: string }> }) {
  return (
    <section aria-label="Preenchimento do perfil" className="rounded-[10px] border border-yx-line bg-yx-surface p-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold text-yx-fg">Perfil {percent}% completo</h2>
        {percent === 100 ? <StatusChip variant="ok">Tudo preenchido</StatusChip> : null}
      </div>
      <div
        role="progressbar"
        aria-label="Preenchimento do perfil"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent}%`}
        className="mt-3 h-2 overflow-hidden rounded-[3px] bg-yx-bar-track"
      >
        <div className="h-full rounded-[3px] bg-brand-gradient" style={{ width: `${percent}%` }} />
      </div>
      {missing.length > 0 ? (
        <div className="mt-3">
          <p className="text-[13px] text-yx-fg-3">Quanto mais completo, melhor a YUX e os agentes representam a sua empresa. Falta preencher:</p>
          <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0">
            {missing.map(item => (
              <li key={item.key}>
                <button type="button" onClick={() => focusField(item.fieldId)} className={cn(sectionLinkClasses, 'min-h-10 sm:min-h-8')}>
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-yx-fg-3">Mantenha os dados atualizados para que o atendimento e as campanhas usem sempre a informação certa.</p>
      )}
    </section>
  )
}

function LogoPreview({ logoUrl }: { logoUrl?: string }) {
  const toWorkspace = usePortalWorkspacePath()
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const showImage = Boolean(logoUrl) && failedUrl !== logoUrl
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-yx-fg">Logo da empresa</p>
      <div className="flex items-center gap-3">
        <div className="grid h-16 w-24 shrink-0 place-items-center overflow-hidden rounded-lg border border-yx-line bg-yx-surface-2">
          {showImage ? (
            <img src={logoUrl} alt="Logo da empresa" className="max-h-full max-w-full object-contain" onError={() => setFailedUrl(logoUrl ?? null)} />
          ) : (
            <ImageOff aria-hidden="true" className="h-5 w-5 text-yx-fg-3" />
          )}
        </div>
        <p className="text-xs text-yx-fg-3">
          {showImage ? 'Este é o logo cadastrado na marca. ' : 'Nenhum logo disponível. '}
          <Link to={toWorkspace('/portal/empresa/marca')} className="font-semibold text-yx-blue hover:text-yx-blue-ink">
            {showImage ? 'Alterar em Marca e tom de voz' : 'Adicionar em Marca e tom de voz'}
          </Link>
        </p>
      </div>
    </div>
  )
}

function BusinessHoursEditor({ value, onChange }: { value: Record<string, unknown>; onChange: (value: Record<string, unknown>) => void }) {
  const dayKeys = new Set<string>(BUSINESS_DAYS.map(day => day.key))
  const others = Object.entries(value).filter(([key]) => !dayKeys.has(key) && describeValue(value[key]))

  const setDay = (key: string, next: Record<string, unknown>) => onChange({ ...value, [key]: next })
  const copyMondayToWeekdays = () => {
    const monday = asRecord(value.monday)
    const next = { ...value }
    for (const key of ['tuesday', 'wednesday', 'thursday', 'friday']) next[key] = { ...monday }
    onChange(next)
  }
  const mondayEnabled = isOpenDay(value.monday)

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-yx-fg">Horário de atendimento</legend>
      <ul className="m-0 grid list-none gap-1 p-0">
        {BUSINESS_DAYS.map(({ key, label }) => {
          const day = asRecord(value[key])
          const enabled = isOpenDay(day)
          return (
            <li key={key} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-yx-line px-3 py-1.5">
              <label htmlFor={`hours-${key}-enabled`} className="flex min-h-10 min-w-[10.5rem] cursor-pointer items-center gap-2 text-sm text-yx-fg">
                <input
                  id={`hours-${key}-enabled`}
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--yx-blue)]"
                  checked={enabled}
                  onChange={event => setDay(key, event.target.checked ? { open: DEFAULT_OPEN, close: DEFAULT_CLOSE } : { closed: true })}
                />
                {label}
              </label>
              {enabled ? (
                <div className="flex flex-wrap items-center gap-2 text-sm text-yx-fg-2">
                  <input
                    id={`hours-${key}-open`}
                    type="time"
                    aria-label={`${label}: abre às`}
                    value={String(day.open || '')}
                    onChange={event => setDay(key, { ...day, closed: undefined, open: event.target.value })}
                    className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                  />
                  <span aria-hidden="true">às</span>
                  <input
                    id={`hours-${key}-close`}
                    type="time"
                    aria-label={`${label}: fecha às`}
                    value={String(day.close || '')}
                    onChange={event => setDay(key, { ...day, closed: undefined, close: event.target.value })}
                    className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                  />
                </div>
              ) : (
                <span className="text-[13px] text-yx-fg-3">{day.closed === true ? 'Fechado' : 'Não informado'}</span>
              )}
            </li>
          )
        })}
      </ul>
      {mondayEnabled ? (
        <button type="button" onClick={copyMondayToWeekdays} className={cn(sectionLinkClasses, 'min-h-10 sm:min-h-8')}>
          Copiar o horário de segunda para terça a sexta
        </button>
      ) : null}
      {others.length > 0 ? (
        <div className="rounded-lg border border-yx-line bg-yx-surface-2 p-3 text-[13px] text-yx-fg-2">
          <p className="font-medium text-yx-fg">Outras informações de horário</p>
          <ul className="m-0 mt-1 list-none p-0">
            {others.map(([key, entry]) => (
              <li key={key}>{keyLabel(key)}: {describeValue(entry)}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-yx-fg-3">Estas informações foram encontradas automaticamente e são mantidas ao salvar.</p>
        </div>
      ) : null}
    </fieldset>
  )
}

function isOpenDay(day: unknown) {
  const record = asRecord(day)
  return record.closed !== true && (typeof record.open === 'string' || typeof record.close === 'string')
}

function formatZip(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits
}

function editable(profile: CompanyProfile): CompanyProfileInput {
  return {
    businessModels:profile.businessModels??[],
    legalName: profile.legalName,
    tradeName: profile.tradeName,
    description: profile.description,
    websiteUrl: profile.websiteUrl,
    industry: profile.industry,
    positioning: profile.positioning,
    differentiators: profile.differentiators,
    emails: profile.emails,
    phones: profile.phones,
    address: asRecord(profile.address),
    businessHours: asRecord(profile.businessHours),
    serviceRegions: profile.serviceRegions,
    socialLinks: asRecord(profile.socialLinks),
    internalNotes: profile.internalNotes,
  }
}
