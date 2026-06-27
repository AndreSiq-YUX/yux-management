import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Pause,
  Play,
  RotateCcw,
  X,
  TrendingUp,
  Calendar,
  Target,
} from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { backendDataService } from '@/services/backendDataService'
import {
  Project,
  PROJECT_STATUS_LABELS,
  PROJECT_PRIORITY_LABELS,
  ProjectStatus,
  ProjectPriority,
} from '@/types/project'

interface ProjectStatusManagerProps {
  project: Project
  onUpdate?: (updatedProject: Project) => void
  trigger?: React.ReactNode
}

interface StatusUpdate {
  status: ProjectStatus
  progress?: number
  notes?: string
  estimatedEndDate?: string
}

export function ProjectStatusManager({
  project,
  onUpdate,
  trigger,
}: ProjectStatusManagerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [statusUpdate, setStatusUpdate] = useState<StatusUpdate>({
    status: project.status,
    progress: project.progress,
    notes: '',
  })

  const getStatusIcon = (status: ProjectStatus) => {
    switch (status) {
      case 'PLANNING':
        return <Clock className="h-4 w-4" />
      case 'ACTIVE':
        return <Play className="h-4 w-4" />
      case 'REVIEW':
        return <AlertCircle className="h-4 w-4" />
      case 'COMPLETED':
        return <CheckCircle2 className="h-4 w-4" />
      case 'CANCELLED':
        return <X className="h-4 w-4" />
      case 'PAUSED':
        return <Pause className="h-4 w-4" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  const getStatusColor = (status: ProjectStatus) => {
    switch (status) {
      case 'PLANNING':
        return 'text-blue-600'
      case 'ACTIVE':
        return 'text-green-600'
      case 'REVIEW':
        return 'text-yellow-600'
      case 'COMPLETED':
        return 'text-green-700'
      case 'CANCELLED':
        return 'text-red-600'
      case 'PAUSED':
        return 'text-gray-600'
      default:
        return 'text-gray-600'
    }
  }

  const getProgressSuggestion = (status: ProjectStatus) => {
    switch (status) {
      case 'PLANNING':
        return 0
      case 'ACTIVE':
        return Math.max(10, project.progress || 0)
      case 'REVIEW':
        return Math.max(80, project.progress || 0)
      case 'COMPLETED':
        return 100
      case 'CANCELLED':
      case 'PAUSED':
        return project.progress || 0
      default:
        return project.progress || 0
    }
  }

  const handleStatusChange = (newStatus: ProjectStatus) => {
    const suggestedProgress = getProgressSuggestion(newStatus)
    setStatusUpdate(prev => ({
      ...prev,
      status: newStatus,
      progress: suggestedProgress,
    }))
  }

  const handleProgressChange = (value: string) => {
    const progress = Math.min(100, Math.max(0, parseInt(value) || 0))
    setStatusUpdate(prev => ({ ...prev, progress }))
  }

  const validateStatusChange = (): string | null => {
    if (statusUpdate.status === 'COMPLETED' && (statusUpdate.progress || 0) < 100) {
      return 'Projetos concluídos devem ter 100% de progresso'
    }
    
    if (statusUpdate.status === 'ACTIVE' && (statusUpdate.progress || 0) === 0) {
      return 'Projetos ativos devem ter progresso maior que 0%'
    }
    
    if (statusUpdate.status === 'REVIEW' && (statusUpdate.progress || 0) < 50) {
      return 'Projetos em revisão geralmente têm pelo menos 50% de progresso'
    }
    
    return null
  }

  const handleSave = async () => {
    const validationError = validateStatusChange()
    if (validationError) {
      toast.error(validationError)
      return
    }

    setLoading(true)
    try {
      const updateData: Partial<Project> = {
        status: statusUpdate.status,
        progress: statusUpdate.progress,
      }

      // Adicionar data de conclusão se o projeto foi marcado como concluído
      if (statusUpdate.status === 'COMPLETED' && project.status !== 'COMPLETED') {
        updateData.actualEndDate = new Date().toISOString()
      }

      // Adicionar notas se fornecidas
      if (statusUpdate.notes?.trim()) {
        updateData.notes = statusUpdate.notes.trim()
      }

      const response = await backendDataService.updateProject(project.id, updateData)
      
      if (response.project) {
        const updatedProject = { ...project, ...updateData }
        onUpdate?.(updatedProject)
        toast.success('Status do projeto atualizado com sucesso')
        setIsOpen(false)
      } else {
        throw new Error('Erro ao atualizar projeto')
      }
    } catch (error) {
      console.error('Erro ao atualizar status do projeto:', error)
      toast.error('Erro ao atualizar status do projeto')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setStatusUpdate({
      status: project.status,
      progress: project.progress,
      notes: '',
    })
  }

  const isChanged = 
    statusUpdate.status !== project.status ||
    statusUpdate.progress !== project.progress ||
    statusUpdate.notes?.trim()

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <TrendingUp className="h-4 w-4 mr-2" />
            Gerenciar Status
          </Button>
        )}
      </DialogTrigger>
      
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gerenciar Status do Projeto</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status Atual */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Status Atual</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`${getStatusColor(project.status)}`}>
                    {getStatusIcon(project.status)}
                  </div>
                  <div>
                    <p className="font-medium">{PROJECT_STATUS_LABELS[project.status]}</p>
                    <p className="text-sm text-muted-foreground">
                      Progresso: {project.progress}%
                    </p>
                  </div>
                </div>
                <Progress value={project.progress} className="w-24 h-2" />
              </div>
            </CardContent>
          </Card>

          {/* Novo Status */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="status">Novo Status</Label>
              <Select
                value={statusUpdate.status}
                onValueChange={handleStatusChange}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PLANNING">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-blue-600" />
                      {PROJECT_STATUS_LABELS.PLANNING}
                    </div>
                  </SelectItem>
                  <SelectItem value="ACTIVE">
                    <div className="flex items-center gap-2">
                      <Play className="h-4 w-4 text-green-600" />
                      {PROJECT_STATUS_LABELS.ACTIVE}
                    </div>
                  </SelectItem>
                  <SelectItem value="REVIEW">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-yellow-600" />
                      {PROJECT_STATUS_LABELS.REVIEW}
                    </div>
                  </SelectItem>
                  <SelectItem value="COMPLETED">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-700" />
                      {PROJECT_STATUS_LABELS.COMPLETED}
                    </div>
                  </SelectItem>
                  <SelectItem value="PAUSED">
                    <div className="flex items-center gap-2">
                      <Pause className="h-4 w-4 text-gray-600" />
                      {PROJECT_STATUS_LABELS.PAUSED}
                    </div>
                  </SelectItem>
                  <SelectItem value="CANCELLED">
                    <div className="flex items-center gap-2">
                      <X className="h-4 w-4 text-red-600" />
                      {PROJECT_STATUS_LABELS.CANCELLED}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="progress">Progresso (%)</Label>
              <div className="flex items-center gap-3 mt-1">
                <input
                  id="progress"
                  type="number"
                  min="0"
                  max="100"
                  value={statusUpdate.progress || 0}
                  onChange={(e) => handleProgressChange(e.target.value)}
                  className="flex h-10 w-20 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <Progress value={statusUpdate.progress || 0} className="flex-1 h-2" />
                <span className="text-sm text-muted-foreground w-8">
                  {statusUpdate.progress || 0}%
                </span>
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notas da Atualização (opcional)</Label>
              <Textarea
                id="notes"
                placeholder="Adicione observações sobre esta mudança de status..."
                value={statusUpdate.notes || ''}
                onChange={(e) => setStatusUpdate(prev => ({ ...prev, notes: e.target.value }))}
                className="mt-1"
                rows={3}
              />
            </div>
          </div>

          {/* Preview da Mudança */}
          {isChanged && (
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Preview da Mudança
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`${getStatusColor(statusUpdate.status)}`}>
                      {getStatusIcon(statusUpdate.status)}
                    </div>
                    <div>
                      <p className="font-medium">{PROJECT_STATUS_LABELS[statusUpdate.status]}</p>
                      <p className="text-sm text-muted-foreground">
                        Progresso: {statusUpdate.progress}%
                      </p>
                    </div>
                  </div>
                  <Progress value={statusUpdate.progress || 0} className="w-24 h-2" />
                </div>
                {statusUpdate.notes?.trim() && (
                  <div className="mt-3 p-2 bg-white rounded border">
                    <p className="text-sm text-muted-foreground">
                      <strong>Nota:</strong> {statusUpdate.notes}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Informações do Projeto */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Cronograma
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Data de Início</p>
                  <p className="font-medium">
                    {format(new Date(project.startDate), 'dd/MM/yyyy', { locale: ptBR })}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Previsão de Término</p>
                  <p className="font-medium">
                    {format(new Date(project.expectedEndDate), 'dd/MM/yyyy', { locale: ptBR })}
                  </p>
                </div>
                {project.actualEndDate && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Data de Término</p>
                    <p className="font-medium">
                      {format(new Date(project.actualEndDate), 'dd/MM/yyyy', { locale: ptBR })}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Ações */}
        <div className="flex items-center justify-between pt-4">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={!isChanged || loading}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Resetar
          </Button>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={!isChanged || loading}
            >
              {loading ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
