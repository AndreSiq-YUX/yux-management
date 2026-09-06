import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Readable } from "node:stream";
import { z } from "zod";
import { hashSessionToken } from "../../auth/session.js";
import { runWithDatabaseRequestContext } from "../../db/request-context.js";
import { requireInternalRole } from "../../http/guards.js";
import { dataQuerySchema, executeDataQuery } from "../data/routes.js";
import { getStrategyRelease, publishStrategyPack } from "./publications.js";
import {
  createStrategyIngestion,
  effectiveStrategyIngestionLimit,
  getStrategyIngestion,
  uploadStrategyIngestion,
} from "./ingestion.js";
import { createBullMqJobId } from "../../jobs/queue.js";

const packParams = z.object({ packId: z.string().uuid() });
const releaseParams = z.object({ releaseId: z.string().uuid() });
const publicationBody = z.object({
  policyVersion: z.string().trim().min(1).max(120),
});
const ingestionParams = z.object({ ingestionId: z.string().uuid() });
const ingestionBody = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(160),
  byteSize: z.number().int().positive(),
  sourceName: z.string().trim().min(1).max(500).optional(),
  sourceKind: z.string().trim().min(1).max(120).optional(),
});

const allowedTables = new Set([
  "yux_strategy_agent_profiles",
  "yux_strategy_skills",
  "yux_strategy_concept_cards",
  "yux_strategy_source_documents",
  "yux_strategy_source_chunks",
  "yux_strategy_source_assets",
  "yux_strategy_retrieval_queries",
  "yux_strategy_agent_bindings",
  "yux_strategy_packs",
  "yux_strategy_pack_releases",
  "yux_strategy_pack_items",
  "yux_strategy_pack_bindings",
  "yux_strategy_ingestion_jobs",
  "platform_provider_connections",
  "model_routing_rules",
  "organizations",
  "ai_assistants",
  "ai_assistant_routing_rules",
  "yux_strategy_agent_recommendations",
  "yux_strategy_agent_handoffs",
  "yux_strategy_outcome_events",
  "yux_objection_playbook_items",
  "yux_metrics_cash_snapshots",
  "agent_execution_runs",
  "agent_execution_steps",
  "agent_autonomy_policies",
  "strategy_workflow_specs",
  "agent_learning_signals",
  "agent_improvement_recommendations",
  "agent_shadow_experiments",
  "yux_strategy_chat_sessions",
  "yux_strategy_chat_messages",
]);

async function getAuthenticatedUser(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const token = request.cookies[request.server.config.SESSION_COOKIE_NAME];
  if (!token) {
    void reply.code(401).send({ error: "not_authenticated" });
    return null;
  }

  const user = await request.server.authStore.findUserBySession(
    hashSessionToken(token),
    new Date(),
  );
  if (!user) {
    void reply.code(401).send({ error: "not_authenticated" });
    return null;
  }

  return user;
}

