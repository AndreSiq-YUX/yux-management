-- A paid page/continuation is shared across new lots of the same criteria.
-- A new lot may consume saved overflow; it must not buy the same first page.
ALTER TABLE public.radar_discovery_pages ADD COLUMN criteria_revision INTEGER NOT NULL DEFAULT 1 CHECK(criteria_revision>0),
 ADD COLUMN admitted_offset INTEGER NOT NULL DEFAULT 0 CHECK(admitted_offset>=0);
CREATE UNIQUE INDEX radar_discovery_page_scope_idx ON public.radar_discovery_pages(organization_id,campaign_id,criteria_revision,scope_key,page_number);
CREATE INDEX radar_discovery_pages_saved_idx ON public.radar_discovery_pages(organization_id,campaign_id,criteria_revision,status);
