import { ShieldCheck, UserCog } from 'lucide-react'

const sections = [
  'Notificacoes',
  'Preferencias pessoais',
  'Seguranca',
  'Idioma',
  'Sessoes',
  'Dados do usuario',
]

export function PortalAccountSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuracoes da Conta</h1>
        <p className="mt-1 text-sm text-gray-600">
          Preferencias pessoais do usuario. Dados da empresa, equipe, integracoes e base de conhecimento ficam na area Empresa.
        </p>
      </div>

      <section className="rounded-lg border bg-white p-5">
        <div className="flex items-start gap-3">
          <UserCog className="mt-0.5 h-5 w-5 text-yux-700" />
          <div>
            <h2 className="font-semibold text-gray-900">Escopo desta area</h2>
            <p className="mt-1 text-sm text-gray-600">
              Esta pagina nao gerencia a empresa. Ela concentra apenas preferencias e seguranca do usuario logado.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {sections.map(section => (
            <div key={section} className="rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {section}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4" />
          <p>
            Alteracoes de seguranca e acesso da empresa devem ser tratadas em Empresa. Esta area fica limitada ao usuario logado.
          </p>
        </div>
      </section>
    </div>
  )
}
