import { CircleDollarSign, Mail, MessageCircle, Trophy, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { CrmLead } from '@/types/crm'

interface LeadDetailPanelProps {
  lead: CrmLead
  onMarkWon: () => void
  onMarkLost: () => void
}

const formatCurrency = (value?: number) => value !== undefined
  ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  : 'Nao informado'

const sourceLabel: Record<string, string> = {
  paid_campaign: 'Campanha paga',
  landing_page: 'Landing page',
  whatsapp_cta: 'WhatsApp',
  organic: 'Organico',
  referral: 'Indicacao',
  manual: 'Manual',
}

export function LeadDetailPanel({ lead, onMarkWon, onMarkLost }: LeadDetailPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">{lead.name}</h2>
          <p className="text-sm text-slate-500">{lead.company || lead.email}</p>
        </div>
        <Badge variant={lead.status === 'won' ? 'default' : lead.status === 'lost' ? 'destructive' : 'secondary'}>
          {lead.status === 'won' ? 'Ganho' : lead.status === 'lost' ? 'Perdido' : 'Aberto'}
        </Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Info icon={Mail} label="Email" value={lead.email} />
        <Info icon={MessageCircle} label="Telefone" value={lead.phone || 'Nao informado'} />
        <Info icon={CircleDollarSign} label="Valor" value={formatCurrency(lead.value)} />
        <Info icon={Trophy} label="Score" value={`${lead.score}/100`} />
      </div>

      <div className="grid gap-3 rounded-md border bg-slate-50 p-3 md:grid-cols-3">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">Origem</p>
          <p className="mt-1 text-sm text-slate-900">{sourceLabel[lead.sourceKind || 'manual'] || lead.source}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">Responsavel</p>
          <p className="mt-1 text-sm text-slate-900">{lead.ownerMemberId || lead.ownerId || lead.assignedTo || 'Nao atribuido'}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">Proximo follow-up</p>
          <p className="mt-1 text-sm text-slate-900">
            {lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt).toLocaleString('pt-BR') : 'Sem agenda'}
          </p>
        </div>
      </div>

      {(lead.ownerMemberId || lead.teamId || lead.pipelineVersionId) && (
        <div className="grid gap-2 rounded-md border bg-white p-3 text-xs text-slate-600 md:grid-cols-3">
          <span>Responsavel CRM: {lead.ownerMemberId || 'Nao atribuido'}</span>
          <span>Equipe: {lead.teamId || 'Sem equipe'}</span>
          <span>Versao do funil: {lead.pipelineVersionId || 'Atual'}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button title="Marcar lead como ganho" onClick={onMarkWon}>
          <Trophy className="mr-2 h-4 w-4" />
          Ganho
        </Button>
        <Button title="Marcar lead como perdido" variant="outline" onClick={onMarkLost}>
          <XCircle className="mr-2 h-4 w-4" />
          Perdido
        </Button>
      </div>
    </div>
  )
}

function Info({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="rounded-md border bg-white p-3">
      <Icon className="h-4 w-4 text-slate-500" />
      <p className="mt-2 text-xs text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-950">{value}</p>
    </div>
  )
}
