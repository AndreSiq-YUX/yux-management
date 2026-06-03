-- Basic contract finance: invoices and billing items without automated payment gateway.

CREATE OR REPLACE FUNCTION private.can_read_finance_contract(target_contract_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.is_internal_user()
    OR EXISTS (
      SELECT 1
      FROM public.contracts c
      JOIN public.contract_modules cm
        ON cm.contract_id = c.id
       AND cm.module_key = 'finance'
       AND cm.enabled = TRUE
      WHERE c.id = target_contract_id
        AND c.status = 'active'
        AND private.can_access_client(c.client_id)
    );
$$;

CREATE OR REPLACE FUNCTION private.can_manage_finance_organization(target_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT private.is_internal_user()
    AND EXISTS (
      SELECT 1
      FROM public.organizations o
      WHERE o.id = target_organization_id
    );
$$;

REVOKE ALL ON FUNCTION private.can_read_finance_contract(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_manage_finance_organization(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_read_finance_contract(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_finance_organization(UUID) TO authenticated;

CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'partial', 'paid', 'overdue', 'cancelled')),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  period_start DATE,
  period_end DATE,
  currency TEXT NOT NULL DEFAULT 'BRL' CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  adjustments DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  paid_amount DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  paid_at TIMESTAMPTZ,
  notes TEXT,
  internal_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT invoices_issue_due_order CHECK (due_date >= issue_date),
  CONSTRAINT invoices_period_order CHECK (period_start IS NULL OR period_end IS NULL OR period_end >= period_start),
  CONSTRAINT invoices_paid_state CHECK (
    (status = 'paid' AND paid_at IS NOT NULL)
    OR (status <> 'paid')
  ),
  UNIQUE (organization_id, invoice_number)
);

CREATE TABLE public.billing_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL CHECK (BTRIM(description) <> ''),
  quantity DECIMAL(12,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(15,2) GENERATED ALWAYS AS (quantity * unit_amount) STORED,
  kind TEXT NOT NULL DEFAULT 'recurring' CHECK (kind IN ('setup', 'recurring', 'usage', 'adjustment', 'discount', 'other')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoices_organization_status ON public.invoices(organization_id, status);
CREATE INDEX idx_invoices_client_due ON public.invoices(client_id, due_date);
CREATE INDEX idx_invoices_contract_due ON public.invoices(contract_id, due_date);
CREATE INDEX idx_invoices_due_status ON public.invoices(due_date, status);
CREATE INDEX idx_billing_items_invoice_id ON public.billing_items(invoice_id);

CREATE OR REPLACE FUNCTION private.sync_invoice_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_invoice_id UUID;
  next_subtotal DECIMAL(15,2);
BEGIN
  target_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT COALESCE(SUM(total_amount), 0)
  INTO next_subtotal
  FROM public.billing_items
  WHERE invoice_id = target_invoice_id;

  UPDATE public.invoices
  SET subtotal = next_subtotal,
      total_amount = GREATEST(next_subtotal + adjustments, 0),
      status = CASE
        WHEN status = 'cancelled' THEN status
        WHEN paid_amount >= GREATEST(next_subtotal + adjustments, 0) AND GREATEST(next_subtotal + adjustments, 0) > 0 THEN 'paid'
        WHEN paid_amount > 0 THEN 'partial'
        ELSE status
      END,
      paid_at = CASE
        WHEN paid_amount >= GREATEST(next_subtotal + adjustments, 0) AND GREATEST(next_subtotal + adjustments, 0) > 0 THEN COALESCE(paid_at, NOW())
        WHEN status = 'paid' THEN paid_at
        ELSE NULL
      END,
      updated_at = NOW()
  WHERE id = target_invoice_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_invoice_payment_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  IF NEW.paid_amount >= NEW.total_amount AND NEW.total_amount > 0 THEN
    NEW.status := 'paid';
    NEW.paid_at := COALESCE(NEW.paid_at, NOW());
  ELSIF NEW.paid_amount > 0 THEN
    NEW.status := 'partial';
    NEW.paid_at := NULL;
  ELSIF NEW.status = 'paid' THEN
    NEW.status := 'issued';
    NEW.paid_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_invoice_totals() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.sync_invoice_payment_state() FROM PUBLIC;

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_billing_items_updated_at
  BEFORE UPDATE ON public.billing_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER sync_invoice_payment_state
  BEFORE INSERT OR UPDATE OF paid_amount, total_amount, status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION private.sync_invoice_payment_state();

CREATE TRIGGER sync_invoice_totals_after_item_change
  AFTER INSERT OR UPDATE OR DELETE ON public.billing_items
  FOR EACH ROW EXECUTE FUNCTION private.sync_invoice_totals();

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users manage invoices" ON public.invoices
  FOR ALL USING (private.can_manage_finance_organization(organization_id))
  WITH CHECK (private.can_manage_finance_organization(organization_id));

CREATE POLICY "Portal users read finance invoices" ON public.invoices
  FOR SELECT USING (private.can_read_finance_contract(contract_id));

CREATE POLICY "Internal users manage billing items" ON public.billing_items
  FOR ALL USING (EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = invoice_id
      AND private.can_manage_finance_organization(i.organization_id)
  )) WITH CHECK (EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = invoice_id
      AND private.can_manage_finance_organization(i.organization_id)
  ));

CREATE POLICY "Portal users read finance billing items" ON public.billing_items
  FOR SELECT USING (EXISTS (
    SELECT 1
    FROM public.invoices i
    WHERE i.id = invoice_id
      AND private.can_read_finance_contract(i.contract_id)
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_items TO authenticated;

INSERT INTO public.role_permissions (role_key, permission_key) VALUES
  ('client_member', 'finance.read')
ON CONFLICT (role_key, permission_key) DO NOTHING;

UPDATE public.platform_modules
SET base = false,
    internal_route = '/finance',
    portal_route = '/portal/finance',
    required_permissions = ARRAY['finance.read'],
    updated_at = NOW()
WHERE key = 'finance';

NOTIFY pgrst, 'reload schema';
