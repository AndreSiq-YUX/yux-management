import { cn } from '@/lib/utils'

const tones = {
  neutral: 'border-yx-line bg-yx-surface-2 text-yx-fg-2',
  info: 'border-yx-line-strong bg-yx-blue-soft text-yx-blue',
  warning: 'border-yx-warn-line bg-yx-warn-soft text-yx-warn',
  success: 'border-yx-ok-line bg-yx-ok-soft text-yx-ok',
  danger: 'border-yx-crit-line bg-yx-crit-soft text-yx-crit',
}

export function MissionStatusBadge({ label, tone, className }: { label: string; tone: keyof typeof tones; className?: string }) {
  return <span className={cn('inline-flex rounded-sm border px-2 py-1 text-[11px] font-semibold', tones[tone], className)}>{label}</span>
}
