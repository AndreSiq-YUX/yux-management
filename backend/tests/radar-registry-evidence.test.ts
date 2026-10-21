import { expect, it } from 'vitest';
const api = await import('../src/modules/radar/registry-evidence.js').catch(() => ({})) as Record<string, any>;
it('sends a stable primary fiscal fact before any page, within 1400 UTF-8 bytes', () => {
    const payload = { legalName: 'Empresa de exemplo', tradeName: 'Exemplo', cnpj: '12345678000190', city: 'Curitiba', state: 'PR',
        registryActivities: [{ code: '1234567', text: 'Atividade principal ' + 'ç'.repeat(900), main: true }, ...Array.from({ length: 25 }, (_, i) => ({ code: String(i).padStart(7, '0'), text: 'Descrição', main: false }))],
        emailDomainSignal: { kind: 'corporate_candidate', checkedAt: 'volatile' }, size: 'Grande', shareCapital: 100000 };
    const evidence = api.buildRadarRegistryEvidence(payload, ['0000024'], ['target_secondary_only']);
    expect(evidence).toMatchObject({ role: 'registry', primary: true, scope: 'establishment', sourceUrl: 'https://cnpja.com/office/12345678000190' });
    expect(Buffer.byteLength(evidence.text)).toBeLessThanOrEqual(1400);
    expect(evidence.text).toContain('0000024');
    expect(evidence.text).toContain('target_secondary_only');
    expect(evidence.text).not.toContain('volatile');
    expect(api.buildRadarRegistryEvidence({ ...payload, observedAt: 'tomorrow', emailDomainSignal: { kind: 'corporate_candidate', checkedAt: 'different' } }, ['0000024'], ['target_secondary_only'])).toEqual(evidence);
});
it('does not claim an establishment registry fact without a CNPJ', () => {
    expect(api.buildRadarRegistryEvidence({ title: 'Nome isolado' }, [], [])).toBeNull();
});
