interface UsageLimitBarProps {
  used: number
  limit?: number | null
}

export function UsageLimitBar({ used, limit }: UsageLimitBarProps) {
  const hasLimit = typeof limit === 'number' && limit > 0
  const percentage = hasLimit ? Math.min(100, Math.max(0, Math.round((used / limit) * 100))) : 0

  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-gray-500">
        <span>{used}</span>
        <span>{hasLimit ? limit : 'Sem limite'}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
        <div className="h-2 rounded-full bg-yux-600" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  )
}
