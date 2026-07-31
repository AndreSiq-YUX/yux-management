import { UsersRound } from 'lucide-react'

export function CrmTeamsPanel() {
  return (
    <section className="rounded-lg border bg-white p-4">
      <div className="flex items-center gap-2">
        <UsersRound className="h-4 w-4 text-emerald-600" />
        <h2 className="text-base font-semibold text-gray-900">Equipes comerciais</h2>
      </div>
      <p className="mt-2 text-sm text-gray-600">
        Equipes definem visibilidade, distribuicao de leads e supervisao por gerente.
      </p>
    </section>
  )
}
