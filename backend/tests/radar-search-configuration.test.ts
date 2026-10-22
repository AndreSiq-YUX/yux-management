import { describe, expect, it } from 'vitest'
import { buildRadarBraveQuery, buildRadarDiscoveryScopes, radarSearchConfigurationSchema,
  resolveRadarSearchConfiguration, RADAR_BRAZIL_STATES } from '../src/modules/radar/search-configuration.js'
import { createRadarCampaign, duplicateRadarCampaign, updateRadarCampaign } from '../src/modules/radar/repository.js'
import type { AuthUser } from '../src/auth/routes.js'

const admin = { id: 'admin', role: 'yux_admin' } as AuthUser
const input = { organizationId: 'org', name: 'Pesquisa editável', campaignType: 'regional_b2b' as const,
  targetSegment: 'Tecnologia', targetStates: ['BA','SC'], targetKeywords: ['software'], targetCnaes: ['6201501'],
  productFocus: ['consultoria'], offerType: 'Automação', dailyLimit: 10,
  searchConfiguration: resolveRadarSearchConfiguration({ qualification: { includeAnyTerms: ['software'] } }) }
class CampaignPool {
  queries: Array<{ sql: string; params: unknown[] }> = []
  row = { id: 'campaign', organization_id: 'org', name: input.name, campaign_type: input.campaignType as 'regional_b2b'|'local_niche'|'recently_opened',
    target_segment: input.targetSegment, target_city: null as string|null, target_state: null as string|null, target_states: input.targetStates,
    target_keywords: input.targetKeywords, target_cnaes: input.targetCnaes, product_focus: input.productFocus,
    offer_type: input.offerType, daily_limit: 10, configuration_revision: 2, search_configuration: input.searchConfiguration }
  async connect() { return { query: this.query.bind(this), release() {} } }
  async query(sql: string, params: unknown[] = []) {
    this.queries.push({ sql, params })
    if (sql.includes("kind = 'yux'")) return { rows: [{ allowed: true }] }
    if (sql.includes('SELECT * FROM public.radar_campaigns')) return { rows: params[1] === 'org' ? [this.row] : [] }
    if (sql.includes('UPDATE public.radar_campaigns')) return { rows: [{ ...this.row, configuration_revision: 2 + Number(params[14]) }] }
    if (sql.includes('INSERT INTO public.radar_campaigns')) return { rows: [{ ...this.row, id: 'copy',
      organization_id:params[0],campaign_type:params[2],target_city:params[4],target_state:params[5],search_configuration: JSON.parse(params[14] as string), target_cnaes: params[7], target_states: params[9] }] }
    return { rows: [] }
  }
}
describe('Radar configurable search', () => {
  it.each([
    {organizationId:'org',segment:'Tecnologia',configuration:undefined},
    {organizationId:'other-org',segment:'Serviços de manutenção',configuration:{cities:[{city:'Joinville',state:'SC'}],research:{contactPurpose:'sales'}}},
  ])('persists the complete platform workflow for a new $segment campaign',async({organizationId,segment,configuration})=>{
    const pool=new CampaignPool()
    await createRadarCampaign(pool as never,admin,{...input,organizationId,targetSegment:segment,searchConfiguration:configuration as never})
    const saved=JSON.parse(pool.queries.find(item=>item.sql.includes('INSERT INTO public.radar_campaigns'))!.params[14] as string)
    expect(saved).toMatchObject({discovery:{enabled:true},funnel:{enabled:true,g1:{mode:'shadow'},g3:{mode:'effective'},g5:{mode:'shadow'},agentPolicy:{mode:'escalation'}},
      research:{enabled:true,webSearchEnabled:true,presenceResolutionEnabled:true,semanticQualificationEnabled:true,profileEnabled:true,inspectLinkedSocialProfiles:true,deepResearchEnabled:true,completion:{enabled:true,requireIdentity:true,requireSegment:true,minimumUsefulContacts:1}}})
    expect(saved.qualification.targets).toEqual([])
    expect(saved.cities).toEqual(configuration?.cities??[])
    if(configuration)expect(saved.research.contactPurpose).toBe('sales')
    expect(pool.queries.some(item=>/INSERT INTO public.radar_(capture|enrichment|candidate_research)|INSERT INTO public.jobs/.test(item.sql))).toBe(false)
  })
  it('does not carry enforce or another campaign calibration into a new copy',async()=>{
    const pool=new CampaignPool()
    pool.row.search_configuration=resolveRadarSearchConfiguration({funnel:{enabled:true,g1:{mode:'enforce'},g5:{mode:'enforce'}}})
    const copy=await duplicateRadarCampaign(pool as never,admin,{organizationId:'org',campaignId:'campaign'})
    expect(copy.searchConfiguration?.funnel).toMatchObject({enabled:true,g1:{mode:'shadow'},g5:{mode:'shadow'}})
    expect(pool.row.search_configuration.funnel.g1.mode).toBe('enforce')
  })
  it.each(['local_niche','recently_opened'] as const)('copies a saved %s campaign into the same complete configurable workflow',async campaignType=>{
    const pool=new CampaignPool()
    Object.assign(pool.row,{campaign_type:campaignType,target_city:'Joinville',target_state:'SC',target_states:[]})
    pool.row.search_configuration=resolveRadarSearchConfiguration({sources:{inspectWebsite:false}})
    const copy=await duplicateRadarCampaign(pool as never,admin,{organizationId:'org',campaignId:'campaign'})
    expect(copy.campaignType).toBe('regional_b2b')
    expect(copy.targetStates).toEqual(['SC'])
    expect(copy.searchConfiguration).toMatchObject({cities:[{city:'Joinville',state:'SC'}],sources:{inspectWebsite:true},research:{enabled:true,presenceResolutionEnabled:true},funnel:{enabled:true}})
    if(campaignType==='recently_opened')expect(copy.searchConfiguration?.openingFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(pool.row.campaign_type).toBe(campaignType)
    expect(pool.row.search_configuration.sources.inspectWebsite).toBe(false)
  })
  it('does not invalidate commercial criteria or discovery cursors when only operational capacity/source changes',async()=>{
    const pool=new CampaignPool()
    const config=resolveRadarSearchConfiguration({...input.searchConfiguration,research:{...input.searchConfiguration.research,maxSearchQueriesPerCandidate:5,maxPagesPerCandidate:8,webSearchProviders:['serper_web_search','brave_web_search']}})
    const result=await updateRadarCampaign(pool as never,admin,'campaign',{...input,searchConfiguration:config})
    expect(result.criteriaChanged).toBe(false)
    expect(pool.queries.find(item=>item.sql.includes('UPDATE public.radar_campaigns'))?.params[14]).toBe(0)
    expect(pool.queries.find(item=>item.sql.includes('UPDATE public.radar_campaigns'))?.params[15]).toBe(1)
  })
  it('has no fixed sector, positive qualification criterion or region', () => {
    const config = resolveRadarSearchConfiguration()
    expect(config.qualification.includeAnyTerms).toEqual([])
    expect(config.qualification.productTerms).toEqual([])
    expect(config.qualification.requireCnaeMatch).toBe(false)
    expect(config.cities).toEqual([])
    expect(buildRadarDiscoveryScopes({ targetStates: [] })).toEqual([])
    expect(buildRadarDiscoveryScopes({ targetStates: [...RADAR_BRAZIL_STATES] })).toHaveLength(27)
  })
  it('isolates cursors by city and configuration revision, normalizing accents', () => {
    const searchConfiguration = { cities: [{city:'Vitória',state:'ES'},{city:'Serra',state:'ES'}] }
    const scopes = buildRadarDiscoveryScopes({ targetStates: ['ES'], searchConfiguration, configurationRevision: 3 })
    expect(scopes[0].key).not.toBe(scopes[1].key)
    expect(scopes[0].label).toBe('Vitória/ES')
    expect(buildRadarDiscoveryScopes({ targetStates: ['ES'], searchConfiguration: { cities: [{city:'Vitoria',state:'ES'}] }, configurationRevision: 3 })[0].key).toBe(scopes[0].key)
    expect(buildRadarDiscoveryScopes({ targetStates: ['ES'], searchConfiguration, configurationRevision: 4 })[0].key).not.toBe(scopes[0].key)
  })
  it('validates limits, duplicate locations and fields, query identity, and date range', () => {
    for (const config of [{ batch: { pageSize: 0 } },{ batch: { verificationLimit: 1.5 } },
      { braveQueryTemplate: '{segment}' },{ exportFields: ['phone','phone'] },
      { openingFrom:'2026-09-30',openingTo:'2026-01-01' },
      { cities: [{city:'Vitória',state:'ES'},{city:'Vitoria',state:'ES'}] }]) {
      expect(radarSearchConfigurationSchema.safeParse(config).success).toBe(false)
    }
    expect(buildRadarBraveQuery('{name} {segment} {terms}', {name:'Alfa',segment:'TI',terms:['contato']})).toBe('Alfa TI contato')
  })
  it('saves a new campaign without injecting kitchen CNAE or state defaults', async () => {
    const pool = new CampaignPool()
    await createRadarCampaign(pool as never, admin, { ...input, targetCnaes: [], searchConfiguration: undefined })
    const insert = pool.queries.find(item => item.sql.includes('INSERT INTO public.radar_campaigns'))!
    expect(insert.params[7]).toEqual([])
    expect(insert.params[9]).toEqual(['BA','SC'])
    expect(JSON.parse(insert.params[14] as string).qualification.includeAnyTerms).toEqual([])
  })
  it('invalidates old reviews only when search configuration changes', async () => {
    const pool = new CampaignPool()
    const unchanged = await updateRadarCampaign(pool as never, admin, 'campaign', { ...input, name: 'Novo nome' })
    expect(unchanged.criteriaChanged).toBe(false)
    expect(pool.queries.some(item => item.sql.includes('UPDATE public.radar_b2b_reviews'))).toBe(false)
    const deliveryOnly = await updateRadarCampaign(pool as never, admin, 'campaign', { ...input,
      searchConfiguration: { ...input.searchConfiguration, exportFields: ['phone'], batch: { ...input.searchConfiguration.batch, verificationLimit: 3 } } })
    expect(deliveryOnly.criteriaChanged).toBe(false)
    const changed = await updateRadarCampaign(pool as never, admin, 'campaign', { ...input, targetStates: ['RJ'] })
    expect(changed.criteriaChanged).toBe(true)
    expect(changed.campaign.configurationRevision).toBe(3)
    expect(pool.queries.some(item => item.sql.includes('approved_by = NULL'))).toBe(true)
  })
  it('duplicates configuration without copying companies, approvals or cursors', async () => {
    const pool = new CampaignPool()
    const copy = await duplicateRadarCampaign(pool as never, admin, { campaignId:'campaign',organizationId:'org' })
    expect(copy.id).toBe('copy')
    expect(copy.searchConfiguration).toMatchObject({cities:input.searchConfiguration.cities,qualification:input.searchConfiguration.qualification,batch:input.searchConfiguration.batch,
      funnel:{enabled:true,g1:{mode:'shadow'},g3:{mode:'effective'},g5:{mode:'shadow'}},discovery:{enabled:true},research:{enabled:true,presenceResolutionEnabled:true,semanticQualificationEnabled:true,profileEnabled:true,deepResearchEnabled:true}})
    expect(pool.queries.some(item => /INSERT INTO public.radar_(candidate|b2b|regional)/.test(item.sql))).toBe(false)
    await expect(duplicateRadarCampaign(pool as never, admin, { campaignId:'campaign',organizationId:'other' })).rejects.toThrow('radar_campaign_not_found')
  })
})
