-- Versioned and audited default; never overwrite an Admin's saved value.
SELECT private.backfill_radar_operational_defaults('{"maxSemanticFitAssessmentsPerCompany":2}'::jsonb);
