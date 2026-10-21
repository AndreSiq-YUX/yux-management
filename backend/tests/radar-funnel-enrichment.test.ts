import { expect, it } from 'vitest';
const api = await import('../src/modules/radar/funnel-enrichment.js').catch(() => ({})) as Record<string, any>;
const page = (path: string, html = '') => ({ url: `https://alfa.example/${path}`, text: 'fatos '.repeat(5000), html, observedAt: '2026-10-21' });
it('selects at most five compact institutional pages, keeping literal excerpts', () => {
    const input = ['blog/noticia', 'contato/', 'servicos/', '', 'sobre/', 'clientes/', 'outra/'].map(path => page(path));
    const result = api.selectRadarQualificationEvidence(input, { maxPages: 5, maxChars: 6000 });
    expect(result.map((item: any) => new URL(item.url).pathname)).toEqual(['/', '/sobre/', '/servicos/', '/clientes/', '/contato/']);
    expect(result.every((item: any) => item.text.length <= 6000 && input.find(original => original.url === item.url)?.text.includes(item.text))).toBe(true);
});
it('prioritizes the requested contact purpose and never chooses recruitment links', () => {
    const input = [page('', '<a href="/trabalhe-conosco/">Vagas</a><a href="/fornecedor/">Seja fornecedor</a><a href="/contato/">Contato</a>')];
    const urls = api.radarPurposeEnrichmentUrls('https://alfa.example/', input, 'suppliers');
    expect(urls[0]).toBe('https://alfa.example/fornecedor/');
    expect(urls.every((url: string) => !/trabalhe|recrut|vaga/i.test(url))).toBe(true);
});
it('standard depth follows real links without speculative extra paths',()=>{
 const input=[page('','<a href="/compras/">Compras</a>')]
 expect(api.radarPurposeEnrichmentUrls('https://alfa.example/',input,'suppliers','standard')).toEqual(['https://alfa.example/compras/'])
})
