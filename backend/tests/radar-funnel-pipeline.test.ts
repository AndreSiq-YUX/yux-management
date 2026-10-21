import { expect, it, vi } from 'vitest';
import { runRadarResearchPipeline } from '../src/modules/radar/research-service.js';
import { resolveRadarSearchConfiguration } from '../src/modules/radar/search-configuration.js';
const identity = { name: 'Empresa Alfa', cnpj: '12345678000190', city: 'Curitiba', state: 'PR' };
const url = 'https://alfa.example/';
const page = { url, text: 'Empresa Alfa CNPJ 12.345.678/0001-90. Atendimento empresarial. contato@alfa.example', observedAt: '2026-10-21' };
const config = (patch = {}) => resolveRadarSearchConfiguration({ funnel: { enabled: true, g0: { mode: 'enforce' }, g1: { mode: 'enforce' }, g5: { mode: 'enforce' } }, research: { enabled: true, webSearchEnabled: true, semanticQualificationEnabled: true }, ...patch });
it.each(['found','exhausted','uncertain'] as const)('continues cheap searches only after a real unresolved identity (%s), and resumes without repurchasing',async mode=>{
 const wrong={url:'https://candidate.example/',text:'Empresa Alfa é mencionada nesta página. Informações institucionais gerais.',observedAt:page.observedAt};
 const web=vi.fn(async()=>[{url:web.mock.calls.length===1||mode!=='found'?wrong.url:url,title:identity.name,snippets:[],observedAt:page.observedAt}]);
 const collect=vi.fn(async(readUrl:string)=>[readUrl===url?page:wrong]);
 const resolvePresence=vi.fn(async()=>{if(mode==='uncertain')throw Error('radar_previous_request_uncertain');return{candidateId:null,scope:'unresolved',reason:'A menção não comprova identidade.',claims:[]}});
 const configuration=config({funnel:{enabled:true,g1:{mode:'off'},g5:{mode:'off'},agentPolicy:{mode:'off'}},research:{enabled:true,webSearchEnabled:true,webSearchProviders:['serper_web_search'],maxSearchQueriesPerCandidate:3,maxPagesPerCandidate:4,presenceResolutionEnabled:true,semanticQualificationEnabled:false}});
 const deps={web,collect,resolvePresence,checkpoint:async()=>{}};
 const result=await runRadarResearchPipeline(identity,configuration,{},deps);
 expect(web).toHaveBeenCalledTimes(mode==='found'?2:mode==='exhausted'?3:1);
 expect(resolvePresence).toHaveBeenCalledTimes(1);
 if(mode==='found'){
  expect(web.mock.calls[1]).toEqual(['"12.345.678/0001-90"','serper_web_search']);
  expect(result.siteAssociation).toBe('confirmed');expect(result.discovery.websiteUrl).toBe(url);
 }else expect(result.siteAssociation).not.toBe('confirmed');
 await runRadarResearchPipeline(identity,configuration,result,deps);
 expect(web).toHaveBeenCalledTimes(mode==='found'?2:mode==='exhausted'?3:1);
});
it.each([false,true])('reads a contact URL returned by the single Agent, including saved receipt recovery=%s',async recovered=>{
 const homepage={...page,text:'Empresa Alfa CNPJ 12.345.678/0001-90. Atendimento empresarial.'}
 const contactUrl='https://alfa.example/portal-2026'
 const hit={url:contactUrl,title:'Empresa Alfa contato fornecedores',snippets:['Portal de compras e fornecedores'],observedAt:page.observedAt}
 const deepResearch=vi.fn(async()=>[hit]),web=vi.fn(async()=>[]),reads:string[]=[]
 const output:any={pages:[homepage],readingComplete:true,discovery:{association:'confirmed',websiteUrl:url,hits:[],suggestions:[],queries:0,limitations:[]},...(recovered?{funnel:{agentAttempted:true,agentCompleted:true},deepResearchCompleted:true,discoveryHits:[hit]}:{})}
 const result=await runRadarResearchPipeline(identity,config({funnel:{enabled:true,g1:{mode:'off'},g5:{mode:'off'},agentPolicy:{mode:'escalation'}},research:{enabled:true,webSearchEnabled:true,deepResearchEnabled:true,maxPagesPerCandidate:8,contactPurpose:'suppliers',semanticQualificationEnabled:false}}),output,{web,deepResearch,collect:async readUrl=>{reads.push(readUrl);return readUrl===contactUrl?[{url:contactUrl,text:'Empresa Alfa CNPJ 12.345.678/0001-90. Fornecedores: compras@alfa.example',observedAt:page.observedAt}]:[]},checkpoint:async()=>{}})
 expect(reads).toContain(contactUrl)
 expect(result.contacts).toEqual(expect.arrayContaining([expect.objectContaining({kind:'email',value:'compras@alfa.example'})]))
 expect(deepResearch).toHaveBeenCalledTimes(recovered?0:1);expect(web).not.toHaveBeenCalled()
})
it('stops a configured registry exclusion before any decision, search, read or semantic call', async () => {
    const web = vi.fn(), decide = vi.fn(), collect = vi.fn(), qualify = vi.fn();
    const result = await runRadarResearchPipeline(identity, config({ excludedNameTerms: ['alfa'] }), {}, { web, decide, collect, qualify, registryPayload: { tradeName: identity.name }, checkpoint: async () => {} } as never);
    expect(result.decisionExcluded).toBe(true);
    for (const spy of [web, decide, collect, qualify]) expect(spy).not.toHaveBeenCalled();
});
it('runs the fiscal triage before free reads, then excludes with zero searches or enrichment', async () => {
    const order: string[] = [], web = vi.fn(), qualify = vi.fn();
    const decide = vi.fn(async (task: string) => { order.push(task); return { action: 'exclude', effectiveMode: 'enforce', choice: 'outside_profile' }; });
    const collect = vi.fn(async () => { order.push('read'); return [page]; });
    const result = await runRadarResearchPipeline(identity, config(), {}, { web, qualify, collect, decide, registryPayload: { cnpj: identity.cnpj, emailDomainSignal: { kind: 'corporate_candidate', domain: 'alfa.example' } }, checkpoint: async () => {} } as never);
    expect(order).toEqual(['radar_initial_triage']);
    expect(result.decisionExcluded).toBe(true);
    expect(web).not.toHaveBeenCalled(); expect(qualify).not.toHaveBeenCalled();
});
it('places the fit gate after identity and before socials, enrichment or qualification, without the old quality model', async () => {
    const order: string[] = [];
    const decide = vi.fn(async (task: string, _pages: unknown, _options: unknown, meta: any) => {
        order.push(task);
        if (task === 'radar_fit_gate') expect(meta.associatedWebsite).toBe(url);
        return { action: 'continue', effectiveMode: 'enforce' };
    });
    const collect = vi.fn(async () => { order.push('read'); return [page]; });
    const qualify = vi.fn(async () => { order.push('qualify'); return { targetStatus: 'confirmed', productFit: 'high', reasons: [], evidenceIds: [], limitations: [] }; });
    const collectSocial = vi.fn(async () => { order.push('social'); return []; });
    const web = vi.fn();
    const result = await runRadarResearchPipeline(identity, config({ research: { enabled: true, webSearchEnabled: true, semanticQualificationEnabled: true, inspectLinkedSocialProfiles: true } }), {},
        { web, collect, collectSocial, qualify, decide, registryPayload: { cnpj: identity.cnpj, emailDomainSignal: { kind: 'corporate_candidate', domain: 'alfa.example' } }, checkpoint: async () => {} } as never);
    expect(order.indexOf('radar_initial_triage')).toBeLessThan(order.indexOf('read'));
    expect(order.indexOf('radar_fit_gate')).toBeLessThan(order.indexOf('social'));
    expect(order.indexOf('radar_fit_gate')).toBeLessThan(order.indexOf('qualify'));
    expect(order).not.toContain('radar_quality_gate');
    expect(result.siteAssociation).toBe('confirmed');
    expect(web).not.toHaveBeenCalled();
});
it('a shadow exclusion does not prevent full research, while an enforced fit exclusion saves later calls', async () => {
    for (const mode of ['shadow', 'enforce'] as const) {
        const qualify = vi.fn(async () => ({ targetStatus: 'review', productFit: 'unknown', reasons: [], evidenceIds: [], limitations: [] }));
        const collectSocial = vi.fn(async () => []);
        const decide = vi.fn(async (task: string) => ({ action: task === 'radar_fit_gate' ? 'exclude' : 'continue', effectiveMode: mode }));
        const result = await runRadarResearchPipeline(identity, config({ funnel: { enabled: true, g1: { mode: 'off' }, g5: { mode } }, research: { semanticQualificationEnabled: true, inspectLinkedSocialProfiles: true } }),
            { pages: [page], readingComplete: true, discoveryLocked: true, discovery: { association: 'confirmed', websiteUrl: url, hits: [], suggestions: [], queries: 0, limitations: [] } },
            { web: vi.fn(), decide, qualify, collectSocial, checkpoint: async () => {} } as never);
        expect(result.decisionExcluded === true).toBe(mode === 'enforce');
        expect(qualify.mock.calls.length).toBe(mode === 'enforce' ? 0 : 1);
        expect(collectSocial.mock.calls.length).toBe(mode === 'enforce' ? 0 : 1);
    }
});
