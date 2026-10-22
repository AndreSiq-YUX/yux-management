import { createHash } from 'node:crypto';
import type { RadarSearchConfiguration } from './search-configuration.js';
import type { RadarBusinessIdentity, RadarPresenceDiscovery } from './site-discovery.js';
import { matchRadarBusinessIdentity } from './site-discovery.js';
import { hasRadarOwnershipSignal, isRadarInstitutionalSource } from './source-identity.js';
import { collectRadarSiteEvidence, type RadarSiteEvidence } from './site-evidence.js';
import { canonicalRadarReadUrl } from './research-checkpoint.js';
import { hasRadarSearchCapacity, type RadarSearchCapacity, type RadarSearchSource, type RadarWebSearchSource } from './search-capacity.js';
import type { RadarWebHit } from './web-search.js';
import type { DecisionContextV1 } from './decision-contracts.js';
import { classifyRadarEmailDomain, type RadarEmailDomainPolicy, type RadarEmailDomainSignal } from './email-domain.js';
import { rethrowRadarAdaptiveYield } from './adaptive-research.js';

type Action = { id: string; description: string; kind: 'read' | 'search' | 'local' | 'agent' | 'stop'; url?: string; query?: string; source?: RadarWebSearchSource; cost: number };
export type RadarFunnelDecision = { action: string; effectiveMode?: string; choice?: string | null; reasonCode?: string; matchedTargetKey?: string; requestId?: string; eventKey?: string; threshold?: number | null };
export type RadarFunnelResearchState = {
    initial?: RadarFunnelDecision;
    fit?: RadarFunnelDecision;
    step?: number;
    decisionCalls?: number;
    decisionRound?: number;
    decisionRecoveryRequestId?: string;
    executedActions?: string[];
    pendingAction?: Action;
    cheapSearches?: number;
    agentAttempted?: boolean;
    agentCompleted?: boolean;
    emailProbeComplete?: boolean;
    emailSignal?: RadarEmailDomainSignal;
    stopReason?: string;
    limitations?: string[];
    blockedGate?: 'g0' | 'g1' | 'g5';
    enrichmentUrls?: string[];
    identityReviewedPages?: string[];
};
export type RadarFunnelDiscoveryOutput = {
    funnel?: RadarFunnelResearchState; pages?: RadarSiteEvidence[]; discovery?: RadarPresenceDiscovery;
    discoveryHits?: RadarWebHit[]; discoveryQueries?: number; discoveryLocked?: boolean;
    deepResearchCompleted?: boolean; deepResearchStop?: string;
};
type Dependencies = {
    web: (query: string, source?: RadarWebSearchSource) => Promise<RadarWebHit[]>;
    local?: () => Promise<RadarWebHit[]>;
    collect?: typeof collectRadarSiteEvidence;
    deepResearch?: (gaps: string[], pages: RadarSiteEvidence[]) => Promise<RadarWebHit[]>;
    choose?: (pages: RadarSiteEvidence[], options: DecisionContextV1['options'], step: number) => Promise<RadarFunnelDecision | undefined>;
    checkpoint: () => Promise<void>;
    sourceCostsBrl?: Partial<Record<RadarSearchSource, number>>;
    searchCapacity?: () => RadarSearchCapacity;
    searchAttempted?: (source: RadarSearchSource, query: string) => boolean;
    queriesUsed?:()=>number;
    maxDecisionCalls?: number;
    recoverAgent?: boolean;
    agentCostBrl?: string;
    registryPayload?: Record<string, unknown>;
    emailPolicy?: RadarEmailDomainPolicy;
    signal?: AbortSignal;
    tlsOptions?: NonNullable<Parameters<typeof collectRadarSiteEvidence>[2]>['tlsOptions'];
    deadlineAt?: number;
};
const hash = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 16);
// Content, not observation time: an inconclusive mention cannot repeatedly stop
// discovery. A new page/text remains eligible for identity verification.
export const radarFunnelIdentityPageKey = (page: RadarSiteEvidence) => hash(JSON.stringify([canonicalRadarReadUrl(page.url) ?? page.url, page.text]));
const uniquePages = (pages: RadarSiteEvidence[]) => [...new Map(pages.map(page => [canonicalRadarReadUrl(page.url) ?? page.url, page])).values()];
const uniqueHits = (hits: RadarWebHit[]) => [...new Map(hits.map(hit => [canonicalRadarReadUrl(hit.url) ?? hit.url, hit])).values()];
export function radarFunnelResearchQueries(identity: RadarBusinessIdentity, domain?: string) {
    const cnpj = identity.cnpj?.replace(/\D/g, '');
    const formatted = cnpj?.length === 14 ? `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}` : identity.cnpj;
    return [...new Set([
        `"${identity.name.replaceAll('"', '')}" ${identity.city ?? ''} ${identity.state ?? ''}`,
        formatted ? `"${formatted}"` : '',
        identity.legalName ? `"${identity.legalName.replaceAll('"', '')}" ${identity.city ?? ''}` : '',
        identity.name, domain ? `site:${domain} contato` : '',
    ].map(query => query.replace(/\s+/g, ' ').trim().slice(0, 200)).filter(Boolean))];
}
export function isRadarFunnelAgentEligible(configuration: RadarSearchConfiguration, state: RadarFunnelResearchState) {
    const policy = configuration.funnel;
    if (policy.agentPolicy.mode !== 'escalation' || !configuration.research.deepResearchEnabled || state.agentAttempted || state.agentCompleted || state.initial?.action === 'exclude' || state.fit?.action === 'exclude') return false;
    if (state.initial?.effectiveMode === 'enforce' && state.initial.action === 'short_investigation' || state.fit?.effectiveMode === 'enforce' && state.fit.action === 'short_investigation') return false;
    const key = state.initial?.effectiveMode === 'enforce' ? state.initial.matchedTargetKey : undefined;
    const priority = configuration.qualification.targets.find(target => target.key === key)?.priority;
    return !priority || policy.agentPolicy.priorities.includes(priority);
}

