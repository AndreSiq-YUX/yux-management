import { useState, useEffect } from 'react'
import { apiService } from '@/services/api'
import { 
  Plus, 
  Search, 
  MoreHorizontal, 
  FolderOpen, 
  Calendar,
  DollarSign,
  User,
  Loader2,
  Clock
} from 'lucide-react'
import toast from 'react-hot-toast'

interface Project {
  id: string;
  name: string;
  description: string;
  status: 'PLANNING' | 'ACTIVE' | 'REVIEW' | 'COMPLETED' | 'CANCELLED';
  serviceLevel: number;
  startDate: string;
  expectedEndDate: string;
  actualEndDate?: string;
  budget: number;
  progress?: number;
  client: {
    id: string;
    companyName: string;
    contactName: string;
  };
  phases?: Array<{
    id: string;
    name: string;
    status: string;
  }>;
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const fetchProjects = async (page = 1, search = '', status = '') => {
    try {
      setLoading(true)
      const response = await apiService.getProjects({
        page,
        limit: 10,
        search: search || undefined,
        status: status || undefined
      })
      
      if (response.success && response.data) {
        const data = response.data as { projects?: Project[]; pagination?: { totalPages: number } };
        setProjects(data.projects || [])
        setTotalPages(data.pagination?.totalPages || 1)
        setCurrentPage(page)
      }
    } catch (error) {
      toast.error('Erro ao carregar projetos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProjects()
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchProjects(1, searchTerm, statusFilter)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-800'
      case 'PLANNING': return 'bg-blue-100 text-blue-800'
      case 'REVIEW': return 'bg-yellow-100 text-yellow-800'
      case 'COMPLETED': return 'bg-gray-100 text-gray-800'
      case 'CANCELLED': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'PLANNING': return 'Planejamento'
      case 'ACTIVE': return 'Ativo'
      case 'REVIEW': return 'Revisão'
      case 'COMPLETED': return 'Concluído'
      case 'CANCELLED': return 'Cancelado'
      default: return status
    }
  }

  const getServiceLevelLabel = (level: number) => {
    switch (level) {
      case 1: return 'Básico'
      case 2: return 'Intermediário'
      case 3: return 'Avançado'
      default: return `Nível ${level}`
    }
  }

  const isOverdue = (expectedEndDate: string, status: string) => {
    if (status === 'COMPLETED' || status === 'CANCELLED') return false
    return new Date(expectedEndDate) < new Date()
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projetos</h1>
          <p className="text-gray-600">Acompanhe o progresso de todos os projetos</p>
        </div>
        <button className="bg-yux-600 text-white px-4 py-2 rounded-md hover:bg-yux-700 flex items-center space-x-2">
          <Plus className="h-4 w-4" />
          <span>Novo Projeto</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="bg-white shadow rounded-lg p-6">
        <form onSubmit={handleSearch} className="flex space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Buscar por nome do projeto ou cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-yux-500 focus:border-yux-500"
          >
            <option value="">Todos os status</option>
            <option value="PLANNING">Planejamento</option>
            <option value="ACTIVE">Ativo</option>
            <option value="REVIEW">Revisão</option>
            <option value="COMPLETED">Concluído</option>
            <option value="CANCELLED">Cancelado</option>
          </select>
          <button
            type="submit"
            className="px-4 py-2 bg-yux-600 text-white rounded-md hover:bg-yux-700"
          >
            Buscar
          </button>
        </form>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <div className="col-span-full flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-yux-600" />
          </div>
        ) : projects.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <FolderOpen className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Nenhum projeto encontrado</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm || statusFilter ? 'Tente ajustar sua busca' : 'Comece criando um novo projeto'}
            </p>
          </div>
        ) : (
          projects.map((project) => (
            <div key={project.id} className="bg-white shadow rounded-lg overflow-hidden hover:shadow-md transition-shadow">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                    {getStatusLabel(project.status)}
                  </span>
                  <button className="text-gray-400 hover:text-gray-600">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>

                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {project.name}
                </h3>
                
                <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                  {project.description}
                </p>

                <div className="space-y-3">
                  <div className="flex items-center text-sm text-gray-500">
                    <User className="h-4 w-4 mr-2" />
                    <span>{project.client.companyName}</span>
                  </div>

                  <div className="flex items-center text-sm text-gray-500">
                    <Calendar className="h-4 w-4 mr-2" />
                    <span>
                      {new Date(project.startDate).toLocaleDateString('pt-BR')} - {' '}
                      {new Date(project.expectedEndDate).toLocaleDateString('pt-BR')}
                    </span>
                    {isOverdue(project.expectedEndDate, project.status) && (
                      <Clock className="h-4 w-4 ml-2 text-red-500" />
                    )}
                  </div>

                  <div className="flex items-center text-sm text-gray-500">
                    <DollarSign className="h-4 w-4 mr-2" />
                    <span>R$ {project.budget.toLocaleString()}</span>
                    <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                      {getServiceLevelLabel(project.serviceLevel)}
                    </span>
                  </div>

                  {project.progress !== undefined && (
                    <div>
                      <div className="flex justify-between text-sm text-gray-600 mb-1">
                        <span>Progresso</span>
                        <span>{project.progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-yux-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${project.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {project.phases && project.phases.length > 0 && (
                    <div>
                      <div className="text-sm text-gray-600 mb-2">Fases</div>
                      <div className="flex flex-wrap gap-1">
                        {project.phases.slice(0, 3).map((phase) => (
                          <span
                            key={phase.id}
                            className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getStatusColor(phase.status)}`}
                          >
                            {phase.name}
                          </span>
                        ))}
                        {project.phases.length > 3 && (
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600">
                            +{project.phases.length - 3}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-gray-50 px-6 py-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">
                    Atualizado em {new Date(project.startDate).toLocaleDateString('pt-BR')}
                  </span>
                  <button className="text-yux-600 hover:text-yux-700 text-sm font-medium">
                    Ver detalhes
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6 rounded-lg shadow">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => fetchProjects(currentPage - 1, searchTerm, statusFilter)}
              disabled={currentPage === 1}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              onClick={() => fetchProjects(currentPage + 1, searchTerm, statusFilter)}
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
                  onClick={() => fetchProjects(currentPage - 1, searchTerm, statusFilter)}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  onClick={() => fetchProjects(currentPage + 1, searchTerm, statusFilter)}
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