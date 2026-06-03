export function CrmSeatUsagePanel() {
  return (
    <section className="rounded-lg border bg-white p-4">
      <h2 className="text-base font-semibold text-gray-900">Assentos contratados</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          ['Vendedores', '0 / 0'],
          ['Gerentes', '0 / 0'],
          ['Admins', '0 / 0'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border p-3">
            <div className="text-sm text-gray-500">{label}</div>
            <div className="mt-1 text-lg font-semibold text-gray-900">{value}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
