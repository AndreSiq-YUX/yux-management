import { Link } from 'react-router-dom'
import { ArrowLeft, LockKeyhole } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'

interface PortalSafeStatePageProps {
  title: string
  description: string
  capabilities: string[]
  backTo?: string
}

export function PortalSafeStatePage({
  title,
  description,
  capabilities,
  backTo = '/portal',
}: PortalSafeStatePageProps) {
  const portalPath = usePortalWorkspacePath()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">{description}</p>
        </div>
        <Button variant="outline" asChild>
          <Link to={portalPath(backTo)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Link>
        </Button>
      </div>

      <section className="rounded-lg border bg-white p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-yux-50 p-2 text-yux-700">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Modulo protegido no portal</h2>
            <p className="mt-1 text-sm text-gray-600">
              Esta tela mostra apenas informacoes liberadas para o contrato atual. Dados internos e configuracoes sensiveis permanecem restritos a operacao YUX.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {capabilities.map(capability => (
            <div key={capability} className="rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {capability}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
