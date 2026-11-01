import type { CrmLead } from '@/types/crm'
import { Button } from '@/components/ui/button'
import { profileValue } from '@/lib/crm/profileValue'

export function LeadProfileSummary({
  lead,
  onEdit,
}: {
  lead: CrmLead
  onEdit: () => void
}) {
  return (
    <section
      className="flex flex-col gap-3 rounded-md border p-4"
      aria-label="Dados do cliente"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Dados do cliente</h3>
        <Button size="sm" variant="outline" onClick={onEdit}>
          Editar dados
        </Button>
      </div>
      <p className="text-sm">
        Tipo de cliente:{' '}
        <strong>
          {lead.profileSummary?.recordTypeName || 'Sem tipo definido'}
        </strong>
      </p>
      {lead.profileSummary?.fields.length ? (
        <dl className="grid gap-3 sm:grid-cols-2">
          {lead.profileSummary.fields.map((field) => (
            <div key={field.key} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{field.label}</dt>
              <dd className="break-words text-sm">
                {profileValue(field.value)}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">
          Selecione o tipo de cliente para preencher os campos da ficha.
        </p>
      )}
    </section>
  )
}
