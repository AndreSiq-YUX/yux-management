import type { LucideIcon } from 'lucide-react'

interface AdminMetricCardProps {
  label: string
  value: string | number
  detail: string
  icon: LucideIcon
}

export function AdminMetricCard({ label, value, detail, icon: Icon }: AdminMetricCardProps) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
          <p className="mt-1 text-sm text-gray-600">{detail}</p>
        </div>
        <span className="rounded-md bg-yux-50 p-2 text-yux-700">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
    </div>
  )
}
