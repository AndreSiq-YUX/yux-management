import type { CrmLead } from '@/types/crm'

// Older Radar imports put research JSON into two generated lines. Interpret only
// those known shapes, leaving ordinary notes intact regardless of lead origin.
export function LeadNotes({ lead }: { lead: CrmLead }) {
  if (!lead.notes?.trim()) return null
  const lines = lead.notes.split('\n').flatMap((line) => {
    const legacy =
      /^(Perfil e fontes|Atividade e evidências):\s*(\{.*\})\s*$/.exec(line)
    if (!legacy) return [line]
    try {
      const parsed: unknown = JSON.parse(legacy[2])
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return [line]
      const data = parsed as Record<string, unknown>,
        result: string[] = []
      const text = (value: unknown, key: string) =>
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        typeof (value as Record<string, unknown>)[key] === 'string'
          ? (value as Record<string, string>)[key]
          : undefined
      if (legacy[1] === 'Perfil e fontes') {
        const summary = text(data.summary, 'value')
        if (summary) result.push(summary)
        for (const key of [
          'services',
          'customerSegments',
          'operatingRegions',
          'scaleSignals',
        ])
          if (Array.isArray(data[key]))
            for (const item of data[key]) {
              const value = text(item, 'value')
              if (value) result.push(value)
            }
      } else if (Array.isArray(data.signals))
        for (const item of data.signals) {
          const value = text(item, 'excerpt')
          if (value) result.push(value)
        }
      return result.length
        ? result
        : ['Informações da pesquisa disponíveis em Sobre a empresa.']
    } catch {
      return [line]
    }
  })
  return (
    <section className="flex flex-col gap-2" aria-label="Observações do lead">
      <h4 className="text-sm font-semibold">Observações</h4>
      <p className="whitespace-pre-wrap break-words text-sm">
        {lines.join('\n')}
      </p>
    </section>
  )
}
