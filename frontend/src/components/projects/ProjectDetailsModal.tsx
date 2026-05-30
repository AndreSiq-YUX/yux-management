import { useState, useEffect } from 'react'
import {
  X,
  Calendar,
  DollarSign,
  User,
  Clock,
  FileText,
  CheckCircle,
  AlertCircle,
  Loader2,
  Edit,
  Archive,
  Copy,
  Trash2,
  Plus,
  Eye,
  Target,
  TrendingUp,
  Users,
  Building2
} from 'lucide-react'
import { supabaseService } from '@/services/supabaseService'
import { Project, ProjectTask, ProjectPhase, PROJECT_STATUS_LABELS, PROJECT_PRIORITY_LABELS, PROJECT_TYPE_LABELS } from '@/types/project'
import { Client } from '@/types/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { ProjectProgressCalculator } from './ProjectProgressCalculator'
import { ProjectNotifications } from './ProjectNotifications'
import { ProjectTaskManager } from './ProjectTaskManager'
import { ProjectDeliveryManager } from './ProjectDeliveryManager'

interface ProjectDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  project: Project | null
  onEdit?: (project: Project) => void
  onDelete?: (projectId: string) => void
  onArchive?: (projectId: string) => void
  onDuplicate?: (projectId: string) => void
}

