import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface NewLeadValues {
  name: string
  email: string
  phone: string
  company: string
  source: string
  value: string
}

const emptyValues: NewLeadValues = { name: '', email: '', phone: '', company: '', source: 'Manual', value: '' }
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * "Novo lead" da variante portal: todos os campos têm rótulo visível.
 * O cadastro de leads exige e-mail (validação do servidor), por isso ele é obrigatório;
 * o telefone é opcional. A pontuação não é informada na criação: ela é calculada pelas regras.
 */
export function LeadCreateDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (values: NewLeadValues) => Promise<void>
}) {
  const [values, setValues] = useState<NewLeadValues>(emptyValues)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (key: keyof NewLeadValues) => (event: { target: { value: string } }) => setValues(current => ({ ...current, [key]: event.target.value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!values.name.trim()) return setError('Informe o nome do lead.')
    if (!emailPattern.test(values.email.trim())) return setError('Informe um e-mail válido. Ele é obrigatório para cadastrar o lead.')
    if (values.value && (!Number.isFinite(Number(values.value)) || Number(values.value) < 0)) return setError('O valor estimado deve ser um número maior ou igual a zero.')
    setSaving(true)
    setError(null)
    try {
      await onCreate(values)
      setValues(emptyValues)
      onOpenChange(false)
    } catch (createError) {
      console.error('Erro ao criar lead:', createError)
      setError('Não foi possível criar o lead. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!saving) { setError(null); onOpenChange(next) } }}>
      <DialogContent className="max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo lead</DialogTitle>
          <DialogDescription>Cadastre uma oportunidade manualmente. Ela entra na primeira etapa do funil.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={submit} noValidate>
          <div>
            <Label htmlFor="new-lead-name">Nome *</Label>
            <Input id="new-lead-name" className="mt-1" required value={values.name} onChange={set('name')} autoComplete="off" />
          </div>
          <div>
            <Label htmlFor="new-lead-email">E-mail *</Label>
            <Input id="new-lead-email" className="mt-1" required type="email" value={values.email} onChange={set('email')} aria-describedby="new-lead-email-hint" autoComplete="off" />
            <p id="new-lead-email-hint" className="mt-1 text-xs text-yx-fg-3">Obrigatório: o cadastro de leads exige um e-mail, mesmo quando você também informa o telefone.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="new-lead-phone">Telefone</Label>
              <Input id="new-lead-phone" className="mt-1" type="tel" value={values.phone} onChange={set('phone')} autoComplete="off" />
            </div>
            <div>
              <Label htmlFor="new-lead-company">Empresa</Label>
              <Input id="new-lead-company" className="mt-1" value={values.company} onChange={set('company')} autoComplete="off" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="new-lead-source">Origem</Label>
              <Input id="new-lead-source" className="mt-1" value={values.source} onChange={set('source')} />
            </div>
            <div>
              <Label htmlFor="new-lead-value">Valor estimado (R$)</Label>
              <Input id="new-lead-value" className="mt-1" type="number" min="0" step="0.01" inputMode="decimal" value={values.value} onChange={set('value')} />
            </div>
          </div>
          {error && <p role="alert" className="rounded-lg border border-yx-crit-line bg-yx-crit-soft px-3 py-2 text-[13px] text-yx-crit">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Criando...' : 'Criar lead'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
