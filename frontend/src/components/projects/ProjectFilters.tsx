import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Separator } from '@/components/ui/separator'
import {
  Filter,
  X,
  Calendar as CalendarIcon,
  DollarSign,
  Users,
  Target,
  Clock,
  Search,
  RotateCcw,
  ChevronDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Project,
  PROJECT_STATUSES,
  PROJECT_PRIORITIES,
  PROJECT_TYPES,
  PROJECT_STATUS_LABELS,
  PROJECT_PRIORITY_LABELS,
  PROJECT_TYPE_LABELS,
} from '@/types/project'
import { Client } from '@/types/client'
import { supabaseService } from '@/services/supabaseService'

export interface ProjectFiltersState {
  search: string
  status: string[]
  priority: string[]
  type: string[]
  clientId: string[]
  startDateFrom?: Date
  startDateTo?: Date
  endDateFrom?: Date
  endDateTo?: Date
  budgetMin?: number
  budgetMax?: number
  progressMin?: number
  progressMax?: number
  hasOverdueTasks?: boolean
  isArchived?: boolean
  sortBy?: 'name' | 'createdAt' | 'startDate' | 'budget' | 'progress'
  sortOrder?: 'asc' | 'desc'
}

interface ProjectFiltersProps {
  filters: ProjectFiltersState
  onFiltersChange: (filters: ProjectFiltersState) => void
  projects: Project[]
}

const DEFAULT_FILTERS: ProjectFiltersState = {
  search: '',
  status: [],
  priority: [],
  type: [],
  clientId: [],
}

