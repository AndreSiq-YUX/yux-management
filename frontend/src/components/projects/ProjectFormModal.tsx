import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { CalendarIcon, Loader2, X } from 'lucide-react'
import { format, parse } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import {
  Project,
  ProjectFormData,
  PROJECT_STATUSES,
  PROJECT_PRIORITIES,
  PROJECT_TYPES,
  PROJECT_STATUS_LABELS,
  PROJECT_PRIORITY_LABELS,
  PROJECT_TYPE_LABELS,
} from '@/types/project'
import { Client } from '@/types/client'
import { supabaseService } from '@/services/supabaseService'
import { projectFormSchema } from '@/lib/validations/project'
import toast from 'react-hot-toast'

interface ProjectFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: ProjectFormData) => Promise<void>
  project?: Project | null
  isLoading?: boolean
}

export function ProjectFormModal({
  isOpen,
  onClose,
  onSave,
  project,
  isLoading = false,
}: ProjectFormModalProps) {
  const [clients, setClients] = useState<Client[]>([])
  const [loadingClients, setLoadingClients] = useState(false)
  const [newTag, setNewTag] = useState('')

  const form = useForm<ProjectFormData>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: '',
      description: '',
      status: 'PLANNING',
      priority: 'MEDIUM',
      type: 'WEBSITE',
      startDate: '',
      expectedEndDate: '',
      budget: 0,
      currency: 'BRL',
      clientId: '',
      managerId: '',
      teamMembers: [],
      tags: [],
      notes: '',
    },
  })

  const { watch, setValue, getValues } = form
  const tags = watch('tags') || []

  // Carregar clientes
  useEffect(() => {
    const fetchClients = async () => {
      setLoadingClients(true)
      try {
        const response: any = await supabaseService.getClients({ page: 1, limit: 1000 })

        // Suportar múltiplos formatos de retorno
        let clientsData: any[] = []
        if (response?.success && response?.data) {
          clientsData = Array.isArray(response.data?.clients)
            ? response.data.clients
            : Array.isArray(response.data)
              ? response.data
              : []
        } else if (Array.isArray(response?.clients)) {
          clientsData = response.clients
        } else if (Array.isArray(response)) {
          clientsData = response
        }

        setClients(Array.isArray(clientsData) ? clientsData : [])
        console.debug('[ProjectFormModal] Clientes carregados:', clientsData.length)
      } catch (error) {
        console.error('Erro ao carregar clientes:', error)
        toast.error('Erro ao carregar clientes')
      } finally {
        setLoadingClients(false)
      }
    }

    if (isOpen) {
      fetchClients()
    }
  }, [isOpen])

  // Preencher formulário quando editando
  useEffect(() => {
    if (project && isOpen) {
      form.reset({
        name: project.name,
        description: project.description,
        status: project.status,
        priority: project.priority,
        type: project.type,
        startDate: project.startDate,
        expectedEndDate: project.expectedEndDate,
        budget: project.budget,
        currency: project.currency,
        clientId: project.clientId,
        managerId: project.managerId || '',
        teamMembers: project.teamMembers || [],
        tags: project.tags || [],
        notes: project.notes || '',
      })
    } else if (!project && isOpen) {
      form.reset({
        name: '',
        description: '',
        status: 'PLANNING',
        priority: 'MEDIUM',
        type: 'WEBSITE',
        startDate: '',
        expectedEndDate: '',
        budget: 0,
        currency: 'BRL',
        clientId: '',
        managerId: '',
        teamMembers: [],
        tags: [],
        notes: '',
      })
    }
  }, [project, isOpen, form])

  const handleSubmit = async (data: ProjectFormData) => {
    try {
      const formData: ProjectFormData = {
        ...data,
        tags,
      }

      console.debug('[ProjectFormModal] handleSubmit -> payload', {
        mode: project ? 'update' : 'create',
        data: formData,
      })
      
      if (project) {
        // Atualizar projeto existente
        console.debug('[ProjectFormModal] updateProject -> request', {
          id: project.id,
          data: formData,
        })
        const response = await supabaseService.updateProject(project.id, formData)
        console.debug('[ProjectFormModal] updateProject -> response', response)
        toast.success('Projeto atualizado com sucesso!')
      } else {
        // Criar novo projeto
        console.debug('[ProjectFormModal] createProject -> request', {
          data: formData,
        })
        const response = await supabaseService.createProject(formData)
        console.debug('[ProjectFormModal] createProject -> response', response)
        toast.success('Projeto criado com sucesso!')
      }
      
      form.reset()
      setNewTag('')
      onClose()
      
      // Chamar callback se fornecido
      if (onSave) {
        await onSave(formData)
      }
    } catch (error) {
      console.error('[ProjectFormModal] handleSubmit -> error', error)
      toast.error('Erro ao salvar projeto')
    }
  }

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setValue('tags', [...tags, newTag.trim()])
      setNewTag('')
    }
  }

  const removeTag = (tagToRemove: string) => {
    setValue('tags', tags.filter(tag => tag !== tagToRemove))
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {project ? 'Editar Projeto' : 'Novo Projeto'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Informe os dados para criar ou editar um projeto.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* Informações Básicas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do Projeto *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Website Institucional" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um cliente" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {loadingClients ? (
                          <SelectItem value="loading" disabled>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Carregando...
                          </SelectItem>
                        ) : (
                          clients.map((client) => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.companyName}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descreva o escopo e objetivos do projeto..."
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Status e Configurações */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PROJECT_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {PROJECT_STATUS_LABELS[status]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prioridade *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PROJECT_PRIORITIES.map((priority) => (
                          <SelectItem key={priority} value={priority}>
                            {PROJECT_PRIORITY_LABELS[priority]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PROJECT_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {PROJECT_TYPE_LABELS[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Datas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Data de Início *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              format(parse(field.value, 'yyyy-MM-dd', new Date()), 'PPP', { locale: ptBR })
                            ) : (
                              <span>Selecione uma data</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          locale={ptBR}
                          selected={field.value ? parse(field.value, 'yyyy-MM-dd', new Date()) : undefined}
                          onSelect={(date) => field.onChange(date ? format(date, 'yyyy-MM-dd') : undefined)}
                          disabled={(date) => date < new Date('1900-01-01')}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expectedEndDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Data Prevista de Término *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              format(parse(field.value, 'yyyy-MM-dd', new Date()), 'PPP', { locale: ptBR })
                            ) : (
                              <span>Selecione uma data</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          locale={ptBR}
                          selected={field.value ? parse(field.value, 'yyyy-MM-dd', new Date()) : undefined}
                          onSelect={(date) => field.onChange(date ? format(date, 'yyyy-MM-dd') : undefined)}
                          disabled={(date) => date < new Date('1900-01-01')}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Orçamento */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="budget"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Orçamento *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="0.00"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Moeda</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="BRL">Real (R$)</SelectItem>
                        <SelectItem value="USD">Dólar ($)</SelectItem>
                        <SelectItem value="EUR">Euro (€)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <FormLabel>Tags</FormLabel>
              <div className="flex flex-wrap gap-2 mb-2">
                {tags.map((tag: string) => (
                  <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                    {tag}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => removeTag(tag)}
                    />
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Adicionar tag..."
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyPress={handleKeyPress}
                />
                <Button type="button" variant="outline" onClick={addTag}>
                  Adicionar
                </Button>
              </div>
            </div>

            {/* Observações */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Observações adicionais sobre o projeto..."
                      className="min-h-[80px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {project ? 'Atualizar' : 'Criar'} Projeto
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
