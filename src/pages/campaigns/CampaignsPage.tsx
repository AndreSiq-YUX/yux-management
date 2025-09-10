import { useState, useEffect } from 'react'
import { apiService } from '@/services/api'
import { 
  RefreshCw, 
  MoreHorizontal, 
  TrendingUp,
  TrendingDown,
  Eye,
  MousePointer,
  Target,
  Loader2,
  Play,
  Pause,
  Settings
} from 'lucide-react'
import toast from 'react-hot-toast'

interface Campaign {
  id: string;
  name: string;
  platform: 'GOOGLE' | 'META';
  status: 'ACTIVE' | 'PAUSED' | 'ENDED';
  budget: number;
  spent: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cpc: number;
  ctr: number;
  roas: number;
  startDate: string;
  endDate?: string;
  lastSyncAt: string;
}

export function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [platformFilter, setPlatformFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const fetchCampaigns = async (page = 1, platform = '', status = '') => {
    try {
      setLoading(true)
      const response = await apiService.getCampaigns({
        page,
        limit: 10,
        platform: platform || undefined,
        status: status || undefined
      })
      
      if (response.success && response.data) {
        setCampaigns((response.data as any).campaigns || [])
        setTotalPages((response.data as any).pagination?.totalPages || 1)
        setCurrentPage(page)
      }
    } catch (error) {
      toast.error('Erro ao carregar campanhas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCampaigns()
  }, [])

  const handleSync = async () => {
    try {
      setSyncing(true)
      const response = await apiService.syncCampaigns()
      
      if (response.success && response.data) {
        toast.success(`${(response.data as any).syncedCount || 0} campanhas sincronizadas`)
        fetchCampaigns(currentPage, platformFilter, statusFilter)
      }
    } catch (error) {
      toast.error('Erro ao sincronizar campanhas')
    } finally {
      setSyncing(false)
    }
  }

  const handleStatusChange = async (campaignId: string, newStatus: string) => {
    try {
      const response = await apiService.updateCampaignStatus(campaignId, newStatus)
      
      if (response.success) {
        toast.success('Status da campanha atualizado')
        fetchCampaigns(currentPage, platformFilter, statusFilter)
      }
    } catch (error) {
      toast.error('Erro ao atualizar status da campanha')
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-800'
      case 'PAUSED': return 'bg-yellow-100 text-yellow-800'
      case 'ENDED': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'Ativa'
      case 'PAUSED': return 'Pausada'
      case 'ENDED': return 'Finalizada'
      default: return status
    }
  }

  const getPlatformColor = (platform: string) => {
    switch (platform) {
      case 'GOOGLE': return 'bg-blue-100 text-blue-800'
      case 'META': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getPlatformLabel = (platform: string) => {
    switch (platform) {
      case 'GOOGLE': return 'Google Ads'
      case 'META': return 'Meta Ads'
      default: return platform
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value)
  }

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('pt-BR').format(value)
  }

  const getBudgetUtilization = (spent: number, budget: number) => {
    return budget > 0 ? (spent / budget) * 100 : 0
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campanhas</h1>
          <p className="text-gray-600">Monitore suas campanhas do Google Ads e Meta Ads</p>
        </div>
        <button 
          onClick={handleSync}
          disabled={syncing}
          className="bg-yux-600 text-white px-4 py-2 rounded-md hover:bg-yux-700 flex items-center space-x-2 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          <span>{syncing ? 'Sincronizando...' : 'Sincronizar Campanhas'}</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex space-x-4">
          <select
            value={platformFilter}
            onChange={(e) => {
              setPlatformFilter(e.target.value)
              fetchCampaigns(1, e.target.value, statusFilter)
            }}
            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
          >
            <option value="">Todas as plataformas</option>
            <option value="GOOGLE">Google Ads</option>
            <option value="META">Meta Ads</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              fetchCampaigns(1, platformFilter, e.target.value)
            }}
            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
          >
            <option value="">Todos os status</option>
            <option value="ACTIVE">Ativas</option>
            <option value="PAUSED">Pausadas</option>
            <option value="ENDED">Finalizadas</option>
          </select>
        </div>
      </div>

      {/* Campaigns List */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-yux-600" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-12">
            <Target className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Nenhuma campanha encontrada</h3>
            <p className="mt-1 text-sm text-gray-500">
              {platformFilter || statusFilter ? 'Tente ajustar os filtros' : 'Sincronize suas campanhas para começar'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Campanha
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Performance
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Orçamento
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Métricas
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Última Sync
                  </th>
                  <th className="relative px-6 py-3">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {campaigns.map((campaign) => (
                  <tr key={campaign.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <div className="h-10 w-10 rounded-full bg-yux-100 flex items-center justify-center">
                            <Target className="h-5 w-5 text-yux-600" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {campaign.name}
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getPlatformColor(campaign.platform)}`}>
                              {getPlatformLabel(campaign.platform)}
                            </span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(campaign.status)}`}>
                              {getStatusLabel(campaign.status)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div className="text-center">
                          <div className="flex items-center justify-center text-gray-400 mb-1">
                            <Eye className="h-3 w-3 mr-1" />
                          </div>
                          <div className="font-medium text-gray-900">
                            {formatNumber(campaign.impressions)}
                          </div>
                          <div className="text-xs text-gray-500">Impressões</div>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center text-gray-400 mb-1">
                            <MousePointer className="h-3 w-3 mr-1" />
                          </div>
                          <div className="font-medium text-gray-900">
                            {formatNumber(campaign.clicks)}
                          </div>
                          <div className="text-xs text-gray-500">Cliques</div>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center text-gray-400 mb-1">
                            <Target className="h-3 w-3 mr-1" />
                          </div>
                          <div className="font-medium text-gray-900">
                            {campaign.conversions}
                          </div>
                          <div className="text-xs text-gray-500">Conversões</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        <div className="font-medium">
                          {formatCurrency(campaign.spent)} / {formatCurrency(campaign.budget)}
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                          <div
                            className={`h-2 rounded-full ${
                              getBudgetUtilization(campaign.spent, campaign.budget) > 90
                                ? 'bg-red-500'
                                : getBudgetUtilization(campaign.spent, campaign.budget) > 75
                                ? 'bg-yellow-500'
                                : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(getBudgetUtilization(campaign.spent, campaign.budget), 100)}%` }}
                          />
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {getBudgetUtilization(campaign.spent, campaign.budget).toFixed(1)}% utilizado
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <div className="text-xs text-gray-500">CPC</div>
                          <div className="font-medium">{formatCurrency(campaign.cpc)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">CTR</div>
                          <div className="font-medium">{campaign.ctr.toFixed(2)}%</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">ROAS</div>
                          <div className={`font-medium flex items-center ${
                            campaign.roas >= 3 ? 'text-green-600' : 
                            campaign.roas >= 2 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {campaign.roas >= 2 ? (
                              <TrendingUp className="h-3 w-3 mr-1" />
                            ) : (
                              <TrendingDown className="h-3 w-3 mr-1" />
                            )}
                            {campaign.roas.toFixed(1)}x
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(campaign.lastSyncAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        {campaign.status === 'ACTIVE' ? (
                          <button
                            onClick={() => handleStatusChange(campaign.id, 'PAUSED')}
                            className="text-yellow-600 hover:text-yellow-700"
                            title="Pausar campanha"
                          >
                            <Pause className="h-4 w-4" />
                          </button>
                        ) : campaign.status === 'PAUSED' ? (
                          <button
                            onClick={() => handleStatusChange(campaign.id, 'ACTIVE')}
                            className="text-green-600 hover:text-green-700"
                            title="Ativar campanha"
                          >
                            <Play className="h-4 w-4" />
                          </button>
                        ) : null}
                        <button className="text-gray-400 hover:text-gray-600">
                          <Settings className="h-4 w-4" />
                        </button>
                        <button className="text-gray-400 hover:text-gray-600">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6 rounded-lg shadow">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => fetchCampaigns(currentPage - 1, platformFilter, statusFilter)}
              disabled={currentPage === 1}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              onClick={() => fetchCampaigns(currentPage + 1, platformFilter, statusFilter)}
              disabled={currentPage === totalPages}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              Próximo
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Página <span className="font-medium">{currentPage}</span> de{' '}
                <span className="font-medium">{totalPages}</span>
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                <button
                  onClick={() => fetchCampaigns(currentPage - 1, platformFilter, statusFilter)}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  onClick={() => fetchCampaigns(currentPage + 1, platformFilter, statusFilter)}
                  disabled={currentPage === totalPages}
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                >
                  Próximo
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}