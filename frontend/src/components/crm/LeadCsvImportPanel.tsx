import { useMemo, useState } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { buildCsvImportPreview } from '@/lib/crm/cockpitRules'

interface LeadCsvImportPanelProps {
  onExecute?: (csv: string) => void
}

export function LeadCsvImportPanel({ onExecute }: LeadCsvImportPanelProps) {
  const [csv, setCsv] = useState('name,email,phone,source,value\n')
  const preview = useMemo(() => buildCsvImportPreview(csv), [csv])

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Importacao CSV</h2>
        <p className="text-sm text-gray-500">Revise os leads antes de executar a importacao.</p>
      </div>
      <Textarea rows={6} value={csv} onChange={event => setCsv(event.target.value)} />
      <div className="grid gap-2 text-sm sm:grid-cols-3">
        <Metric label="Linhas" value={preview.rows.length.toString()} />
        <Metric label="Validas" value={preview.validRows.toString()} />
        <Metric label="Com erro" value={preview.invalidRows.toString()} />
      </div>
      <div className="max-h-64 overflow-auto rounded-md border">
        {preview.rows.map(row => (
          <div key={row.rowNumber} className="grid grid-cols-[80px_1fr_1fr] gap-3 border-b px-3 py-2 text-sm last:border-b-0">
            <span>#{row.rowNumber}</span>
            <span>{row.lead.name || 'Sem nome'}</span>
            <span className={row.errors.length ? 'text-red-600' : 'text-emerald-700'}>
              {row.errors.length ? row.errors.join(', ') : 'Valida'}
            </span>
          </div>
        ))}
      </div>
      <Button type="button" disabled={preview.validRows === 0} onClick={() => onExecute?.(csv)}>
        <Upload className="mr-2 h-4 w-4" />
        Executar importacao
      </Button>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-white p-3">
      <p className="text-xs uppercase text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-950">{value}</p>
    </div>
  )
}
