DROP TRIGGER IF EXISTS ai_agent_actions_history ON crm.ai_agent_actions;
DROP TRIGGER IF EXISTS ai_agent_actions_transition ON crm.ai_agent_actions;

DROP FUNCTION IF EXISTS crm.record_ai_agent_action_history();
DROP FUNCTION IF EXISTS crm.enforce_ai_agent_action_transition();

DROP TABLE IF EXISTS crm.ai_agent_action_history;
DROP TABLE IF EXISTS crm.ai_agent_actions;

-- Keep the catalog permissions so any role assignments survive rollback.
