import { useState } from 'react'
import { ImageOff } from 'lucide-react'
import { StatusChip } from '@/components/portal-ui'
import { composeSampleMessage, fontFamilyFor, isValidHex, normalizeHex } from '@/lib/company-intelligence/brandPreview'
import type { BrandVisualIdentity } from '@/types/companyIntelligence'

export interface BrandCardProps {
  brandName?: string
  toneOfVoice: string
  persona: string
  brandVoiceSummary: string
  vocabularyDo: string[]
  visualIdentity: BrandVisualIdentity
}

/** Cartão da marca: logo, paleta, amostra das fontes e mensagem de exemplo no tom definido. */
export function BrandCard({ brandName, toneOfVoice, persona, brandVoiceSummary, vocabularyDo, visualIdentity }: BrandCardProps) {
  const [failedLogo, setFailedLogo] = useState<string | null>(null)
  const logoUrl = visualIdentity.logoUrl?.trim()
  const showLogo = Boolean(logoUrl) && failedLogo !== logoUrl
  const colors = visualIdentity.colors.map(color => color.trim()).filter(Boolean)
  const fonts = visualIdentity.typography.map(font => font.trim()).filter(Boolean)
  const sample = composeSampleMessage({ brandName, toneOfVoice, persona, brandVoiceSummary, vocabularyDo })

  return (
    <section aria-label="Cartão da marca" className="overflow-hidden rounded-[10px] border border-yx-line bg-yx-surface shadow-[0_1px_2px_rgba(14,17,32,0.04),0_2px_8px_rgba(14,17,32,0.04)] dark:shadow-none">
      <div aria-hidden="true" className="h-1.5 bg-brand-gradient" />
      <div className="grid gap-5 p-[18px] md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] md:gap-6">
        <div className="space-y-3">
          <div className="grid h-24 place-items-center overflow-hidden rounded-lg border border-yx-line bg-yx-surface-2 p-2">
            {showLogo ? (
              <img src={logoUrl} alt={`Logo${brandName ? ` de ${brandName}` : ' da marca'}`} className="max-h-full max-w-full object-contain" onError={() => setFailedLogo(logoUrl ?? null)} />
            ) : (
              <span className="flex flex-col items-center gap-1 text-center text-xs text-yx-fg-3">
                <ImageOff aria-hidden="true" className="h-5 w-5" />
                {logoUrl ? 'Não foi possível carregar o logo' : 'Logo ainda não cadastrado'}
              </span>
            )}
          </div>
          {persona.trim() ? (
            <p className="text-[13px] text-yx-fg-2"><span className="font-mono text-[11px] uppercase tracking-[0.08em] text-yx-fg-3">Fala com</span><br />{persona}</p>
          ) : null}
          {toneOfVoice.trim() ? (
            <p className="text-[13px] text-yx-fg-2"><span className="font-mono text-[11px] uppercase tracking-[0.08em] text-yx-fg-3">Tom de voz</span><br />{toneOfVoice}</p>
          ) : null}
        </div>

        <div className="min-w-0 space-y-5">
          <div>
            <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-yx-fg-3">Paleta de cores</h3>
            {colors.length ? (
              <ul className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
                {colors.map((color, index) => {
                  const valid = isValidHex(color)
                  const hex = normalizeHex(color) ?? color
                  return (
                    <li key={`${color}-${index}`} className="flex items-center gap-2 rounded-lg border border-yx-line bg-yx-surface py-1 pl-1 pr-2.5">
                      {valid ? (
                        <span
                          aria-hidden="true"
                          data-testid="brand-swatch"
                          className="block h-8 w-8 rounded-md border border-yx-line-strong"
                          style={{ backgroundColor: hex }}
                        />
                      ) : (
                        <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-md border border-dashed border-yx-crit-line bg-yx-crit-soft text-xs text-yx-crit">?</span>
                      )}
                      <span className="font-mono text-xs text-yx-fg-2">{valid ? hex.toUpperCase() : color}</span>
                      {!valid ? <StatusChip variant="crit">Cor inválida</StatusChip> : null}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="mt-2 text-[13px] text-yx-fg-3">Nenhuma cor cadastrada. Adicione as cores da marca em Identidade visual, mais abaixo.</p>
            )}
          </div>

          <div>
            <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-yx-fg-3">Tipografia</h3>
            {fonts.length ? (
              <ul className="m-0 mt-2 grid list-none gap-2 p-0 sm:grid-cols-2">
                {fonts.map(font => (
                  <li key={font} className="rounded-lg border border-yx-line px-3 py-2">
                    <span className="block text-2xl leading-tight text-yx-fg" style={{ fontFamily: fontFamilyFor(font) }}>Aa Bb Cc 123</span>
                    <span className="mt-0.5 block text-xs text-yx-fg-3">{font}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[13px] text-yx-fg-3">Nenhuma fonte cadastrada.</p>
            )}
          </div>

          <div>
            <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-yx-fg-3">Exemplo de mensagem</h3>
            {sample ? (
              <>
                <p className="mt-2 rounded-lg rounded-tl-sm border border-yx-line bg-yx-blue-soft px-3.5 py-2.5 text-sm leading-relaxed text-yx-fg">{sample}</p>
                <p className="mt-1.5 text-xs text-yx-fg-3">Montada com o tom de voz, o resumo e as palavras que você definiu.</p>
              </>
            ) : (
              <p className="mt-2 text-[13px] text-yx-fg-3">Defina o tom de voz e o resumo da marca para ver um exemplo de mensagem.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
