import { useEffect, useState } from 'react'
import { Save, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { CompanyBrandProfileInput } from '@/types/companyIntelligence'
import { TagListField } from './TagListField'

interface BrandVoiceFormProps {
  profile: CompanyBrandProfileInput
  saving?: boolean
  onSave: (input: CompanyBrandProfileInput) => Promise<void>
}

export function BrandVoiceForm({ profile, saving = false, onSave }: BrandVoiceFormProps) {
  const [draft, setDraft] = useState(profile)
  const [dirty, setDirty] = useState(false)
  useEffect(() => { setDraft(profile); setDirty(false) }, [profile])
  const update = <K extends keyof CompanyBrandProfileInput>(key: K, value: CompanyBrandProfileInput[K]) => {
    setDraft(current => ({ ...current, [key]: value })); setDirty(true)
  }
  const updateVisual = <K extends keyof CompanyBrandProfileInput['visualIdentity']>(key: K, value: CompanyBrandProfileInput['visualIdentity'][K]) => {
    update('visualIdentity', { ...draft.visualIdentity, [key]: value })
  }

  return (
    <form className="space-y-6 rounded-lg border bg-white p-5" onSubmit={async event => { event.preventDefault(); await onSave({ ...draft, status: 'active' }); setDirty(false) }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-base font-semibold text-gray-950">Comportamento da marca e dos agentes</h2><p className="mt-1 text-sm text-gray-600">O perfil ativo passa a orientar textos, campanhas e conversas.</p></div>
        <Button type="submit" disabled={saving || !dirty}><Save className="mr-2 h-4 w-4" />{saving ? 'Salvando...' : 'Salvar e ativar'}</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="tone-of-voice">Tom de voz</Label><Input id="tone-of-voice" value={draft.toneOfVoice} onChange={event => update('toneOfVoice', event.target.value)} placeholder="Consultivo, direto e acolhedor" /></div>
        <div className="space-y-2"><Label htmlFor="persona">Público/persona</Label><Input id="persona" value={draft.persona} onChange={event => update('persona', event.target.value)} placeholder="Gestores de pequenas e médias empresas" /></div>
      </div>
      <div className="space-y-2"><Label htmlFor="brand-summary">Resumo da voz</Label><Textarea id="brand-summary" rows={4} value={draft.brandVoiceSummary} onChange={event => update('brandVoiceSummary', event.target.value)} /></div>
      <div className="grid gap-4 md:grid-cols-2">
        <TagListField id="vocabulary-do" label="Palavras e expressões recomendadas" value={draft.vocabularyDo} onChange={value => update('vocabularyDo', value)} />
        <TagListField id="priority-topics" label="Temas prioritários" value={draft.priorityTopics} onChange={value => update('priorityTopics', value)} />
      </div>

      <section className="space-y-4 rounded-lg border border-rose-200 bg-rose-50/60 p-4">
        <div className="flex gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 text-rose-700" /><div><h3 className="font-semibold text-rose-950">Bloqueios obrigatórios</h3><p className="text-sm text-rose-800">Estas regras têm precedência sobre campanhas, automações e solicitações do contato.</p></div></div>
        <div className="grid gap-4 md:grid-cols-2">
          <TagListField id="vocabulary-dont" label="Palavras e promessas que não podem ser usadas" value={draft.vocabularyDont} onChange={value => update('vocabularyDont', value)} danger />
          <TagListField id="forbidden-topics" label="Assuntos que não devem ser abordados" value={draft.forbiddenTopics} onChange={value => update('forbiddenTopics', value)} danger />
        </div>
        <div className="space-y-2"><Label htmlFor="compliance-notes" className="text-rose-800">Restrições legais e recomendações</Label><Textarea id="compliance-notes" rows={4} className="border-rose-200" value={draft.complianceNotes || ''} onChange={event => update('complianceNotes', event.target.value)} placeholder="Ex.: não garantir resultado, não oferecer desconto sem aprovação..." /></div>
      </section>

      <section className="space-y-4 rounded-lg border border-violet-200 bg-violet-50/40 p-4">
        <div><h3 className="font-semibold text-gray-950">Identidade visual estruturada</h3><p className="text-sm text-gray-600">Logo, cores e padrões usados por criativos, landing pages e agentes.</p></div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="logo-url">URL do logo</Label><Input id="logo-url" type="url" value={draft.visualIdentity.logoUrl || ''} onChange={event => updateVisual('logoUrl', event.target.value)} placeholder="https://site.com/logo.svg" /></div>
          <TagListField id="brand-colors" label="Cores da marca" value={draft.visualIdentity.colors} onChange={value => updateVisual('colors', value)} />
          <TagListField id="brand-typography" label="Tipografias" value={draft.visualIdentity.typography} onChange={value => updateVisual('typography', value)} />
          <TagListField id="brand-graphic-elements" label="Elementos gráficos" value={draft.visualIdentity.graphicElements} onChange={value => updateVisual('graphicElements', value)} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="design-style">Estilo de design</Label><Textarea id="design-style" rows={3} value={draft.visualIdentity.designStyle} onChange={event => updateVisual('designStyle', event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="imagery-style">Estilo de imagens</Label><Textarea id="imagery-style" rows={3} value={draft.visualIdentity.imageryStyle} onChange={event => updateVisual('imageryStyle', event.target.value)} /></div>
        </div>
        <div className="space-y-2"><Label htmlFor="visual-guidelines">Direção visual complementar</Label><Textarea id="visual-guidelines" rows={3} value={draft.visualGuidelines || ''} onChange={event => update('visualGuidelines', event.target.value)} /></div>
      </section>
    </form>
  )
}
