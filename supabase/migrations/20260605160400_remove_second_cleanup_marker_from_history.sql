-- Cleanup for an accidental no-op validation migration registered through MCP.
-- No application schema was changed by the removed markers.

DELETE FROM supabase_migrations.schema_migrations
WHERE version IN ('20260605160341')
   OR name IN (
    'noop_schema_validation_marker',
    'remove_noop_schema_validation_marker',
    'remove_cleanup_marker_from_history'
  );
