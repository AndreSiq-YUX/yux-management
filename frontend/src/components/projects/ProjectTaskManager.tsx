import React, { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, CheckCircle, Circle, Calendar, User, AlertCircle, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'react-hot-toast'
import { Project, Task, Phase } from '@/types/project'
import { backendDataService } from '@/services/backendDataService'

interface ProjectTaskManagerProps {
  project: Project
  onUpdate?: () => void
}

interface TaskFormData {
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  assignedTo?: string
  dueDate?: string
  phaseId?: string
  estimatedHours?: number
}

interface PhaseFormData {
  name: string
  description: string
  status: 'planning' | 'in_progress' | 'completed' | 'on_hold'
  startDate?: string
  endDate?: string
  budget?: number
}

const TASK_STATUS_LABELS = {
  pending: 'Pendente',
  in_progress: 'Em Andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada'
}

const TASK_PRIORITY_LABELS = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente'
}

const PHASE_STATUS_LABELS = {
  planning: 'Planejamento',
  in_progress: 'Em Andamento',
  completed: 'Concluída',
  on_hold: 'Em Espera'
}

const TASK_STATUS_COLORS = {
  pending: 'bg-gray-100 text-gray-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800'
}

const TASK_PRIORITY_COLORS = {
  low: 'bg-gray-100 text-gray-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-red-100 text-red-800'
}

const PHASE_STATUS_COLORS = {
  planning: 'bg-purple-100 text-purple-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  on_hold: 'bg-yellow-100 text-yellow-800'
}

