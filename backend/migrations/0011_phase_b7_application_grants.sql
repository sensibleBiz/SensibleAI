GRANT SELECT, INSERT, UPDATE, DELETE ON
  crm.attendance_events,
  crm.attendance_daily,
  crm.leave_types,
  crm.leave_requests,
  crm.leave_balances,
  crm.leave_balance_entries,
  crm.holidays
TO sensible_app_role;

GRANT SELECT ON
  crm.attendance_events,
  crm.attendance_daily,
  crm.leave_types,
  crm.leave_requests,
  crm.leave_balances,
  crm.leave_balance_entries,
  crm.holidays
TO sensible_rls_owner;

GRANT EXECUTE ON FUNCTION crm.can_access_attendance(uuid, uuid)
TO sensible_app_role;
