import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { metaChannelService } from '@/services/metaChannelService'

export function WhatsAppTestProvisionForm({ organizationId, onConnected }: { organizationId: string; onConnected: () => Promise<void> }) {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const sending = useRef(false)
  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sending.current) return
    const form = event.currentTarget
    const data = new FormData(form)
    const accessToken = String(data.get('accessToken') || '').trim()
    const tokenField = form.elements.namedItem('accessToken') as HTMLInputElement | null
    if (tokenField) tokenField.value = ''
    sending.current = true
    setPending(true)
    setMessage(null)
    try {
      await metaChannelService.provisionTestNumber({
        organizationId, wabaId: String(data.get('wabaId') || '').trim(), phoneNumberId: String(data.get('phoneNumberId') || '').trim(), accessToken,
      })
      await onConnected()
      setMessage('Número de teste conectado em modo manual. Verifique a conexão e envie uma mensagem do seu celular para este número.')
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      setMessage(code === 'whatsapp_test_provisioning_disabled'
        ? 'Habilite no servidor a organização de homologação e o Phone Number ID exato antes de conectar.'
        : 'Não foi possível conectar. Confira os IDs, a configuração do aplicativo no servidor e a validade/permissões do token. Cole o token novamente para tentar.')
    } finally {
      sending.current = false
      setPending(false)
    }
  }
  return <details className="rounded-lg border bg-white p-4">
    <summary className="cursor-pointer text-sm font-semibold text-gray-900">Homologação interna com número de teste da Meta</summary>
    <p className="mt-3 text-sm text-gray-600">Uso exclusivo da equipe YUX na organização de homologação. A credencial será validada na Meta e armazenada de forma protegida no servidor.</p>
    <form className="mt-4 space-y-3" onSubmit={connect}>
      <fieldset className="grid gap-3 sm:grid-cols-2" disabled={pending}>
        <label className="text-sm font-medium text-gray-800">WhatsApp Business Account ID (WABA)
          <input className="mt-1 w-full rounded-md border px-3 py-2" inputMode="numeric" name="wabaId" pattern="[0-9]{5,30}" required />
        </label>
        <label className="text-sm font-medium text-gray-800">Phone Number ID
          <input className="mt-1 w-full rounded-md border px-3 py-2" inputMode="numeric" name="phoneNumberId" pattern="[0-9]{5,30}" required />
        </label>
        <label className="text-sm font-medium text-gray-800 sm:col-span-2">Token de acesso temporário
          <input autoComplete="off" className="mt-1 w-full rounded-md border px-3 py-2" minLength={20} maxLength={4096} name="accessToken" required spellCheck={false} type="password" />
        </label>
      </fieldset>
      <button className="rounded-md bg-yux-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={pending} type="submit">{pending ? 'Validando na Meta…' : 'Validar e conectar número de teste'}</button>
      {message ? <p className="text-sm text-gray-700" role="status">{message}</p> : null}
    </form>
  </details>
}
