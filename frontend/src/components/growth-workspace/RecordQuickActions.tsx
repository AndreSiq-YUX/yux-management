import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface RecordQuickAction {
  key: string
  label: string
  icon?: ReactNode
  onClick?: () => void
  disabled?: boolean
}

interface RecordQuickActionsProps {
  actions: RecordQuickAction[]
}

export function RecordQuickActions({ actions }: RecordQuickActionsProps) {
  return (
    <section className="rounded-md border bg-white p-3">
      <h3 className="font-medium text-slate-950">Acoes rapidas</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map(action => (
          <Button key={action.key} type="button" variant="outline" disabled={action.disabled} onClick={action.onClick} title={action.label}>
            {action.icon}
            {action.label}
          </Button>
        ))}
      </div>
    </section>
  )
}
