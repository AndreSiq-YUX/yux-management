import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface TagListFieldProps {
  id: string
  label: string
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  /** Texto de apoio abaixo do campo. */
  hint?: string
  danger?: boolean
}

export function TagListField({ id, label, value, onChange, placeholder, hint, danger = false }: TagListFieldProps) {
  // Mantém o texto digitado (inclusive a vírgula final) enquanto a lista é atualizada.
  const [text, setText] = useState(() => value.join(', '))

  useEffect(() => {
    setText(current => (sameList(splitList(current), value) ? current : value.join(', ')))
  }, [value])

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className={danger ? 'text-yx-crit' : 'text-yx-fg'}>{label}</Label>
      <Input
        id={id}
        value={text}
        onChange={event => {
          setText(event.target.value)
          onChange(splitList(event.target.value))
        }}
        placeholder={placeholder || 'Separe os itens por vírgulas'}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cn('border-yx-line-strong bg-yx-surface', danger && 'border-yx-crit-line focus-visible:ring-yx-crit')}
      />
      {hint ? <p id={`${id}-hint`} className="text-xs text-yx-fg-3">{hint}</p> : null}
      {value.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label={`${label}: itens`}>
          {value.map(item => (
            <li
              key={item}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-xs',
                danger ? 'border-yx-crit-line bg-yx-crit-soft text-yx-crit' : 'border-yx-line bg-yx-blue-soft text-yx-blue-ink',
              )}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function sameList(a: string[], b: string[]) {
  return a.length === b.length && a.every((item, index) => item === b[index])
}

function splitList(value: string) {
  const seen = new Set<string>()
  return value.split(/[,;\n]/).map(item => item.trim()).filter(item => {
    const normalized = item.toLocaleLowerCase('pt-BR')
    if (!item || seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}
