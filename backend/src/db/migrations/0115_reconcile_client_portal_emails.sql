-- Reconcile client contact emails with their linked portal identities.
-- Ambiguous or conflicting relationships are intentionally left unchanged.

WITH single_client_users AS (
  SELECT user_id
  FROM public.clients
  WHERE user_id IS NOT NULL
  GROUP BY user_id
  HAVING COUNT(*) = 1
), safe_email_updates AS (
  SELECT
    c.user_id,
    TRIM(c.email) AS email
  FROM public.clients c
  JOIN single_client_users single_user ON single_user.user_id = c.user_id
  JOIN app_users linked_user ON linked_user.id = c.user_id
  WHERE TRIM(c.email) <> ''
    AND LOWER(linked_user.email) <> LOWER(TRIM(c.email))
    AND NOT EXISTS (
      SELECT 1
      FROM app_users conflicting_user
      WHERE conflicting_user.id <> linked_user.id
        AND LOWER(conflicting_user.email) = LOWER(TRIM(c.email))
    )
)
UPDATE app_users portal_user
SET email = safe_update.email,
    updated_at = NOW()
FROM safe_email_updates safe_update
WHERE portal_user.id = safe_update.user_id;
