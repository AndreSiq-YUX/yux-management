import { expect, it, vi } from 'vitest';
import { resolveRadarSearchConfiguration } from '../src/modules/radar/search-configuration.js';
const api = await import('../src/modules/radar/funnel-discovery.js').catch(() => ({})) as Record<string, any>;
const identity = { name: 'Empresa Alfa', legalName: 'Empresa Alfa LTDA', cnpj: '12345678000190', city: 'Curitiba', state: 'PR' };
const page = { url: 'https://alfa.example/', text: 'Empresa Alfa CNPJ 12.345.678/0001-90. contato@alfa.example', observedAt: '2026-10-21' };
const config = (patch = {}) => resolveRadarSearchConfiguration({ funnel: { enabled: true, g3: { mode: 'effective' }, agentPolicy: { mode: 'escalation' } }, sources: { enrichWithBrave: false }, research: { enabled: true, webSearchEnabled: true, webSearchProviders: ['serper_web_search', 'perplexity_search_fast'], deepResearchEnabled: true, maxSearchQueriesPerCandidate: 3, maxPagesPerCandidate: 4 }, ...patch });
const base = <T extends Record<string, unknown>>(patch: T = {} as T) => ({ web: vi.fn(async () => []), collect: vi.fn(async () => []), checkpoint: vi.fn(async () => {}), sourceCostsBrl: { serper_web_search: .035, perplexity_search_fast: .007 }, maxDecisionCalls: 6, ...patch });
it('allows one additional free Agent page beyond already read pages, and never follows another company origin',async()=>{
 const portal='https://alfa.example/portal',other='https://outra.example/contact';
 const output:any={funnel:{agentCompleted:true},pages:[page],discoveryHits:[{url:portal,title:'Compras',snippets:[]},{url:other,title:'Outra empresa',snippets:[]}]};
 const collect=vi.fn(async(url:string,policy:any,options:any)=>{
  expect(url).toBe(portal);expect(policy.maxPagesPerCandidate).toBeGreaterThan(options.initialPages.length);
  return[{url,text:'Canal de compras Empresa Alfa',observedAt:page.observedAt}];
 });
 const deps=base({collect});await api.runRadarFunnelDiscovery(identity,config(),output,deps);
 expect(collect).toHaveBeenCalledTimes(1);expect(deps.web).not.toHaveBeenCalled();expect(output.pages).toHaveLength(2);
});
it('uses a corporate email domain for free and skips paid identity searches only after direct ownership', async () => {
    const output = {};
    const deps = base({ registryPayload: { emailDomainSignal: { kind: 'corporate_candidate', domain: 'alfa.example' } }, collect: vi.fn(async () => [page]) });
    await api.runRadarFunnelDiscovery(identity, config(), output, deps);
    expect(deps.web).not.toHaveBeenCalled();
    expect(deps.collect).toHaveBeenCalledTimes(1);
    expect(output).toMatchObject({ discovery: { websiteUrl: page.url, association: 'confirmed' }, funnel: { emailSignal: { outcome: 'confirmed' } } });
});
it('never probes generic or accountant domains', async () => {
    for (const kind of ['generic_provider', 'possible_accountant']) {
        const deps = base({ registryPayload: { emailDomainSignal: { kind, domain: 'gmail.com' } } });
        await api.runRadarFunnelDiscovery(identity, config({ research: { webSearchEnabled: false } }), {}, deps);
        expect(deps.collect).not.toHaveBeenCalled();
    }
});
it('executes exactly the source offered by the per-step choice, without overriding other sources', async () => {
    const web = vi.fn(async () => [{ url: page.url, title: identity.name, snippets: [], observedAt: page.observedAt }]);
    const choose = vi.fn(async (_pages: unknown, options: any[]) => ({ action: options.find(option => option.id.startsWith('search_perplexity_search_fast_')).id }));
    await api.runRadarFunnelDiscovery(identity, config(), {}, base({ web, choose, collect: async () => [page] }));
    expect(web).toHaveBeenCalledTimes(1);
    expect(web.mock.calls[0]).toEqual(['"Empresa Alfa" Curitiba PR', 'perplexity_search_fast']);
});
it('offers an early Agent only after a cheap attempt, and makes no paid searches after it', async () => {
    const web = vi.fn(async () => []), agent = vi.fn(async (_gaps: string[], _pages: unknown) => [{ url: page.url, title: identity.name, snippets: [], observedAt: page.observedAt }]);
    const choose = vi.fn(async (_pages: unknown, options: any[]) => ({ action: options.find(option => option.id === 'agent_research')?.id ?? options.find(option => option.id.startsWith('search_')).id }));
    const output = {};
    await api.runRadarFunnelDiscovery(identity, config(), output, base({ web, deepResearch: agent, choose, collect: async () => [page] }));
    expect(web).toHaveBeenCalledTimes(1);
    expect(agent).toHaveBeenCalledTimes(1);
    expect(agent.mock.calls[0][0]).toEqual(expect.arrayContaining(['identity', 'website', 'contact', 'whatsapp', 'official_socials']));
    expect(output).toMatchObject({ funnel: { agentCompleted: true } });
});
it('uses the cheapest deterministic option for an invalid choice and never repeats a completed step on resume', async () => {
    const output: any = {};
    let interrupt = true;
    const web = vi.fn(async (_query: string, _source?: string) => [{ url: page.url, title: identity.name, snippets: [], observedAt: page.observedAt }]);
    const deps = base({ web, choose: async () => ({ action: 'not_offered' }), collect: async () => [page], checkpoint: async () => {
        if (interrupt && output.discoveryHits?.length) { interrupt = false; throw Error('simulated_worker_restart'); }
    } });
    await expect(api.runRadarFunnelDiscovery(identity, config(), output, deps)).rejects.toThrow('simulated_worker_restart');
    await api.runRadarFunnelDiscovery(identity, config(), output, deps);
    expect(web).toHaveBeenCalledTimes(1);
    expect(web.mock.calls[0][1]).toBe('perplexity_search_fast');
});
it('does not restrict Agent or search budgets using a weak-fit observation', async () => {
    const output: any = { funnel: { initial: { action: 'continue', effectiveMode: 'shadow', choice: 'weak_fit' } } };
    const agent = vi.fn(async () => []);
    await api.runRadarFunnelDiscovery(identity, config(), output, base({ deepResearch: agent, choose: async (_pages: unknown, options: any[]) => ({ action: options.find(option => option.id === 'agent_research')?.id ?? options.find(option => option.id.startsWith('search_'))?.id ?? 'stop' }) }));
    expect(agent).toHaveBeenCalledTimes(1);
});
it('limits a calibrated weak fit to its short budget and never offers the Agent', async () => {
    const output: any = { funnel: { initial: { action: 'short_investigation', effectiveMode: 'enforce', choice: 'weak_fit' } } };
    const deps = base({ deepResearch: vi.fn(async () => []), choose: async (_pages: unknown, options: any[]) => {
        expect(options.some(option => option.id === 'agent_research')).toBe(false);
        return { action: options.find(option => option.id.startsWith('search_'))?.id ?? 'stop' };
    } });
    await api.runRadarFunnelDiscovery(identity, config(), output, deps);
    expect(deps.web).toHaveBeenCalledTimes(1);
    expect(deps.deepResearch).not.toHaveBeenCalled();
});
it('recovers the cheap-attempt count from durable calls before deciding whether to escalate',async()=>{
 const agent=vi.fn(async()=>[]),deps=base({queriesUsed:()=>1,searchAttempted:()=>true,deepResearch:agent});
 await api.runRadarFunnelDiscovery(identity,config(),{},deps);
 expect(deps.web).not.toHaveBeenCalled();expect(agent).toHaveBeenCalledTimes(1);
});
