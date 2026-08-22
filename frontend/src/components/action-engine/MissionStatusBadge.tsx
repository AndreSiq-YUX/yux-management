import { cn } from '@/lib/utils'

const tones = {
  neutral: 'border-slate-200 bg-slate-50 text-slate-700',
  info: 'border-blue-200 bg-blue-50 text-blue-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  danger: 'border-red-200 bg-red-50 text-red-700',
}

export function MissionStatusBadge({ label, tone, className }: { label: string; tone: keyof typeof tones; className?: string }) {
  return <span className={cn('inline-flex rounded-sm border px-2 py-1 text-[11px] font-semibold', tones[tone], className)}>{label}</span>
}
