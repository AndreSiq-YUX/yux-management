import { CrmInstanceProvisioningPanel } from '@/components/platform/CrmInstanceProvisioningPanel'

export function CrmGovernancePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal text-gray-900">Governanca CRM</h1>
        <p className="mt-1 text-sm text-gray-600">
          Controle comercial de instancias, limites, blueprints e permissoes por contrato.
        </p>
      </div>
      <CrmInstanceProvisioningPanel />
    </div>
  )
}
