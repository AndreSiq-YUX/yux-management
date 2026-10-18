import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface FieldProps {
  label: string
  id: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  hint?: string
  inputMode?: 'text' | 'numeric' | 'url' | 'email' | 'tel'
  autoComplete?: string
  className?: string
}

/** Campo de texto com rótulo sempre visível e texto de apoio opcional. */
export function Field({ label, id, value, onChange, type = 'text', placeholder, hint, inputMode, autoComplete, className }: FieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id} className="text-yx-fg">{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={event => onChange(event.target.value)}
      />
      {hint ? <p id={`${id}-hint`} className="text-xs text-yx-fg-3">{hint}</p> : null}
    </div>
  )
}

interface TextAreaFieldProps {
  label: string
  id: string
  value: string
  onChange: (value: string) => void
  rows?: number
  placeholder?: string
  hint?: ReactNode
  className?: string
}

export function TextAreaField({ label, id, value, onChange, rows = 3, placeholder, hint, className }: TextAreaFieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id} className="text-yx-fg">{label}</Label>
      <Textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={event => onChange(event.target.value)}
      />
      {hint ? <p id={`${id}-hint`} className="text-xs text-yx-fg-3">{hint}</p> : null}
    </div>
  )
}

/** Foca (e rola até) um campo pelo id. */
export function focusField(id: string) {
  const element = document.getElementById(id)
  if (!element) return
  element.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  element.focus({ preventScroll: true })
}
