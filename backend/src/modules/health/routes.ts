import type { FastifyInstance } from "fastify";
import { requireAuth, requireInternalRole } from "../../http/guards.js";
import { runWithDatabaseRequestContext } from "../../db/request-context.js";
import { buildOperationalSnapshot } from "./operational-snapshot.js";

const service = "yux-backend-api";

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get("/health/live", async () => ({
    status: "ok",
    service,
  }));

  app.get("/health", async () => ({
    status: "ok",
    service,
  }));

  const ready = async (
    _request: unknown,
    reply: { code(statusCode: number): { send(value: unknown): unknown } },
  ) => {
    try {
      await Promise.all([app.pg.query("SELECT 1"), app.redisPing()]);
      return { status: "ready", service };
    } catch (error) {
      app.log.warn(error, "readiness dependency check failed");
      return reply.code(503).send({ status: "unavailable", service });
    }
  };

  app.get("/ready", ready);
  app.get("/health/ready", ready);

  app.get("/health/operational", async (request) => {
    requireAuth(request);
    const context = requireInternalRole(request);
    return runWithDatabaseRequestContext(
      {
        role: context.role,
        organizationIds: context.organizationIds,
        serviceRole: "api",
      },
      () => buildOperationalSnapshot(app.pg, app.config),
    );
  });
}
