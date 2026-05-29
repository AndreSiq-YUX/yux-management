export function LeadsPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
          <p className="text-gray-600">Gerencie seu pipeline de vendas</p>
        </div>
        <button className="bg-yux-600 text-white px-4 py-2 rounded-md hover:bg-yux-700">
          Novo Lead
        </button>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <p className="text-gray-500 text-center py-8">
          Módulo de leads em desenvolvimento...
        </p>
      </div>
    </div>
  )
}