-- Alter check constraint to include 'other' in communication_preference
BEGIN;

ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_communication_preference_check;
ALTER TABLE clients
  ADD CONSTRAINT clients_communication_preference_check
  CHECK (
    communication_preference IS NULL OR communication_preference IN (
      'email', 'phone', 'whatsapp', 'teams', 'slack', 'other'
    )
  );

COMMIT;