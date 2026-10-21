import { z } from 'zod';
import type pg from 'pg';
import type { AuthUser } from '../../auth/routes.js';
import { normalizeRadarText } from './search-configuration.js';
import { requireRadarScope } from './access.js';

const code = z.union([z.string(), z.number().int().nonnegative()]).transform(String);
const node = z.object({ id: code, descricao: z.string().min(1).max(2000) }).passthrough();
const official = node.extend({ classe: node.extend({ grupo: node.extend({ divisao: node.extend({ secao: node.optional() }).optional() }).optional() }).optional() });
/** Reference data only. Source: IBGE API CNAE v2, /cnae/subclasses.
 * https://servicodados.ibge.gov.br/api/docs/cnae?versao=2 */
export function normalizeRadarCnaeCatalog(value: unknown) {
    const rows = z.array(official).min(1).max(20000).parse(value);
    return rows.map(row => {
        const subclass = z.string().regex(/^\d{7}$/).parse(row.id), hierarchy: Record<string, string> = {};
        for (const [key, item] of [['class', row.classe], ['group', row.classe?.grupo], ['division', row.classe?.grupo?.divisao], ['section', row.classe?.grupo?.divisao?.secao]] as const) {
            if (item) { hierarchy[`${key}Code`] = item.id; hierarchy[`${key}Description`] = item.descricao; }
        }
        return { code: subclass, description: row.descricao, searchText: normalizeRadarText(row.descricao), hierarchy };
    });
}
export async function importRadarCnaeCatalog(db: Pick<pg.Pool, 'query'>, value: unknown) {
    const records = normalizeRadarCnaeCatalog(value);
    const result = await db.query(`INSERT INTO public.radar_cnae_catalog(code,description,search_text,hierarchy) SELECT code,description,"searchText",hierarchy FROM jsonb_to_recordset($1::jsonb) AS item(code TEXT,description TEXT,"searchText" TEXT,hierarchy JSONB) ON CONFLICT(code) DO UPDATE SET description=EXCLUDED.description,search_text=EXCLUDED.search_text,hierarchy=EXCLUDED.hierarchy,updated_at=NOW() WHERE (radar_cnae_catalog.description,radar_cnae_catalog.search_text,radar_cnae_catalog.hierarchy) IS DISTINCT FROM (EXCLUDED.description,EXCLUDED.search_text,EXCLUDED.hierarchy)`, [JSON.stringify(records)]);
    return { total: records.length, changed: result.rowCount ?? 0 };
}
export async function searchRadarCnaeCatalog(db: Pick<pg.Pool, 'query'>, user: AuthUser, value: unknown) {
    const input = z.object({ organizationId: z.uuid(), q: z.string().trim().max(120).default('') }).strict().parse(value);
    await requireRadarScope(db, user, { organizationId: input.organizationId });
    const numeric = input.q.replace(/\D/g, ''), text = normalizeRadarText(input.q);
    return (await db.query(`SELECT code,description FROM public.radar_cnae_catalog WHERE ($1<>'' AND code LIKE $1||'%') OR ($2<>'' AND search_text LIKE '%'||$2||'%') ORDER BY code LIMIT 30`, [numeric, text])).rows;
}
