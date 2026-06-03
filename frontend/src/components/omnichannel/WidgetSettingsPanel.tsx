import { RefreshCw, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface AdminWidgetSettings {
  name: string
  isActive: boolean
  branding: string
  consentText: string
  initialForm: string
  allowedOrigins: string[]
  embedSnippet: string
}

interface WidgetSettingsPanelProps {
  organizationId: string
  widget: AdminWidgetSettings
  onSaveWidget?: (organizationId: string) => void
  onRotateWidgetToken?: (organizationId: string) => void
}

export function WidgetSettingsPanel({ organizationId, widget, onSaveWidget, onRotateWidgetToken }: WidgetSettingsPanelProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900">Webchat</h2>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" title="Regenerar token do widget" onClick={() => onRotateWidgetToken?.(organizationId)}><RefreshCw className="mr-1 h-3 w-3" />Token</Button>
          <Button type="button" size="sm" title="Salvar widget" onClick={() => onSaveWidget?.(organizationId)}><Save className="mr-1 h-3 w-3" />Salvar</Button>
        </div>
      </div>
      <div className="grid gap-3 rounded-md border bg-white p-3 text-sm md:grid-cols-2">
        <p><span className="text-gray-500">Nome</span><br />{widget.name}</p>
        <p><span className="text-gray-500">Estado</span><br />{widget.isActive ? 'ativo' : 'inativo'}</p>
        <p><span className="text-gray-500">Branding</span><br />{widget.branding}</p>
        <p><span className="text-gray-500">Consentimento</span><br />{widget.consentText}</p>
        <p><span className="text-gray-500">Formulario inicial</span><br />{widget.initialForm}</p>
        <p><span className="text-gray-500">Allowed origins</span><br />{widget.allowedOrigins.join(', ')}</p>
        <pre className="col-span-full overflow-x-auto rounded bg-gray-50 p-2 text-xs">{widget.embedSnippet}</pre>
      </div>
    </section>
  )
}
