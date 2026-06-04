import { useEffect, useMemo, useState } from 'react'
import { ClientModuleLimitsPanel } from '@/components/platform/admin/ClientModuleLimitsPanel'
import { PLATFORM_MODULES } from '@/lib/platform/moduleRegistry'
import { platformService } from '@/services/platformService'
import type { ContractDetails } from '@/types/platform'

interface ContractModulesPanelProps {
  contract: ContractDetails | null
  onChange: () => void
}

export function ContractModulesPanel({ contract, onChange }: ContractModulesPanelProps) {
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [selectedLimitModule, setSelectedLimitModule] = useState<string | null>(null)
  const enabledModules = useMemo(() => {
    return new Set(contract?.modules.filter(module => module.enabled).map(module => module.moduleKey) || [])
  }, [contract])

  useEffect(() => {
    setSelectedLimitModule(null)
  }, [contract?.id])

  async function handleToggle(moduleKey: string, current: boolean) {
    if (!contract || savingKey) return

    setSavingKey(moduleKey)
    try {
      await platformService.setContractModule(contract.id, moduleKey, !current)
      onChange()
    } catch (error) {
      console.error('Error updating contract module:', error)
    } finally {
      setSavingKey(null)
    }
  }

  if (!contract) {
    return (
      <section className="rounded-lg border bg-white p-4 text-sm text-gray-500">
        Selecione um contrato para gerenciar modulos.
      </section>
    )
  }

  return (
    <section className="rounded-lg border bg-white">
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold text-gray-900">Modulos do contrato</h2>
        <p className="text-sm text-gray-500">{contract.name || contract.id}</p>
      </div>

      <div className="divide-y">
        {PLATFORM_MODULES.map(module => {
          const checked = enabledModules.has(module.key)
          const isSaving = savingKey === module.key
          const isLimitsOpen = selectedLimitModule === module.key

          return (
            <div key={module.key}>
              <label
                className={`flex cursor-pointer items-center justify-between gap-4 px-4 py-3 ${
                  isSaving ? 'opacity-60' : ''
                }`}
              >
                <span>
                  <span className="block text-sm font-medium text-gray-900">{module.name}</span>
                  <span className="block text-xs text-gray-500">{module.key}</span>
                </span>
                <span className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-expanded={isLimitsOpen}
                    className="text-xs font-medium text-yux-700 hover:text-yux-800"
                    onClick={event => {
                      event.preventDefault()
                      event.stopPropagation()
                      setSelectedLimitModule(current => current === module.key ? null : module.key)
                    }}
                  >
                    Limites
                  </button>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={Boolean(savingKey)}
                    onChange={() => handleToggle(module.key, checked)}
                    className="h-4 w-4 rounded border-gray-300 text-yux-600 focus:ring-yux-500"
                  />
                </span>
              </label>
              {contract && isLimitsOpen && (
                <ClientModuleLimitsPanel
                  organizationId={contract.clientId}
                  contractId={contract.id}
                  moduleKey={module.key}
                />
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
