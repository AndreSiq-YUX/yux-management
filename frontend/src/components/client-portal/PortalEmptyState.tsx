import { Link } from 'react-router-dom'
import { ArrowRight, Inbox, type LucideIcon } from 'lucide-react'

interface PortalEmptyStateProps {
  title: string
  description: string
  icon?: LucideIcon
  action?: {
    label: string
    href: string
  }
}

export function PortalEmptyState({ title, description, icon: Icon = Inbox, action }: PortalEmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed bg-white p-6 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-gray-50 text-gray-500">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-gray-900">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-gray-600">{description}</p>
      {action && (
        <Link
          to={action.href}
          className="mt-4 inline-flex items-center justify-center rounded-md border px-3 py-2 text-sm font-medium text-gray-700 hover:border-yux-300 hover:bg-yux-50 hover:text-yux-800"
        >
          {action.label}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      )}
    </div>
  )
}
