import { supabase } from '@/lib/supabase'
import { Project, ProjectPhase, ProjectTask } from '@/types/project'

export class SupabaseService {
  private mapProject(row: any): Project {
    const client = row.clients ? {
      id: row.clients.id,
      companyName: row.clients.company_name,
      contactName: row.clients.contact_name,
      email: row.clients.email || undefined,
    } : undefined

    return {
      id: row.id,
      name: row.name,
      description: row.description || '',
      status: row.status || 'PLANNING',
      priority: row.priority || 'MEDIUM',
      type: row.type || 'OTHER',
      startDate: row.start_date,
      expectedEndDate: row.expected_end_date,
      actualEndDate: row.actual_end_date || undefined,
      endDate: row.expected_end_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      budget: Number(row.budget || 0),
      actualCost: Number(row.actual_cost || 0),
      spent: Number(row.spent || row.actual_cost || 0),
      currency: row.currency || 'BRL',
      progress: Number(row.progress || 0),
      completedTasks: Number(row.completed_tasks || 0),
      totalTasks: Number(row.total_tasks || 0),
      clientId: row.client_id,
      client,
      managerId: row.manager_id || undefined,
      teamMembers: row.team_members || [],
      isActive: row.is_active ?? row.status !== 'ARCHIVED',
      isArchived: row.is_archived ?? row.status === 'ARCHIVED',
      phases: Array.isArray(row.project_phases) ? row.project_phases.map((phase: any) => this.mapProjectPhase(phase, row.id)) : undefined,
      tasks: Array.isArray(row.project_tasks) ? row.project_tasks.map((task: any) => this.mapProjectTask(task, row.id)) : undefined,
      tags: row.tags || [],
      notes: row.notes || undefined,
    }
  }

