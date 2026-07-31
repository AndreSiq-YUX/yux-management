import { Building2, FileText, Megaphone, Receipt, Repeat2, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface RecordAssociationItem {
  key: string
  label: string
  count: number
  description?: string
}

interface RecordAssociationsPanelProps {
  associations: RecordAssociationItem[]
}

const iconByKey: Record<string, typeof Building2> = {
  company: Building2,
  contacts: Users,
  opportunities: Repeat2,
  campaigns: Megaphone,
  documents: FileText,
  invoices: Receipt,
}

export function RecordAssociationsPanel({ associations }: RecordAssociationsPanelProps) {
  return (
    <section className="rounded-md border bg-white">
      <div className="border-b p-3">
        <h3 className="font-medium text-slate-950">Associacoes</h3>
        <p className="text-xs text-slate-500">Objetos ligados a este relacionamento.</p>
      </div>
      <div className="divide-y">
        {associations.map(item => {
          const Icon = iconByKey[item.key] || Repeat2
          return (
            <div key={item.key} className="p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-950">{item.label}</p>
                    {item.description && <p className="truncate text-xs text-slate-500">{item.description}</p>}
                  </div>
                </div>
                <Badge variant={item.count > 0 ? 'secondary' : 'outline'}>{item.count}</Badge>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
