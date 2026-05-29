import React, { useState, useEffect } from 'react'
import { supabaseService } from '@/services/supabaseService'
import { 
  Plus, 
  Search, 
  MoreHorizontal, 
  FolderOpen, 
  Calendar,
  DollarSign,
  User,
  Loader2,
  Clock,
  Eye,
  Edit,
  Trash2,
  Archive,
  Copy,
  Filter
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { Project, PROJECT_STATUS_LABELS, PROJECT_PRIORITY_LABELS, PROJECT_TYPE_LABELS, ProjectFilters } from '@/types/project'
import { ProjectFormModal } from '@/components/projects/ProjectFormModal'
import { ProjectDetailsModal } from '@/components/projects/ProjectDetailsModal'
import { ProjectFilters as ProjectFiltersComponent, ProjectFiltersState, applyProjectFilters } from '@/components/projects/ProjectFilters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [advancedFilters, setAdvancedFilters] = useState<ProjectFiltersState>({
    search: '',
    status: [],
    priority: [],
    type: [],
    clientId: [],
  })
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const { toast } = useToast()

  const fetchProjects = async () => {
    try {
      setLoading(true)
      const response = await supabaseService.getProjects()
      
      if (response.projects) {
        setProjects(response.projects || [])
      }
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao carregar projetos',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProjects()
  }, [])

  // Aplicar filtros avançados aos projetos
  const filteredProjects = React.useMemo(() => {
    return applyProjectFilters(projects, advancedFilters)
  }, [projects, advancedFilters])

  const handleCreateProject = () => {
    setEditingProject(null)
    setIsFormModalOpen(true)
  }

  const handleEditProject = (project: Project) => {
    setEditingProject(project)
    setIsFormModalOpen(true)
  }

  const handleCloseFormModal = () => {
    setIsFormModalOpen(false)
    setEditingProject(null)
  }

  const handleViewProject = (project: Project) => {
    setSelectedProject(project)
    setIsDetailsModalOpen(true)
  }

  const handleCloseDetailsModal = () => {
    setIsDetailsModalOpen(false)
    setSelectedProject(null)
  }

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('Tem certeza que deseja excluir este projeto?')) return
    
    try {
      await supabaseService.deleteProject(projectId)
      toast({
        title: 'Sucesso',
        description: 'Projeto excluído com sucesso'
      })
      fetchProjects()
      handleCloseDetailsModal()
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao excluir projeto',
        variant: 'destructive'
      })
    }
  }

  const handleArchiveProject = async (projectId: string) => {
    try {
      await supabaseService.archiveProject(projectId)
      toast({
        title: 'Sucesso',
        description: 'Projeto arquivado com sucesso'
      })
      fetchProjects()
      handleCloseDetailsModal()
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao arquivar projeto',
        variant: 'destructive'
      })
    }
  }

  const handleDuplicateProject = async (projectId: string) => {
    try {
      await supabaseService.duplicateProject(projectId)
      toast({
        title: 'Sucesso',
        description: 'Projeto duplicado com sucesso'
      })
      fetchProjects()
      handleCloseDetailsModal()
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Erro ao duplicar projeto',
        variant: 'destructive'
      })
    }
  }

  const onProjectSaved = async () => {
    // Recarregar a lista de projetos após salvar
    await fetchProjects()
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'default'
      case 'PLANNING': return 'secondary'
      case 'REVIEW': return 'outline'
      case 'COMPLETED': return 'secondary'
      case 'CANCELLED': return 'destructive'
      default: return 'secondary'
    }
  }

  const getPriorityVariant = (priority: string) => {
    switch (priority) {
      case 'HIGH': return 'destructive'
      case 'MEDIUM': return 'default'
      case 'LOW': return 'secondary'
      default: return 'secondary'
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
        <Button onClick={handleCreateProject} className="flex items-center space-x-2">
          <Plus className="h-4 w-4" />
          <span>Novo Projeto</span>
        </Button>
      </div>

      {/* Advanced Filters */}
      <ProjectFiltersComponent
        filters={advancedFilters}
        onFiltersChange={setAdvancedFilters}
        projects={projects}
      />

      {/* Projects Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <div className="col-span-full flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <FolderOpen className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Nenhum projeto encontrado</h3>
            <p className="mt-1 text-sm text-gray-500">
              {projects.length === 0 ? 'Comece criando um novo projeto' : 'Nenhum projeto corresponde aos filtros aplicados'}
            </p>
          </div>
        ) : (
          filteredProjects.map((project) => (
            <Card key={project.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <Badge variant={getStatusVariant(project.status)}>
                      {PROJECT_STATUS_LABELS[project.status] || project.status}
                    </Badge>
                    {project.priority && (
                      <Badge variant={getPriorityVariant(project.priority)}>
                        {PROJECT_PRIORITY_LABELS[project.priority] || project.priority}
                      </Badge>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleViewProject(project)}>
                        <Eye className="h-4 w-4 mr-2" />
                        Ver detalhes
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleEditProject(project)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicateProject(project.id)}>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleArchiveProject(project.id)}>
                        <Archive className="h-4 w-4 mr-2" />
                        Arquivar
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleDeleteProject(project.id)}
                        className="text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <h3 className="text-lg font-semibold mb-2">
                  {project.name}
                </h3>
                
                <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                  {project.description}
                </p>

                <div className="space-y-3">
                  <div className="flex items-center text-sm text-muted-foreground">
                    <User className="h-4 w-4 mr-2" />
                    <span>{project.client?.companyName || 'Cliente não definido'}</span>
                  </div>

                  <div className="flex items-center text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4 mr-2" />
                    <span>
                      {new Date(project.startDate).toLocaleDateString('pt-BR')} - {' '}
                      {new Date(project.expectedEndDate).toLocaleDateString('pt-BR')}
                    </span>
                    {isOverdue(project.expectedEndDate, project.status) && (
                      <Clock className="h-4 w-4 ml-2 text-red-500" />
                    )}
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center text-muted-foreground">
                      <DollarSign className="h-4 w-4 mr-2" />
                      <span>R$ {project.budget?.toLocaleString() || '0'}</span>
                    </div>
                    {project.type && (
                      <Badge variant="outline">
                        {PROJECT_TYPE_LABELS[project.type] || project.type}
                      </Badge>
                    )}
                  </div>

                  {project.progress !== undefined && (
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-muted-foreground">Progresso</span>
                        <span className="font-medium">{project.progress}%</span>
                      </div>
                      <Progress value={project.progress} className="h-2" />
                    </div>
                  )}

                  {project.phases && project.phases.length > 0 && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-2">Fases</div>
                      <div className="flex flex-wrap gap-1">
                        {project.phases.slice(0, 3).map((phase) => (
                          <Badge
                            key={phase.id}
                            variant={getStatusVariant(phase.status)}
                            className="text-xs"
                          >
                            {phase.name}
                          </Badge>
                        ))}
                        {project.phases.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{project.phases.length - 3}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>

              <div className="border-t px-6 py-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">
                    Atualizado em {new Date(project.updatedAt || project.startDate).toLocaleDateString('pt-BR')}
                  </span>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => handleViewProject(project)}
                  >
                    Ver detalhes
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Results Summary */}
      {filteredProjects.length > 0 && (
        <Card>
          <CardContent className="px-4 py-3 text-center">
            <p className="text-sm text-muted-foreground">
              {filteredProjects.length} projeto{filteredProjects.length !== 1 ? 's' : ''} encontrado{filteredProjects.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Project Form Modal */}
      <ProjectFormModal
        isOpen={isFormModalOpen}
        onClose={handleCloseFormModal}
        project={editingProject}
        onSave={onProjectSaved}
      />

      {/* Project Details Modal */}
      <ProjectDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={handleCloseDetailsModal}
        project={selectedProject}
        onEdit={handleEditProject}
        onDelete={handleDeleteProject}
        onArchive={handleArchiveProject}
        onDuplicate={handleDuplicateProject}
      />
    </div>
  )
}
