import type { ReactNode } from 'react'
import { Mail, MessageCircle, Phone, Trophy } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { CrmLead } from '@/types/crm'

interface RecordIdentityAction {
  key: string
  label: string
  icon?: ReactNode
  onClick?: () => void
  variant?: 'default' | 'outline' | 'secondary' | 'destructive' | 'ghost' | 'link'
}

interface RecordIdentityPanelProps {
  lead: CrmLead
  actions: RecordIdentityAction[]
}

const statusLabel: Record<string, string> = {
  won: 'Ganho',
  lost: 'Perdido',
  open: 'Aberto',
  new: 'Novo',
  contacted: 'Contatado',
  qualified: 'Qualificado',
}

export function RecordIdentityPanel({ lead, actions }: RecordIdentityPanelProps) {
  const owner = lead.ownerMemberId || lead.ownerId || lead.assignedTo || 'Nao atribuido'
  const nextFollowUp = lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt).toLocaleString('pt-BR') : 'Sem agenda'

  return (
    <section className="rounded-md border bg-white">
      <div className="border-b p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-slate-950">{lead.name}</h2>
            <p className="truncate text-sm text-slate-500">{lead.company || lead.email || 'Lead sem empresa'}</p>
          </div>
          <Badge variant={lead.status === 'won' ? 'default' : lead.status === 'lost' ? 'destructive' : 'secondary'}>
            {statusLabel[lead.status || 'open'] || lead.status || 'Aberto'}
          </Badge>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {actions.map(action => (
            <Button
              key={action.key}
              type="button"
              size="sm"
              variant={action.variant || 'outline'}
              className="h-auto min-h-10 flex-col gap-1 px-2 py-2 text-xs"
              onClick={action.onClick}
              title={action.label}
            >
              {action.icon}
              <span className="max-w-full truncate">{action.label}</span>
            </Button>
          ))}
        </div>
      </div>

      <dl className="space-y-3 p-4 text-sm">
        <Info icon={<Mail className="h-4 w-4" />} label="Email" value={lead.email || 'Nao informado'} />
        <Info icon={<Phone className="h-4 w-4" />} label="Telefone" value={lead.phone || lead.whatsappPhone || 'Nao informado'} />
        <Info icon={<MessageCircle className="h-4 w-4" />} label="Origem" value={lead.source || lead.sourceKind || 'Manual'} />
        <Info icon={<Trophy className="h-4 w-4" />} label="Score" value={`${lead.score || 0}/100`} />
        <Info label="Responsavel" value={owner} />
        <Info label="Proxima acao" value={nextFollowUp} />
      </dl>
    </section>
  )
}

function Info({ icon, label, value }: { icon?: ReactNode; label: string; value: string }) {
  return (
    <div>
      <dt className="flex items-center gap-2 text-xs font-medium uppercase text-slate-500">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 break-words font-medium text-slate-950">{value}</dd>
    </div>
  )
}