export function ProjectDetailsModal({
  isOpen,
  onClose,
  project,
  onEdit,
  onDelete,
  onArchive,
  onDuplicate
}: ProjectDetailsModalProps) {
  const [loading, setLoading] = useState(false)
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const [phases, setPhases] = useState<ProjectPhase[]>([])
  const [client, setClient] = useState<Client | null>(null)

  useEffect(() => {
    if (isOpen && project) {
      fetchProjectDetails()
    }
  }, [isOpen, project])

  const fetchProjectDetails = async () => {
    if (!project) return

    try {
      setLoading(true)

      // Carregar tarefas do projeto
      const tasksResponse = await supabaseService.getProjectTasks(project.id)
      setTasks(tasksResponse.tasks || [])

      // Carregar fases do projeto
      const phasesResponse = await supabaseService.getProjectPhases(project.id)
      setPhases(phasesResponse.phases || [])

      // Carregar dados do cliente se não estiver incluído
      if (project.clientId && !project.client) {
        const clientResponse = await supabaseService.getClientById(project.clientId)
        setClient(clientResponse.client)
      } else if (project.client) {
        setClient(project.client as Client)
      }
    } catch (error) {
      console.error('Erro ao carregar detalhes do projeto:', error)
      toast.error('Erro ao carregar detalhes do projeto')
    } finally {
      setLoading(false)
    }
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'completed':
        return 'default'
      case 'active':
        return 'default'
      case 'review':
        return 'secondary'
      case 'cancelled':
        return 'destructive'
      case 'planning':
        return 'outline'
      default:
        return 'secondary'
    }
  }

  const getPriorityVariant = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'destructive'
      case 'medium':
        return 'default'
      case 'low':
        return 'secondary'
      default:
        return 'outline'
    }
  }

  const isOverdue = (endDate: string, status: string) => {
    if (status === 'completed' || status === 'cancelled') return false
    return new Date(endDate) < new Date()
  }



  const formatDate = (date: string) => {
    return format(new Date(date), 'dd/MM/yyyy', { locale: ptBR })
  }

  const formatCurrency = (value: number, currency: string = 'BRL') => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency
    }).format(value)
  }

  const calculateTasksProgress = () => {
    if (tasks.length === 0) return 0
    const completedTasks = tasks.filter(task => task.status === 'completed').length
    return Math.round((completedTasks / tasks.length) * 100)
  }

  const calculatePhasesProgress = () => {
    if (phases.length === 0) return 0
    const completedPhases = phases.filter(phase => phase.status === 'completed').length
    return Math.round((completedPhases / phases.length) * 100)
  }

  if (!project) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-semibold">
                {project.name}
              </DialogTitle>
              <div className="flex items-center space-x-2 mt-2">
                <Badge variant={getStatusVariant(project.status)}>
                  {PROJECT_STATUS_LABELS[project.status] || project.status}
                </Badge>
                {project.priority && (
                  <Badge variant={getPriorityVariant(project.priority)}>
                    {PROJECT_PRIORITY_LABELS[project.priority] || project.priority}
                  </Badge>
                )}
                {project.type && (
                  <Badge variant="outline">
                    {PROJECT_TYPE_LABELS[project.type] || project.type}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    Ações
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onEdit && (
                    <DropdownMenuItem onClick={() => onEdit(project)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </DropdownMenuItem>
                  )}
                  {onDuplicate && (
                    <DropdownMenuItem onClick={() => onDuplicate(project.id)}>
                      <Copy className="h-4 w-4 mr-2" />
                      Duplicar
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  {onArchive && (
                    <DropdownMenuItem onClick={() => onArchive(project.id)}>
                      <Archive className="h-4 w-4 mr-2" />
                      Arquivar
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <DropdownMenuItem 
                      onClick={() => onDelete(project.id)}
                      className="text-red-600"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Excluir
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-6">
                <TabsTrigger value="overview">Visão Geral</TabsTrigger>
                <TabsTrigger value="tasks">Tarefas & Fases</TabsTrigger>
                <TabsTrigger value="delivery">Entregas</TabsTrigger>
                <TabsTrigger value="progress">Progresso</TabsTrigger>
                <TabsTrigger value="client">Cliente</TabsTrigger>
                <TabsTrigger value="notifications">Notificações</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                {/* Project Info */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <FileText className="h-5 w-5 mr-2" />
                      Informações do Projeto
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2">Descrição</h4>
                      <p className="text-muted-foreground">
                        {project.description || 'Nenhuma descrição fornecida'}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">Data de Início</p>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(project.startDate)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">Previsão de Entrega</p>
                          <p className={`text-sm ${
                            isOverdue(project.expectedEndDate, project.status) 
                              ? 'text-red-600' 
                              : 'text-muted-foreground'
                          }`}>
                            {formatDate(project.expectedEndDate)}
                            {isOverdue(project.expectedEndDate, project.status) && (
                              <Clock className="h-3 w-3 ml-1 inline" />
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">Orçamento</p>
                          <p className="text-sm text-muted-foreground">
                            {project.budget ? formatCurrency(project.budget) : 'Não definido'}
                          </p>
                        </div>
                      </div>

                      <div className="md:col-span-2">
                        <ProjectProgressCalculator 
                          project={project}
                          onProgressUpdate={(newProgress) => {
                            // Atualizar o progresso do projeto localmente
                            project.progress = newProgress
                          }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Progress Summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center text-base">
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Progresso das Tarefas
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-2xl font-bold">{calculateTasksProgress()}%</span>
                        <span className="text-sm text-muted-foreground">
                          {tasks.filter(t => t.status === 'completed').length} de {tasks.length}
                        </span>
                      </div>
                      <Progress value={calculateTasksProgress()} className="h-2" />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center text-base">
                        <TrendingUp className="h-4 w-4 mr-2" />
                        Progresso das Fases
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-2xl font-bold">{calculatePhasesProgress()}%</span>
                        <span className="text-sm text-muted-foreground">
                          {phases.filter(p => p.status === 'completed').length} de {phases.length}
                        </span>
                      </div>
                      <Progress value={calculatePhasesProgress()} className="h-2" />
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="tasks" className="space-y-4">
                <ProjectTaskManager 
                  project={project} 
                  onUpdate={() => {
                    // Recarregar dados do projeto se necessário
                    fetchProjectDetails()
                  }}
                />
              </TabsContent>

              <TabsContent value="delivery" className="space-y-4">
                <ProjectDeliveryManager project={project} />
              </TabsContent>

              <TabsContent value="progress" className="space-y-4">
                <ProjectProgressCalculator 
                  project={project} 
                  onProgressUpdate={(newProgress) => {
                    // Atualizar progresso do projeto
                    project.progress = newProgress
                  }}
                />
              </TabsContent>

              <TabsContent value="client" className="space-y-4">
                {client ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <Building2 className="h-5 w-5 mr-2" />
                        Informações do Cliente
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <h4 className="font-semibold text-lg">{client.companyName}</h4>
                        <p className="text-muted-foreground">{client.contactName}</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex items-center space-x-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">Email</p>
                            <p className="text-sm text-muted-foreground">{client.email}</p>
                          </div>
                        </div>

                        {client.phone && (
                          <div className="flex items-center space-x-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium">Telefone</p>
                              <p className="text-sm text-muted-foreground">{client.phone}</p>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center space-x-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">Setor</p>
                            <p className="text-sm text-muted-foreground">{client.sector}</p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">Porte</p>
                            <p className="text-sm text-muted-foreground">
                              {client.size === 'small' ? 'Pequena' :
                               client.size === 'medium' ? 'Média' : 'Grande'}
                            </p>
                          </div>
                        </div>
                      </div>

                      {client.website && (
                        <div className="flex items-center space-x-2">
                          <Eye className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">Website</p>
                            <a 
                              href={client.website} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:underline"
                            >
                              {client.website}
                            </a>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <div className="text-center py-12">
                    <Building2 className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">Cliente não encontrado</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Não foi possível carregar as informações do cliente.
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="notifications">
                <ProjectNotifications project={project} />
              </TabsContent>
            </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
