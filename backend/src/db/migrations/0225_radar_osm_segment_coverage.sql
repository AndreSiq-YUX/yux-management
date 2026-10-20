-- Preserve legacy snapshots. Only the historical medical mapping is known to
-- have been indexed; a new mapping must be imported, not inferred from zero rows.
ALTER TABLE public.radar_osm_snapshots ADD COLUMN segment_coverage JSONB NOT NULL DEFAULT '{"medical_clinics":{"version":"legacy-1.0.0"}}'::jsonb;
