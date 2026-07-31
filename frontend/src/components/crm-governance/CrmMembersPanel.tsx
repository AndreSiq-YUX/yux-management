import { UserPlus } from 'lucide-react'

export function CrmMembersPanel() {
  return (
    <section className="rounded-lg border bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900">Convites e papeis</h2>
        <button className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-gray-700">
          <UserPlus className="h-4 w-4" />
          Convidar
        </button>
      </div>
      <p className="mt-2 text-sm text-gray-600">
        Admins do cliente convidam vendedores e gerentes dentro dos limites configurados pela YUX.
      </p>
    </section>
  )
}
