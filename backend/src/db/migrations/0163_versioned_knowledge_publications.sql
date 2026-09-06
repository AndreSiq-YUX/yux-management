-- Versioned, tenant-safe publication identity for strategic and company knowledge.

ALTER TABLE public.yux_strategy_packs
  ADD COLUMN IF NOT EXISTS owner_organization_id UUID REFERENCES public.organizations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS current_release_id UUID;

ALTER TABLE public.yux_strategy_source_documents
  ADD COLUMN IF NOT EXISTS owner_organization_id UUID REFERENCES public.organizations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_origin TEXT NOT NULL DEFAULT 'document_extracted'
    CHECK (source_origin IN ('document_extracted','manual_authored','seed_example'));

UPDATE public.yux_strategy_source_documents
SET owner_organization_id=organization_id
WHERE owner_organization_id IS NULL AND organization_id IS NOT NULL;

ALTER TABLE public.yux_strategy_pack_items
  ADD COLUMN IF NOT EXISTS source_origin TEXT NOT NULL DEFAULT 'manual_authored'
    CHECK (source_origin IN ('document_extracted','manual_authored','seed_example'));

UPDATE public.yux_strategy_pack_items item
SET source_origin='seed_example',
    payload=item.payload || jsonb_build_object('sourceOrigin','seed_example','evidenceStatus','unattributed_example')
FROM public.yux_strategy_packs pack
WHERE pack.id=item.pack_id AND pack.pack_key='blackbook_yux_growth_doctrine';

CREATE TABLE IF NOT EXISTS public.yux_strategy_pack_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES public.yux_strategy_packs(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version > 0),
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  policy_version TEXT NOT NULL CHECK (BTRIM(policy_version) <> ''),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
  published_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(pack_id,version),
  UNIQUE(pack_id,content_hash)
);

ALTER TABLE public.yux_strategy_packs
  DROP CONSTRAINT IF EXISTS yux_strategy_packs_current_release_fk;
ALTER TABLE public.yux_strategy_packs
  ADD CONSTRAINT yux_strategy_packs_current_release_fk
  FOREIGN KEY(current_release_id) REFERENCES public.yux_strategy_pack_releases(id) ON DELETE SET NULL;