export function ProjectTaskManager({ project, onUpdate }: ProjectTaskManagerProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [phases, setPhases] = useState<Phase[]>([])
  const [loading, setLoading] = useState(true)
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false)
  const [isPhaseModalOpen, setIsPhaseModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [editingPhase, setEditingPhase] = useState<Phase | null>(null)
  const [taskForm, setTaskForm] = useState<TaskFormData>({
    title: '',
    description: '',
    status: 'pending',
    priority: 'medium'
  })
  const [phaseForm, setPhaseForm] = useState<PhaseFormData>({
    name: '',
    description: '',
    status: 'planning'
  })

  useEffect(() => {
    loadTasksAndPhases()
  }, [project.id])

  const loadTasksAndPhases = async () => {
    try {
      setLoading(true)
      const [tasksResponse, phasesResponse] = await Promise.all([
        backendDataService.getProjectTasks(project.id),
        backendDataService.getProjectPhases(project.id)
      ])
      
      setTasks(tasksResponse.tasks || [])
      setPhases(phasesResponse.phases || [])
    } catch (error) {
      console.error('Erro ao carregar tarefas e fases:', error)
      toast.error('Erro ao carregar tarefas e fases')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTask = () => {
    setEditingTask(null)
    setTaskForm({
      title: '',
      description: '',
      status: 'pending',
      priority: 'medium'
    })
    setIsTaskModalOpen(true)
  }

  const handleEditTask = (task: Task) => {
    setEditingTask(task)
    setTaskForm({
      title: task.title,
      description: task.description || '',
      status: task.status,
      priority: task.priority,
      assignedTo: task.assignedTo || '',
      dueDate: task.dueDate ? format(new Date(task.dueDate), 'yyyy-MM-dd') : '',
      phaseId: task.phaseId || '',
      estimatedHours: task.estimatedHours || undefined
    })
    setIsTaskModalOpen(true)
  }

  const handleCreatePhase = () => {
    setEditingPhase(null)
    setPhaseForm({
      name: '',
      description: '',
      status: 'planning'
    })
    setIsPhaseModalOpen(true)
  }

  const handleEditPhase = (phase: Phase) => {
    setEditingPhase(phase)
    setPhaseForm({
      name: phase.name,
      description: phase.description || '',
      status: phase.status,
      startDate: phase.startDate ? format(new Date(phase.startDate), 'yyyy-MM-dd') : '',
      endDate: phase.endDate ? format(new Date(phase.endDate), 'yyyy-MM-dd') : '',
      budget: phase.budget || undefined
    })
    setIsPhaseModalOpen(true)
  }

  const handleSaveTask = async () => {
    try {
      const taskData = {
        ...taskForm,
        projectId: project.id,
        dueDate: taskForm.dueDate ? new Date(taskForm.dueDate).toISOString() : undefined
      }

      if (editingTask) {
        await backendDataService.updateProjectTask(project.id, editingTask.id, taskData)
        toast.success('Tarefa atualizada com sucesso!')
      } else {
        await backendDataService.createProjectTask(project.id, taskData)
        toast.success('Tarefa criada com sucesso!')
      }

      setIsTaskModalOpen(false)
      loadTasksAndPhases()
      onUpdate?.()
    } catch (error) {
      console.error('Erro ao salvar tarefa:', error)
      toast.error('Erro ao salvar tarefa')
    }
  }

  const handleSavePhase = async () => {
    try {
      const phaseData = {
        ...phaseForm,
        projectId: project.id,
        startDate: phaseForm.startDate ? new Date(phaseForm.startDate).toISOString() : undefined,
        endDate: phaseForm.endDate ? new Date(phaseForm.endDate).toISOString() : undefined
      }

      if (editingPhase) {
        await backendDataService.updateProjectPhase(project.id, editingPhase.id, phaseData)
        toast.success('Fase atualizada com sucesso!')
      } else {
        await backendDataService.createProjectPhase(project.id, {
          ...phaseData,
          startDate: phaseForm.startDate || new Date().toISOString().split('T')[0],
          endDate: phaseForm.endDate || new Date().toISOString().split('T')[0],
          orderIndex: phases.length,
        })
        toast.success('Fase criada com sucesso!')
      }

      setIsPhaseModalOpen(false)
      loadTasksAndPhases()
      onUpdate?.()
    } catch (error) {
      console.error('Erro ao salvar fase:', error)
      toast.error('Erro ao salvar fase')
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta tarefa?')) return

    try {
      await backendDataService.deleteProjectTask(project.id, taskId)
      toast.success('Tarefa excluída com sucesso!')
      loadTasksAndPhases()
      onUpdate?.()
    } catch (error) {
      console.error('Erro ao excluir tarefa:', error)
      toast.error('Erro ao excluir tarefa')
    }
  }

  const handleDeletePhase = async (phaseId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta fase?')) return

    try {
      await backendDataService.deleteProjectPhase(project.id, phaseId)
      toast.success('Fase excluída com sucesso!')
      loadTasksAndPhases()
      onUpdate?.()
    } catch (error) {
      console.error('Erro ao excluir fase:', error)
      toast.error('Erro ao excluir fase')
    }
  }

  const toggleTaskStatus = async (task: Task) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed'
    try {
      await backendDataService.updateProjectTask(project.id, task.id, { status: newStatus })
      loadTasksAndPhases()
      onUpdate?.()
    } catch (error) {
      console.error('Erro ao atualizar status da tarefa:', error)
      toast.error('Erro ao atualizar status da tarefa')
    }
  }

  const toggleTaskVisibility = async (task: Task) => {
    try {
      await backendDataService.updateProjectTaskVisibility(project.id, task.id, !task.isClientVisible)
      loadTasksAndPhases()
      onUpdate?.()
    } catch (error) {
      console.error('Erro ao atualizar visibilidade da tarefa:', error)
      toast.error('Erro ao atualizar visibilidade da tarefa')
    }
  }

  const getPhaseProgress = (phase: Phase) => {
    const phaseTasks = tasks.filter(task => task.phaseId === phase.id)
    if (phaseTasks.length === 0) return 0
    const completedTasks = phaseTasks.filter(task => task.status === 'completed')
    return Math.round((completedTasks.length / phaseTasks.length) * 100)
  }

  const getProjectProgress = () => {
    if (tasks.length === 0) return 0
    const completedTasks = tasks.filter(task => task.status === 'completed')
    return Math.round((completedTasks.length / tasks.length) * 100)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded mb-4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Progress Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Progresso Geral</span>
            <span className="text-sm font-normal text-muted-foreground">
              {tasks.filter(t => t.status === 'completed').length} de {tasks.length} tarefas concluídas
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={getProjectProgress()} className="h-2" />
          <p className="text-sm text-muted-foreground mt-2">
            {getProjectProgress()}% concluído
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue="tasks" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="tasks">Tarefas ({tasks.length})</TabsTrigger>
          <TabsTrigger value="phases">Fases ({phases.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Tarefas do Projeto</h3>
            <Button onClick={handleCreateTask}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Tarefa
            </Button>
          </div>

          {tasks.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhuma tarefa encontrada</h3>
                <p className="text-gray-500 mb-4">Comece criando a primeira tarefa do projeto.</p>
                <Button onClick={handleCreateTask}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Primeira Tarefa
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => {
                const phase = phases.find(p => p.id === task.phaseId)
                return (
                  <Card key={task.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3 flex-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleTaskStatus(task)}
                            className="p-0 h-auto"
                          >
                            {task.status === 'completed' ? (
                              <CheckCircle className="h-5 w-5 text-green-600" />
                            ) : (
                              <Circle className="h-5 w-5 text-gray-400" />
                            )}
                          </Button>
                          <div className="flex-1">
                            <h4 className={`font-medium ${task.status === 'completed' ? 'line-through text-gray-500' : ''}`}>
                              {task.title}
                            </h4>
                            {task.description && (
                              <p className="text-sm text-gray-600 mt-1">{task.description}</p>
                            )}
                            <div className="flex items-center space-x-4 mt-2">
                              <Badge className={TASK_STATUS_COLORS[task.status]}>
                                {TASK_STATUS_LABELS[task.status]}
                              </Badge>
                              <Badge className={TASK_PRIORITY_COLORS[task.priority]}>
                                {TASK_PRIORITY_LABELS[task.priority]}
                              </Badge>
                              {phase && (
                                <Badge variant="outline">
                                  {phase.name}
                                </Badge>
                              )}
                              {task.dueDate && (
                                <div className="flex items-center text-sm text-gray-500">
                                  <Calendar className="h-4 w-4 mr-1" />
                                  {format(new Date(task.dueDate), 'dd/MM/yyyy', { locale: ptBR })}
                                </div>
                              )}
                              {task.assignedTo && (
                                <div className="flex items-center text-sm text-gray-500">
                                  <User className="h-4 w-4 mr-1" />
                                  {task.assignedTo}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="flex items-center gap-2 pr-2 text-xs text-gray-500">
                            <Eye className="h-4 w-4" />
                            <Switch
                              checked={task.isClientVisible}
                              onCheckedChange={() => toggleTaskVisibility(task)}
                              aria-label={`Exibir ${task.title} no portal`}
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditTask(task)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteTask(task.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="phases" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Fases do Projeto</h3>
            <Button onClick={handleCreatePhase}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Fase
            </Button>
          </div>

          {phases.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhuma fase encontrada</h3>
                <p className="text-gray-500 mb-4">Organize o projeto em fases para melhor controle.</p>
                <Button onClick={handleCreatePhase}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Primeira Fase
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {phases.map((phase) => {
                const phaseTasks = tasks.filter(task => task.phaseId === phase.id)
                const progress = getPhaseProgress(phase)
                return (
                  <Card key={phase.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h4 className="font-semibold text-lg">{phase.name}</h4>
                          {phase.description && (
                            <p className="text-gray-600 mt-1">{phase.description}</p>
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditPhase(phase)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeletePhase(phase.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Badge className={PHASE_STATUS_COLORS[phase.status]}>
                            {PHASE_STATUS_LABELS[phase.status]}
                          </Badge>
                          <span className="text-sm text-gray-500">
                            {phaseTasks.length} tarefa{phaseTasks.length !== 1 ? 's' : ''}
                          </span>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-medium">Progresso</span>
                            <span className="text-sm text-gray-500">{progress}%</span>
                          </div>
                          <Progress value={progress} className="h-2" />
                        </div>

                        {(phase.startDate || phase.endDate) && (
                          <div className="flex items-center space-x-4 text-sm text-gray-500">
                            {phase.startDate && (
                              <div className="flex items-center">
                                <Calendar className="h-4 w-4 mr-1" />
                                Início: {format(new Date(phase.startDate), 'dd/MM/yyyy', { locale: ptBR })}
                              </div>
                            )}
                            {phase.endDate && (
                              <div className="flex items-center">
                                <Calendar className="h-4 w-4 mr-1" />
                                Fim: {format(new Date(phase.endDate), 'dd/MM/yyyy', { locale: ptBR })}
                              </div>
                            )}
                          </div>
                        )}

                        {phase.budget && (
                          <div className="text-sm text-gray-500">
                            Orçamento: R$ {phase.budget.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Task Modal */}
      <Dialog open={isTaskModalOpen} onOpenChange={setIsTaskModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingTask ? 'Editar Tarefa' : 'Nova Tarefa'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="task-title">Título *</Label>
              <Input
                id="task-title"
                value={taskForm.title}
                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                placeholder="Digite o título da tarefa"
              />
            </div>
            <div>
              <Label htmlFor="task-description">Descrição</Label>
              <Textarea
                id="task-description"
                value={taskForm.description}
                onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                placeholder="Descreva a tarefa"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="task-status">Status</Label>
                <Select value={taskForm.status} onValueChange={(value: any) => setTaskForm({ ...taskForm, status: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TASK_STATUS_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="task-priority">Prioridade</Label>
                <Select value={taskForm.priority} onValueChange={(value: any) => setTaskForm({ ...taskForm, priority: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TASK_PRIORITY_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="task-phase">Fase</Label>
                <Select value={taskForm.phaseId || ''} onValueChange={(value) => setTaskForm({ ...taskForm, phaseId: value || undefined })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma fase" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhuma fase</SelectItem>
                    {phases.map((phase) => (
                      <SelectItem key={phase.id} value={phase.id}>{phase.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="task-assigned">Responsável</Label>
                <Input
                  id="task-assigned"
                  value={taskForm.assignedTo || ''}
                  onChange={(e) => setTaskForm({ ...taskForm, assignedTo: e.target.value })}
                  placeholder="Nome do responsável"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="task-due-date">Data de Vencimento</Label>
                <Input
                  id="task-due-date"
                  type="date"
                  value={taskForm.dueDate || ''}
                  onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="task-hours">Horas Estimadas</Label>
                <Input
                  id="task-hours"
                  type="number"
                  min="0"
                  step="0.5"
                  value={taskForm.estimatedHours || ''}
                  onChange={(e) => setTaskForm({ ...taskForm, estimatedHours: e.target.value ? parseFloat(e.target.value) : undefined })}
                  placeholder="Ex: 8"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => setIsTaskModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveTask} disabled={!taskForm.title.trim()}>
                {editingTask ? 'Atualizar' : 'Criar'} Tarefa
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Phase Modal */}
      <Dialog open={isPhaseModalOpen} onOpenChange={setIsPhaseModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingPhase ? 'Editar Fase' : 'Nova Fase'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="phase-name">Nome *</Label>
              <Input
                id="phase-name"
                value={phaseForm.name}
                onChange={(e) => setPhaseForm({ ...phaseForm, name: e.target.value })}
                placeholder="Digite o nome da fase"
              />
            </div>
            <div>
              <Label htmlFor="phase-description">Descrição</Label>
              <Textarea
                id="phase-description"
                value={phaseForm.description}
                onChange={(e) => setPhaseForm({ ...phaseForm, description: e.target.value })}
                placeholder="Descreva a fase"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="phase-status">Status</Label>
              <Select value={phaseForm.status} onValueChange={(value: any) => setPhaseForm({ ...phaseForm, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PHASE_STATUS_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="phase-start-date">Data de Início</Label>
                <Input
                  id="phase-start-date"
                  type="date"
                  value={phaseForm.startDate || ''}
                  onChange={(e) => setPhaseForm({ ...phaseForm, startDate: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="phase-end-date">Data de Fim</Label>
                <Input
                  id="phase-end-date"
                  type="date"
                  value={phaseForm.endDate || ''}
                  onChange={(e) => setPhaseForm({ ...phaseForm, endDate: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="phase-budget">Orçamento</Label>
              <Input
                id="phase-budget"
                type="number"
                min="0"
                step="0.01"
                value={phaseForm.budget || ''}
                onChange={(e) => setPhaseForm({ ...phaseForm, budget: e.target.value ? parseFloat(e.target.value) : undefined })}
                placeholder="Ex: 5000.00"
              />
            </div>
            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => setIsPhaseModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSavePhase} disabled={!phaseForm.name.trim()}>
                {editingPhase ? 'Atualizar' : 'Criar'} Fase
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
