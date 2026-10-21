import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { importRadarCnaeCatalog, normalizeRadarCnaeCatalog } from '../src/modules/radar/cnae-catalog.js';

// Read-only by default. --apply requires an explicitly supplied DATABASE_URL;
// no dotenv loading or automatic production connection.
const args = process.argv.slice(2), fileAt = args.indexOf('--file');
let source: unknown;
if (fileAt >= 0) source = JSON.parse(await readFile(args[fileAt + 1], 'utf8'));
else {
    const response = await fetch('https://servicodados.ibge.gov.br/api/v2/cnae/subclasses', { redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error('radar_cnae_catalog_download_failed');
    if (Number(response.headers.get('content-length')) > 10_000_000) throw Error('radar_cnae_catalog_too_large');
    let bytes = 0; const chunks: Uint8Array[] = [];
    for await (const chunk of response.body!) { bytes += chunk.length; if (bytes > 10_000_000) throw Error('radar_cnae_catalog_too_large'); chunks.push(chunk); }
    source = JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const records = normalizeRadarCnaeCatalog(source);
if (!args.includes('--apply')) console.log(JSON.stringify({ dryRun: true, total: records.length, source: 'IBGE CNAE v2', message: 'Nenhum banco foi acessado. Para importar, informe DATABASE_URL e --apply.' }));
else {
    if (!process.env.DATABASE_URL) throw Error('radar_cnae_catalog_database_url_required');
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    try { console.log(JSON.stringify(await importRadarCnaeCatalog(pool, source))); } finally { await pool.end(); }
}
