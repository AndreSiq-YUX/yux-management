-- Some clean remote projects were created before interactions became part of the baseline.

CREATE TABLE IF NOT EXISTS public.interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('call', 'email', 'meeting', 'note')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT interactions_reference CHECK (
    (client_id IS NOT NULL AND lead_id IS NULL) OR
    (client_id IS NULL AND lead_id IS NOT NULL)
  )
);

ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_interactions_updated_at ON public.interactions;
CREATE TRIGGER update_interactions_updated_at
  BEFORE UPDATE ON public.interactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.interactions TO authenticated;

NOTIFY pgrst, 'reload schema';
