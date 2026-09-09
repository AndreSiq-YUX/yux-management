import { randomUUID } from "node:crypto";
import pg from "pg";
import { expect, it } from "vitest";
import { storePlatformProviderSecret } from "../../src/modules/platform/adminRepository.js";
import { resolveEffectiveProviderCredential } from "../../src/modules/platform/provider-credentials.js";
import type { AppEnv } from "../../src/config/env.js";
import {
  createIntegrationRig,
  getIntegrationDatabaseUrl,
} from "./support/rig.js";

it("separa readiness de saúde operacional e não transforma custo desconhecido em zero", async () => {
  const previousProviderKey = process.env.PROVIDER_SECRET_ENCRYPTION_KEY_B64;
  process.env.PROVIDER_SECRET_ENCRYPTION_KEY_B64 =
    "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=";
  const rig = await createIntegrationRig();
  const pool = new pg.Pool({
    connectionString: getIntegrationDatabaseUrl(),
    max: 2,
  });
  try {
    const replacedWorkerId = randomUUID();
    await rig.sql(
      `INSERT INTO public.worker_process_heartbeats (instance_id,queue_classes,started_at,last_seen_at,metadata)
       VALUES ($1,ARRAY['interactive'],NOW()-INTERVAL '10 minutes',NOW()-INTERVAL '2 minutes','{}')`,
      [replacedWorkerId],
    );
    await rig.sql(
      `INSERT INTO public.worker_process_heartbeats (instance_id,queue_classes,started_at,last_seen_at,metadata)
       VALUES ($1,ARRAY['interactive','ingestion','external','maintenance'],NOW()-INTERVAL '1 minute',NOW(),'{}')`,
      [randomUUID()],
    );
    await rig.sql(
      `INSERT INTO public.provider_usage_events (
         provider_key,model,correlation_id,reported_usage,cost_brl,measurement_status,measurement_reason
       ) VALUES ('openrouter','qwen/qwen3-embedding-8b',$1,'{"tokens":42}',NULL,'unavailable','provider_price_not_reported')`,
      [randomUUID()],
    );
    await rig.sql(
      `INSERT INTO public.domain_events (
         id,organization_id,event_type,aggregate_type,aggregate_id,correlation_id,actor,payload,
         dispatch_status,lease_owner,lease_until
       ) VALUES ($1,$2,'integration.operational_orphan','mission',$3,$1,'{"type":"system"}','{}',
         'dispatching','dead-worker',NOW()-INTERVAL '2 minutes')`,
      [randomUUID(), rig.ids.organizationA, rig.ids.missionA],
    );
    await rig.sql(
      `INSERT INTO public.domain_events (
         id,organization_id,event_type,aggregate_type,aggregate_id,correlation_id,actor,payload,
         dispatch_status,failure_class,created_at
       ) VALUES ($1,$2,'integration.historical_terminal','mission',$3,$1,'{"type":"system"}','{}',
         'dispatched','terminal',NOW()-INTERVAL '30 days')`,
      [randomUUID(), rig.ids.organizationA, rig.ids.missionA],
    );
    const smtp = await pool.query<{ id: string }>(
      `UPDATE public.platform_provider_connections SET status='active'
       WHERE provider_key='smtp2go' AND environment='production' RETURNING id`,
    );
    expect(smtp.rows[0]?.id).toBeTruthy();
    await storePlatformProviderSecret(
      pool,
      {
        providerConnectionId: smtp.rows[0]!.id,
        secretKind: "api_key",
        value: "database-smtp-secret",
      },
      "integration-session-secret-32-characters-minimum",
    );
    const effectiveDatabaseCredential =
      await resolveEffectiveProviderCredential(
        pool,
        {
          SESSION_SECRET: "integration-session-secret-32-characters-minimum",
          PROVIDER_SECRET_ENCRYPTION_KEY_B64:
            "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
        } as AppEnv,
        "smtp2go",
      );
    expect(effectiveDatabaseCredential).toMatchObject({
      configured: true,
      source: "database",
      value: "database-smtp-secret",
    });

    const readiness = await rig.rawRequest("GET", "/api/ready", "");
    expect(readiness).toMatchObject({
      statusCode: 200,
      body: { status: "ready" },
    });
    const denied = await rig.request(
      "client_admin_A",
      "GET",
      "/api/health/operational",
    );
    expect(denied.statusCode).toBe(403);
    const snapshot = await rig.request(
      "yux_admin",
      "GET",
      "/api/health/operational",
    );
    expect(snapshot.statusCode).toBe(200);
    expect(snapshot.body).toMatchObject({
      status: "degraded",
      windows: { workerHeartbeatSeconds: 30, workerStaleAfterSeconds: 90 },
      harness: { status: "unavailable" },
      outbox: { abandonedLeases: 1, terminalFailures: 1 },
    });
    expect(snapshot.body.workers).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: "ok" })]),
    );
    expect(snapshot.body.workers).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ instanceId: replacedWorkerId })]),
    );
    expect(snapshot.body.workerHistory).toMatchObject({ replacedHeartbeatCount: 1 });
    expect(snapshot.body.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "jina_ai",
          configured: true,
          source: "environment",
          verifiedAt: null,
        }),
        expect.objectContaining({
          provider: "smtp2go",
          configured: true,
          source: "database",
          verifiedAt: null,
        }),
      ]),
    );
    expect(snapshot.body.usage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "jina_ai",
          costBrl: null,
          measurementStatus: "unavailable",
        }),
      ]),
    );
    expect(JSON.stringify(snapshot.body)).not.toContain(
      "integration-jina-api-key",
    );
    expect(JSON.stringify(snapshot.body)).not.toContain("database-smtp-secret");
  } finally {
    await pool.end();
    await rig.close();
    if (previousProviderKey === undefined)
      delete process.env.PROVIDER_SECRET_ENCRYPTION_KEY_B64;
    else process.env.PROVIDER_SECRET_ENCRYPTION_KEY_B64 = previousProviderKey;
  }
});
