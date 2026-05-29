// Tipos e interfaces para o módulo de Clientes

export interface Address {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface ClientProject {
  id: string;
  name: string;
  description: string;
  status: 'planning' | 'active' | 'review' | 'completed' | 'cancelled';
  serviceLevel: 1 | 2 | 3;
  startDate: string;
  expectedEndDate: string;
  actualEndDate?: string;
  budget: number;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClientInteraction {
  id: string;
  type: 'call' | 'email' | 'meeting' | 'proposal' | 'contract' | 'support';
  date: string;
  description: string;
  outcome?: string;
  nextAction?: string;
  createdBy: string;
  createdAt: string;
}

export interface Client {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  website?: string;
  sector: string;
  size: 'small' | 'medium' | 'large';
  address?: Address;
  userId?: string; // Link to User account if client has portal access
  leadSource: string;
  acquisitionCost?: number;
  lifetimeValue?: number;
  totalRevenue?: number;
  averageProjectValue?: number;
  projectsCount?: number;
  lastInteraction?: string;
  status: 'active' | 'inactive' | 'prospect' | 'churned';
  tags?: string[];
  // Preferências e tecnologias (opcional, alinhado com UI atual)
  preferredTechnologies?: string[];
  communicationPreferences?: CommunicationPreference[];
  notes?: string;
  assignedTo?: string; // User ID of account manager
  createdAt: string;
  updatedAt: string;
  
  // Relacionamentos
  projects?: ClientProject[];
  interactions?: ClientInteraction[];
}

export interface ClientFilters {
  search?: string;
  sector?: string;
  size?: 'small' | 'medium' | 'large';
  leadSource?: string;
  status?: 'active' | 'inactive' | 'prospect' | 'churned';
  assignedTo?: string;
  minLifetimeValue?: number;
  maxLifetimeValue?: number;
  createdAfter?: string;
  createdBefore?: string;
  hasActiveProjects?: boolean;
  tags?: string[];
  // Campos utilizados na UI atual (filtros avançados)
  sizes?: Array<'small' | 'medium' | 'large'>;
  leadSources?: string[];
  statuses?: Array<'active' | 'inactive' | 'prospect' | 'churned'>;
  minValue?: number;
  maxValue?: number;
  startDate?: string;
  endDate?: string;
}

export interface ClientFormData {
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  website?: string;
  sector: string;
  size: 'small' | 'medium' | 'large';
  leadSource: string;
  acquisitionCost?: number;
  address?: Partial<Address>;
  notes?: string;
  tags?: string[];
  assignedTo?: string;
  preferredTechnologies?: string[];
  communicationPreferences?: CommunicationPreference[];
}

export interface ClientStats {
  totalClients: number;
  activeClients: number;
  totalRevenue: number;
  averageValue: number;
  newClientsThisMonth: number;
  conversionRate: number;
  growthRate?: number;
  topSector?: string;
}

// Constantes para dropdowns e validações
export const CLIENT_SIZES = [
  { value: 'small', label: 'Pequena (1-10 funcionários)' },
  { value: 'medium', label: 'Média (11-50 funcionários)' },
  { value: 'large', label: 'Grande (50+ funcionários)' }
] as const;

export const CLIENT_SECTORS = [
  'Tecnologia',
  'Saúde',
  'Educação',
  'Varejo',
  'E-commerce',
  'Serviços Financeiros',
  'Imobiliário',
  'Alimentação',
  'Beleza e Estética',
  'Consultoria',
  'Advocacia',
  'Contabilidade',
  'Marketing',
  'Construção',
  'Indústria',
  'Logística',
  'Turismo',
  'Outros'
] as const;

export const LEAD_SOURCES = [
  'Google Ads',
  'Meta Ads',
  'LinkedIn',
  'Indicação',
  'Site Orgânico',
  'Email Marketing',
  'Evento',
  'Cold Outreach',
  'Parceiro',
  'Outros'
] as const;

export const CLIENT_STATUSES = [
  { value: 'prospect', label: 'Prospect', color: 'blue' },
  { value: 'active', label: 'Ativo', color: 'green' },
  { value: 'inactive', label: 'Inativo', color: 'gray' },
  { value: 'churned', label: 'Perdido', color: 'red' }
] as const;

// Preferências de comunicação canônicas (para tipagem e reuso em UI/form)
export const COMMUNICATION_PREFERENCES = [
  'email',
  'phone',
  'whatsapp',
  'slack',
  'other'
] as const;
export type CommunicationPreference = typeof COMMUNICATION_PREFERENCES[number];
export const INTERACTION_TYPES = [
  { value: 'call', label: 'Ligação', icon: 'Phone' },
  { value: 'email', label: 'Email', icon: 'Mail' },
  { value: 'meeting', label: 'Reunião', icon: 'Calendar' },
  { value: 'proposal', label: 'Proposta', icon: 'FileText' },
  { value: 'contract', label: 'Contrato', icon: 'FileCheck' },
  { value: 'support', label: 'Suporte', icon: 'HelpCircle' }
] as const;