export function ProjectFilters({ filters, onFiltersChange, projects }: ProjectFiltersProps) {
  const [clients, setClients] = useState<Client[]>([])
  const [isExpanded, setIsExpanded] = useState(false)
  const [startDateFromOpen, setStartDateFromOpen] = useState(false)
  const [startDateToOpen, setStartDateToOpen] = useState(false)
  const [endDateFromOpen, setEndDateFromOpen] = useState(false)
  const [endDateToOpen, setEndDateToOpen] = useState(false)

  useEffect(() => {
    loadClients()
  }, [])

  const loadClients = async () => {
    try {
      const response = await supabaseService.getClients()
      setClients(response.clients || [])
    } catch (error) {
      console.error('Erro ao carregar clientes:', error)
    }
  }

  const updateFilters = (updates: Partial<ProjectFiltersState>) => {
    onFiltersChange({ ...filters, ...updates })
  }

  const toggleArrayFilter = (key: keyof ProjectFiltersState, value: string) => {
    const currentArray = (filters[key] as string[]) || []
    const newArray = currentArray.includes(value)
      ? currentArray.filter(item => item !== value)
      : [...currentArray, value]
    updateFilters({ [key]: newArray })
  }

  const clearFilters = () => {
    onFiltersChange(DEFAULT_FILTERS)
  }

  const getActiveFiltersCount = () => {
    let count = 0
    if (filters.search) count++
    if (filters.status.length > 0) count++
    if (filters.priority.length > 0) count++
    if (filters.type.length > 0) count++
    if (filters.clientId.length > 0) count++
    if (filters.startDateFrom || filters.startDateTo) count++
    if (filters.endDateFrom || filters.endDateTo) count++
    if (filters.budgetMin !== undefined || filters.budgetMax !== undefined) count++
    if (filters.progressMin !== undefined || filters.progressMax !== undefined) count++
    if (filters.hasOverdueTasks) count++
    if (filters.isArchived) count++
    return count
  }

  const formatDateRange = (from?: Date, to?: Date) => {
    if (!from && !to) return 'Selecionar período'
    if (from && to) {
      return `${format(from, 'dd/MM/yy', { locale: ptBR })} - ${format(to, 'dd/MM/yy', { locale: ptBR })}`
    }
    if (from) return `A partir de ${format(from, 'dd/MM/yy', { locale: ptBR })}`
    if (to) return `Até ${format(to, 'dd/MM/yy', { locale: ptBR })}`
    return 'Selecionar período'
  }

  const activeFiltersCount = getActiveFiltersCount()

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtros
            {activeFiltersCount > 0 && (
              <Badge variant="secondary">{activeFiltersCount}</Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {activeFiltersCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-xs"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Limpar
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Busca e Ordenação */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar projetos..."
              value={filters.search}
              onChange={(e) => updateFilters({ search: e.target.value })}
              className="pl-9"
            />
          </div>
          <Select
            value={filters.sortBy || 'createdAt'}
            onValueChange={(value) => updateFilters({ sortBy: value as any })}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Nome</SelectItem>
              <SelectItem value="createdAt">Data de Criação</SelectItem>
              <SelectItem value="startDate">Data de Início</SelectItem>
              <SelectItem value="budget">Orçamento</SelectItem>
              <SelectItem value="progress">Progresso</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => updateFilters({ sortOrder: filters.sortOrder === 'asc' ? 'desc' : 'asc' })}
            className="px-3"
          >
            {filters.sortOrder === 'desc' ? (
              <ArrowDown className="h-4 w-4" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Filtros Rápidos */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={filters.status.includes('ACTIVE') ? 'default' : 'outline'}
            size="sm"
            onClick={() => toggleArrayFilter('status', 'ACTIVE')}
          >
            Em Andamento
          </Button>
          <Button
            variant={filters.priority.includes('HIGH') ? 'default' : 'outline'}
            size="sm"
            onClick={() => toggleArrayFilter('priority', 'HIGH')}
          >
            Alta Prioridade
          </Button>
          <Button
            variant={filters.hasOverdueTasks ? 'destructive' : 'outline'}
            size="sm"
            onClick={() => updateFilters({ hasOverdueTasks: !filters.hasOverdueTasks })}
          >
            Com Atraso
          </Button>
        </div>

        {isExpanded && (
          <>
            <Separator />
            
            {/* Filtros Avançados */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Status */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Status</Label>
                <div className="flex flex-wrap gap-1">
                  {PROJECT_STATUSES.map(status => (
                    <Button
                      key={status}
                      variant={filters.status.includes(status) ? 'default' : 'outline'}
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => toggleArrayFilter('status', status)}
                    >
                      {PROJECT_STATUS_LABELS[status]}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Prioridade */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Prioridade</Label>
                <div className="flex flex-wrap gap-1">
                  {PROJECT_PRIORITIES.map(priority => (
                    <Button
                      key={priority}
                      variant={filters.priority.includes(priority) ? 'default' : 'outline'}
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => toggleArrayFilter('priority', priority)}
                    >
                      {PROJECT_PRIORITY_LABELS[priority]}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Tipo */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Tipo</Label>
                <div className="flex flex-wrap gap-1">
                  {PROJECT_TYPES.map(type => (
                    <Button
                      key={type}
                      variant={filters.type.includes(type) ? 'default' : 'outline'}
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => toggleArrayFilter('type', type)}
                    >
                      {PROJECT_TYPE_LABELS[type]}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Cliente */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Cliente</Label>
                <Select
                  value={filters.clientId.length === 1 ? filters.clientId[0] : ''}
                  onValueChange={(value) => {
                    if (value) {
                      updateFilters({ clientId: [value] })
                    } else {
                      updateFilters({ clientId: [] })
                    }
                  }}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Todos os clientes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos os clientes</SelectItem>
                    {clients.map(client => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.companyName || client.contactName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Data de Início */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Data de Início</Label>
                <Popover open={startDateFromOpen} onOpenChange={setStartDateFromOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal h-8 text-xs"
                    >
                      <CalendarIcon className="mr-2 h-3 w-3" />
                      {formatDateRange(filters.startDateFrom, filters.startDateTo)}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <div className="p-3 space-y-3">
                      <div className="space-y-2">
                        <Label className="text-xs">De:</Label>
                        <Calendar
                          mode="single"
                          selected={filters.startDateFrom}
                          onSelect={(date) => updateFilters({ startDateFrom: date })}
                          locale={ptBR}
                          className="rounded-md border"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Até:</Label>
                        <Calendar
                          mode="single"
                          selected={filters.startDateTo}
                          onSelect={(date) => updateFilters({ startDateTo: date })}
                          locale={ptBR}
                          className="rounded-md border"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            updateFilters({ startDateFrom: undefined, startDateTo: undefined })
                            setStartDateFromOpen(false)
                          }}
                        >
                          Limpar
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setStartDateFromOpen(false)}
                        >
                          Aplicar
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Data de Término */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Data de Término</Label>
                <Popover open={endDateFromOpen} onOpenChange={setEndDateFromOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal h-8 text-xs"
                    >
                      <CalendarIcon className="mr-2 h-3 w-3" />
                      {formatDateRange(filters.endDateFrom, filters.endDateTo)}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <div className="p-3 space-y-3">
                      <div className="space-y-2">
                        <Label className="text-xs">De:</Label>
                        <Calendar
                          mode="single"
                          selected={filters.endDateFrom}
                          onSelect={(date) => updateFilters({ endDateFrom: date })}
                          locale={ptBR}
                          className="rounded-md border"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Até:</Label>
                        <Calendar
                          mode="single"
                          selected={filters.endDateTo}
                          onSelect={(date) => updateFilters({ endDateTo: date })}
                          locale={ptBR}
                          className="rounded-md border"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            updateFilters({ endDateFrom: undefined, endDateTo: undefined })
                            setEndDateFromOpen(false)
                          }}
                        >
                          Limpar
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setEndDateFromOpen(false)}
                        >
                          Aplicar
                        </Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Filtros Numéricos */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Orçamento */}
              <div className="space-y-2">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  Orçamento
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Mín"
                    value={filters.budgetMin || ''}
                    onChange={(e) => updateFilters({ 
                      budgetMin: e.target.value ? Number(e.target.value) : undefined 
                    })}
                    className="h-8 text-xs"
                  />
                  <Input
                    type="number"
                    placeholder="Máx"
                    value={filters.budgetMax || ''}
                    onChange={(e) => updateFilters({ 
                      budgetMax: e.target.value ? Number(e.target.value) : undefined 
                    })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {/* Progresso */}
              <div className="space-y-2">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <Target className="h-3 w-3" />
                  Progresso (%)
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Mín"
                    min="0"
                    max="100"
                    value={filters.progressMin || ''}
                    onChange={(e) => updateFilters({ 
                      progressMin: e.target.value ? Number(e.target.value) : undefined 
                    })}
                    className="h-8 text-xs"
                  />
                  <Input
                    type="number"
                    placeholder="Máx"
                    min="0"
                    max="100"
                    value={filters.progressMax || ''}
                    onChange={(e) => updateFilters({ 
                      progressMax: e.target.value ? Number(e.target.value) : undefined 
                    })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Filtros Especiais */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant={filters.isArchived ? 'default' : 'outline'}
                size="sm"
                onClick={() => updateFilters({ isArchived: !filters.isArchived })}
              >
                Arquivados
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// Função utilitária para aplicar filtros
export function applyProjectFilters(projects: Project[], filters: ProjectFiltersState): Project[] {
  let filteredProjects = projects.filter(project => {
    // Busca por texto
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      const matchesSearch = 
        project.name.toLowerCase().includes(searchLower) ||
        project.description?.toLowerCase().includes(searchLower) ||
        project.client?.companyName?.toLowerCase().includes(searchLower) ||
        project.client?.contactName?.toLowerCase().includes(searchLower)
      
      if (!matchesSearch) return false
    }

    // Status
    if (filters.status.length > 0 && !filters.status.includes(project.status)) {
      return false
    }

    // Prioridade
    if (filters.priority.length > 0 && !filters.priority.includes(project.priority)) {
      return false
    }

    // Tipo
    if (filters.type.length > 0 && !filters.type.includes(project.type)) {
      return false
    }

    // Cliente
    if (filters.clientId.length > 0 && !filters.clientId.includes(project.clientId)) {
      return false
    }

    // Data de início
    if (filters.startDateFrom && new Date(project.startDate) < filters.startDateFrom) {
      return false
    }
    if (filters.startDateTo && new Date(project.startDate) > filters.startDateTo) {
      return false
    }

    // Data de término
    if (project.endDate) {
      if (filters.endDateFrom && new Date(project.endDate) < filters.endDateFrom) {
        return false
      }
      if (filters.endDateTo && new Date(project.endDate) > filters.endDateTo) {
        return false
      }
    }

    // Orçamento
    if (filters.budgetMin !== undefined && (project.budget || 0) < filters.budgetMin) {
      return false
    }
    if (filters.budgetMax !== undefined && (project.budget || 0) > filters.budgetMax) {
      return false
    }

    // Progresso
    if (filters.progressMin !== undefined && (project.progress || 0) < filters.progressMin) {
      return false
    }
    if (filters.progressMax !== undefined && (project.progress || 0) > filters.progressMax) {
      return false
    }

    // Arquivados
    if (filters.isArchived !== undefined) {
      const isArchived = project.status === 'ARCHIVED'
      if (filters.isArchived !== isArchived) {
        return false
      }
    }

    return true
  })

  // Aplicar ordenação
  if (filters.sortBy) {
    filteredProjects.sort((a, b) => {
      let aValue: any
      let bValue: any

      switch (filters.sortBy) {
        case 'name':
          aValue = a.name.toLowerCase()
          bValue = b.name.toLowerCase()
          break
        case 'createdAt':
          aValue = new Date(a.createdAt)
          bValue = new Date(b.createdAt)
          break
        case 'startDate':
          aValue = new Date(a.startDate)
          bValue = new Date(b.startDate)
          break
        case 'budget':
          aValue = a.budget || 0
          bValue = b.budget || 0
          break
        case 'progress':
          aValue = a.progress || 0
          bValue = b.progress || 0
          break
        default:
          return 0
      }

      if (aValue < bValue) {
        return filters.sortOrder === 'desc' ? 1 : -1
      }
      if (aValue > bValue) {
        return filters.sortOrder === 'desc' ? -1 : 1
      }
      return 0
    })
  }

  return filteredProjects
}
