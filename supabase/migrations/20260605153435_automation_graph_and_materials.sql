-- Support for visual node graphs, branching checks and organization materials.

-- 1. Update builder_mode check constraint on automation_flows to allow 'node'
ALTER TABLE public.automation_flows
  DROP CONSTRAINT IF EXISTS automation_flows_builder_mode_check;

ALTER TABLE public.automation_flows
  ADD CONSTRAINT automation_flows_builder_mode_check CHECK (builder_mode IN ('guided', 'technical', 'node'));

-- 2. Add graph column to automation_flows
ALTER TABLE public.automation_flows
  ADD COLUMN IF NOT EXISTS graph JSONB CHECK (graph IS NULL OR jsonb_typeof(graph) = 'object');

-- 3. Add max_upload_size_mb to omnichannel_settings
ALTER TABLE public.omnichannel_settings
  ADD COLUMN IF NOT EXISTS max_upload_size_mb INTEGER NOT NULL DEFAULT 10 CHECK (max_upload_size_mb > 0);

-- 4. Create organization_materials table for storing materials
CREATE TABLE IF NOT EXISTS public.organization_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (BTRIM(name) <> ''),
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.organization_materials ENABLE ROW LEVEL SECURITY;

-- Triggers for updated_at column
DROP TRIGGER IF EXISTS update_organization_materials_updated_at ON public.organization_materials;
CREATE TRIGGER update_organization_materials_updated_at BEFORE UPDATE ON public.organization_materials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Row Level Security policies
DROP POLICY IF EXISTS "Omnichannel users read organization materials" ON public.organization_materials;
CREATE POLICY "Omnichannel users read organization materials" ON public.organization_materials
  FOR SELECT TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'read'));

DROP POLICY IF EXISTS "Omnichannel configurators manage organization materials" ON public.organization_materials;
CREATE POLICY "Omnichannel configurators manage organization materials" ON public.organization_materials
  FOR ALL TO authenticated USING (private.can_access_omnichannel_organization(organization_id, 'configure'))
  WITH CHECK (private.can_access_omnichannel_organization(organization_id, 'configure'));

-- Revoke anon and grant to authenticated/service_role
REVOKE ALL ON public.organization_materials FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_materials TO authenticated, service_role;

-- 5. Create storage bucket for materials
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'materials',
  'materials',
  true,
  52428800, -- 50MB global storage limit
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf', 'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  updated_at = NOW();

-- Storage policies
DROP POLICY IF EXISTS "Materials readers" ON storage.objects;
CREATE POLICY "Materials readers" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'materials'
    AND private.can_access_omnichannel_storage_object(name, 'read')
  );

DROP POLICY IF EXISTS "Materials uploaders" ON storage.objects;
CREATE POLICY "Materials uploaders" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'materials'
    AND private.can_access_omnichannel_storage_object(name, 'write')
  );

DROP POLICY IF EXISTS "Materials editors" ON storage.objects;
CREATE POLICY "Materials editors" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'materials'
    AND private.can_access_omnichannel_storage_object(name, 'write')
  );

DROP POLICY IF EXISTS "Materials deleters" ON storage.objects;
CREATE POLICY "Materials deleters" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'materials'
    AND private.can_access_omnichannel_storage_object(name, 'write')
  );

NOTIFY pgrst, 'reload schema';
