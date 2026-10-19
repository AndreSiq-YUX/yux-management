-- Product capacities are Admin policies, not int4 storage boundaries.
DO $$ DECLARE target RECORD; BEGIN
 FOR target IN SELECT * FROM (VALUES
  ('radar_capture_operations','requested_count'),('radar_capture_operations','queries'),
  ('radar_capture_requests','requested_count'),('radar_campaigns','daily_limit'),
  ('radar_data_sources','rate_limit_per_day'),('radar_source_usage_counters','units'),
  ('radar_regional_discovery_cursors','page_size')
 ) AS columns_to_widen(table_name,column_name) LOOP
  EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I TYPE BIGINT',target.table_name,target.column_name);
  EXECUTE format('ALTER TABLE public.%I ADD CHECK(%I<=9007199254740991)',target.table_name,target.column_name);
 END LOOP;
END $$;
