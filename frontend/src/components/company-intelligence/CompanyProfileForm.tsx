import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { CompanyProfile, CompanyProfileInput } from '@/types/companyIntelligence'
import { TagListField } from './TagListField'

interface CompanyProfileFormProps {
  profile: CompanyProfile
  saving?: boolean
  onSave: (input: CompanyProfileInput) => Promise<void>
}

export function CompanyProfileForm({ profile, saving = false, onSave }: CompanyProfileFormProps) {
  const [draft, setDraft] = useState<CompanyProfileInput>(() => editable(profile))
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setDraft(editable(profile))
    setDirty(false)
  }, [profile])

  const update = <K extends keyof CompanyProfileInput>(key: K, value: CompanyProfileInput[K]) => {
    setDraft(current => ({ ...current, [key]: value }))
    setDirty(true)
  }

  return (
    <form
      className="space-y-6 rounded-lg border bg-white p-5"
      onSubmit={async event => {
        event.preventDefault()
        await onSave(draft)
        setDirty(false)
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-950">Informações da empresa</h2>
          <p className="mt-1 text-sm text-gray-600">Esses dados contextualizam relatórios, campanhas, atendimento e agentes.</p>
        </div>
        <Button type="submit" disabled={saving || !dirty}>
          <Save className="mr-2 h-4 w-4" />{saving ? 'Salvando...' : 'Salvar alterações'}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Razão social" id="legal-name" value={draft.legalName} onChange={value => update('legalName', value)} />
        <Field label="Nome da marca" id="trade-name" value={draft.tradeName} onChange={value => update('tradeName', value)} />
        <Field label="Segmento" id="industry" value={draft.industry} onChange={value => update('industry', value)} />
        <Field label="Site" id="website" type="url" value={draft.websiteUrl || ''} onChange={value => update('websiteUrl', value || undefined)} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="company-description">Descrição institucional</Label>
        <Textarea id="company-description" rows={4} value={draft.description} onChange={event => update('description', event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="positioning">Posicionamento</Label>
        <Textarea id="positioning" rows={3} value={draft.positioning} onChange={event => update('positioning', event.target.value)} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <TagListField id="differentiators" label="Diferenciais" value={draft.differentiators} onChange={value => update('differentiators', value)} />
        <TagListField id="service-regions" label="Regiões atendidas" value={draft.serviceRegions} onChange={value => update('serviceRegions', value)} />
        <TagListField id="company-emails" label="E-mails públicos" value={draft.emails} onChange={value => update('emails', value)} />
        <TagListField id="company-phones" label="Telefones" value={draft.phones} onChange={value => update('phones', value)} />
        <Field label="Instagram" id="instagram" value={String(draft.socialLinks.instagram || '')} onChange={value => update('socialLinks', { ...draft.socialLinks, instagram: value })} />
        <Field label="LinkedIn" id="linkedin" value={String(draft.socialLinks.linkedin || '')} onChange={value => update('socialLinks', { ...draft.socialLinks, linkedin: value })} />
        <Field label="Cidade" id="city" value={String(draft.address.city || '')} onChange={value => update('address', { ...draft.address, city: value })} />
        <Field label="Estado" id="state" value={String(draft.address.state || '')} onChange={value => update('address', { ...draft.address, state: value })} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="internal-notes">Observações internas</Label>
        <Textarea id="internal-notes" rows={3} value={draft.internalNotes || ''} onChange={event => update('internalNotes', event.target.value)} />
        <p className="text-xs text-gray-500">Visível apenas para administradores e configuradores autorizados.</p>
      </div>
    </form>
  )
}

function Field({ label, id, value, onChange, type = 'text' }: { label: string; id: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} type={type} value={value} onChange={event => onChange(event.target.value)} /></div>
}

function editable(profile: CompanyProfile): CompanyProfileInput {
  return {
    legalName: profile.legalName,
    tradeName: profile.tradeName,
    description: profile.description,
    websiteUrl: profile.websiteUrl,
    industry: profile.industry,
    positioning: profile.positioning,
    differentiators: profile.differentiators,
    emails: profile.emails,
    phones: profile.phones,
    address: profile.address,
    businessHours: profile.businessHours,
    serviceRegions: profile.serviceRegions,
    socialLinks: profile.socialLinks,
    internalNotes: profile.internalNotes,
  }
}
