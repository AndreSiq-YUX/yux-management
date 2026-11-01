ALTER TABLE public.leads ADD COLUMN deleted_at TIMESTAMPTZ,
  ADD COLUMN deleted_by UUID REFERENCES public.users(id);
CREATE INDEX leads_active_instance ON public.leads(crm_instance_id,id) WHERE deleted_at IS NULL;
CREATE INDEX leads_trash_instance ON public.leads(crm_instance_id,deleted_at DESC,id) WHERE deleted_at IS NOT NULL;
ALTER TABLE public.automation_executions ADD COLUMN cancelled_at TIMESTAMPTZ;
ALTER TABLE public.automation_executions DROP CONSTRAINT automation_executions_status_check;
ALTER TABLE public.automation_executions ADD CONSTRAINT automation_executions_status_check CHECK(status IN ('pending','processing','completed','failed','cancelled'));
ALTER TABLE public.messages ADD COLUMN cancelled_at TIMESTAMPTZ;
ALTER TABLE public.email_send_requests ADD COLUMN cancelled_at TIMESTAMPTZ;
-- Central write guard protects command adapters and retries, including direct HTTP data writes.
CREATE FUNCTION private.crm_active_lead_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; removed TIMESTAMPTZ;
BEGIN
  IF TG_TABLE_NAME='messages' THEN
    IF NEW.direction<>'outbound' OR NEW.delivery_status NOT IN ('queued','pending','sending','processing') THEN RETURN NEW; END IF;
    IF NEW.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'Entrega cancelada pela exclusão do lead.' USING ERRCODE='23514'; END IF;
    SELECT lead_id INTO target FROM public.conversations WHERE id=NEW.conversation_id;
  ELSE
    target:=NEW.lead_id;
    IF TG_TABLE_NAME IN ('automation_executions','email_send_requests') THEN
      IF NEW.cancelled_at IS NOT NULL AND NEW.status IN ('pending','processing','queued','sending') THEN RAISE EXCEPTION 'Execução cancelada pela exclusão do lead.' USING ERRCODE='23514'; END IF;
      IF NEW.status='cancelled' THEN RETURN NEW; END IF;
    END IF;
    IF TG_TABLE_NAME='email_send_requests' AND NEW.status NOT IN ('queued','sending') THEN RETURN NEW; END IF;
    IF TG_TABLE_NAME='crm_sequence_enrollments' AND NEW.status<>'active' THEN RETURN NEW; END IF;
  END IF;
  IF target IS NULL THEN RETURN NEW; END IF;
  SELECT deleted_at INTO removed FROM public.leads WHERE id=target FOR KEY SHARE;
  IF removed IS NOT NULL THEN RAISE EXCEPTION 'Lead excluído. Recupere-o antes de iniciar novas ações.' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['lead_tasks','crm_tasks','crm_sequence_enrollments','automation_executions','email_send_requests','messages'] LOOP
    EXECUTE format('CREATE TRIGGER crm_active_lead_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.crm_active_lead_write_guard()',t);
  END LOOP;
END $$;
