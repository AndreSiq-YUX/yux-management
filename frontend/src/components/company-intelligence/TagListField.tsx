import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface TagListFieldProps {
  id: string
  label: string
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  danger?: boolean
}

export function TagListField({ id, label, value, onChange, placeholder, danger = false }: TagListFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className={danger ? 'text-rose-800' : undefined}>{label}</Label>
      <Input
        id={id}
        value={value.join(', ')}
        onChange={event => onChange(splitList(event.target.value))}
        placeholder={placeholder || 'Separe os itens por vírgulas'}
        className={danger ? 'border-rose-200 focus-visible:ring-rose-500' : undefined}
      />
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map(item => (
            <span key={item} className={`rounded-full px-2 py-1 text-xs ${danger ? 'bg-rose-100 text-rose-800' : 'bg-yux-50 text-yux-800'}`}>
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  )
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
