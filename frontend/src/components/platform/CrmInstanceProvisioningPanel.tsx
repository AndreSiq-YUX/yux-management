import { Settings2, ShieldCheck, Users } from 'lucide-react'

export function CrmInstanceProvisioningPanel() {
  return (
    <section className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            Instancias por contrato
          </div>
          <p className="mt-2 text-sm text-gray-600">
            Cada contrato com modulo CRM ativo recebe uma instancia isolada, com setor, blueprint e status proprios.
          </p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
            <Users className="h-4 w-4 text-emerald-600" />
            Limites de vendedores
          </div>
          <p className="mt-2 text-sm text-gray-600">
            YUX define vendedores, gerentes e admins contratados antes do cliente convidar sua equipe.
          </p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
            <Settings2 className="h-4 w-4 text-violet-600" />
            Blueprint setorial
          </div>
          <p className="mt-2 text-sm text-gray-600">
            O blueprint inicia funis, campos, categorias, mensagens e presets sem travar a personalizacao consultiva.
          </p>
        </div>
      </div>
    </section>
  )
}
