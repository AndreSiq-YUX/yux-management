import { FilePlus2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { CrmLead } from '@/types/crm'
import type { PackageDefinition } from '@/types/platform'

interface LeadProposalLauncherProps {
  lead: CrmLead
  packages: PackageDefinition[]
  packageId: string
  onPackageChange: (value: string) => void
  onCreate: () => void
}

export function LeadProposalLauncher({ lead, packages, packageId, onPackageChange, onCreate }: LeadProposalLauncherProps) {
  return (
    <section className="rounded-md border bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium text-slate-950">Nova proposta</h3>
          <p className="text-sm text-slate-500">{lead.company || lead.name} · {lead.value ? lead.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Valor a definir'}</p>
        </div>
        <div className="flex min-w-[280px] flex-1 gap-2 md:flex-none">
          <Select value={packageId} onValueChange={onPackageChange}>
            <SelectTrigger><SelectValue placeholder="Pacote comercial" /></SelectTrigger>
            <SelectContent>{packages.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button disabled={!packageId} onClick={onCreate}>
            <FilePlus2 className="mr-1 h-4 w-4" />
            Criar
          </Button>
        </div>
      </div>
      <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
        <Info label="Origem" value={lead.sourceKind || lead.source} />
        <Info label="Interesse" value={lead.interest || 'Nao informado'} />
        <Info label="Score" value={`${lead.score}/100`} />
      </div>
    </section>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-2">
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="font-medium text-slate-900">{value}</p>
    </div>
  )
}
