-- Enforce tenant binding for consumption, not only for the previous receipt.
-- Additive forward correction; do not rewrite an already-applied checksum.
ALTER TABLE public.radar_analysis_retry_authorizations
 DROP CONSTRAINT radar_analysis_retry_authoriz_consumed_by_analysis_receipt_fkey,
 ADD CONSTRAINT radar_retry_consumed_tenant_fk FOREIGN KEY(consumed_by_analysis_receipt_id,organization_id)
 REFERENCES public.radar_analysis_receipts(id,organization_id);
