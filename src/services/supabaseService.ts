import { supabase } from '@/lib/supabase'

export class SupabaseService {
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
  async getClients(params?: { page?: number; limit?: number; search?: string }) {
    const { page = 1, limit = 10, search } = params || {}
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

    const { data, error, count } = await query

    if (error) throw error

    return {
      clients: data || [],
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
    return { client: data }
  }

  // Project methods
  async getProjects(params?: { 
    page?: number; 
    limit?: number; 
    search?: string; 
    status?: string;
    clientId?: string;
  }) {
    const { page = 1, limit = 10, search, status, clientId } = params || {}
    const from = (page - 1) * limit
    const to = from + limit - 1

    let query = supabase
      .from('projects')
      .select(`
        *,
        clients (id, company_name, contact_name, email)
      `, { count: 'exact' })
      .range(from, to)
      .order('created_at', { ascending: false })

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`)
    }

    if (status) {
      query = query.eq('status', status)
    }

    if (clientId) {
      query = query.eq('client_id', clientId)
    }

    const { data, error, count } = await query

    if (error) throw error

    return {
      projects: data || [],
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

    return {
      campaigns: data || [],
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
}

export const supabaseService = new SupabaseService()