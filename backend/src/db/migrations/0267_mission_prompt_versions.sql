CREATE TABLE private.mission_prompt_versions (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('mission-planning','mission-intake-internal','mission-intake-client')),
  version INTEGER NOT NULL CHECK (version > 0),
  instructions JSONB NOT NULL CHECK (jsonb_typeof(instructions) = 'object'),
  operation TEXT NOT NULL CHECK (operation IN ('publish','restore')),
  restored_from_version INTEGER,
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
  test_fingerprints TEXT[] NOT NULL,
  author_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, scope, version)
);

CREATE TABLE private.mission_prompt_execution_versions (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('mission-planning','mission-intake-internal','mission-intake-client')),
  operation_id UUID NOT NULL,
  operation_version INTEGER NOT NULL CHECK (operation_version > 0),
  prompt_version INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, scope, operation_id, operation_version),
  FOREIGN KEY (organization_id, scope, prompt_version)
    REFERENCES private.mission_prompt_versions(organization_id, scope, version) ON DELETE CASCADE
);

CREATE INDEX mission_prompt_execution_version_lookup
  ON private.mission_prompt_execution_versions(organization_id, scope, prompt_version)
  WHERE prompt_version IS NOT NULL;

ALTER TABLE private.mission_prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.mission_prompt_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE private.mission_prompt_execution_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.mission_prompt_execution_versions FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON private.mission_prompt_versions TO yux_api;
GRANT SELECT ON private.mission_prompt_versions TO yux_worker;
GRANT SELECT, INSERT ON private.mission_prompt_execution_versions TO yux_worker;

CREATE POLICY mission_prompt_versions_admin ON private.mission_prompt_versions TO yux_api
  USING (current_setting('app.current_role', true) = 'yux_admin');
CREATE POLICY mission_prompt_versions_worker ON private.mission_prompt_versions FOR SELECT TO yux_worker
  USING (organization_id = ANY(coalesce(nullif(current_setting('app.current_orgs', true), ''), '{}')::uuid[]));
CREATE POLICY mission_prompt_execution_versions_worker ON private.mission_prompt_execution_versions TO yux_worker
  USING (organization_id = ANY(coalesce(nullif(current_setting('app.current_orgs', true), ''), '{}')::uuid[]));
