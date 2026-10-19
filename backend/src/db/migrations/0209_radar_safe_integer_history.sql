-- Historical counters must support the same exact range as capacity settings.
ALTER TABLE public.radar_cost_logs ALTER COLUMN units TYPE BIGINT;
ALTER TABLE public.radar_cost_logs ADD CHECK(units<=9007199254740991);
ALTER TABLE public.radar_regional_discovery_cursors ALTER COLUMN pages_processed TYPE BIGINT;
ALTER TABLE public.radar_regional_discovery_cursors ALTER COLUMN candidates_seen TYPE BIGINT;
ALTER TABLE public.radar_regional_discovery_cursors ADD CHECK(pages_processed<=9007199254740991 AND candidates_seen<=9007199254740991);
