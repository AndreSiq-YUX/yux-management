import { radarHtmlLinks, type RadarSiteEvidence } from './site-evidence.js';
import type { RadarResearchPolicy } from './search-configuration.js';
import { isRadarInstitutionalSource } from './source-identity.js';

const recruitment = /vaga|recrut|carreira|trabalhe|curriculo|careers|jobs/i;
function pageRank(url: string) {
    const path = new URL(url).pathname;
    if (path === '/') return 0;
    if (/sobre|about|empresa|institucional|quem-somos|^\/a-/i.test(path)) return 1;
    if (/servic|solu[cç]|produto/i.test(path)) return 2;
    if (/client|segment|atend|case/i.test(path)) return 3;
    if (/contat|contact|fornecedor|compras|supplier/i.test(path)) return 4;
    return 5;
}
export function selectRadarQualificationEvidence(pages: RadarSiteEvidence[], limits: { maxPages: number; maxChars: number }) {
    if (!Number.isSafeInteger(limits.maxPages) || limits.maxPages < 1 || !Number.isSafeInteger(limits.maxChars) || limits.maxChars < 1) throw Error('radar_qualification_evidence_limit_invalid');
    return [...new Map(pages.filter(page => page.text && !page.limitation && isRadarInstitutionalSource(page.url, { text: page.text }) && !recruitment.test(new URL(page.url).pathname))
        .map(page => [page.url, page])).values()].sort((a, b) => pageRank(a.url) - pageRank(b.url))
        .slice(0, limits.maxPages).map(page => ({ ...page, text: page.text.slice(0, limits.maxChars) }));
}
export function radarPurposeEnrichmentUrls(website: string, pages: RadarSiteEvidence[], purpose: RadarResearchPolicy['contactPurpose'], depth: 'standard'|'full' = 'full') {
    const origin = new URL(website).origin;
    const linked = pages.filter(page => new URL(page.url).origin === origin).flatMap(page => radarHtmlLinks(page.html ?? '').flatMap(link => {
        try {
            const target = new URL(link, page.url);
            target.hash = '';
            return target.origin === origin && !target.search && !recruitment.test(target.pathname) && /contat|contact|fornecedor|compras|suprimento|supplier|orcamento|sobre|about|servic|solu[cç]|client|empresa|institucional/i.test(target.pathname) ? [target.toString()] : [];
        } catch { return []; }
    }));
    const paths = depth === 'standard' ? [] : purpose === 'suppliers' ? ['/fornecedores/', '/compras/', '/seja-fornecedor/', '/suprimentos/', '/contato/'] : ['/contato/', '/orcamento/'];
    const rank = (url: string) => purpose === 'suppliers' && /fornecedor|compras|suprimento|supplier/i.test(new URL(url).pathname) ? 0 : /contat|contact|orcamento/i.test(new URL(url).pathname) ? 1 : 2;
    const read = new Set(pages.map(page => page.url));
    // Real linked pages always precede guessed paths of the same purpose.
    return [...new Set([...linked.sort((a, b) => rank(a) - rank(b)), ...paths.map(path => new URL(path, origin).toString())])].filter(url => !read.has(url));
}
