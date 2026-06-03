import type { CrmMigrationStrategy } from '@/types/crm'

interface CrmPublicationWizardProps {
  impactedOpenLeadCount: number
  selectedStrategy?: CrmMigrationStrategy
}

export function CrmPublicationWizard({ impactedOpenLeadCount, selectedStrategy }: CrmPublicationWizardProps) {
  const requiresStrategy = impactedOpenLeadCount > 0

  return (
    <section className="rounded-lg border bg-white p-4">
      <h2 className="text-base font-semibold text-gray-900">Publicacao da versao</h2>
      <p className="mt-2 text-sm text-gray-600">
        {impactedOpenLeadCount} leads abertos impactados pela nova configuracao.
      </p>
      <div className="mt-4 grid gap-2">
        <label className="rounded-md border p-3 text-sm text-gray-700">Manter leads existentes</label>
        <label className="rounded-md border p-3 text-sm text-gray-700">Migrar todos os leads</label>
        <label className="rounded-md border p-3 text-sm text-gray-700">Migrar apenas leads abertos</label>
        <label className="rounded-md border p-3 text-sm text-gray-700">Mapear etapas antigas para novas</label>
      </div>
      <button
        className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        disabled={requiresStrategy && !selectedStrategy}
      >
        Publicar versao
      </button>
    </section>
  )
}
