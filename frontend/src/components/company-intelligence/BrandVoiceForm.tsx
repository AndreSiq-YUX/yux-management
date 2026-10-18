import { useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { SectionCard, StickySaveBar, portalButtonClasses, useUnsavedChangesWarning } from '@/components/portal-ui'
import { Input } from '@/components/ui/input'
import { isValidHex, normalizeHex, toColorInputValue } from '@/lib/company-intelligence/brandPreview'
import { cn } from '@/lib/utils'
import type { CompanyBrandProfileInput } from '@/types/companyIntelligence'
import { BrandCard } from './BrandCard'
import { Field, TextAreaField } from './formParts'
import { TagListField } from './TagListField'

interface BrandVoiceFormProps {
  profile: CompanyBrandProfileInput
  saving?: boolean
  onSave: (input: CompanyBrandProfileInput) => Promise<void>
  /** Nome da empresa, usado na mensagem de exemplo do cartão da marca. */
  brandName?: string
}

export function BrandVoiceForm({ profile, saving = false, onSave, brandName }: BrandVoiceFormProps) {
  const [draft, setDraft] = useState(profile)
  const [baseline, setBaseline] = useState(() => JSON.stringify(profile))
  const profileFingerprint = useRef(JSON.stringify(profile))
  const dirty = JSON.stringify(draft) !== baseline
  const invalidColors = draft.visualIdentity.colors.some(color => color.trim() !== '' && !isValidHex(color))

  useUnsavedChangesWarning(dirty)

  useEffect(() => {
    const fingerprint = JSON.stringify(profile)
    if (profileFingerprint.current === fingerprint) return
    profileFingerprint.current = fingerprint
    setDraft(profile)
    setBaseline(fingerprint)
  }, [profile])

  const update = <K extends keyof CompanyBrandProfileInput>(key: K, value: CompanyBrandProfileInput[K]) => {
    setDraft(current => ({ ...current, [key]: value }))
  }
  const updateVisual = <K extends keyof CompanyBrandProfileInput['visualIdentity']>(key: K, value: CompanyBrandProfileInput['visualIdentity'][K]) => {
    setDraft(current => ({ ...current, visualIdentity: { ...current.visualIdentity, [key]: value } }))
  }

  const save = async () => {
    if (invalidColors) return
    const toSave: CompanyBrandProfileInput = {
      ...draft,
      visualIdentity: {
        ...draft.visualIdentity,
        colors: draft.visualIdentity.colors.map(color => normalizeHex(color)).filter((color): color is string => color !== null),
      },
      status: 'active',
    }
    try {
      await onSave(toSave)
      setDraft(current => ({ ...current, visualIdentity: { ...current.visualIdentity, colors: toSave.visualIdentity.colors } }))
      setBaseline(JSON.stringify({ ...draft, visualIdentity: { ...draft.visualIdentity, colors: toSave.visualIdentity.colors } }))
    } catch {
      // A página já avisou o erro; as alterações continuam na tela para tentar de novo.
    }
  }

  return (
    <div className="space-y-5">
      <BrandCard
        brandName={brandName}
        toneOfVoice={draft.toneOfVoice}
        persona={draft.persona}
        brandVoiceSummary={draft.brandVoiceSummary}
        vocabularyDo={draft.vocabularyDo}
        visualIdentity={draft.visualIdentity}
      />

      <form
        className="space-y-5"
        noValidate
        onSubmit={event => {
          event.preventDefault()
          if (!saving) void save()
        }}
      >
        <SectionCard id="brand-voice" title="Tom de voz" description="Ao salvar, esta marca passa a orientar textos, campanhas e conversas.">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Tom de voz" id="tone-of-voice" value={draft.toneOfVoice} onChange={value => update('toneOfVoice', value)} placeholder="Consultivo, direto e acolhedor" />
              <Field label="Público/persona" id="persona" value={draft.persona} onChange={value => update('persona', value)} placeholder="Gestores de pequenas e médias empresas" hint="Com quem a marca conversa." />
            </div>
            <TextAreaField label="Resumo da voz" id="brand-summary" rows={4} value={draft.brandVoiceSummary} onChange={value => update('brandVoiceSummary', value)} hint="Em poucas frases: como a marca fala e o que transmite." />
          </div>
        </SectionCard>

        <SectionCard id="brand-do-dont" title="O que usar e o que evitar" description="Estas regras valem para campanhas, automações e respostas, e vêm antes de qualquer pedido de contato.">
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <TagListField id="vocabulary-do" label="Palavras e expressões recomendadas" value={draft.vocabularyDo} onChange={value => update('vocabularyDo', value)} />
              <TagListField id="priority-topics" label="Temas prioritários" value={draft.priorityTopics} onChange={value => update('priorityTopics', value)} />
            </div>
            <div className="grid gap-4 rounded-lg border border-yx-crit-line bg-yx-crit-soft p-4 md:grid-cols-2">
              <TagListField id="vocabulary-dont" label="Palavras e promessas que não podem ser usadas" value={draft.vocabularyDont} onChange={value => update('vocabularyDont', value)} danger />
              <TagListField id="forbidden-topics" label="Assuntos que não devem ser abordados" value={draft.forbiddenTopics} onChange={value => update('forbiddenTopics', value)} danger />
            </div>
            <TextAreaField label="Restrições legais e recomendações" id="compliance-notes" rows={4} value={draft.complianceNotes || ''} onChange={value => update('complianceNotes', value)} placeholder="Ex.: não garantir resultado, não oferecer desconto sem aprovação..." />
          </div>
        </SectionCard>

        <SectionCard id="brand-visual" title="Identidade visual" description="Logo, cores e estilo usados em criativos, páginas e agentes.">
          <div className="space-y-5">
            <Field label="Endereço (URL) do logo" id="logo-url" type="url" inputMode="url" value={draft.visualIdentity.logoUrl || ''} onChange={value => updateVisual('logoUrl', value)} placeholder="https://site.com/logo.svg" hint="Cole o link de uma imagem do logo. A pré-visualização aparece no cartão da marca, acima." />
            <ColorPaletteField colors={draft.visualIdentity.colors} onChange={colors => updateVisual('colors', colors)} />
            <div className="grid gap-4 md:grid-cols-2">
              <TagListField id="brand-typography" label="Tipografias" value={draft.visualIdentity.typography} onChange={value => updateVisual('typography', value)} hint="Nomes das fontes, como Sora, Inter. A amostra aparece no cartão da marca." />
              <TagListField id="brand-graphic-elements" label="Elementos gráficos" value={draft.visualIdentity.graphicElements} onChange={value => updateVisual('graphicElements', value)} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <TextAreaField label="Estilo de design" id="design-style" rows={3} value={draft.visualIdentity.designStyle} onChange={value => updateVisual('designStyle', value)} />
              <TextAreaField label="Estilo de imagens" id="imagery-style" rows={3} value={draft.visualIdentity.imageryStyle} onChange={value => updateVisual('imageryStyle', value)} />
            </div>
            <TextAreaField label="Direção visual complementar" id="visual-guidelines" rows={3} value={draft.visualGuidelines || ''} onChange={value => update('visualGuidelines', value)} />
          </div>
        </SectionCard>
      </form>

      <StickySaveBar
        dirty={dirty}
        saving={saving}
        saveDisabled={invalidColors}
        onSave={() => void save()}
        onDiscard={() => setDraft(profile)}
      />
    </div>
  )
}

/** Paleta editável: seletor de cor nativo + texto hexadecimal para cada cor. */
function ColorPaletteField({ colors, onChange }: { colors: string[]; onChange: (colors: string[]) => void }) {
  const setColor = (index: number, value: string) => onChange(colors.map((color, position) => (position === index ? value : color)))
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-yx-fg">Cores da marca</legend>
      <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {colors.map((color, index) => {
          const invalid = color.trim() !== '' && !isValidHex(color)
          return (
            <li key={index} className="space-y-1">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  id={`brand-color-${index}-picker`}
                  aria-label={`Escolher a cor ${index + 1}`}
                  value={toColorInputValue(color)}
                  onChange={event => setColor(index, event.target.value)}
                  className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1"
                />
                <Input
                  id={`brand-color-${index}`}
                  aria-label={`Código da cor ${index + 1}`}
                  aria-invalid={invalid || undefined}
                  value={color}
                  onChange={event => setColor(index, event.target.value)}
                  placeholder="#5519ff"
                  spellCheck={false}
                  className={cn('font-mono', invalid && 'border-yx-crit focus-visible:ring-yx-crit')}
                />
                <button
                  type="button"
                  onClick={() => onChange(colors.filter((_, position) => position !== index))}
                  className={portalButtonClasses('ghost', 'h-10 w-10 shrink-0 px-0 sm:h-[34px] sm:w-[34px]')}
                  aria-label={`Remover a cor ${index + 1}`}
                >
                  <X aria-hidden="true" />
                </button>
              </div>
              {invalid ? <p className="text-xs text-yx-crit">Use o formato #RRGGBB, como #5519ff.</p> : null}
            </li>
          )
        })}
      </ul>
      <button type="button" onClick={() => onChange([...colors, '#000000'])} className={portalButtonClasses('ghost')}>
        <Plus aria-hidden="true" />
        Adicionar cor
      </button>
      {!colors.length ? <p className="text-xs text-yx-fg-3">Adicione as cores principais da marca. Elas aparecem na paleta do cartão acima.</p> : null}
    </fieldset>
  )
}
