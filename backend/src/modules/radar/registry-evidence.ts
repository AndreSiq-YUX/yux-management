import { radarRegistryActivities } from './registry-gate.js';
import { normalizeRadarCnpjIdentifier } from './cnpj-identifier.js';
import type { DecisionContextV1 } from './decision-contracts.js';

export function radarUtf8Excerpt(value: string, maxBytes: number) {
    let result = '', used = 0;
    for (const char of value) {
        const size = Buffer.byteLength(char);
        if (used + size > maxBytes) break;
        result += char;
        used += size;
    }
    return result;
}
export function buildRadarRegistryEvidence(payload: Record<string, unknown>, targetCnaes: string[], flags: string[]): DecisionContextV1['evidence'][number] | null {
    const cnpj = normalizeRadarCnpjIdentifier(payload.cnpj ?? payload.taxId);
    if (!cnpj) return null;
    const text = (value: unknown, bytes: number) => typeof value === 'string' || typeof value === 'number' ? radarUtf8Excerpt(String(value), bytes) : undefined;
    const activities = radarRegistryActivities(payload);
    const main = activities.find(item => item.main);
    const target = (code: string) => targetCnaes.some(prefix => code.startsWith(prefix.replace(/\D/g, '')));
    const secondary = activities.filter(item => !item.main).sort((a, b) => Number(target(b.code)) - Number(target(a.code))).slice(0, 15);
    const ordered = [...(main ? [main] : []), ...secondary];
    const signal = payload.emailDomainSignal as { kind?: unknown } | undefined;
    const material = {
        cnpj, name: text(payload.tradeName ?? payload.title, 100), legalName: text(payload.legalName, 140),
        city: text(payload.city, 60), state: text(payload.state, 8),
        legalNature: text(payload.legalNature ?? payload.nature, 60), size: text(payload.registeredSize ?? payload.size ?? payload.companySize, 40),
        capital: text(payload.shareCapital ?? payload.capital, 40), opening: text(payload.openingDate ?? payload.openedAt, 20),
        emailClass: text(signal?.kind, 40), flags: flags.slice(0, 10).map(flag => radarUtf8Excerpt(flag, 40)),
        activities: ordered.map(item => ({ code: item.code.slice(0, 7), main: item.main, text: '' })),
    };
    // Preserve every selected code; spend the remaining bytes on descriptions,
    // principal and matching secondary activities first. No arbitrary page text.
    for (let index = 0; index < ordered.length; index++) {
        const remaining = 1400 - Buffer.byteLength(JSON.stringify(material));
        if (remaining <= 4) break;
        const description = radarUtf8Excerpt(ordered[index].text ?? '', Math.min(180, remaining - 4));
        material.activities[index].text = description;
        while (Buffer.byteLength(JSON.stringify(material)) > 1400) material.activities[index].text = [...material.activities[index].text].slice(0, -1).join('');
    }
    // Very long configured flags must not crowd out the principal fact.
    while (Buffer.byteLength(JSON.stringify(material)) > 1400 && material.flags.length) material.flags.pop();
    while (Buffer.byteLength(JSON.stringify(material)) > 1400 && material.activities.length>1) material.activities.pop();
    return { id: `registry_${cnpj}`, sourceUrl: `https://cnpja.com/office/${cnpj}`, text: JSON.stringify(material), role: 'registry', primary: true, contradictory: false, scope: 'establishment' };
}
