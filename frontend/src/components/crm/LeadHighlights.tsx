import type { CrmLead } from '@/types/crm'

export function profileValue(value: unknown): string {
  if (value === null || value === undefined || value === '')
    return 'Não informado'
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (typeof value === 'number') return value.toLocaleString('pt-BR')
  return typeof value === 'string' ? value : 'Não informado'
}

export function LeadHighlights({ lead }: { lead: CrmLead }) {
  const fields =
    lead.profileSummary?.fields.filter(
      (field) =>
        field.isHighlighted && field.value !== null && field.value !== '',
    ) || []
  if (!fields.length) return null
  return (
    <dl
      aria-label="Campos em destaque"
      className="mt-2 flex min-w-0 flex-col gap-1 text-xs text-muted-foreground"
    >
      {fields.map((field) => (
        <div key={field.key} className="min-w-0 break-words">
          <dt className="inline font-medium">{field.label}: </dt>
          <dd className="inline" title={profileValue(field.value)}>
            {profileValue(field.value).slice(0, 120)}
            {profileValue(field.value).length > 120 ? '…' : ''}
          </dd>
        </div>
      ))}
    </dl>
  )
}
