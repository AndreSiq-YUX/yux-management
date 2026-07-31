import { z } from 'zod'
import {
  PROJECT_STATUSES,
  PROJECT_PRIORITIES,
  PROJECT_TYPES,
} from '@/types/project'

// Schema base para projetos
export const projectBaseSchema = z.object({
  name: z.string()
    .min(2, 'Nome deve ter pelo menos 2 caracteres')
    .max(100, 'Nome deve ter no máximo 100 caracteres')
    .regex(/^[a-zA-Z0-9\s\-_àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]+$/, 'Nome contém caracteres inválidos'),
  description: z.string()
    .min(10, 'Descrição deve ter pelo menos 10 caracteres')
    .max(1000, 'Descrição deve ter no máximo 1000 caracteres'),
  status: z.enum(PROJECT_STATUSES, {
    errorMap: () => ({ message: 'Status inválido' })
  }),
  priority: z.enum(PROJECT_PRIORITIES, {
    errorMap: () => ({ message: 'Prioridade inválida' })
  }),
  type: z.enum(PROJECT_TYPES, {
    errorMap: () => ({ message: 'Tipo de projeto inválido' })
  }),
  budget: z.number()
    .min(0, 'Orçamento deve ser maior ou igual a zero')
    .max(999999999, 'Orçamento muito alto')
    .refine((value) => {
      // Verifica se tem no máximo 2 casas decimais
      return Number.isInteger(value * 100)
    }, 'Orçamento deve ter no máximo 2 casas decimais'),
  currency: z.string()
    .length(3, 'Código da moeda deve ter 3 caracteres')
    .regex(/^[A-Z]{3}$/, 'Código da moeda inválido')
    .default('BRL'),
  clientId: z.string()
    .min(1, 'Cliente é obrigatório')
    .uuid('ID do cliente inválido'),
  managerId: z.string()
    .uuid('ID do gerente inválido')
    .optional()
    .or(z.literal('')),
  teamMembers: z.array(z.string().uuid('ID de membro da equipe inválido'))
    .max(20, 'Máximo de 20 membros na equipe')
    .optional(),
  tags: z.array(z.string()
    .min(1, 'Tag não pode estar vazia')
    .max(30, 'Tag deve ter no máximo 30 caracteres')
    .regex(/^[a-zA-Z0-9\-_]+$/, 'Tag contém caracteres inválidos'))
    .max(10, 'Máximo de 10 tags por projeto')
    .optional(),
  notes: z.string()
    .max(2000, 'Notas devem ter no máximo 2000 caracteres')
    .optional(),
})

// Schema para validação de datas
export const projectDateSchema = z.object({
  startDate: z.string()
    .min(1, 'Data de início é obrigatória')
    .refine((date) => {
      const parsedDate = new Date(date)
      return !isNaN(parsedDate.getTime())
    }, 'Data de início inválida'),
  expectedEndDate: z.string()
    .min(1, 'Data prevista de término é obrigatória')
    .refine((date) => {
      const parsedDate = new Date(date)
      return !isNaN(parsedDate.getTime())
    }, 'Data prevista de término inválida'),
})

// Schema completo para formulário de projeto
export const projectFormSchema = projectBaseSchema
  .merge(projectDateSchema)
  .refine((data) => {
    const startDate = new Date(data.startDate)
    const endDate = new Date(data.expectedEndDate)
    return endDate >= startDate
  }, {
    message: 'Data de término deve ser posterior ou igual à data de início',
    path: ['expectedEndDate'],
  })
  .refine((data) => {
    const startDate = new Date(data.startDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    // Permite datas passadas apenas para projetos em edição
    // Para novos projetos, a data deve ser hoje ou futura
    return startDate >= today || data.status !== 'PLANNING'
  }, {
    message: 'Data de início deve ser hoje ou futura para novos projetos',
    path: ['startDate'],
  })
  .refine((data) => {
    const startDate = new Date(data.startDate)
    const endDate = new Date(data.expectedEndDate)
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    // Projeto não pode durar mais de 5 anos (1825 dias)
    return diffDays <= 1825
  }, {
    message: 'Duração do projeto não pode exceder 5 anos',
    path: ['expectedEndDate'],
  })

// Schema para atualização de projeto (campos opcionais)
export const projectUpdateSchema = projectBaseSchema
  .merge(projectDateSchema)
  .partial()
  .refine((data) => {
    if (data.startDate && data.expectedEndDate) {
      const startDate = new Date(data.startDate)
      const endDate = new Date(data.expectedEndDate)
      return endDate >= startDate
    }
    return true
  }, {
    message: 'Data de término deve ser posterior ou igual à data de início',
    path: ['expectedEndDate'],
  })

// Schema para filtros de projeto
export const projectFiltersSchema = z.object({
  search: z.string().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  priority: z.enum(PROJECT_PRIORITIES).optional(),
  clientId: z.string().uuid().optional(),
  managerId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  budgetMin: z.number().min(0).optional(),
  budgetMax: z.number().min(0).optional(),
  tags: z.array(z.string()).optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(10),
})

// Schema para progresso do projeto
export const projectProgressSchema = z.object({
  progress: z.number()
    .min(0, 'Progresso deve ser maior ou igual a 0%')
    .max(100, 'Progresso deve ser menor ou igual a 100%'),
})

// Schema para status do projeto
export const projectStatusSchema = z.object({
  status: z.enum(PROJECT_STATUSES),
})

// Tipos derivados dos schemas
export type ProjectFormData = z.infer<typeof projectFormSchema>
export type ProjectUpdateData = z.infer<typeof projectUpdateSchema>
export type ProjectFiltersData = z.infer<typeof projectFiltersSchema>
export type ProjectProgressData = z.infer<typeof projectProgressSchema>
export type ProjectStatusData = z.infer<typeof projectStatusSchema>

// Validadores utilitários
export const validateProjectId = (id: string): boolean => {
  return z.string().uuid().safeParse(id).success
}

export const validateProjectName = (name: string): boolean => {
  return projectBaseSchema.shape.name.safeParse(name).success
}

export const validateProjectBudget = (budget: number): boolean => {
  return projectBaseSchema.shape.budget.safeParse(budget).success
}

export const validateProjectDates = (startDate: string, endDate: string): boolean => {
  const result = projectDateSchema.safeParse({ startDate, endDate })
  if (!result.success) return false
  
  const start = new Date(startDate)
  const end = new Date(endDate)
  return end >= start
}