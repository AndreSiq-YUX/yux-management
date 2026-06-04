import { Activity, Bot, Boxes, Building2, FileCheck2, Mail, PlugZap } from 'lucide-react'
import { AdminMetricCard } from '@/components/platform/admin/AdminMetricCard'
import { AdminQuickActions } from '@/components/platform/admin/AdminQuickActions'

const quickActions = [
  {
    label: 'Contratos e limites',
    description: 'Gerenciar modulos contratados e quotas por cliente.',
    href: '/contracts',
    icon: FileCheck2,
  },
  {
    label: 'Integracoes',
    description: 'Configurar provedores globais e por cliente.',
    href: '/admin/integrations',
    icon: PlugZap,
  },
  {
    label: 'Email/SMTP2GO',
    description: 'Gerenciar conta master, subcontas, dominios e envios.',
    href: '/admin/email',
    icon: Mail,
  },
  {
    label: 'IA/LLM',
    description: 'Controlar provedores, modelos, custos e uso por modulo.',
    href: '/admin/ai',
    icon: Bot,
  },
]

export function AdminHubPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin YUX Hub</h1>
        <p className="text-gray-600">
          Controle central de clientes, contratos, modulos, limites e integracoes.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard
          label="Clientes"
          value="-"
          detail="Carregando via servico administrativo"
          icon={Building2}
        />
        <AdminMetricCard
          label="Contratos ativos"
          value="-"
          detail="Base comercial da plataforma"
          icon={FileCheck2}
        />
        <AdminMetricCard
          label="Modulos ativos"
          value="-"
          detail="CRM, Automacoes, Suporte e mais"
          icon={Boxes}
        />
        <AdminMetricCard
          label="Saude"
          value="-"
          detail="Integracoes, IA, email e webhooks"
          icon={Activity}
        />
      </div>

      <AdminQuickActions actions={quickActions} />
    </div>
  )
}
