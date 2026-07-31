import { ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

export interface AdminQuickAction {
  label: string
  description: string
  href: string
  icon: LucideIcon
}

interface AdminQuickActionsProps {
  actions: AdminQuickAction[]
}

export function AdminQuickActions({ actions }: AdminQuickActionsProps) {
  return (
    <section className="rounded-lg border bg-white">
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold text-gray-900">Acoes administrativas</h2>
      </div>
      <div className="divide-y">
        {actions.map(action => {
          const Icon = action.icon

          return (
            <Link
              key={action.href}
              to={action.href}
              className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-gray-50"
            >
              <span className="flex min-w-0 items-start gap-3">
                <span className="rounded-md bg-gray-50 p-2 text-gray-600">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-900">{action.label}</span>
                  <span className="block text-sm text-gray-500">{action.description}</span>
                </span>
              </span>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
            </Link>
          )
        })}
      </div>
    </section>
  )
}