  private mapProjectTask(row: any, fallbackProjectId?: string): ProjectTask {
    return {
      id: row.id,
      projectId: row.project_id || fallbackProjectId || '',
      phaseId: row.phase_id || undefined,
      title: row.title,
      description: row.description || undefined,
      status: row.status || 'pending',
      priority: row.priority || 'medium',
      assignedTo: row.assigned_to || undefined,
      dueDate: row.due_date || undefined,
      completedAt: row.completed_at || undefined,
      estimatedHours: row.estimated_hours !== null && row.estimated_hours !== undefined ? Number(row.estimated_hours) : undefined,
      actualHours: row.actual_hours !== null && row.actual_hours !== undefined ? Number(row.actual_hours) : undefined,
      orderIndex: Number(row.order_index || 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private mapProjectPhase(row: any, fallbackProjectId?: string): ProjectPhase {
    return {
      id: row.id,
      projectId: row.project_id || fallbackProjectId || '',
      name: row.name,
      description: row.description || undefined,
      status: row.status || 'planning',
      startDate: row.start_date || undefined,
      endDate: row.end_date || undefined,
      budget: row.budget !== null && row.budget !== undefined ? Number(row.budget) : undefined,
      actualCost: row.actual_cost !== null && row.actual_cost !== undefined ? Number(row.actual_cost) : undefined,
      progress: Number(row.progress || 0),
      orderIndex: Number(row.order_index || 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private mapCampaign(row: any) {
    return {
      id: row.id,
      name: row.name,
      platform: row.platform,
      status: row.status,
      budget: Number(row.budget || 0),
      spent: Number(row.spent || 0),
      impressions: Number(row.impressions || 0),
      clicks: Number(row.clicks || 0),
      conversions: Number(row.conversions || 0),
      cpc: Number(row.cpc || 0),
      ctr: Number(row.ctr || 0),
      roas: Number(row.roas || 0),
      startDate: row.start_date,
      endDate: row.end_date || undefined,
      lastSyncAt: row.last_sync_at,
    }
  }

  // Auth methods
  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    
    if (error) throw error
    return data
  }

  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  async getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) throw error
    
    if (!user) return null

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError) throw profileError
    return { user, profile }
  }

  // Dashboard methods
  async getDashboardStats() {
    const [
      { count: totalClients },
      { count: totalProjects },
      { count: totalLeads },
      { count: totalCampaigns },
      { count: activeProjects },
      { count: qualifiedLeads }
    ] = await Promise.all([
      supabase.from('clients').select('*', { count: 'exact', head: true }),
      supabase.from('projects').select('*', { count: 'exact', head: true }),
      supabase.from('leads').select('*', { count: 'exact', head: true }),
      supabase.from('campaigns').select('*', { count: 'exact', head: true }),
      supabase.from('projects').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
      supabase.from('leads').select('*', { count: 'exact', head: true }).in('stage', ['QUALIFIED', 'PROPOSAL', 'NEGOTIATION'])
    ])

    // Get recent projects
    const { data: recentProjects } = await supabase
      .from('projects')
      .select(`
        *,
        clients (company_name, contact_name)
      `)
      .order('updated_at', { ascending: false })
      .limit(5)

    // Get campaign metrics
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('*')
      .eq('status', 'ACTIVE')

    const totalBudget = campaigns?.reduce((sum, c) => sum + c.budget, 0) || 0
    const totalSpent = campaigns?.reduce((sum, c) => sum + c.spent, 0) || 0
    const totalImpressions = campaigns?.reduce((sum, c) => sum + c.impressions, 0) || 0
    const totalClicks = campaigns?.reduce((sum, c) => sum + c.clicks, 0) || 0
    const avgROAS = campaigns?.length ? campaigns.reduce((sum, c) => sum + c.roas, 0) / campaigns.length : 0

    return {
      overview: {
        totalClients: totalClients || 0,
        totalProjects: totalProjects || 0,
        totalLeads: totalLeads || 0,
        totalCampaigns: totalCampaigns || 0,
        activeProjects: activeProjects || 0,
        qualifiedLeads: qualifiedLeads || 0
      },
      financial: {
        totalRevenue: 0, // Calculate from completed projects
        totalBudget,
        totalCampaignSpent: totalSpent,
        budgetUtilization: totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0
      },
      marketing: {
        totalImpressions,
        totalClicks,
        ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
        avgROAS
      },
      conversion: {
        leadConversionRate: 0, // Calculate from leads
        projectCompletionRate: 0 // Calculate from projects
      },
      recent: {
        projects: recentProjects?.map(p => ({
          id: p.id,
          name: p.name,
          client: p.clients?.company_name || '',
          status: p.status,
          progress: Math.floor(Math.random() * 100) // Mock progress
        })) || [],
        leads: [], // Get recent leads
        tasks: [] // Mock tasks
      }
    }
  }

  // Client methods
  async getClients(params?: { page?: number; limit?: number; search?: string; sector?: string; sizes?: string[]; leadSources?: string[]; minValue?: number; maxValue?: number; startDate?: string; endDate?: string }) {
    const { page = 1, limit = 10, search, sector, sizes, leadSources, minValue, maxValue, startDate, endDate } = params || {}
    const from = (page - 1) * limit
    const to = from + limit - 1

    let query = supabase
      .from('clients')
      .select(`
        *,
        projects (id, name, status, budget)
      `, { count: 'exact' })
      .range(from, to)
      .order('created_at', { ascending: false })

    if (search) {
      query = query.or(`company_name.ilike.%${search}%,contact_name.ilike.%${search}%,email.ilike.%${search}%`)
    }

    if (sector) {
      query = query.eq('sector', sector)
    }

    if (sizes && sizes.length > 0) {
      query = query.in('size', sizes)
    }

    if (leadSources && leadSources.length > 0) {
      query = query.in('lead_source', leadSources)
    }

    if (typeof minValue === 'number') {
      query = query.gte('lifetime_value', minValue)
    }

    if (typeof maxValue === 'number') {
      query = query.lte('lifetime_value', maxValue)
    }

    if (startDate) {
      query = query.gte('created_at', new Date(startDate).toISOString())
    }

    if (endDate) {
      // incluir todo o dia final
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)
      query = query.lte('created_at', end.toISOString())
    }

    const { data, error, count } = await query

    if (error) throw error

    const mapped = (data || []).map((row: any) => ({
      id: row.id,
      userId: row.user_id || undefined,
      companyName: row.company_name,
      contactName: row.contact_name,
      email: row.email,
      phone: row.phone || undefined,
      website: row.website || undefined,
      sector: row.sector,
      size: row.size,
      address: row.address || undefined,
      leadSource: row.lead_source,
      acquisitionCost: row.acquisition_cost ?? undefined,
      lifetimeValue: row.lifetime_value ?? undefined,
      totalRevenue: row.total_revenue ?? undefined,
      averageProjectValue: row.average_project_value ?? undefined,
      projectsCount: Array.isArray(row.projects) ? row.projects.length : (row.projects_count ?? undefined),
      lastInteraction: row.last_interaction ?? undefined,
      status: row.status || 'active',
      tags: row.tags || undefined,
      preferredTechnologies: row.preferred_technologies || undefined,
      communicationPreferences: Array.isArray(row.communication_preferences) ? row.communication_preferences : (row.communication_preferences ? [row.communication_preferences] : undefined),
      notes: row.notes || undefined,
      assignedTo: row.assigned_to || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      projects: Array.isArray(row.projects)
        ? row.projects.map((p: any) => ({ id: p.id, name: p.name, status: p.status, budget: p.budget }))
        : []
    }))

    return {
      success: true,
      data: mapped,
      clients: mapped,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
        hasNext: page < Math.ceil((count || 0) / limit),
        hasPrev: page > 1
      }
    }
  }

