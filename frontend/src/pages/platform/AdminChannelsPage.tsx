import { useEffect, useState } from 'react'
import { AdminChannelsTable } from '@/components/platform/admin/AdminChannelsTable'
import { adminPlatformService, type AdminChannelConnectionRow } from '@/services/adminPlatformService'

export function AdminChannelsPage() {
  const [rows, setRows] = useState<AdminChannelConnectionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    adminPlatformService.getAdminChannelConnections()
      .then(nextRows => {
        if (active) setRows(nextRows)
      })
      .catch(error => {
        console.error('Erro ao carregar canais Meta:', error)
        if (active) setError('Nao foi possivel carregar canais conectados.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Canais conectados</h1>
        <p className="text-gray-600">Governanca global de WhatsApp, Instagram Direct e Facebook Messenger.</p>
      </div>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="font-semibold text-gray-900">Como as contas sao conectadas</h2>
        <p className="mt-1 text-sm text-gray-600">
          A autorizacao de WhatsApp, Instagram e Facebook acontece no portal do cliente, em Canais conectados. O Admin YUX Hub acompanha status, saude, reautenticacao e clientes sem conexoes ativas nesta visao.
        </p>
        <div className="mt-3 grid gap-3 text-sm text-gray-700 md:grid-cols-3">
          <div className="rounded-md border bg-gray-50 p-3">
            <strong className="text-gray-900">1. Cliente autoriza</strong>
            <p className="mt-1">O cliente abre o fluxo oficial da Meta e seleciona numeros, contas ou paginas.</p>
          </div>
          <div className="rounded-md border bg-gray-50 p-3">
            <strong className="text-gray-900">2. YUX Hub monitora</strong>
            <p className="mt-1">Esta tela mostra token, webhook, ultimo evento e falhas de saude por cliente.</p>
          </div>
          <div className="rounded-md border bg-gray-50 p-3">
            <strong className="text-gray-900">3. Operacao corrige</strong>
            <p className="mt-1">Contas em stale, failed ou needs_reauth devem ser reautenticadas pelo portal.</p>
          </div>
        </div>
      </section>

      {loading && <p className="text-sm text-gray-600">Carregando canais...</p>}
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {!loading && !error && <AdminChannelsTable rows={rows} />}
    </div>
  )
}