ALTER TABLE public.yux_strategy_concept_cards
  ADD COLUMN IF NOT EXISTS pack_release_id UUID REFERENCES public.yux_strategy_pack_releases(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS pack_item_id UUID REFERENCES public.yux_strategy_pack_items(id) ON DELETE RESTRICT;

DO $$
DECLARE constraint_name TEXT;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  WHERE con.conrelid='public.yux_strategy_source_documents'::regclass
    AND con.contype='u'
    AND pg_get_constraintdef(con.oid)='UNIQUE (source_hash)'
  LIMIT 1;
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.yux_strategy_source_documents DROP CONSTRAINT %I',constraint_name);
  END IF;

  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  WHERE con.conrelid='public.yux_strategy_concept_cards'::regclass
    AND con.contype='u'
    AND pg_get_constraintdef(con.oid)='UNIQUE (concept, category)'
  LIMIT 1;
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.yux_strategy_concept_cards DROP CONSTRAINT %I',constraint_name);
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS yux_strategy_document_private_hash_uq
  ON public.yux_strategy_source_documents(owner_organization_id,source_hash)
  WHERE owner_organization_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS yux_strategy_document_global_hash_uq
  ON public.yux_strategy_source_documents(source_hash)
  WHERE owner_organization_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS yux_strategy_card_release_item_uq
  ON public.yux_strategy_concept_cards(pack_release_id,pack_item_id)
  WHERE pack_release_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS yux_strategy_card_legacy_concept_uq
  ON public.yux_strategy_concept_cards(concept,category)
  WHERE pack_release_id IS NULL;

ALTER TABLE public.knowledge_publications
  ADD COLUMN IF NOT EXISTS version INTEGER,
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS snapshot JSONB;

WITH numbered AS (
  SELECT id,ROW_NUMBER() OVER(PARTITION BY entry_id ORDER BY published_at,id)::INTEGER AS version
  FROM public.knowledge_publications
)
UPDATE public.knowledge_publications publication
SET version=numbered.version,
    content_hash=encode(digest(publication.body_snapshot,'sha256'),'hex'),
    snapshot=jsonb_build_object('body',publication.body_snapshot)
FROM numbered WHERE numbered.id=publication.id;

ALTER TABLE public.knowledge_publications
  ALTER COLUMN version SET NOT NULL,
  ALTER COLUMN content_hash SET NOT NULL,
  ALTER COLUMN snapshot SET NOT NULL,
  ADD CONSTRAINT knowledge_publications_content_hash_check CHECK(content_hash ~ '^[a-f0-9]{64}$');
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_publications_entry_version_uq
  ON public.knowledge_publications(entry_id,version);

CREATE OR REPLACE FUNCTION private.complete_knowledge_publication_identity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.version := COALESCE(NEW.version,(
    SELECT COALESCE(MAX(existing.version),0)+1
    FROM public.knowledge_publications existing WHERE existing.entry_id=NEW.entry_id
  ));
  NEW.content_hash := COALESCE(NEW.content_hash,encode(digest(NEW.body_snapshot,'sha256'),'hex'));
  NEW.snapshot := COALESCE(NEW.snapshot,jsonb_build_object('body',NEW.body_snapshot));
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS complete_knowledge_publication_identity ON public.knowledge_publications;
CREATE TRIGGER complete_knowledge_publication_identity
  BEFORE INSERT ON public.knowledge_publications
  FOR EACH ROW EXECUTE FUNCTION private.complete_knowledge_publication_identity();

ALTER TABLE public.knowledge_sources
  ADD COLUMN IF NOT EXISTS current_publication_id UUID REFERENCES public.knowledge_publications(id) ON DELETE SET NULL;
ALTER TABLE public.marketing_knowledge_documents
  ADD COLUMN IF NOT EXISTS current_publication_id UUID REFERENCES public.knowledge_publications(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION private.prevent_strategy_release_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'strategy_release_is_immutable';
END
$$;
DROP TRIGGER IF EXISTS protect_strategy_release_immutable ON public.yux_strategy_pack_releases;
CREATE TRIGGER protect_strategy_release_immutable
  BEFORE UPDATE OR DELETE ON public.yux_strategy_pack_releases
  FOR EACH ROW EXECUTE FUNCTION private.prevent_strategy_release_mutation();

ALTER TABLE public.yux_strategy_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_packs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_pack_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_pack_releases FORCE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_pack_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_pack_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_pack_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_pack_bindings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_source_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_source_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_source_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_source_pages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_source_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_source_chunks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_source_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_source_assets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_concept_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yux_strategy_concept_cards FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS strategy_packs_scoped ON public.yux_strategy_packs;
CREATE POLICY strategy_packs_scoped ON public.yux_strategy_packs FOR ALL
  USING (private.rls_is_internal() OR (owner_organization_id IS NOT NULL AND private.rls_can_access_organization(owner_organization_id)))
  WITH CHECK (private.rls_is_internal() OR (owner_organization_id IS NOT NULL AND private.rls_can_access_organization(owner_organization_id)));
DROP POLICY IF EXISTS strategy_releases_scoped ON public.yux_strategy_pack_releases;
CREATE POLICY strategy_releases_scoped ON public.yux_strategy_pack_releases FOR SELECT
  USING (EXISTS(SELECT 1 FROM public.yux_strategy_packs pack WHERE pack.id=pack_id));
CREATE POLICY strategy_releases_internal_write ON public.yux_strategy_pack_releases FOR INSERT
  WITH CHECK (private.rls_is_internal());

DROP POLICY IF EXISTS strategy_pack_items_scoped ON public.yux_strategy_pack_items;
CREATE POLICY strategy_pack_items_scoped ON public.yux_strategy_pack_items FOR ALL
  USING (EXISTS(SELECT 1 FROM public.yux_strategy_packs pack WHERE pack.id=pack_id))
  WITH CHECK (EXISTS(SELECT 1 FROM public.yux_strategy_packs pack WHERE pack.id=pack_id));
DROP POLICY IF EXISTS strategy_pack_bindings_scoped ON public.yux_strategy_pack_bindings;
CREATE POLICY strategy_pack_bindings_scoped ON public.yux_strategy_pack_bindings FOR ALL
  USING (private.rls_is_internal() OR (organization_id IS NOT NULL AND private.rls_can_access_organization(organization_id)))
  WITH CHECK (private.rls_is_internal() OR (organization_id IS NOT NULL AND private.rls_can_access_organization(organization_id)));
DROP POLICY IF EXISTS strategy_source_documents_scoped ON public.yux_strategy_source_documents;
CREATE POLICY strategy_source_documents_scoped ON public.yux_strategy_source_documents FOR ALL
  USING (private.rls_is_internal() OR (owner_organization_id IS NOT NULL AND private.rls_can_access_organization(owner_organization_id)))
  WITH CHECK (private.rls_is_internal() OR (owner_organization_id IS NOT NULL AND private.rls_can_access_organization(owner_organization_id)));
DO $$
DECLARE child_table TEXT;
BEGIN
  FOREACH child_table IN ARRAY ARRAY['yux_strategy_source_pages','yux_strategy_source_chunks','yux_strategy_source_assets']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS strategy_source_child_scoped ON public.%I',child_table);
    EXECUTE format(
      'CREATE POLICY strategy_source_child_scoped ON public.%I FOR ALL USING (EXISTS(SELECT 1 FROM public.yux_strategy_source_documents document WHERE document.id=document_id)) WITH CHECK (EXISTS(SELECT 1 FROM public.yux_strategy_source_documents document WHERE document.id=document_id))',
      child_table
    );
  END LOOP;
END
$$;
DROP POLICY IF EXISTS strategy_concept_cards_scoped ON public.yux_strategy_concept_cards;
CREATE POLICY strategy_concept_cards_scoped ON public.yux_strategy_concept_cards FOR ALL
  USING (
    private.rls_is_internal() OR EXISTS(
      SELECT 1 FROM public.yux_strategy_pack_releases release
      JOIN public.yux_strategy_packs pack ON pack.id=release.pack_id
      WHERE release.id=pack_release_id AND pack.owner_organization_id IS NOT NULL
        AND private.rls_can_access_organization(pack.owner_organization_id)
    )
  )
  WITH CHECK (private.rls_is_internal());

GRANT SELECT,INSERT ON public.yux_strategy_pack_releases TO yux_api,yux_worker;
GRANT SELECT ON public.yux_strategy_pack_releases TO yux_runtime;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='yux_strategy_pack_client_owner_check'
      AND conrelid='public.yux_strategy_packs'::regclass
  ) THEN
    ALTER TABLE public.yux_strategy_packs ADD CONSTRAINT yux_strategy_pack_client_owner_check
      CHECK(scope <> 'client' OR owner_organization_id IS NOT NULL);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='yux_strategy_document_client_owner_check'
      AND conrelid='public.yux_strategy_source_documents'::regclass
  ) THEN
    ALTER TABLE public.yux_strategy_source_documents ADD CONSTRAINT yux_strategy_document_client_owner_check
      CHECK(source_scope <> 'client' OR owner_organization_id IS NOT NULL);
  END IF;
END
$$;
