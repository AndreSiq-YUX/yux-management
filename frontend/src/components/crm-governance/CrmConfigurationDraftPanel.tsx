import { GitBranch, Tags, TextCursorInput } from 'lucide-react'

export function CrmConfigurationDraftPanel() {
  return (
    <section className="rounded-lg border bg-white p-4">
      <h2 className="text-base font-semibold text-gray-900">Rascunho de configuracao</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-md border p-3">
          <GitBranch className="h-4 w-4 text-blue-600" />
          <div className="mt-2 text-sm font-medium text-gray-900">Funis e etapas</div>
        </div>
        <div className="rounded-md border p-3">
          <TextCursorInput className="h-4 w-4 text-violet-600" />
          <div className="mt-2 text-sm font-medium text-gray-900">Campos personalizados</div>
        </div>
        <div className="rounded-md border p-3">
          <Tags className="h-4 w-4 text-emerald-600" />
          <div className="mt-2 text-sm font-medium text-gray-900">Categorias e perdas</div>
        </div>
      </div>
    </section>
  )
}
