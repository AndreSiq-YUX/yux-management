import { createHash } from "node:crypto";
import type pg from "pg";
import {
  projectStrategyRelease,
  type StrategyPackItemForProjection,
} from "./projection.js";

type PackRow = {
  id: string;
  pack_key: string;
  name: string;
  description: string;
  scope: string;
  visibility: string;
  owner_organization_id: string | null;
  target_profile_keys: string[];
  target_modules: string[];
  metadata: Record<string, unknown>;
};
type ItemRow = StrategyPackItemForProjection & {
  priority: number;
  source_reference: string | null;
};

export async function publishStrategyPack(
  pool: pg.Pool,
  input: { packId: string; policyVersion: string; publishedBy: string },
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const packResult = await client.query<PackRow>(
      `SELECT id,pack_key,name,description,scope,visibility,owner_organization_id,target_profile_keys,target_modules,metadata
       FROM public.yux_strategy_packs WHERE id=$1 FOR UPDATE`,
      [input.packId],
    );
    const pack = packResult.rows[0];
    if (!pack) throw publicationError("strategy_pack_not_found", 404);
    const items = (
      await client.query<ItemRow>(
        `SELECT id,item_type,title,summary,body,profile_keys,stage_tags,retrieval_tags,source_reference,
              priority,payload,source_origin
       FROM public.yux_strategy_pack_items WHERE pack_id=$1 AND status='approved'
       ORDER BY priority,id`,
        [pack.id],
      )
    ).rows;
    if (!items.length)
      throw publicationError("strategy_pack_has_no_approved_items", 409);
    const snapshot = {
      schemaVersion: 1,
      pack: {
        key: pack.pack_key,
        name: pack.name,
        description: pack.description,
        scope: pack.scope,
        visibility: pack.visibility,
        ownerOrganizationId: pack.owner_organization_id,
        targetProfileKeys: pack.target_profile_keys,
        targetModules: pack.target_modules,
        metadata: pack.metadata,
      },
      items: items.map((item) => ({
        id: item.id,
        kind: item.item_type,
        title: item.title,
        summary: item.summary,
        body: item.body,
        profileKeys: item.profile_keys,
        stageTags: item.stage_tags,
        retrievalTags: item.retrieval_tags,
        sourceReference: item.source_reference,
        sourceOrigin: item.source_origin,
        priority: item.priority,
        payload: item.payload,
      })),
    };
    const contentHash = createHash("sha256")
      .update(stableSerialize(snapshot))
      .digest("hex");
    const existing = await client.query<{
      id: string;
      version: number;
      published_at: Date | string;
    }>(
      `SELECT id,version,published_at FROM public.yux_strategy_pack_releases WHERE pack_id=$1 AND content_hash=$2`,
      [pack.id, contentHash],
    );
    if (existing.rows[0]) {
      await client.query(
        `UPDATE public.yux_strategy_packs SET current_release_id=$2,status='published',version=$3,updated_at=NOW() WHERE id=$1`,
        [pack.id, existing.rows[0].id, existing.rows[0].version],
      );
      await client.query("COMMIT");
      return {
        releaseId: existing.rows[0].id,
        version: existing.rows[0].version,
        contentHash,
        publishedAt: new Date(existing.rows[0].published_at).toISOString(),
        duplicate: true,
      };
    }
    const versionResult = await client.query<{ version: number }>(
      `SELECT COALESCE(MAX(version),0)+1 AS version FROM public.yux_strategy_pack_releases WHERE pack_id=$1`,
      [pack.id],
    );
    const version = Number(versionResult.rows[0]?.version || 1);
    const release = (
      await client.query<{ id: string; published_at: Date | string }>(
        `INSERT INTO public.yux_strategy_pack_releases (pack_id,version,content_hash,policy_version,snapshot,published_by)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING id,published_at`,
        [
          pack.id,
          version,
          contentHash,
          input.policyVersion,
          JSON.stringify(snapshot),
          input.publishedBy,
        ],
      )
    ).rows[0]!;
    await projectStrategyRelease(client, {
      releaseId: release.id,
      ownerOrganizationId: pack.owner_organization_id,
      items,
    });
    await client.query(
      `UPDATE public.yux_strategy_packs SET current_release_id=$2,status='published',version=$3,updated_at=NOW() WHERE id=$1`,
      [pack.id, release.id, version],
    );
    await client.query("COMMIT");
    return {
      releaseId: release.id,
      version,
      contentHash,
      publishedAt: new Date(release.published_at).toISOString(),
      duplicate: false,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function getStrategyRelease(pool: pg.Pool, releaseId: string) {
  const result = await pool.query(
    `SELECT release.id,release.pack_id,release.version,release.content_hash,release.policy_version,
            release.snapshot,release.published_by,release.published_at,
            (pack.current_release_id=release.id) AS is_current
     FROM public.yux_strategy_pack_releases release JOIN public.yux_strategy_packs pack ON pack.id=release.pack_id
     WHERE release.id=$1`,
    [releaseId],
  );
  return result.rows[0] ?? null;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

function publicationError(message: string, statusCode: number) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}
