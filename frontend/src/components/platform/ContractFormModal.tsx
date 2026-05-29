import { useEffect, useId, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { platformService } from '@/services/platformService'
import type { Client } from '@/types/client'
import type { BillingCycle, ContractDetails, ContractStatus, PackageDefinition } from '@/types/platform'

interface ContractFormModalProps {
  open: boolean
  contract: ContractDetails | null
  clients: Client[]
  packages: PackageDefinition[]
  onClose: () => void
  onSaved: (contract: ContractDetails) => void
}

const statusOptions: ContractStatus[] = ['draft', 'active', 'paused', 'cancelled', 'completed']
const billingOptions: BillingCycle[] = ['one_time', 'monthly', 'quarterly', 'yearly']

const today = () => new Date().toISOString().split('T')[0]

export function ContractFormModal({
  open,
  contract,
  clients,
  packages,
  onClose,
  onSaved,
}: ContractFormModalProps) {
  const [clientId, setClientId] = useState('')
  const [packageId, setPackageId] = useState('')
  const [name, setName] = useState('')
  const [status, setStatus] = useState<ContractStatus>('draft')
  const [startsAt, setStartsAt] = useState(today())
  const [endsAt, setEndsAt] = useState('')
  const [value, setValue] = useState('')
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const formId = useId()

  useEffect(() => {
    if (!open) return

    setClientId(contract?.clientId || '')
    setPackageId(contract?.packageId || '')
    setName(contract?.name || '')
    setStatus(contract?.status || 'draft')
    setStartsAt(contract?.startsAt || today())
    setEndsAt(contract?.endsAt || '')
    setValue(contract?.value !== undefined ? String(contract.value) : '')
    setBillingCycle(contract?.billingCycle || 'monthly')
    setNotes(contract?.notes || '')
    setSaving(false)
  }, [contract, open])

  const canSave = useMemo(() => {
    return !saving && Boolean(clientId && packageId && name.trim())
  }, [clientId, name, packageId, saving])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSave) return

    const trimmedValue = value.trim()
    const numericValue = trimmedValue === '' ? undefined : Number(trimmedValue)
    const normalizedValue =
      numericValue !== undefined && Number.isFinite(numericValue) ? numericValue : undefined
    const commonPayload = {
      packageId,
      name: name.trim(),
      status,
      startsAt,
      billingCycle,
    }

    setSaving(true)
    try {
      const saved = contract
        ? await platformService.updateContract(contract.id, {
            ...commonPayload,
            endsAt: endsAt || null,
            value: trimmedValue === '' ? null : normalizedValue,
            notes: notes.trim() || null,
          })
        : await platformService.createContract({
            ...commonPayload,
            clientId,
            endsAt: endsAt || undefined,
            value: normalizedValue,
            notes: notes.trim() || undefined,
          })

      onSaved(saved)
      onClose()
    } catch (error) {
      console.error('Error saving contract:', error)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {contract ? 'Editar contrato' : 'Novo contrato'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Fechar modal de contrato"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label
                htmlFor={`${formId}-client`}
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Cliente *
              </label>
              <select
                id={`${formId}-client`}
                value={clientId}
                onChange={event => setClientId(event.target.value)}
                disabled={Boolean(contract)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-yux-500 focus:ring-yux-500"
              >
                <option value="">Selecione</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>
                    {client.companyName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor={`${formId}-package`}
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Pacote *
              </label>
              <select
                id={`${formId}-package`}
                value={packageId}
                onChange={event => setPackageId(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-yux-500 focus:ring-yux-500"
              >
                <option value="">Selecione</option>
                {packages.map(packageItem => (
                  <option key={packageItem.id} value={packageItem.id}>
                    {packageItem.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor={`${formId}-name`}
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Nome *
            </label>
            <input
              id={`${formId}-name`}
              value={name}
              onChange={event => setName(event.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-yux-500 focus:ring-yux-500"
              placeholder="Contrato principal"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label
                htmlFor={`${formId}-status`}
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Status
              </label>
              <select
                id={`${formId}-status`}
                value={status}
                onChange={event => setStatus(event.target.value as ContractStatus)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-yux-500 focus:ring-yux-500"
              >
                {statusOptions.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor={`${formId}-billing-cycle`}
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Ciclo
              </label>
              <select
                id={`${formId}-billing-cycle`}
                value={billingCycle}
                onChange={event => setBillingCycle(event.target.value as BillingCycle)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-yux-500 focus:ring-yux-500"
              >
                {billingOptions.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label
                htmlFor={`${formId}-starts-at`}
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Inicio
              </label>
              <input
                id={`${formId}-starts-at`}
                type="date"
                value={startsAt}
                onChange={event => setStartsAt(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-yux-500 focus:ring-yux-500"
              />
            </div>

            <div>
              <label
                htmlFor={`${formId}-ends-at`}
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Fim
              </label>
              <input
                id={`${formId}-ends-at`}
                type="date"
                value={endsAt}
                onChange={event => setEndsAt(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-yux-500 focus:ring-yux-500"
              />
            </div>

            <div>
              <label
                htmlFor={`${formId}-value`}
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Valor
              </label>
              <input
                id={`${formId}-value`}
                type="number"
                min="0"
                step="0.01"
                value={value}
                onChange={event => setValue(event.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-yux-500 focus:ring-yux-500"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor={`${formId}-notes`}
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Notas
            </label>
            <textarea
              id={`${formId}-notes`}
              value={notes}
              onChange={event => setNotes(event.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-yux-500 focus:ring-yux-500"
            />
          </div>

          <div className="flex justify-end gap-3 border-t pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="rounded-md bg-yux-600 px-4 py-2 text-sm font-medium text-white hover:bg-yux-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
