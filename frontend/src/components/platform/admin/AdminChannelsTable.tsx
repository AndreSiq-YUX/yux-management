import type { AdminChannelConnectionRow } from '@/services/adminPlatformService'

export function AdminChannelsTable({ rows }: { rows: AdminChannelConnectionRow[] }) {
  return (
    <section className="rounded-lg border bg-white">
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold text-gray-900">Canais Meta por cliente</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Canal</th>
              <th className="px-4 py-3">Conta</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Token</th>
              <th className="px-4 py-3">Webhook</th>
              <th className="px-4 py-3">Ultimo evento</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map(row => (
              <tr key={row.id}>
                <td className="px-4 py-3 font-medium text-gray-900">{row.organizationName}</td>
                <td className="px-4 py-3">{row.channel}</td>
                <td className="px-4 py-3">{row.displayName}</td>
                <td className="px-4 py-3">{row.healthStatus}</td>
                <td className="px-4 py-3">{row.tokenState || '-'}</td>
                <td className="px-4 py-3">{row.providerVerifyState || '-'}</td>
                <td className="px-4 py-3">{row.lastEventAt ? new Date(row.lastEventAt).toLocaleString('pt-BR') : '-'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-sm text-gray-500" colSpan={7}>Nenhum canal Meta conectado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