  async getClientById(id: string) {
    const { data, error } = await supabase
      .from('clients')
      .select(`
        *,
        users (id, name, email, role, last_login),
        projects (
          id, name, status, budget
        )
      `)
      .eq('id', id)
      .single()

    if (error) throw error

    const row: any = data
    const mapped = {
      id: row.id,
      userId: row.user_id || undefined,
      companyName: row.company_name,
      contactName: row.contact_name,
      email: row.email,
      phone: row.phone || undefined,
      website: row.website || undefined,
      sector: row.sector,
      size: row.size,
      address: row.address || undefined,
      leadSource: row.lead_source,
      acquisitionCost: row.acquisition_cost ?? undefined,
      lifetimeValue: row.lifetime_value ?? undefined,
      totalRevenue: row.total_revenue ?? undefined,
      averageProjectValue: row.average_project_value ?? undefined,
      projectsCount: Array.isArray(row.projects) ? row.projects.length : (row.projects_count ?? undefined),
      lastInteraction: row.last_interaction ?? undefined,
      status: row.status || 'active',
      tags: row.tags || undefined,
      preferredTechnologies: row.preferred_technologies || undefined,
      communicationPreferences: Array.isArray(row.communication_preferences) ? row.communication_preferences : (row.communication_preferences ? [row.communication_preferences] : undefined),
      notes: row.notes || undefined,
      assignedTo: row.assigned_to || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      projects: Array.isArray(row.projects)
        ? row.projects.map((p: any) => ({ id: p.id, name: p.name, status: p.status, budget: p.budget }))
        : []
    }

    return { success: true, data: mapped, client: mapped }
  }

  async getClientStats() {
    try {
      // Get total clients count
      const { count: totalClients } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true })

      // Get active clients (clients with active projects)
      const { count: activeClients } = await supabase
        .from('clients')
        .select(`
          id,
          projects!inner(status)
        `, { count: 'exact', head: true })
        .eq('projects.status', 'ACTIVE')

      // Get total revenue from completed projects
      const { data: completedProjects } = await supabase
        .from('projects')
        .select('budget')
        .eq('status', 'COMPLETED')

      const totalRevenue = completedProjects?.reduce((sum, project) => sum + (project.budget || 0), 0) || 0

      // Calculate average client value
      const averageValue = totalClients ? totalRevenue / totalClients : 0

