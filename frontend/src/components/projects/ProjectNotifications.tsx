import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Bell,
  BellOff,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Mail,
  MessageSquare,
  Settings,
  Users,
  Target,
  TrendingDown,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format, addDays, differenceInDays, isAfter, isBefore } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Project, ProjectTask, ProjectPhase } from '@/types/project'
import { backendDataService } from '@/services/backendDataService'

interface ProjectNotificationsProps {
  project: Project
}

interface NotificationRule {
  id: string
  type: 'deadline' | 'milestone' | 'progress' | 'budget' | 'team'
  enabled: boolean
  title: string
  description: string
  daysBeforeDeadline?: number
  progressThreshold?: number
  budgetThreshold?: number
}

interface ActiveNotification {
  id: string
  type: 'warning' | 'info' | 'success' | 'error'
  title: string
  message: string
  priority: 'high' | 'medium' | 'low'
  createdAt: Date
  actionRequired?: boolean
}

const DEFAULT_NOTIFICATION_RULES: NotificationRule[] = [
  {
    id: 'deadline-7d',
    type: 'deadline',
    enabled: true,
    title: 'Prazo se aproximando (7 dias)',
    description: 'Notificar quando faltarem 7 dias para o prazo final',
    daysBeforeDeadline: 7,
  },
  {
    id: 'deadline-3d',
    type: 'deadline',
    enabled: true,
    title: 'Prazo se aproximando (3 dias)',
    description: 'Notificar quando faltarem 3 dias para o prazo final',
    daysBeforeDeadline: 3,
  },
  {
    id: 'deadline-1d',
    type: 'deadline',
    enabled: true,
    title: 'Prazo se aproximando (1 dia)',
    description: 'Notificar quando faltar 1 dia para o prazo final',
    daysBeforeDeadline: 1,
  },
  {
    id: 'progress-stalled',
    type: 'progress',
    enabled: true,
    title: 'Progresso estagnado',
    description: 'Notificar quando o progresso não avançar por 7 dias',
  },
  {
    id: 'milestone-completed',
    type: 'milestone',
    enabled: true,
    title: 'Marco concluído',
    description: 'Notificar quando uma fase importante for concluída',
  },
  {
    id: 'budget-80',
    type: 'budget',
    enabled: true,
    title: 'Orçamento 80% utilizado',
    description: 'Notificar quando 80% do orçamento for utilizado',
    budgetThreshold: 80,
  },
  {
    id: 'team-overload',
    type: 'team',
    enabled: false,
    title: 'Equipe sobrecarregada',
    description: 'Notificar quando membros da equipe tiverem muitas tarefas',
  },
]

