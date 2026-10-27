SET TIME ZONE 'UTC';

GRANT SELECT, INSERT, UPDATE, DELETE ON crm.calls TO sensible_app_role;
GRANT EXECUTE ON FUNCTION crm.can_access_call(uuid, uuid) TO sensible_app_role;