      // Get new clients this month
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const { count: newClientsThisMonth } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfMonth.toISOString())

      // Mock conversion rate for now
      const conversionRate = 75

      return {
        success: true,
        data: {
          totalClients: totalClients || 0,
          activeClients: activeClients || 0,
          totalRevenue,
          averageValue,
          newClientsThisMonth: newClientsThisMonth || 0,
          conversionRate
        }
      }
    } catch (error) {
      console.error('Error fetching client stats:', error)
      return {
        success: false,
        error: 'Failed to fetch client statistics'
      }
    }
  }



  // Campaign methods
  async getCampaigns(params?: {
    page?: number;
    limit?: number;
    platform?: string;
    status?: string;
  }) {
    const { page = 1, limit = 10, platform, status } = params || {}
    const from = (page - 1) * limit
    const to = from + limit - 1

    let query = supabase
      .from('campaigns')
      .select('*', { count: 'exact' })
      .range(from, to)
      .order('last_sync_at', { ascending: false })

    if (platform) {
      query = query.eq('platform', platform)
    }

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error, count } = await query

    if (error) throw error

    const mappedCampaigns = (data || []).map(row => this.mapCampaign(row))

    return {
      success: true,
      data: mappedCampaigns,
      campaigns: mappedCampaigns,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
        hasNext: page < Math.ceil((count || 0) / limit),
        hasPrev: page > 1
      }
    }
  }

  async syncCampaigns() {
    // Mock sync - in real implementation, this would call Edge Functions
    // that sync with Google Ads and Meta APIs
    
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('*')
      .eq('status', 'ACTIVE')

    let syncedCount = 0

    for (const campaign of campaigns || []) {
      // Mock updating metrics with random variations
      const impressionVariation = Math.floor(Math.random() * 1000)
      const clickVariation = Math.floor(Math.random() * 50)
      const conversionVariation = Math.floor(Math.random() * 5)
      const spentVariation = Math.random() * 100

      await supabase
        .from('campaigns')
        .update({
          impressions: campaign.impressions + impressionVariation,
          clicks: campaign.clicks + clickVariation,
          conversions: campaign.conversions + conversionVariation,
          spent: Math.min(campaign.spent + spentVariation, campaign.budget),
          last_sync_at: new Date().toISOString()
        })
        .eq('id', campaign.id)

      syncedCount++
    }

    return {
      message: 'Campaigns synchronized successfully',
      syncedCount,
      lastSync: new Date().toISOString()
    }
  }

  async updateCampaignStatus(id: string, status: string) {
    const { data, error } = await supabase
      .from('campaigns')
      .update({ 
        status: status as any,
        ...(status === 'ENDED' && { end_date: new Date().toISOString().split('T')[0] })
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return { campaign: data }
  }

  // Lead methods
  async getLeads(params?: {
    page?: number;
    limit?: number;
    search?: string;
    stage?: string;
    source?: string;
  }) {
    const { page = 1, limit = 10, search, stage, source } = params || {}
    const from = (page - 1) * limit
    const to = from + limit - 1

    let query = supabase
      .from('leads')
      .select(`
        *,
        campaigns (id, name, platform),
        clients (id, company_name, contact_name)
      `, { count: 'exact' })
      .range(from, to)
      .order('created_at', { ascending: false })

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`)
    }

    if (stage) {
      query = query.eq('stage', stage)
    }

    if (source) {
      query = query.eq('source', source)
    }

    const { data, error, count } = await query

    if (error) throw error

    return {
      success: true,
      data: data || [],
      leads: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
        hasNext: page < Math.ceil((count || 0) / limit),
        hasPrev: page > 1
      }
    }
  }

  // User methods
  async getUsers(params?: { limit?: number; search?: string }) {
    const { limit = 100, search } = params || {}
    
    let query = supabase
      .from('users')
      .select('*')
      .limit(limit)
      .order('name')
    
    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`)
    }
    
    const { data, error } = await query
    
    if (error) throw error
    
    return {
      success: true,
      data: data || []
    }
  }

  // Client CRUD methods
  async createClient(clientData: any) {
    try {
      // Log temporário do payload que será enviado
      console.debug('[SupabaseService] createClient payload:', clientData)

      const { data, error } = await supabase
        .from('clients')
        .insert({
          company_name: clientData.companyName,
          contact_name: clientData.contactName,
          email: clientData.email,
          phone: clientData.phone,
          website: clientData.website,
          sector: clientData.sector,
          size: clientData.size,
          lead_source: clientData.leadSource,
          acquisition_cost: clientData.acquisitionCost,
          address: clientData.address,
          notes: clientData.notes,
          tags: clientData.tags,
          assigned_to: clientData.assignedTo,
          preferred_technologies: clientData.preferredTechnologies,
          communication_preferences: clientData.communicationPreferences
        })
        .select()
        .single()
      
      if (error) throw error
      
      return {
        success: true,
        data
      }
    } catch (error: any) {
      // Log detalhado do erro retornado pelo Supabase/PostgREST
      console.error('Error creating client:', error)
      return {
        success: false,
        error: error?.message ? { message: error.message, details: error?.details, hint: error?.hint, code: error?.code } : 'Failed to create client'
      }
    }
  }

  async updateClient(id: string, clientData: any) {
    try {
      const { data, error } = await supabase
        .from('clients')
        .update({
          company_name: clientData.companyName,
          contact_name: clientData.contactName,
          email: clientData.email,
          phone: clientData.phone,
          website: clientData.website,
          sector: clientData.sector,
          size: clientData.size,
          lead_source: clientData.leadSource,
          acquisition_cost: clientData.acquisitionCost,
          address: clientData.address,
          notes: clientData.notes,
          tags: clientData.tags,
          assigned_to: clientData.assignedTo,
          preferred_technologies: clientData.preferredTechnologies,
          communication_preferences: clientData.communicationPreferences
        })
        .eq('id', id)
        .select()
        .single()
      
      if (error) throw error
      
      return {
        success: true,
        data
      }
    } catch (error) {
      console.error('Error updating client:', error)
      return {
        success: false,
        error: 'Failed to update client'
      }
    }
  }

  async deleteClient(id: string) {
    try {
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', id)
      
      if (error) throw error
      
      return {
        success: true
      }
    } catch (error) {
      console.error('Error deleting client:', error)
      return {
        success: false,
        error: 'Failed to delete client'
      }
    }
  }

  // Suggestions for clients (tags and preferred technologies)
  async getClientSuggestions(params?: { limit?: number }) {
    const { limit = 500 } = params || {}

    const { data, error } = await supabase
      .from('clients')
      .select('tags, preferred_technologies')
      .limit(limit)

    if (error) throw error

    const tagSet = new Set<string>()
    const techSet = new Set<string>()

    for (const row of data || []) {
      const tags: string[] | null = (row as any).tags || null
      const techs: string[] | null = (row as any).preferred_technologies || null
      if (Array.isArray(tags)) {
        tags.forEach(t => {
          const v = String(t).trim()
          if (v) tagSet.add(v)
        })
      }
      if (Array.isArray(techs)) {
        techs.forEach(t => {
          const v = String(t).trim()
          if (v) techSet.add(v)
        })
      }
    }

    return {
      success: true,
      data: {
        tags: Array.from(tagSet).sort((a, b) => a.localeCompare(b)),
        technologies: Array.from(techSet).sort((a, b) => a.localeCompare(b))
      }
    }
  }

  // Project methods
  async getProjects(params?: {
    page?: number
    limit?: number
    search?: string
    status?: string
    priority?: string
    clientId?: string
    managerId?: string
    startDate?: string
    endDate?: string
    tags?: string[]
    budgetMin?: number
    budgetMax?: number
  }) {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      status, 
      priority, 
      clientId, 
      managerId, 
      startDate, 
      endDate, 
      tags,
      budgetMin,
      budgetMax
    } = params || {}

    let query = supabase
      .from('projects')
      .select(`
        *,
        clients (
          id,
          company_name,
          contact_name,
          email
        )
      `, { count: 'exact' })

    // Apply filters
    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`)
    }

    if (status) {
      query = query.eq('status', status)
    }

    if (priority) {
      query = query.eq('priority', priority)
    }

    if (clientId) {
      query = query.eq('client_id', clientId)
    }

    if (managerId) {
      query = query.eq('manager_id', managerId)
    }

    if (startDate) {
      query = query.gte('start_date', startDate)
    }

    if (endDate) {
      query = query.lte('expected_end_date', endDate)
    }

    if (budgetMin) {
      query = query.gte('budget', budgetMin)
    }

    if (budgetMax) {
      query = query.lte('budget', budgetMax)
    }

    if (tags && tags.length > 0) {
      query = query.overlaps('tags', tags)
    }

    // Apply pagination
    const from = (page - 1) * limit
    const to = from + limit - 1

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) throw error

    const mappedProjects = (data || []).map(row => this.mapProject(row))

    return {
      success: true,
      data: mappedProjects,
      projects: mappedProjects,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit)
    }
  }

  async createProject(projectData: {
    name: string;
    description: string;
    status: string;
    priority: string;
    type: string;
    startDate: string;
    expectedEndDate: string;
    budget: number;
    currency: string;
    clientId: string;
    managerId?: string;
    teamMembers?: string[];
    tags?: string[];
    notes?: string;
  }) {
    const insertPayload = {
      name: projectData.name,
      description: projectData.description,
      status: projectData.status as any,
      priority: projectData.priority as any,
      type: projectData.type as any,
      start_date: projectData.startDate,
      expected_end_date: projectData.expectedEndDate,
      budget: projectData.budget,
      currency: projectData.currency,
      client_id: projectData.clientId,
      manager_id: projectData.managerId,
      team_members: projectData.teamMembers || [],
      tags: projectData.tags || [],
      notes: projectData.notes,
      progress: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    console.debug('[supabaseService.createProject] insert payload ->', insertPayload)

    const { data, error } = await supabase
      .from('projects')
      .insert(insertPayload)
      .select(`
        *,
        clients (
          id,
          company_name,
          contact_name,
          email
        )
      `)
      .single()

    if (error) {
      console.error('[supabaseService.createProject] error ->', {
        message: error.message,
        details: (error as any).details,
        hint: (error as any).hint,
        code: (error as any).code,
      })
      throw error
    }

    const project = this.mapProject(data)
    console.debug('[supabaseService.createProject] response ->', project)
    return { success: true, data: project, project }
  }

  async updateProject(id: string, projectData: {
    name?: string;
    description?: string;
    status?: string;
    priority?: string;
    type?: string;
    startDate?: string;
    expectedEndDate?: string;
    actualEndDate?: string;
    budget?: number;
    currency?: string;
    clientId?: string;
    managerId?: string;
    teamMembers?: string[];
    tags?: string[];
    notes?: string;
    progress?: number;
  }) {
    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    if (projectData.name !== undefined) updateData.name = projectData.name
    if (projectData.description !== undefined) updateData.description = projectData.description
    if (projectData.status !== undefined) updateData.status = projectData.status
    if (projectData.priority !== undefined) updateData.priority = projectData.priority
    if (projectData.type !== undefined) updateData.type = projectData.type
    if (projectData.startDate !== undefined) updateData.start_date = projectData.startDate
    if (projectData.expectedEndDate !== undefined) updateData.expected_end_date = projectData.expectedEndDate
    if (projectData.actualEndDate !== undefined) updateData.actual_end_date = projectData.actualEndDate
    if (projectData.budget !== undefined) updateData.budget = projectData.budget
    if (projectData.currency !== undefined) updateData.currency = projectData.currency
    if (projectData.clientId !== undefined) updateData.client_id = projectData.clientId
    if (projectData.managerId !== undefined) updateData.manager_id = projectData.managerId
    if (projectData.teamMembers !== undefined) updateData.team_members = projectData.teamMembers
    if (projectData.tags !== undefined) updateData.tags = projectData.tags
    if (projectData.notes !== undefined) updateData.notes = projectData.notes
    if (projectData.progress !== undefined) updateData.progress = projectData.progress

    console.debug('[supabaseService.updateProject] update payload ->', { id, updateData })

    const { data, error } = await supabase
      .from('projects')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        clients (
          id,
          company_name,
          contact_name,
          email
        )
      `)
      .single()

    if (error) {
      console.error('[supabaseService.updateProject] error ->', {
        message: error.message,
        details: (error as any).details,
        hint: (error as any).hint,
        code: (error as any).code,
      })
      throw error
    }

    const project = this.mapProject(data)
    console.debug('[supabaseService.updateProject] response ->', project)
    return { success: true, data: project, project }
  }

  async deleteProject(id: string) {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id)

    if (error) throw error
    return { success: true }
  }

  async getProjectById(id: string) {
    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        clients (
          id,
          company_name,
          contact_name,
          email,
          phone,
          website
        ),
        project_phases (
          id,
          name,
          description,
          status,
          start_date,
          end_date,
          progress,
          order_index,
          created_at,
          updated_at
        ),
        project_tasks (
          id,
          title,
          description,
          status,
          priority,
          assigned_to,
          due_date,
          estimated_hours,
          actual_hours,
          phase_id,
          order_index,
          created_at,
          updated_at
        )
      `)
      .eq('id', id)
      .single()

    if (error) throw error
    const project = this.mapProject(data)
    return { success: true, data: project, project }
  }

  async archiveProject(id: string) {
    const { data, error } = await supabase
      .from('projects')
      .update({ 
        status: 'ARCHIVED',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    const project = this.mapProject(data)
    return { success: true, data: project, project }
  }

  async duplicateProject(id: string, data?: {
    name?: string;
    clientId?: string;
    startDate?: string;
  }) {
    // First get the original project
    const { data: originalProject, error: fetchError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError) throw fetchError

    // Create the duplicate with modified data
    const duplicateData = {
      ...originalProject,
      id: undefined, // Let Supabase generate new ID
      name: data?.name || `${originalProject.name} (Cópia)`,
      client_id: data?.clientId || originalProject.client_id,
      start_date: data?.startDate || new Date().toISOString().split('T')[0],
      expected_end_date: data?.startDate ? 
        new Date(new Date(data.startDate).getTime() + (new Date(originalProject.expected_end_date).getTime() - new Date(originalProject.start_date).getTime())).toISOString().split('T')[0] :
        originalProject.expected_end_date,
      actual_end_date: null,
      progress: 0,
      status: 'PLANNING',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data: newProject, error: createError } = await supabase
      .from('projects')
      .insert(duplicateData)
      .select()
      .single()

    if (createError) throw createError
    const project = this.mapProject(newProject)
    return { success: true, data: project, project }
  }

  // Project Tasks methods
  async getProjectTasks(projectId: string) {
    const { data, error } = await supabase
      .from('project_tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('order_index')

    if (error) throw error
    const tasks = (data || []).map(row => this.mapProjectTask(row, projectId))
    return { success: true, data: tasks, tasks }
  }

  async createProjectTask(projectId: string, taskData: {
    title: string;
    description?: string;
    status: string;
    priority: string;
    assignedTo?: string;
    dueDate?: string;
    estimatedHours?: number;
    phaseId?: string;
  }) {
    const { data, error } = await supabase
      .from('project_tasks')
      .insert({
        project_id: projectId,
        title: taskData.title,
        description: taskData.description,
        status: taskData.status as any,
        priority: taskData.priority as any,
        assigned_to: taskData.assignedTo,
        due_date: taskData.dueDate,
        estimated_hours: taskData.estimatedHours,
        phase_id: taskData.phaseId,
        order_index: 0, // Will be updated by trigger
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) throw error
    const task = this.mapProjectTask(data, projectId)
    return { success: true, data: task, task }
  }

  async updateProjectTask(projectId: string, taskId: string, taskData: {
    title?: string;
    description?: string;
    status?: string;
    priority?: string;
    assignedTo?: string;
    dueDate?: string;
    estimatedHours?: number;
    actualHours?: number;
    phaseId?: string;
  }) {
    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    if (taskData.title !== undefined) updateData.title = taskData.title
    if (taskData.description !== undefined) updateData.description = taskData.description
    if (taskData.status !== undefined) updateData.status = taskData.status
    if (taskData.priority !== undefined) updateData.priority = taskData.priority
    if (taskData.assignedTo !== undefined) updateData.assigned_to = taskData.assignedTo
    if (taskData.dueDate !== undefined) updateData.due_date = taskData.dueDate
    if (taskData.estimatedHours !== undefined) updateData.estimated_hours = taskData.estimatedHours
    if (taskData.actualHours !== undefined) updateData.actual_hours = taskData.actualHours
    if (taskData.phaseId !== undefined) updateData.phase_id = taskData.phaseId

    const { data, error } = await supabase
      .from('project_tasks')
      .update(updateData)
      .eq('id', taskId)
      .eq('project_id', projectId)
      .select()
      .single()

    if (error) throw error
    const task = this.mapProjectTask(data, projectId)
    return { success: true, data: task, task }
  }

  async deleteProjectTask(projectId: string, taskId: string) {
    const { error } = await supabase
      .from('project_tasks')
      .delete()
      .eq('id', taskId)
      .eq('project_id', projectId)

    if (error) throw error
    return { success: true }
  }

  // Project Phases methods
  async getProjectPhases(projectId: string) {
    const { data, error } = await supabase
      .from('project_phases')
      .select('*')
      .eq('project_id', projectId)
      .order('order_index')

    if (error) throw error
    const phases = (data || []).map(row => this.mapProjectPhase(row, projectId))
    return { success: true, data: phases, phases }
  }

  async createProjectPhase(projectId: string, phaseData: {
    name: string;
    description?: string;
    status?: string;
    startDate: string;
    endDate: string;
    budget?: number;
    orderIndex: number;
  }) {
    const { data, error } = await supabase
      .from('project_phases')
      .insert({
        project_id: projectId,
        name: phaseData.name,
        description: phaseData.description,
        start_date: phaseData.startDate,
        end_date: phaseData.endDate,
        budget: phaseData.budget,
        order_index: phaseData.orderIndex,
        status: phaseData.status || 'planning',
        progress: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) throw error
    const phase = this.mapProjectPhase(data, projectId)
    return { success: true, data: phase, phase }
  }

  async updateProjectPhase(projectId: string, phaseId: string, phaseData: {
    name?: string;
    description?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    progress?: number;
  }) {
    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    if (phaseData.name !== undefined) updateData.name = phaseData.name
    if (phaseData.description !== undefined) updateData.description = phaseData.description
    if (phaseData.status !== undefined) updateData.status = phaseData.status
    if (phaseData.startDate !== undefined) updateData.start_date = phaseData.startDate
    if (phaseData.endDate !== undefined) updateData.end_date = phaseData.endDate
    if (phaseData.progress !== undefined) updateData.progress = phaseData.progress

    const { data, error } = await supabase
      .from('project_phases')
      .update(updateData)
      .eq('id', phaseId)
      .eq('project_id', projectId)
      .select()
      .single()

    if (error) throw error
    const phase = this.mapProjectPhase(data, projectId)
    return { success: true, data: phase, phase }
  }

  async deleteProjectPhase(projectId: string, phaseId: string) {
    const { error } = await supabase
      .from('project_phases')
      .delete()
      .eq('id', phaseId)
      .eq('project_id', projectId)

    if (error) throw error
    return { success: true }
  }

  // Additional project methods
  async getProjectStats() {
    const { data: projects, error } = await supabase
      .from('projects')
      .select('status, priority, budget, progress')

    if (error) throw error

    const stats = {
      total: projects?.length || 0,
      byStatus: {} as Record<string, number>,
      byPriority: {} as Record<string, number>,
      totalBudget: 0,
      averageProgress: 0
    }

    if (projects) {
      projects.forEach(project => {
        // Count by status
        stats.byStatus[project.status] = (stats.byStatus[project.status] || 0) + 1
        
        // Count by priority
        stats.byPriority[project.priority] = (stats.byPriority[project.priority] || 0) + 1
        
        // Sum budget
        stats.totalBudget += project.budget || 0
        
        // Sum progress for average
        stats.averageProgress += project.progress || 0
      })
      
      // Calculate average progress
      stats.averageProgress = stats.averageProgress / projects.length
    }

    return { success: true, data: stats, stats }
  }

  async getProjectsByClient(clientId: string, params?: {
    status?: string
    includeArchived?: boolean
  }) {
    let query = supabase
      .from('projects')
      .select(`
        *,
        clients (
          id,
          company_name,
          contact_name,
          email
        )
      `)
      .eq('client_id', clientId)

    if (params?.status) {
      query = query.eq('status', params.status)
    }

    if (!params?.includeArchived) {
      query = query.neq('status', 'ARCHIVED')
    }

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) throw error
    const projects = (data || []).map(row => this.mapProject(row))
    return { success: true, data: projects, projects }
  }

  async unarchiveProject(id: string) {
    const { data, error } = await supabase
      .from('projects')
      .update({ 
        status: 'ACTIVE',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    const project = this.mapProject(data)
    return { success: true, data: project, project }
  }
}

export const supabaseService = new SupabaseService()
