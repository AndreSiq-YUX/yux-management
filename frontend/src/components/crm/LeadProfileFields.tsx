import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { applicableProfileFields } from '@/types/crmRecordProfile'
import type { CrmProfileConfiguration, CustomFieldValues } from '@/types/crmRecordProfile'

interface Props {
  configuration: CrmProfileConfiguration
  recordTypeId: string | null
  values: CustomFieldValues
  onTypeChange: (id: string | null) => void
  onValuesChange: (values: CustomFieldValues) => void
  disabled?: boolean
}

const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50'

export function LeadProfileFields({ configuration, recordTypeId, values, onTypeChange, onValuesChange, disabled }: Props) {
  const prefix = useId()
  const fields = applicableProfileFields(configuration.fields, recordTypeId)
  return (
    <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-4">
      <legend className="mb-3 text-sm font-semibold">Perfil do cliente</legend>
      <div className="flex flex-col gap-1 text-sm font-medium">
        <label htmlFor={`${prefix}-type`}>Tipo de cliente</label>
        <select id={`${prefix}-type`} className={selectClass} value={recordTypeId || ''} onChange={event => onTypeChange(event.target.value || null)}>
          <option value="">Sem tipo definido</option>
          {configuration.recordTypes.filter(type => type.isActive || type.id === recordTypeId).map(type => (
            <option key={type.id} value={type.id} disabled={!type.isActive}>{type.name}{!type.isActive ? ' (arquivado)' : ''}</option>
          ))}
        </select>
      </div>
      {!configuration.recordTypes.some(type => type.isActive) && !fields.length && (
        <p className="text-sm text-muted-foreground">Os tipos e campos podem ser cadastrados em “Tipos e campos”, no CRM.</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map(field => {
          const id = `${prefix}-${field.id}`
          const value = values[field.stableKey]
          const change = (next: string | number | boolean | null) => onValuesChange({ ...values, [field.stableKey]: next })
          return (
            <div key={field.id} className={`flex min-w-0 flex-col gap-1 text-sm font-medium${field.fieldType === 'textarea' ? ' sm:col-span-2' : ''}`}>
              <label htmlFor={id}>{field.label}{field.required ? ' *' : ''}</label>
              {field.fieldType === 'textarea' ? (
                <Textarea id={id} required={field.required} maxLength={10000} value={typeof value === 'string' ? value : ''} onChange={event => change(event.target.value)} />
              ) : field.fieldType === 'select' || field.fieldType === 'boolean' ? (
                <select id={id} className={selectClass} required={field.required} value={value === null || value === undefined ? '' : String(value)}
                  onChange={event => change(event.target.value === '' ? null : field.fieldType === 'boolean' ? event.target.value === 'true' : event.target.value)}>
                  <option value="">Selecione</option>
                  {field.fieldType === 'boolean' ? <><option value="true">Sim</option><option value="false">Não</option></> : field.options.map(option => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : (
                <Input id={id} required={field.required} type={field.fieldType === 'number' ? 'number' : field.fieldType === 'date' ? 'date' : 'text'}
                  step={field.fieldType === 'number' ? 'any' : undefined} maxLength={field.fieldType === 'text' ? 10000 : undefined}
                  value={typeof value === 'string' || typeof value === 'number' ? value : ''}
                  onChange={event => change(field.fieldType === 'number' ? event.target.value === '' ? null : Number(event.target.value) : event.target.value)} />
              )}
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}
