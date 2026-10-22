-- Persist parser defaults before any fresh retry authorization is issued.
-- The helper preserves explicit values, records migration-origin audit history
-- and advances the policy version only when keys are actually missing.
SELECT private.backfill_radar_operational_defaults('{"maxDecisionCallsPerCompany":6,"maxPresenceResolutionsPerCompany":2,"maxDeepSearchesPerCompany":1,"maxFallbackAttemptsPerEffect":1,"stalledAfterMinutes":10}'::jsonb);
