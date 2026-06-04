import { Mail, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export function EmailSettingsPanel() {
  return (
    <section className="rounded-md border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Mail className="mt-0.5 h-4 w-4 text-slate-600" />
          <div>
            <h2 className="text-base font-semibold text-slate-950">Configuracoes de email</h2>
            <p className="text-sm text-slate-600">SMTP2GO, subcontas, limites e opt-out por cliente.</p>
          </div>
        </div>
        <Badge variant="outline">
          <ShieldCheck className="mr-1 h-3.5 w-3.5" />
          SMTP2GO
        </Badge>
      </div>
      <div className="mt-3 grid gap-3 text-sm md:grid-cols-3">
        <div className="rounded-md border bg-slate-50 p-3">Subconta por organizacao</div>
        <div className="rounded-md border bg-slate-50 p-3">Quota diaria e mensal</div>
        <div className="rounded-md border bg-slate-50 p-3">Supressoes e webhooks</div>
      </div>
    </section>
  )
}