/** New, opt-in discovery controller. The chosen action includes its exact
 * source/query and is checkpointed before execution, independently of the next
 * model turn. Cached effects recover through the existing paid/read adapters. */
export async function runRadarFunnelDiscovery(identity: RadarBusinessIdentity, configuration: RadarSearchConfiguration, output: RadarFunnelDiscoveryOutput, deps: Dependencies) {
    const state = output.funnel ??= {};
    state.step ??= 0; state.decisionCalls ??= 0; state.executedActions ??= []; state.cheapSearches ??= 0; state.limitations ??= [];
    state.cheapSearches=Math.max(state.cheapSearches,deps.queriesUsed?.()??0);
    let pages = uniquePages(output.pages ?? []);
    let hits = uniqueHits([...(output.discoveryHits ?? []), ...(output.discovery?.hits ?? []), ...(output.discovery?.suggestions ?? [])]);
    const owns = (page: RadarSiteEvidence) => !page.limitation && isRadarInstitutionalSource(page.url, { text: page.text, html: page.html }) && matchRadarBusinessIdentity(identity, page.text) === 'confirmed' && hasRadarOwnershipSignal(page.url, identity, page);
    const flush = () => { output.pages = pages; output.discoveryHits = hits; };
    const read = async (url: string, maximum: number) => {
        const prior = pages.filter(page => new URL(page.url).origin === new URL(url).origin);
        const remaining = configuration.research.maxPagesPerCandidate - pages.filter(page=>!page.limitation).length;
        const collected = await (deps.collect ?? collectRadarSiteEvidence)(url, { maxPagesPerCandidate: prior.filter(page=>!page.limitation).length + Math.min(remaining, maximum), maxAttemptsPerCandidate: prior.length + maximum * 2 }, {
            signal: deps.signal, tlsOptions: deps.tlsOptions, deadlineAt: deps.deadlineAt, initialPages: prior,
            checkpoint: async value => { pages = uniquePages([...pages, ...value]); flush(); await deps.checkpoint(); },
        });
        pages = uniquePages([...pages, ...collected]); flush();
    };
    if(deps.recoverAgent&&!state.agentCompleted&&deps.deepResearch){
        try{
            hits=uniqueHits([...hits,...await deps.deepResearch(['identity','website','contact','whatsapp','official_socials'],pages)]);
            state.agentAttempted=true;state.agentCompleted=true;output.deepResearchCompleted=true;
            state.pendingAction=undefined;
        }catch(cause){
            rethrowRadarAdaptiveYield(cause);deps.signal?.throwIfAborted();state.agentAttempted=true;
            output.deepResearchStop='radar_research_call_uncertain';
        }
        flush();await deps.checkpoint();
    }
    if (!state.emailProbeComplete) {
        const payload = deps.registryPayload ?? {};
        state.emailSignal = deps.emailPolicy ? classifyRadarEmailDomain(payload.emailRaw, deps.emailPolicy) : payload.emailDomainSignal as RadarEmailDomainSignal | undefined;
        const signal = state.emailSignal;
        if (signal?.kind === 'corporate_candidate' && signal.domain && !pages.some(owns)) {
            const url = `https://${signal.domain}/`;
            if (!pages.some(page => canonicalRadarReadUrl(page.url) === url)) await read(url, 2);
            const own = pages.find(page => new URL(page.url).hostname === signal.domain && owns(page));
            state.emailSignal = { ...signal, outcome: own ? 'confirmed' : pages.some(page => new URL(page.url).hostname === signal.domain && !!page.text && !page.limitation) ? 'unconfirmed' : 'unreachable',
                messagePt: own ? 'O site indicado pelo e-mail foi associado à empresa por evidência pública.' : 'O domínio do e-mail foi consultado, mas não confirmou o site da empresa.' };
        }
        state.emailProbeComplete = true; flush(); await deps.checkpoint();
    }
    const queries = radarFunnelResearchQueries(identity, state.emailSignal?.kind === 'corporate_candidate' ? state.emailSignal.domain : undefined);
    const short = state.initial?.effectiveMode === 'enforce' && state.initial.action === 'short_investigation';
    const queryCap = short ? configuration.funnel.weakFitBudget.maxCheapSearches : Number.MAX_SAFE_INTEGER;
    const canSearch = (source: RadarSearchSource, query: string) => !state.agentAttempted && !state.agentCompleted && state.cheapSearches! < queryCap &&
        !state.executedActions!.includes(`search_${source}_${hash(query)}`) && !deps.searchAttempted?.(source, query) &&
        (deps.searchCapacity ? hasRadarSearchCapacity(deps.searchCapacity(), source) : state.cheapSearches! < configuration.research.maxSearchQueriesPerCandidate) &&
        (deps.sourceCostsBrl === undefined || typeof deps.sourceCostsBrl[source] === 'number' && deps.sourceCostsBrl[source]! > 0);
    while (true) {
        deps.signal?.throwIfAborted();
        const directlyOwned = pages.find(owns);
        if (!state.pendingAction && directlyOwned && !state.agentCompleted) { state.stopReason = 'identity_found'; break; }
        const readOptions: Action[] = [];
        if (pages.filter(page => !page.limitation).length < configuration.research.maxPagesPerCandidate && pages.length < configuration.research.maxPagesPerCandidate * 2) {
            for (const hit of hits.filter(hit => isRadarInstitutionalSource(hit.url, { title: hit.title, text: hit.snippets.join(' ') }))) {
                // A saved Agent may have found a nonstandard contact portal.
                // Once identity is known, read only that trusted origin, never
                // reopen paid discovery or adopt a third-party contact.
                if(directlyOwned&&new URL(hit.url).origin!==new URL(directlyOwned.url).origin)continue;
                const root = new URL('/', hit.url).toString();
                const url = !pages.some(page => canonicalRadarReadUrl(page.url) === root) ? root : canonicalRadarReadUrl(hit.url);
                if (!url || pages.some(page => canonicalRadarReadUrl(page.url) === url)) continue;
                const id = `read_${hash(url)}`;
                if (!state.executedActions.includes(id) && !readOptions.some(option => option.id === id)) readOptions.push({ id, kind: 'read', url, cost: 0, description: `Ler página pública ${url}; custo de busca R$ 0; confirmar identidade e canais.` });
            }
        }
        if(!state.pendingAction&&directlyOwned&&!readOptions.length){state.stopReason='identity_found';break;}
        const options: Action[] = readOptions.slice(0, 4);
        const institutionalRead = pages.some(page => !state.identityReviewedPages?.includes(radarFunnelIdentityPageKey(page)) && !!page.text && !page.limitation && isRadarInstitutionalSource(page.url, { text: page.text }) && [identity.name, identity.legalName].some(name => !!name && page.text.toLowerCase().includes(name.toLowerCase())));
        const candidatePending = readOptions.length > 0 || institutionalRead;
        const agentEligible = !!deps.deepResearch && isRadarFunnelAgentEligible(configuration, state) && !candidatePending &&
            (configuration.funnel.agentPolicy.timing === 'immediately_when_no_site_candidate' || state.cheapSearches > 0);
        if (agentEligible) options.push({ id: 'agent_research', kind: 'agent', cost: Number.MAX_VALUE, description: `Uma investigação completa para todas as lacunas; custo estimado R$ ${deps.agentCostBrl??'conforme orçamento autorizado'}, monitorado e sem teto remoto garantido. Sem nova busca paga após esta chamada.` });
        if (!institutionalRead && !readOptions.length && configuration.research.webSearchEnabled) {
            for (const source of configuration.research.webSearchProviders) {
                const query = queries.find(query => canSearch(source, query));
                if (query) options.push({ id: `search_${source}_${hash(query)}`, kind: 'search', source, query, cost: deps.sourceCostsBrl?.[source] ?? 0,
                    description: `Buscar ${query} em ${source}; fonte com capacidade e licença autorizadas; custo estimado R$ ${deps.sourceCostsBrl?.[source] ?? 'não informado'}.` });
            }
        }
        if (!institutionalRead && !readOptions.length && deps.local && configuration.research.localSearchOrder !== 'disabled' && canSearch('brave_place_search', identity.name) &&
            !state.executedActions.includes('local_brave_place') && (configuration.research.localSearchOrder === 'before_web' || !options.some(option => option.kind === 'search'))) {
            options.push({ id: 'local_brave_place', kind: 'local', cost: deps.sourceCostsBrl?.brave_place_search ?? 0, description: `Busca local complementar na região; custo estimado R$ ${deps.sourceCostsBrl?.brave_place_search ?? 'não informado'}.` });
        }
        const offered = [...options.slice(0, 7), { id: 'stop', kind: 'stop' as const, cost: 0, description: 'Prosseguir para associação de identidade e revisão com as evidências já disponíveis.' }];
        if (!state.pendingAction) {
            const actionable = offered.filter(option => option.kind !== 'stop');
            if (!actionable.length) { state.stopReason = institutionalRead ? 'candidate_ready_for_identity' : 'eligible_actions_exhausted'; break; }
            let selected: Action | undefined;
            if (actionable.length === 1 || directlyOwned) selected = actionable[0];
            else if (configuration.funnel.g3.mode === 'effective' && deps.choose && state.decisionCalls < (deps.maxDecisionCalls ?? 6)) {
                const decision = await deps.choose(pages, offered.map(({ id, description }) => ({ id, description })), state.step);
                state.decisionCalls++;
                selected = offered.find(option => option.id === decision?.action);
            }
            // Prefer uncharged reads, then an early Agent when eligible, then
            // the cheapest allowed search. Never invent an unoffered action.
            selected ??= actionable.find(option => option.kind === 'read') ?? (agentEligible ? actionable.find(option => option.kind === 'agent') : undefined) ?? [...actionable].sort((a, b) => a.cost - b.cost)[0];
            state.pendingAction = selected; flush(); await deps.checkpoint();
        }
        const action = state.pendingAction;
        if (action.kind === 'stop') { state.pendingAction = undefined; state.stopReason = 'decision_stop'; break; }
        // A policy edit or newly exhausted budget may invalidate a saved choice.
        // Completed effects still recover from their receipt, never a new source.
        if (action.kind !== 'read' && !offered.some(option => option.id === action.id)) {
            state.pendingAction = undefined; state.step++; continue;
        }
        try {
            if (action.kind === 'read' && action.url && !pages.some(page => canonicalRadarReadUrl(page.url) === action.url)) await read(action.url, 1);
            else if (action.kind === 'search') { hits = uniqueHits([...hits, ...await deps.web(action.query!, action.source)]); state.cheapSearches++; }
            else if (action.kind === 'local') { hits = uniqueHits([...hits, ...await deps.local!()]); state.cheapSearches++; }
            else if (action.kind === 'agent') {
                const result = await deps.deepResearch!(['identity', 'website', 'contact', 'whatsapp', 'official_socials'], pages);
                hits = uniqueHits([...hits, ...result]); state.agentAttempted = true; state.agentCompleted = true; output.deepResearchCompleted = true;
            }
        } catch (cause) {
            rethrowRadarAdaptiveYield(cause);
            deps.signal?.throwIfAborted();
            const code = cause instanceof Error && /^[a-z][a-z0-9_]{1,120}$/.test(cause.message) ? cause.message : 'radar_funnel_action_failed';
            state.limitations.push(code);
            if (action.kind === 'agent') { state.agentAttempted = true; output.deepResearchStop = code; }
            if (action.kind === 'search' || action.kind === 'local') state.cheapSearches++;
        }
        state.executedActions.push(action.id); state.pendingAction = undefined; state.step++;
        output.discoveryQueries = state.cheapSearches; flush(); await deps.checkpoint();
    }
    const owned = pages.find(owns);
    output.discovery = { hits, suggestions: hits.filter(hit => canonicalRadarReadUrl(hit.url) !== canonicalRadarReadUrl(owned?.url ?? '')), websiteUrl: owned?.url,
        association: owned ? 'confirmed' : hits.length ? 'review' : 'not_found_in_consulted_sources', queries: output.discoveryQueries ?? state.cheapSearches,
        limitations: state.limitations };
    output.discoveryLocked = true; flush(); await deps.checkpoint();
    return output;
}
