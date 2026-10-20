-- Supports bounded tuple pagination; does not import data or activate a source.
CREATE INDEX radar_osm_places_cursor_idx
  ON public.radar_osm_places(snapshot_id,segment_key,osm_type,osm_id);
