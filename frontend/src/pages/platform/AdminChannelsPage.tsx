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

      {loading && <p className="text-sm text-gray-600">Carregando canais...</p>}
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {!loading && !error && <AdminChannelsTable rows={rows} />}
    </div>
  )
}
