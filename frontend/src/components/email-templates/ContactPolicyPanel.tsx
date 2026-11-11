import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  commercialEmailError,
  commercialEmailService,
  type ContactBasis,
  type ContactPolicy,
} from '@/services/commercialEmailService'

const basisOptions: Array<{ value: ContactBasis; label: string; help: string }> = [
  {
    value: 'published_business_contact',
    label: 'Contato comercial divulgado pela empresa',
    help: 'Permite falar com o endereço ou número que a empresa divulga para fornecedores e parceiros. Toda mensagem leva a opção de não receber mais.',
  },
  {
    value: 'explicit_opt_in',
    label: 'Somente com autorização registrada',
    help: 'Só envia para contatos que autorizaram o recebimento (registro na ficha do lead).',
  },
]

export function ContactPolicyPanel({ organizationId }: { organizationId: string }) {
  const [policy, setPolicy] = useState<ContactPolicy | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [emailBasis, setEmailBasis] = useState<ContactBasis>('published_business_contact')
  const [whatsappBasis, setWhatsappBasis] = useState<ContactBasis>('explicit_opt_in')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    commercialEmailService
      .contactPolicy(organizationId)
      .then((result) => {
        if (!active) return
        setPolicy(result.policy)
        setCanManage(result.canManage)
        setEmailBasis(result.policy.emailBasis)
        setWhatsappBasis(result.policy.whatsappBasis)
      })
      .catch(() => {
        if (active) setError('Não foi possível carregar a política de contato.')
      })
    return () => {
      active = false
    }
  }, [organizationId])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!policy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await commercialEmailService.saveContactPolicy(organizationId, {
        emailBasis,
        whatsappBasis,
        revision: policy.revision,
      })
      setPolicy(result.policy)
      setNotice('Política de contato salva.')
    } catch (cause) {
      setError(commercialEmailError(cause, 'Não foi possível salvar a política de contato.'))
    } finally {
      setBusy(false)
    }
  }

  if (!policy && !error) return null

  return (
    <section className="space-y-3 rounded-lg border bg-white p-4" aria-labelledby="contact-policy-title">
      <div>
        <h2 id="contact-policy-title" className="text-base font-semibold">
          Política de contato
        </h2>
        <p className="text-sm text-gray-600">
          Define quando a equipe e as automações podem iniciar contato com um lead. Contatos que pedirem para não
          receber mais mensagens são sempre bloqueados.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-yx-crit">
          {error}
        </p>
      )}
      {policy && (
        <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
          <BasisField
            id="contact-policy-email"
            label="E-mail"
            value={emailBasis}
            disabled={!canManage || busy}
            onChange={setEmailBasis}
          />
          <BasisField
            id="contact-policy-whatsapp"
            label="WhatsApp"
            value={whatsappBasis}
            disabled={!canManage || busy}
            onChange={setWhatsappBasis}
            warning={
              whatsappBasis === 'published_business_contact'
                ? 'A Meta exige autorização do contato para mensagens iniciadas pela empresa. Use com cautela: denúncias reduzem a qualidade do número.'
                : undefined
            }
          />
          {canManage ? (
            <div className="md:col-span-2 flex items-center gap-3">
              <Button type="submit" disabled={busy}>
                {busy ? 'Salvando…' : 'Salvar política'}
              </Button>
              {notice && <span className="text-sm text-gray-600">{notice}</span>}
            </div>
          ) : (
            <p className="md:col-span-2 text-sm text-gray-600">Somente administradores da conta alteram esta política.</p>
          )}
        </form>
      )}
    </section>
  )
}

function BasisField({
  id,
  label,
  value,
  disabled,
  onChange,
  warning,
}: {
  id: string
  label: string
  value: ContactBasis
  disabled: boolean
  onChange: (value: ContactBasis) => void
  warning?: string
}) {
  const current = basisOptions.find((option) => option.value === value)
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        className="block w-full rounded-md border bg-white p-2 text-sm"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as ContactBasis)}
      >
        {basisOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {current && <p className="text-xs text-gray-600">{current.help}</p>}
      {warning && <p className="text-xs text-yx-crit">{warning}</p>}
    </div>
  )
}
