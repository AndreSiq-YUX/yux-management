import { profileValue } from '@/lib/crm/profileValue'
import type { CrmLead } from '@/types/crm'


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
