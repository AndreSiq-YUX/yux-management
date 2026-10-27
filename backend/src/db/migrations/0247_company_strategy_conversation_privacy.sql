ALTER TABLE public.action_mission_conversations ADD COLUMN company_strategy_private boolean NOT NULL DEFAULT false;
UPDATE public.action_mission_conversations conversation SET company_strategy_private=true
 WHERE conversation.current_brief ? 'companyStrategyReview'
 OR EXISTS(SELECT 1 FROM public.action_mission_conversation_messages message WHERE message.organization_id=conversation.organization_id AND message.conversation_id=conversation.id AND (message.structured_payload ? 'strategyProposal' OR message.structured_payload ? 'strategyProposalReference'));
CREATE POLICY company_strategy_private_conversation ON public.action_mission_conversations AS RESTRICTIVE FOR SELECT TO yux_api,yux_worker,yux_runtime
 USING(current_setting('app.current_role',true)<>'client_member' OR NOT company_strategy_private);
CREATE POLICY company_strategy_private_message ON public.action_mission_conversation_messages AS RESTRICTIVE FOR SELECT TO yux_api,yux_worker,yux_runtime
 USING(current_setting('app.current_role',true)<>'client_member' OR EXISTS(
  SELECT 1 FROM public.action_mission_conversations conversation WHERE conversation.id=conversation_id AND conversation.organization_id=organization_id AND NOT conversation.company_strategy_private
 ));
CREATE FUNCTION private.guard_company_strategy_conversation_privacy() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF OLD.company_strategy_private AND NOT NEW.company_strategy_private THEN RAISE EXCEPTION 'company_strategy_conversation_privacy_is_permanent' USING ERRCODE='23514';END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER company_strategy_conversation_privacy BEFORE UPDATE ON public.action_mission_conversations FOR EACH ROW EXECUTE FUNCTION private.guard_company_strategy_conversation_privacy();