export async function registerStrategyEngineRoutes(app: FastifyInstance) {
  app.addContentTypeParser(
    "application/octet-stream",
    (_request, payload, done) => done(null, payload),
  );

  app.post("/packs/:packId/ingestions", async (request, reply) => {
    const context = requireInternalRole(request);
    const user = await getAuthenticatedUser(request, reply);
    if (!user) return reply;
    const params = packParams.safeParse(request.params);
    const body = ingestionBody.safeParse(request.body);
    if (!params.success || !body.success)
      return reply.code(400).send({ error: "invalid_strategy_ingestion" });
    const maxBytes = effectiveStrategyIngestionLimit(
      app.config.STRATEGY_INGESTION_MAX_MB,
    );
    const ingestion = await runWithDatabaseRequestContext(
      {
        role: context.role,
        organizationIds: context.organizationIds,
        serviceRole: "api",
      },
      () =>
        createStrategyIngestion(app.pg, {
          packId: params.data.packId,
          ...body.data,
          uploadedBy: user.id,
          organizationIds: context.organizationIds,
          maxBytes,
        }),
    );
    return reply.code(201).send(ingestion);
  });

  app.put(
    "/ingestions/:ingestionId/file",
    { bodyLimit: 50 * 1024 * 1024 },
    async (request, reply) => {
      const context = requireInternalRole(request);
      const user = await getAuthenticatedUser(request, reply);
      if (!user) return reply;
      const params = ingestionParams.safeParse(request.params);
      if (!params.success || !request.body || typeof (request.body as Readable).pipe !== "function")
        return reply.code(400).send({ error: "invalid_strategy_file_upload" });
      const expectedSha256 = request.headers["x-content-sha256"];
      if (
        expectedSha256 !== undefined &&
        (typeof expectedSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(expectedSha256))
      ) {
        return reply.code(400).send({ error: "invalid_strategy_file_hash" });
      }
      const uploaded = await runWithDatabaseRequestContext(
        {
          role: context.role,
          organizationIds: context.organizationIds,
          serviceRole: "api",
        },
        () =>
          uploadStrategyIngestion(app.pg, {
            ingestionId: params.data.ingestionId,
            payload: request.body as Readable,
            expectedSha256,
            storageRoot: app.config.KNOWLEDGE_STORAGE_DIR,
            maxBytes: effectiveStrategyIngestionLimit(
              app.config.STRATEGY_INGESTION_MAX_MB,
            ),
          }),
      );
      await app.jobQueue
        .add("events.dispatchPending", {
          limit: 100,
          strategyIngestionId: params.data.ingestionId,
        })
        .catch(() => undefined);
      return reply.code(202).send(uploaded);
    },
  );

  app.get("/ingestions/:ingestionId", async (request, reply) => {
    const context = requireInternalRole(request);
    const user = await getAuthenticatedUser(request, reply);
    if (!user) return reply;
    const params = ingestionParams.safeParse(request.params);
    if (!params.success)
      return reply.code(400).send({ error: "invalid_strategy_ingestion" });
    const ingestion = await runWithDatabaseRequestContext(
      {
        role: context.role,
        organizationIds: context.organizationIds,
        serviceRole: "api",
      },
      () => getStrategyIngestion(app.pg, params.data.ingestionId),
    );
    if (!ingestion)
      return reply.code(404).send({ error: "strategy_ingestion_not_found" });
    if (ingestion.status === "queued" && ingestion.documentId) {
      await app.jobQueue
        .add(
          "strategy.indexKnowledge",
          {
            ingestionId: ingestion.ingestionId,
            documentId: ingestion.documentId,
            organizationId: ingestion.organizationId,
          },
          { jobId: createBullMqJobId("strategy-index", ingestion.ingestionId) },
        )
        .catch(() => undefined);
    }
    return ingestion;
  });

  app.post("/packs/:packId/releases", async (request, reply) => {
    requireInternalRole(request);
    const user = await getAuthenticatedUser(request, reply);
    if (!user) return reply;
    const params = packParams.safeParse(request.params);
    const body = publicationBody.safeParse(request.body);
    if (!params.success || !body.success)
      return reply.code(400).send({ error: "invalid_strategy_publication" });
    const context = requireInternalRole(request);
    const publication = await runWithDatabaseRequestContext(
      {
        role: context.role,
        organizationIds: context.organizationIds,
        serviceRole: "api",
      },
      () =>
        publishStrategyPack(app.pg, {
          packId: params.data.packId,
          policyVersion: body.data.policyVersion,
          publishedBy: user.id,
        }),
    );
    return reply.code(publication.duplicate ? 200 : 201).send(publication);
  });

  app.get("/releases/:releaseId", async (request, reply) => {
    requireInternalRole(request);
    const user = await getAuthenticatedUser(request, reply);
    if (!user) return reply;
    const params = releaseParams.safeParse(request.params);
    if (!params.success)
      return reply.code(400).send({ error: "invalid_strategy_release" });
    const context = requireInternalRole(request);
    const release = await runWithDatabaseRequestContext(
      {
        role: context.role,
        organizationIds: context.organizationIds,
        serviceRole: "api",
      },
      () => getStrategyRelease(app.pg, params.data.releaseId),
    );
    return (
      release ?? reply.code(404).send({ error: "strategy_release_not_found" })
    );
  });

  app.post("/query", async (request, reply) => {
    requireInternalRole(request);
    const user = await getAuthenticatedUser(request, reply);
    if (!user) return reply;

    const parsed = dataQuerySchema.safeParse(request.body);
    if (!parsed.success || !allowedTables.has(parsed.data.table)) {
      return reply.code(400).send({ error: "invalid_strategy_engine_query" });
    }

    return executeDataQuery(app, parsed.data);
  });
}
