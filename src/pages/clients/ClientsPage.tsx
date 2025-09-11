import React, { useState, useEffect } from 'react';
import { apiService } from '@/services/api';
import { Search, Plus, Eye, Edit, Trash2, Filter, Download, ChevronDown, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { Client, ClientFilters as ClientFiltersType, ClientStats as ClientStatsType } from '@/types/client';
import { ClientFormModal } from '@/components/clients/ClientFormModal';
import { ClientDetailsModal } from '@/components/clients/ClientDetailsModal';
import { ClientFilters } from '@/components/clients/ClientFilters';
import { ClientStats } from '@/components/clients/ClientStats';
import { ClientImportModal } from '@/components/clients/ClientImportModal';

export function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  
  // Estados dos modais
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  
  // Estados dos filtros
  const [filters, setFilters] = useState<ClientFiltersType>({});
  
  // Estados das estatísticas
  const [stats, setStats] = useState<ClientStatsType>({
    totalClients: 0,
    activeClients: 0,
    totalRevenue: 0,
    averageValue: 0,
    newClientsThisMonth: 0,
    conversionRate: 0
  });
  const [statsLoading, setStatsLoading] = useState(false);
  
  // Estados da exportação
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [exporting, setExporting] = useState(false);
  
  // Estados da importação
  const [showImportModal, setShowImportModal] = useState(false);

  const fetchStats = async () => {
    try {
      setStatsLoading(true);
      const response = await apiService.getClientStats();
      
      if (response.success && response.data) {
        setStats(response.data as ClientStatsType);
      }
    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchClients = async (page = 1, search = '', currentFilters = filters) => {
    try {
      setLoading(true);
      
      // Construir parâmetros da API incluindo filtros
      const params: any = {
        page,
        limit: 10,
        search: search || undefined
      };
      
      // Adicionar filtros aos parâmetros
      if (currentFilters.sector) params.sector = currentFilters.sector;
      if (currentFilters.sizes?.length) params.sizes = currentFilters.sizes;
      if (currentFilters.leadSources?.length) params.leadSources = currentFilters.leadSources;
      if (currentFilters.statuses?.length) params.statuses = currentFilters.statuses;
      if (currentFilters.minValue) params.minValue = currentFilters.minValue;
      if (currentFilters.maxValue) params.maxValue = currentFilters.maxValue;
      if (currentFilters.startDate) params.startDate = currentFilters.startDate;
      if (currentFilters.endDate) params.endDate = currentFilters.endDate;
      
      const response = await apiService.getClients(params);
      
      if (response.success && response.data) {
        setClients((response.data as any).clients || [])
        setTotalPages((response.data as any).pagination?.totalPages || 1)
        setCurrentPage(page)
      }
    } catch (error) {
      toast.error('Erro ao carregar clientes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchClients()
    fetchStats()
  }, [])

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showExportDropdown) {
        setShowExportDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showExportDropdown]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchClients(1, searchTerm)
  }

  // Funções dos modais
  const handleNewClient = () => {
    setSelectedClient(null);
    setShowFormModal(true);
  };

  const handleEditClient = (client: Client) => {
    setSelectedClient(client);
    setShowFormModal(true);
  };

  const handleViewClient = (client: Client) => {
    setSelectedClient(client);
    setShowDetailsModal(true);
  };

  const handleDeleteClient = async (clientId: string) => {
    try {
      const response = await apiService.deleteClient(clientId);
      if (response.success) {
        toast.success('Cliente excluído com sucesso!');
        fetchClients(currentPage, searchTerm);
      } else {
        toast.error(response.error?.message || 'Erro ao excluir cliente');
      }
    } catch (error) {
      toast.error('Erro ao excluir cliente');
      console.error('Erro:', error);
    }
  };

  const handleModalSuccess = () => {
    fetchClients(currentPage, searchTerm);
  };

  const closeModals = () => {
    setShowFormModal(false);
    setShowDetailsModal(false);
    setSelectedClient(null);
  };

  // Funções dos filtros
  const handleFiltersChange = (newFilters: ClientFiltersType) => {
    setFilters(newFilters);
    setCurrentPage(1);
    fetchClients(1, searchTerm, newFilters);
  };

  const handleClearFilters = () => {
    setFilters({});
    setCurrentPage(1);
    fetchClients(1, searchTerm, {});
  };

  // Funções de exportação
  const handleExportCSV = async () => {
    try {
      setExporting(true);
      setShowExportDropdown(false);
      const response = await apiService.exportClients('csv', filters);
      
      if (response.success && response.data) {
        // Criar e baixar o arquivo CSV
        const blob = new Blob([response.data], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `clientes_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        toast.success('Dados exportados com sucesso!');
      }
    } catch (error) {
      toast.error('Erro ao exportar dados');
      console.error('Erro:', error);
    } finally {
      setExporting(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      setShowExportDropdown(false);
      const response = await apiService.exportClients('excel', filters);
      
      if (response.success && response.data) {
        // Criar e baixar o arquivo Excel
        const blob = new Blob([response.data], { 
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `clientes_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        toast.success('Dados exportados com sucesso!');
      }
    } catch (error) {
      toast.error('Erro ao exportar dados');
      console.error('Erro:', error);
    } finally {
      setExporting(false);
    }
  };

  // Funções da importação
  const handleImportSuccess = () => {
    setShowImportModal(false);
    fetchClients(1, searchTerm, filters);
    fetchStats();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-800'
      case 'PLANNING': return 'bg-blue-100 text-blue-800'
      case 'REVIEW': return 'bg-yellow-100 text-yellow-800'
      case 'COMPLETED': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getSizeLabel = (size: string) => {
    switch (size) {
      case 'small': return 'Pequena'
      case 'medium': return 'Média'
      case 'large': return 'Grande'
      default: return size
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-600">Gerencie seus clientes e relacionamentos</p>
        </div>
        <div className="flex space-x-3">
            <button
              onClick={() => setShowImportModal(true)}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center space-x-2"
            >
              <Upload className="h-4 w-4" />
              <span>Importar</span>
            </button>
            <button
              onClick={handleNewClient}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>Novo Cliente</span>
            </button>
          </div>
      </div>

      {/* Estatísticas */}
      <ClientStats stats={stats} loading={statsLoading} />

      {/* Search and Filters */}
      <div className="bg-white shadow rounded-lg p-6">
        <form onSubmit={handleSearch} className="flex space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Buscar por empresa, contato ou email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-yux-600 text-white rounded-md hover:bg-yux-700"
          >
            Buscar
          </button>
          <ClientFilters
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onClearFilters={handleClearFilters}
          />
          <div className="relative">
            <button
              onClick={() => setShowExportDropdown(!showExportDropdown)}
              disabled={exporting}
              className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="h-4 w-4" />
              <span>{exporting ? 'Exportando...' : 'Exportar'}</span>
              <ChevronDown className="h-4 w-4" />
            </button>
            
            {showExportDropdown && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-10">
                <div className="py-1">
                  <button
                    onClick={handleExportCSV}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Exportar como CSV
                  </button>
                  <button
                    onClick={handleExportExcel}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Exportar como Excel
                  </button>
                </div>
              </div>
            )}
          </div>
        </form>
      </div>

      {/* Clients List */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-yux-600" />
          </div>
        ) : clients.length === 0 ? (
          <div className="text-center py-12">
            <Building2 className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Nenhum cliente encontrado</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm ? 'Tente ajustar sua busca' : 'Comece adicionando um novo cliente'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cliente
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contato
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Setor
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Projetos
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Valor Total
                    </th>
                    <th className="relative px-6 py-3">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {clients.map((client) => (
                    <tr key={client.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-yux-100 flex items-center justify-center">
                              <Building2 className="h-5 w-5 text-yux-600" />
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {client.companyName}
                            </div>
                            <div className="text-sm text-gray-500">
                              {getSizeLabel(client.size)} • {client.leadSource}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{client.contactName}</div>
                        <div className="text-sm text-gray-500 flex items-center space-x-1">
                          <Mail className="h-3 w-3" />
                          <span>{client.email}</span>
                        </div>
                        {client.phone && (
                          <div className="text-sm text-gray-500 flex items-center space-x-1">
                            <Phone className="h-3 w-3" />
                            <span>{client.phone}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{client.sector}</div>
                        {client.website && (
                          <div className="text-sm text-gray-500 flex items-center space-x-1">
                            <Globe className="h-3 w-3" />
                            <a 
                              href={client.website} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="hover:text-yux-600"
                            >
                              Site
                            </a>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {client.projects?.length || 0} projeto(s)
                        </div>
                        {client.projects && client.projects.length > 0 && (
                          <div className="flex space-x-1 mt-1">
                            {client.projects.slice(0, 2).map((project) => (
                              <span
                                key={project.id}
                                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(project.status)}`}
                              >
                                {project.status}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {client.lifetimeValue 
                          ? `R$ ${client.lifetimeValue.toLocaleString()}`
                          : '-'
                        }
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          <button 
                            onClick={() => handleViewClient(client)}
                            className="text-yux-600 hover:text-yux-900"
                            title="Visualizar cliente"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => handleEditClient(client)}
                            className="text-gray-600 hover:text-gray-900"
                            title="Editar cliente"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={() => handleDeleteClient(client.id)}
                            className="text-red-600 hover:text-red-900"
                            title="Excluir cliente"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                <div className="flex-1 flex justify-between sm:hidden">
                  <button
                    onClick={() => fetchClients(currentPage - 1, searchTerm)}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => fetchClients(currentPage + 1, searchTerm)}
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
                        onClick={() => fetchClients(currentPage - 1, searchTerm)}
                        disabled={currentPage === 1}
                        className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Anterior
                      </button>
                      <button
                        onClick={() => fetchClients(currentPage + 1, searchTerm)}
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
          </>
        )}
</div>
      </div>

      {/* Modais */}
      <ClientFormModal
        isOpen={showFormModal}
        onClose={closeModals}
        onSuccess={handleModalSuccess}
        client={selectedClient}
      />

      <ClientDetailsModal
        isOpen={showDetailsModal}
        onClose={closeModals}
        onEdit={handleEditClient}
        onDelete={handleDeleteClient}
        client={selectedClient}
      />

      <ClientImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={handleImportSuccess}
      />
    </div>
  )
}