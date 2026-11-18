CREATE TABLE private.mission_conversation_turn_context (
  organization_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  message_sequence INTEGER NOT NULL,
  history_after_sequence INTEGER NOT NULL CHECK (
    history_after_sequence >= 0 AND history_after_sequence < message_sequence
  ),
  audience TEXT NOT NULL CHECK (audience IN ('internal_operator', 'client_user')),
  input_sources JSONB NOT NULL CHECK (jsonb_typeof(input_sources) = 'array'),
  PRIMARY KEY (conversation_id, message_sequence),
  FOREIGN KEY (conversation_id, organization_id)
    REFERENCES public.action_mission_conversations(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id, message_sequence)
    REFERENCES public.action_mission_conversation_messages(conversation_id, sequence) ON DELETE CASCADE
);

ALTER TABLE private.mission_conversation_turn_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.mission_conversation_turn_context FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON private.mission_conversation_turn_context TO yux_worker;
GRANT SELECT ON private.mission_conversation_turn_context TO yux_api;
CREATE POLICY mission_conversation_turn_context_worker ON private.mission_conversation_turn_context TO yux_worker
  USING (organization_id = ANY(coalesce(nullif(current_setting('app.current_orgs', true), ''), '{}')::uuid[]));
CREATE POLICY mission_conversation_turn_context_admin ON private.mission_conversation_turn_context FOR SELECT TO yux_api
  USING (current_setting('app.current_role', true) = 'yux_admin');
