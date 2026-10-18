import { useState } from 'react'
import toast from 'react-hot-toast'
import { KeyRound, Loader2, LogOut } from 'lucide-react'
import { PageHeader, PendingSection, SectionCard, portalButtonClasses } from '@/components/portal-ui'
import { roleLabel } from '@/lib/client-portal/portalDisplay'
import { requestPasswordReset } from '@/services/backendAuthService'
import { useAuthStore } from '@/stores/authStore'
import { usePlatformStore } from '@/stores/platformStore'

export function PortalAccountSettingsPage() {
  const user = useAuthStore(state => state.user)
  const logout = useAuthStore(state => state.logout)
  const platformRole = usePlatformStore(state => state.role)
  const [resetting, setResetting] = useState(false)

  const role = roleLabel(platformRole?.key || user?.role)

  async function resetPassword() {
    if (!user?.email || resetting) return
    setResetting(true)
    try {
      await requestPasswordReset(user.email)
      toast.success('Enviamos um link para o seu e-mail.')
    } catch (cause) {
      console.error('Erro ao pedir redefinição de senha:', cause)
      toast.error('Não foi possível enviar o link agora. Tente novamente.')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="w-full space-y-6">
      <PageHeader title="Minha conta" lead="Seus dados de acesso e a segurança da sua conta." />

      <SectionCard id="dados-usuario" title="Seus dados" description="Para alterar o e-mail de acesso, fale com a equipe YUX.">
        <dl className="m-0 grid gap-4 text-[13.5px] sm:grid-cols-3">
          <Field label="Nome" value={user?.name || 'Não informado'} />
          <Field label="E-mail" value={user?.email || 'Não informado'} />
          <Field label="Papel" value={role} />
        </dl>
      </SectionCard>

      <SectionCard id="seguranca" title="Segurança" description="Mantenha sua conta protegida.">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void resetPassword()}
            disabled={!user?.email || resetting}
            aria-busy={resetting}
            className={portalButtonClasses('ghost')}
          >
            {resetting ? <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <KeyRound aria-hidden="true" />}
            Redefinir senha
          </button>
          <button type="button" onClick={() => void logout()} className={portalButtonClasses('ghost')}>
            <LogOut aria-hidden="true" />
            Sair
          </button>
        </div>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2">
        <PendingSection
          code="B7"
          title="Notificações"
          description="Escolha quais avisos receber por e-mail e no portal."
          message="As preferências de notificação estão em implantação e serão liberadas em breve."
        />
        <PendingSection
          code="B7"
          title="Sessões ativas"
          description="Veja e encerre as sessões abertas em outros dispositivos."
          message="O controle de sessões ativas está em implantação e será liberado em breve."
        />
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-yx-fg-3">{label}</dt>
      <dd className="m-0 mt-1 break-words font-medium text-yx-fg">{value}</dd>
    </div>
  )
}
