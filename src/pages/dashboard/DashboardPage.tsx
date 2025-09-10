import { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { 
  TrendingUp, 
  Users, 
  FolderOpen, 
  DollarSign,
  Calendar,
  Loader2
} from 'lucide-react'

interface DashboardData {
  overview: {
    totalUsers: number;
    totalClients: number;
    totalProjects: number;
    totalLeads: number;
    totalCampaigns: number;
    activeProjects: number;
    qualifiedLeads: number;
  };
  financial: {
    totalRevenue: number;
    totalBudget: number;
    totalCampaignSpent: number;
    budgetUtilization: number;
  };
  marketing: {
    totalImpressions: number;
    totalClicks: number;
    ctr: number;
    avgROAS: number;
  };
  conversion: {
    leadConversionRate: number;
    projectCompletionRate: number;
  };
  recent: {
    projects: Array<{
      id: string;
      name: string;
      client: string;
      status: string;
      progress: number;
    }>;
    leads: Array<{
      id: string;
      name: string;
      company: string;
      stage: string;
      value: number;
    }>;
    tasks: Array<{
      id: string;
      title: string;
      date: string;
      type: string;
    }>;
  };
}

export function DashboardPage() {
  const { user } = useAuthStore()
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // Mock data for now since supabaseService might not be fully implemented
        const mockData: DashboardData = {
          overview: {
            totalUsers: 5,
            totalClients: 2,
            totalProjects: 3,
            totalLeads: 3,
            totalCampaigns: 3,
            activeProjects: 1,
            qualifiedLeads: 2,
          },
          financial: {
            totalRevenue: 78000,
            totalBudget: 100000,
            totalCampaignSpent: 7150,
            budgetUtilization: 78,
          },
          marketing: {
            totalImpressions: 281000,
            totalClicks: 5620,
            ctr: 2.0,
            avgROAS: 2.83,
          },
          conversion: {
            leadConversionRate: 66.7,
            projectCompletionRate: 33.3,
          },
          recent: {
            projects: [
              {
                id: '1',
                name: 'Website Institucional ABC',
                client: 'Empresa ABC Ltda',
                status: 'ACTIVE',
                progress: 75,
              },
              {
                id: '2',
                name: 'Sistema de E-commerce XYZ',
                client: 'XYZ Corporation',
                status: 'PLANNING',
                progress: 25,
              },
            ],
            leads: [
              {
                id: '1',
                name: 'Pedro Oliveira',
                company: 'Startup Inovadora',
                stage: 'QUALIFIED',
                value: 20000,
              },
              {
                id: '2',
                name: 'Ana Costa',
                company: 'Loja Online',
                stage: 'PROPOSAL',
                value: 12000,
              },
            ],
            tasks: [
              {
                id: '1',
                title: 'Reunião com cliente ABC',
                date: new Date().toISOString(),
                type: 'meeting',
              },
              {
                id: '2',
                title: 'Entrega do protótipo XYZ',
                date: new Date(Date.now() + 86400000).toISOString(),
                type: 'delivery',
              },
            ],
          },
        }
        
        setDashboardData(mockData)
      } catch (error) {
        console.error('Error fetching dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Loader2 className="h-8 w-8 animate-spin text-yux-600" />
      </div>
    )
  }

  if (!dashboardData) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Erro ao carregar dados do dashboard</p>
      </div>
    )
  }

  const stats = [
    {
      name: 'Receita Total',
      value: `R$ ${dashboardData.financial.totalRevenue.toLocaleString()}`,
      change: `${dashboardData.financial.budgetUtilization}% do orçamento`,
      changeType: 'neutral',
      icon: DollarSign,
    },
    {
      name: 'Projetos Ativos',
      value: dashboardData.overview.activeProjects.toString(),
      change: `${dashboardData.overview.totalProjects} total`,
      changeType: 'positive',
      icon: FolderOpen,
    },
    {
      name: 'Leads Qualificados',
      value: dashboardData.overview.qualifiedLeads.toString(),
      change: `${dashboardData.conversion.leadConversionRate}% conversão`,
      changeType: 'positive',
      icon: Users,
    },
    {
      name: 'ROAS Médio',
      value: `${dashboardData.marketing.avgROAS.toFixed(1)}x`,
      change: `${dashboardData.marketing.ctr.toFixed(2)}% CTR`,
      changeType: dashboardData.marketing.avgROAS >= 2 ? 'positive' : 'negative',
      icon: TrendingUp,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Welcome section */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Bem-vindo, {user?.name || 'Usuário'}!
        </h1>
        <p className="text-gray-600">
          Aqui está um resumo das suas atividades hoje.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.name}
            className="relative overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:px-6 sm:py-6"
          >
            <dt>
              <div className="absolute rounded-md bg-yux-500 p-3">
                <stat.icon className="h-6 w-6 text-white" aria-hidden="true" />
              </div>
              <p className="ml-16 truncate text-sm font-medium text-gray-500">
                {stat.name}
              </p>
            </dt>
            <dd className="ml-16 flex items-baseline">
              <p className="text-2xl font-semibold text-gray-900">{stat.value}</p>
              <p
                className={`ml-2 flex items-baseline text-sm font-semibold ${
                  stat.changeType === 'positive'
                    ? 'text-green-600'
                    : stat.changeType === 'negative'
                    ? 'text-red-600'
                    : 'text-gray-600'
                }`}
              >
                {stat.change}
              </p>
            </dd>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Projects */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Projetos Recentes
            </h3>
            <div className="space-y-4">
              {dashboardData.recent.projects.map((project) => (
                <div key={project.id} className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {project.name}
                    </p>
                    <p className="text-sm text-gray-500">{project.client}</p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="text-sm text-gray-500">{project.progress}%</span>
                    <div className="w-16 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-yux-600 h-2 rounded-full"
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Upcoming Tasks */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Próximas Tarefas
            </h3>
            <div className="space-y-4">
              {dashboardData.recent.tasks.map((task) => (
                <div key={task.id} className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    <Calendar className="h-5 w-5 text-gray-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {task.title}
                    </p>
                    <p className="text-sm text-gray-500">
                      {new Date(task.date).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Campaign Performance */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Performance de Campanhas
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="text-center">
              <div className="text-2xl font-bold text-yux-600">
                R$ {dashboardData.financial.totalCampaignSpent.toLocaleString()}
              </div>
              <div className="text-sm text-gray-500">Investimento Total</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {dashboardData.marketing.totalImpressions.toLocaleString()}
              </div>
              <div className="text-sm text-gray-500">Impressões</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {dashboardData.marketing.avgROAS.toFixed(1)}x
              </div>
              <div className="text-sm text-gray-500">ROAS Médio</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}