export function ProjectNotifications({ project }: ProjectNotificationsProps) {
  const [loading, setLoading] = useState(false)
  const [rules, setRules] = useState<NotificationRule[]>(DEFAULT_NOTIFICATION_RULES)
  const [notifications, setNotifications] = useState<ActiveNotification[]>([])
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const [phases, setPhases] = useState<ProjectPhase[]>([])

  useEffect(() => {
    loadProjectData()
    generateNotifications()
  }, [project.id])

  useEffect(() => {
    generateNotifications()
  }, [rules, tasks, phases, project])

  const loadProjectData = async () => {
    setLoading(true)
    try {
      // Carregar tarefas
      const tasksResponse = await backendDataService.getProjectTasks(project.id)
      setTasks(tasksResponse.tasks || [])

      // Carregar fases
      const phasesResponse = await backendDataService.getProjectPhases(project.id)
      setPhases(phasesResponse.phases || [])
    } catch (error) {
      console.error('Erro ao carregar dados do projeto:', error)
    } finally {
      setLoading(false)
    }
  }

  const generateNotifications = () => {
    const newNotifications: ActiveNotification[] = []
    const now = new Date()

    // Verificar prazos
    if (project.endDate) {
      const endDate = new Date(project.endDate)
      const daysUntilDeadline = differenceInDays(endDate, now)

      rules.forEach(rule => {
        if (rule.type === 'deadline' && rule.enabled && rule.daysBeforeDeadline) {
          if (daysUntilDeadline <= rule.daysBeforeDeadline && daysUntilDeadline >= 0) {
            newNotifications.push({
              id: `deadline-${rule.daysBeforeDeadline}d`,
              type: daysUntilDeadline <= 1 ? 'error' : daysUntilDeadline <= 3 ? 'warning' : 'info',
              title: 'Prazo se aproximando',
              message: `Faltam ${daysUntilDeadline} dia(s) para o prazo final do projeto`,
              priority: daysUntilDeadline <= 1 ? 'high' : daysUntilDeadline <= 3 ? 'medium' : 'low',
              createdAt: now,
              actionRequired: daysUntilDeadline <= 3,
            })
          }
        }
      })

      // Verificar se o prazo já passou
      if (isAfter(now, endDate) && project.status !== 'COMPLETED') {
        newNotifications.push({
          id: 'deadline-overdue',
          type: 'error',
          title: 'Prazo vencido',
          message: `O projeto está ${Math.abs(daysUntilDeadline)} dia(s) atrasado`,
          priority: 'high',
          createdAt: now,
          actionRequired: true,
        })
      }
    }

    // Verificar progresso estagnado
    const progressRule = rules.find(r => r.id === 'progress-stalled' && r.enabled)
    if (progressRule && project.progress !== undefined && project.progress < 100) {
      // Simular verificação de progresso estagnado (em um sistema real, isso viria do backend)
      const lastProgressUpdate = addDays(now, -8) // Simular última atualização há 8 dias
      if (isBefore(lastProgressUpdate, addDays(now, -7))) {
        newNotifications.push({
          id: 'progress-stalled',
          type: 'warning',
          title: 'Progresso estagnado',
          message: 'O progresso do projeto não foi atualizado nos últimos 7 dias',
          priority: 'medium',
          createdAt: now,
          actionRequired: true,
        })
      }
    }

    // Verificar marcos concluídos
    const milestoneRule = rules.find(r => r.id === 'milestone-completed' && r.enabled)
    if (milestoneRule) {
      const completedPhases = phases.filter(phase => 
        phase.status === 'completed' && 
        phase.endDate && 
        differenceInDays(now, new Date(phase.endDate)) <= 1
      )
      
      completedPhases.forEach(phase => {
        newNotifications.push({
          id: `milestone-${phase.id}`,
          type: 'success',
          title: 'Marco concluído',
          message: `A fase "${phase.name}" foi concluída com sucesso`,
          priority: 'low',
          createdAt: now,
        })
      })
    }

    // Verificar orçamento
    const budgetRule = rules.find(r => r.id === 'budget-80' && r.enabled)
    if (budgetRule && project.budget && project.spent !== undefined) {
      const budgetUsagePercent = (project.spent / project.budget) * 100
      if (budgetUsagePercent >= (budgetRule.budgetThreshold || 80)) {
        newNotifications.push({
          id: 'budget-threshold',
          type: budgetUsagePercent >= 95 ? 'error' : 'warning',
          title: 'Orçamento em alerta',
          message: `${Math.round(budgetUsagePercent)}% do orçamento foi utilizado`,
          priority: budgetUsagePercent >= 95 ? 'high' : 'medium',
          createdAt: now,
          actionRequired: budgetUsagePercent >= 90,
        })
      }
    }

    // Verificar tarefas em atraso
    const overdueTasks = tasks.filter(task => 
      task.dueDate && 
      isAfter(now, new Date(task.dueDate)) && 
      task.status !== 'completed'
    )

    if (overdueTasks.length > 0) {
      newNotifications.push({
        id: 'tasks-overdue',
        type: 'warning',
        title: 'Tarefas em atraso',
        message: `${overdueTasks.length} tarefa(s) estão em atraso`,
        priority: 'medium',
        createdAt: now,
        actionRequired: true,
      })
    }

    setNotifications(newNotifications)
  }

  const toggleRule = (ruleId: string) => {
    setRules(prev => prev.map(rule => 
      rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule
    ))
  }

  const dismissNotification = (notificationId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId))
    toast.success('Notificação dispensada')
  }

  const getNotificationIcon = (type: ActiveNotification['type']) => {
    switch (type) {
      case 'error': return <AlertTriangle className="h-4 w-4" />
      case 'warning': return <Clock className="h-4 w-4" />
      case 'success': return <CheckCircle2 className="h-4 w-4" />
      default: return <Bell className="h-4 w-4" />
    }
  }

  const getNotificationColor = (type: ActiveNotification['type']) => {
    switch (type) {
      case 'error': return 'border-red-200 bg-red-50'
      case 'warning': return 'border-yellow-200 bg-yellow-50'
      case 'success': return 'border-green-200 bg-green-50'
      default: return 'border-blue-200 bg-blue-50'
    }
  }

  const getPriorityBadge = (priority: ActiveNotification['priority']) => {
    switch (priority) {
      case 'high': return <Badge variant="destructive">Alta</Badge>
      case 'medium': return <Badge variant="outline">Média</Badge>
      default: return <Badge variant="secondary">Baixa</Badge>
    }
  }

  return (
    <div className="space-y-6">
      {/* Notificações Ativas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notificações Ativas
            {notifications.length > 0 && (
              <Badge variant="outline">{notifications.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <div className="text-center py-6">
              <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Nenhuma notificação ativa no momento
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map(notification => (
                <div
                  key={notification.id}
                  className={`p-3 rounded-lg border ${getNotificationColor(notification.type)}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="mt-0.5">
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-sm font-medium">{notification.title}</h4>
                          {getPriorityBadge(notification.priority)}
                          {notification.actionRequired && (
                            <Badge variant="outline" className="text-xs">
                              Ação Necessária
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {notification.message}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(notification.createdAt, 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => dismissNotification(notification.id)}
                    >
                      ×
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configurações de Notificação */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Configurações de Notificação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {rules.map((rule, index) => (
            <div key={rule.id}>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Label htmlFor={rule.id} className="text-sm font-medium">
                      {rule.title}
                    </Label>
                    <Badge variant="outline" className="text-xs">
                      {rule.type}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {rule.description}
                  </p>
                </div>
                <Switch
                  id={rule.id}
                  checked={rule.enabled}
                  onCheckedChange={() => toggleRule(rule.id)}
                />
              </div>
              {index < rules.length - 1 && <Separator className="mt-4" />}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Estatísticas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4" />
            Resumo de Alertas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-lg font-semibold text-red-600">
                {notifications.filter(n => n.priority === 'high').length}
              </p>
              <p className="text-xs text-muted-foreground">Alta Prioridade</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-yellow-600">
                {notifications.filter(n => n.priority === 'medium').length}
              </p>
              <p className="text-xs text-muted-foreground">Média Prioridade</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-blue-600">
                {notifications.filter(n => n.actionRequired).length}
              </p>
              <p className="text-xs text-muted-foreground">Ação Necessária</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-green-600">
                {rules.filter(r => r.enabled).length}
              </p>
              <p className="text-xs text-muted-foreground">Regras Ativas</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
