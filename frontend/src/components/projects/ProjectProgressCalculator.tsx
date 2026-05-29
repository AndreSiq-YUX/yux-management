import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import {
  Calculator,
  CheckCircle2,
  Circle,
  AlertCircle,
  TrendingUp,
  RefreshCw,
  Target,
  Clock,
  Users,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabaseService } from '@/services/supabaseService'
import {
  Project,
  ProjectTask,
  ProjectPhase,
  PROJECT_STATUS_LABELS,
} from '@/types/project'

interface ProjectProgressCalculatorProps {
  project: Project
  onProgressUpdate?: (newProgress: number) => void
}

interface ProgressBreakdown {
  tasksProgress: number
  phasesProgress: number
  overallProgress: number
  completedTasks: number
  totalTasks: number
  completedPhases: number
  totalPhases: number
  suggestedProgress: number
}

export function ProjectProgressCalculator({
  project,
  onProgressUpdate,
}: ProjectProgressCalculatorProps) {
  const [loading, setLoading] = useState(false)
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const [phases, setPhases] = useState<ProjectPhase[]>([])
  const [breakdown, setBreakdown] = useState<ProgressBreakdown | null>(null)

  useEffect(() => {
    fetchProjectData()
  }, [project.id])

  const fetchProjectData = async () => {
    setLoading(true)
    try {
      // Carregar tarefas
      const tasksResponse = await supabaseService.getProjectTasks(project.id)
      setTasks(tasksResponse.tasks || [])

      // Carregar fases
      const phasesResponse = await supabaseService.getProjectPhases(project.id)
      setPhases(phasesResponse.phases || [])
    } catch (error) {
      console.error('Erro ao carregar dados do projeto:', error)
      toast.error('Erro ao carregar dados do projeto')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (tasks.length > 0 || phases.length > 0) {
      calculateProgress()
    }
  }, [tasks, phases])

  const calculateProgress = () => {
    // Calcular progresso das tarefas
    const completedTasks = tasks.filter(task => task.status === 'completed').length
    const tasksProgress = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0

    // Calcular progresso das fases
    const completedPhases = phases.filter(phase => phase.status === 'completed').length
    const phasesProgress = phases.length > 0 ? Math.round((completedPhases / phases.length) * 100) : 0

    // Calcular progresso ponderado das fases (considerando o progresso individual)
    const weightedPhasesProgress = phases.length > 0 
      ? Math.round(phases.reduce((sum, phase) => sum + (phase.progress || 0), 0) / phases.length)
      : 0

    // Calcular progresso geral sugerido
    let suggestedProgress = 0
    
    if (tasks.length > 0 && phases.length > 0) {
      // Se tem tarefas e fases, usar média ponderada (60% fases, 40% tarefas)
      suggestedProgress = Math.round((weightedPhasesProgress * 0.6) + (tasksProgress * 0.4))
    } else if (phases.length > 0) {
      // Se só tem fases, usar progresso ponderado das fases
      suggestedProgress = weightedPhasesProgress
    } else if (tasks.length > 0) {
      // Se só tem tarefas, usar progresso das tarefas
      suggestedProgress = tasksProgress
    } else {
      // Se não tem nem tarefas nem fases, manter progresso atual
      suggestedProgress = project.progress || 0
    }

    const newBreakdown: ProgressBreakdown = {
      tasksProgress,
      phasesProgress: weightedPhasesProgress,
      overallProgress: project.progress || 0,
      completedTasks,
      totalTasks: tasks.length,
      completedPhases,
      totalPhases: phases.length,
      suggestedProgress,
    }

    setBreakdown(newBreakdown)
  }

  const handleApplySuggestedProgress = async () => {
    if (!breakdown) return

    setLoading(true)
    try {
      const response = await supabaseService.updateProject(project.id, {
        progress: breakdown.suggestedProgress,
      })

      if (response.project) {
        onProgressUpdate?.(breakdown.suggestedProgress)
        toast.success('Progresso atualizado com sucesso')
      } else {
        throw new Error('Erro ao atualizar progresso')
      }
    } catch (error) {
      console.error('Erro ao atualizar progresso:', error)
      toast.error('Erro ao atualizar progresso')
    } finally {
      setLoading(false)
    }
  }

  const getProgressColor = (progress: number) => {
    if (progress >= 90) return 'text-green-600'
    if (progress >= 70) return 'text-blue-600'
    if (progress >= 40) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getProgressVariant = (progress: number) => {
    if (progress >= 90) return 'default'
    if (progress >= 70) return 'secondary'
    if (progress >= 40) return 'outline'
    return 'destructive'
  }

  if (!breakdown) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            <span>Calculando progresso...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  const hasDiscrepancy = Math.abs(breakdown.overallProgress - breakdown.suggestedProgress) > 5

  return (
    <Card className={hasDiscrepancy ? 'border-yellow-200 bg-yellow-50' : ''}>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Calculator className="h-4 w-4" />
          Calculadora de Progresso
          {hasDiscrepancy && (
            <Badge variant="outline" className="text-yellow-700 border-yellow-300">
              Divergência Detectada
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progresso Atual vs Sugerido */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Progresso Atual</span>
              <span className="text-sm font-medium">{breakdown.overallProgress}%</span>
            </div>
            <Progress value={breakdown.overallProgress} className="h-2" />
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Progresso Sugerido</span>
              <span className={`text-sm font-medium ${getProgressColor(breakdown.suggestedProgress)}`}>
                {breakdown.suggestedProgress}%
              </span>
            </div>
            <Progress value={breakdown.suggestedProgress} className="h-2" />
          </div>
        </div>

        {/* Breakdown Detalhado */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4" />
            Detalhamento
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Tarefas */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Tarefas</p>
                  <p className="text-xs text-muted-foreground">
                    {breakdown.completedTasks} de {breakdown.totalTasks} concluídas
                  </p>
                </div>
              </div>
              <Badge variant={getProgressVariant(breakdown.tasksProgress)}>
                {breakdown.tasksProgress}%
              </Badge>
            </div>

            {/* Fases */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Fases</p>
                  <p className="text-xs text-muted-foreground">
                    {breakdown.completedPhases} de {breakdown.totalPhases} concluídas
                  </p>
                </div>
              </div>
              <Badge variant={getProgressVariant(breakdown.phasesProgress)}>
                {breakdown.phasesProgress}%
              </Badge>
            </div>
          </div>
        </div>

        {/* Recomendações */}
        {hasDiscrepancy && (
          <div className="p-3 bg-yellow-100 border border-yellow-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-800">
                  Divergência no Progresso
                </p>
                <p className="text-xs text-yellow-700 mt-1">
                  O progresso atual ({breakdown.overallProgress}%) difere do calculado 
                  ({breakdown.suggestedProgress}%) com base nas tarefas e fases.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Ações */}
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchProjectData}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Recalcular
          </Button>
          
          {hasDiscrepancy && (
            <Button
              size="sm"
              onClick={handleApplySuggestedProgress}
              disabled={loading}
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Aplicar Progresso Sugerido
            </Button>
          )}
        </div>

        {/* Estatísticas Adicionais */}
        {(breakdown.totalTasks > 0 || breakdown.totalPhases > 0) && (
          <div className="pt-3 border-t">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-lg font-semibold">{breakdown.totalTasks}</p>
                <p className="text-xs text-muted-foreground">Total de Tarefas</p>
              </div>
              <div>
                <p className="text-lg font-semibold">{breakdown.totalPhases}</p>
                <p className="text-xs text-muted-foreground">Total de Fases</p>
              </div>
              <div>
                <p className={`text-lg font-semibold ${getProgressColor(breakdown.suggestedProgress)}`}>
                  {breakdown.suggestedProgress}%
                </p>
                <p className="text-xs text-muted-foreground">Progresso Calculado</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
