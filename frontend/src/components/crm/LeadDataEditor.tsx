import { useRef, useState, type FormEvent } from 'react'
import { apiRequest } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import type { CrmLead } from '@/types/crm'
const fields = [
  ['name', 'Nome'],
  ['company', 'Empresa'],
  ['email', 'E-mail'],
  ['phone', 'Telefone'],
  ['whatsappPhone', 'WhatsApp'],
  ['websiteUrl', 'Site'],
  ['cnpj', 'CNPJ'],
  ['address', 'Endereço'],
  ['city', 'Cidade'],
  ['state', 'UF'],
] as const
export function LeadDataEditor({
  lead,
  onSaved,
  onCancel,
}: {
  lead: CrmLead
  onSaved: () => void
  onCancel: () => void
}) {
  const initial = useRef({
    values: Object.fromEntries(
      fields.map(([key]) => [
        key,
        String(
          (key === 'websiteUrl'
            ? (lead.websiteUrl ?? lead.commercialProfile?.websiteUrl)
            : lead[key]) ?? '',
        ),
      ]),
    ),
    expected: Object.fromEntries(
      fields.map(([key]) => [key, lead[key] ?? null]),
    ),
  })
  const [values, setValues] = useState(() => initial.current.values),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const pending = useRef(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const changed = fields.filter(
        ([key]) => values[key] !== initial.current.values[key],
      )
      if (changed.length)
        await apiRequest(`/crm/leads/${lead.id}`, {
          method: 'PATCH',
          body: {
            ...Object.fromEntries(changed.map(([key]) => [key, values[key]])),
            expectedValues: Object.fromEntries(
              changed.map(([key]) => [key, initial.current.expected[key]]),
            ),
          },
        })
      onSaved()
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Não foi possível salvar os dados.',
      )
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4"
      aria-label="Editar dados de contato"
    >
      <h3 className="font-semibold">Dados de contato e empresa</h3>
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        {fields.map(([key, label]) => (
          <Field key={key}>
            <FieldLabel htmlFor={`lead-data-${key}`}>{label}</FieldLabel>
            <Input
              id={`lead-data-${key}`}
              type={key === 'email' ? 'email' : 'text'}
              placeholder={
                key === 'websiteUrl' ? 'https://empresa.com.br' : undefined
              }
              required={key === 'name'}
              value={values[key]}
              onChange={(e) =>
                setValues((v) => ({ ...v, [key]: e.target.value }))
              }
              disabled={busy}
              maxLength={
                key === 'state'
                  ? 2
                  : key === 'websiteUrl'
                    ? 2048
                    : key === 'address'
                      ? 600
                      : 200
              }
            />
          </Field>
        ))}
      </FieldGroup>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? 'Salvando...' : 'Salvar dados'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={onCancel}
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}
