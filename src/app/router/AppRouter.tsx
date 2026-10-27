import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { lazy, Suspense, useEffect } from "react";
import { type AppDispatch, RootState } from "@/app/store";
import { setOutletInfo, setTeamTreeData } from "@/app/store/appStateSlice";
import { LoginPage, listenUserPermissions, restorePostgresSession } from "@/features/auth";
import { teamTreeApi } from "@/features/team";
import { OUTLET_FEATURE_KEYS, outletApi } from "@/features/outlets";
import { PERMISSION_MASTER, ROLES, ROUTES_PATHS } from "@/shared/lib/constants";
import MainLayout from "@/layouts/MainLayout";
import SpinLoader from "@/shared/components/SpinLoader";
import PrivateRoute from "./ProtectedRoute";
import PermissionRouteGate from "./PermissionRoute";
import NotFound from "./NotFound";
import NoAccess from "./NoAccess";

// Lazy-loaded feature pages for fast initial bundle and on-demand loading
const LeadsPage = lazy(() => import("@/features/leads").then((m) => ({ default: m.LeadsPage })));
const LeadFunnelDashboard = lazy(() => import("@/features/leads").then((m) => ({ default: m.LeadFunnelDashboard })));
const FunnelLeadDetailsPage = lazy(() => import("@/features/leads").then((m) => ({ default: m.FunnelLeadDetailsPage })));
const RingingStatusLeads = lazy(() => import("@/features/leads").then((m) => ({ default: m.RingingStatusLeads })));
const CallLaterPage = lazy(() => import("@/features/leads").then((m) => ({ default: m.CallLaterPage })));
const CustomerProfilePage = lazy(() => import("@/features/leads").then((m) => ({ default: m.CustomerProfilePage })));

const TaskDetailsPage = lazy(() => import("@/features/tasks").then((m) => ({ default: m.TaskDetailsPage })));
const TaskManagementPage = lazy(() => import("@/features/tasks").then((m) => ({ default: m.TaskManagementPage })));

const ActivityMonthlyPage = lazy(() => import("@/features/activities").then((m) => ({ default: m.ActivityMonthlyPage })));
const AttendanceRecordsPage = lazy(() => import("@/features/attendance").then((m) => ({ default: m.AttendanceRecordsPage })));

const PermissionManagementPage = lazy(() => import("@/features/access-control").then((m) => ({ default: m.PermissionManagementPage })));
const EditPermissionsPage = lazy(() => import("@/features/access-control").then((m) => ({ default: m.EditPermissionsPage })));
const PermissionsMasterPage = lazy(() => import("@/features/access-control").then((m) => ({ default: m.PermissionsMasterPage })));

const WhatsAppChatPage = lazy(() => import("@/features/whatsapp").then((m) => ({ default: m.WhatsAppChatPage })));
const EmailAutomationPage = lazy(() => import("@/features/communication").then((m) => ({ default: m.EmailAutomationPage })));
const SmsAutomationPage = lazy(() => import("@/features/communication").then((m) => ({ default: m.SmsAutomationPage })));
const WhatsAppAutomationPage = lazy(() => import("@/features/communication").then((m) => ({ default: m.WhatsAppAutomationPage })));

const TeamTreePage = lazy(() => import("@/features/team").then((m) => ({ default: m.TeamTreePage })));
const OutletListPage = lazy(() => import("@/features/outlets").then((m) => ({ default: m.OutletListPage })));
const OutletDetailsPage = lazy(() => import("@/features/outlets").then((m) => ({ default: m.OutletDetailsPage })));
const OutletFeatureAccessPage = lazy(() => import("@/features/outlets").then((m) => ({ default: m.OutletFeatureAccessPage })));

const ProductsPage = lazy(() => import("@/features/products").then((m) => ({ default: m.ProductsPage })));
const ExpenseApprovalPage = lazy(() => import("@/features/expenses").then((m) => ({ default: m.ExpenseApprovalPage })));
const UserTrackingPage = lazy(() => import("@/features/expenses").then((m) => ({ default: m.UserTrackingPage })));

const SourceWiseReport = lazy(() => import("@/features/reports").then((m) => ({ default: m.SourceWiseReport })));
const EmployeeWiseReport = lazy(() => import("@/features/reports").then((m) => ({ default: m.EmployeeWiseReport })));
const CityStateReport = lazy(() => import("@/features/reports").then((m) => ({ default: m.CityStateReport })));
const CallLogsReportPage = lazy(() => import("@/features/reports").then((m) => ({ default: m.CallLogsReportPage })));

const LeaveManagementPage = lazy(() => import("@/features/leave").then((m) => ({ default: m.LeaveManagementPage })));
const LeaveBalancePage = lazy(() => import("@/features/leave").then((m) => ({ default: m.LeaveBalancePage })));
const HolidayCalendarPage = lazy(() => import("@/features/leave").then((m) => ({ default: m.HolidayCalendarPage })));
const ApplyLeavePage = lazy(() => import("@/features/leave").then((m) => ({ default: m.ApplyLeavePage })));

const IntegrationMasterPage = lazy(() => import("@/features/integrations").then((m) => ({ default: m.IntegrationMasterPage })));
const DeleteFacebookDataPage = lazy(() => import("@/features/integrations").then((m) => ({ default: m.DeleteFacebookDataPage })));

const EmployeeTargetingPage = lazy(() => import("@/features/employee-targets").then((m) => ({ default: m.EmployeeTargetingPage })));

const WarehouseDashboardPage = lazy(() => import("@/features/warehouse").then((m) => ({ default: m.WarehouseDashboardPage })));
const WarehouseAddProductsPage = lazy(() => import("@/features/warehouse").then((m) => ({ default: m.WarehouseAddProductsPage })));
const CreateWarehouseProductPage = lazy(() => import("@/features/warehouse").then((m) => ({ default: m.CreateWarehouseProductPage })));
const TransferRequestPage = lazy(() => import("@/features/warehouse").then((m) => ({ default: m.TransferRequestPage })));

const DashboardPage = lazy(() => import("@/features/dashboard").then((m) => ({ default: m.DashboardPage })));
const WorkspaceSetupWizard = lazy(() => import("@/features/onboarding").then((module) => ({ default: module.WorkspaceSetupWizard })));

const DealerDashboardPage = lazy(() => import("@/features/dealer-wallet").then((m) => ({ default: m.DealerDashboardPage })));
const AddSubscriptionPage = lazy(() => import("@/features/dealer-wallet").then((m) => ({ default: m.AddSubscriptionPage })));

const WalletDashboardPage = lazy(() => import("@/features/billing").then((m) => ({ default: m.WalletDashboardPage })));
const TransactionHistoryPage = lazy(() => import("@/features/billing").then((m) => ({ default: m.TransactionHistoryPage })));
const TopUpPage = lazy(() => import("@/features/billing").then((m) => ({ default: m.TopUpPage })));
const PaymentReturnPage = lazy(() => import("@/features/billing").then((m) => ({ default: m.PaymentReturnPage })));
const RateCardListPage = lazy(() => import("@/features/billing").then((m) => ({ default: m.RateCardListPage })));
const RateCardFormPage = lazy(() => import("@/features/billing").then((m) => ({ default: m.RateCardFormPage })));

const SendeskAdminPage = lazy(() => import("@/features/support").then((m) => ({ default: m.SendeskAdminPage })));

const EventListPage = lazy(() => import("@/features/events").then((m) => ({ default: m.EventListPage })));
const CreateEventPage = lazy(() => import("@/features/events").then((m) => ({ default: m.CreateEventPage })));
const EventDetailsPage = lazy(() => import("@/features/events").then((m) => ({ default: m.EventDetailsPage })));
const EditEventPage = lazy(() => import("@/features/events").then((m) => ({ default: m.EditEventPage })));
const EventRegisterPage = lazy(() => import("@/features/events").then((m) => ({ default: m.EventRegisterPage })));
const EventPamphletLeadPage = lazy(() => import("@/features/events").then((m) => ({ default: m.EventPamphletLeadPage })));
const EventPaymentSuccessPage = lazy(() => import("@/features/events").then((m) => ({ default: m.EventPaymentSuccessPage })));
const EventPaymentFailedPage = lazy(() => import("@/features/events").then((m) => ({ default: m.EventPaymentFailedPage })));

const SalaryMasterPage = lazy(() => import("@/features/payroll").then((m) => ({ default: m.SalaryMasterPage })));
const LegacySalaryMasterPage = lazy(() => import("@/features/payroll").then((m) => ({ default: m.LegacySalaryMasterPage })));

const AiScrapPage = lazy(() => import("@/features/ai-contacts").then((m) => ({ default: m.AiScrapPage })));
const GeneratedContactUploadPage = lazy(() => import("@/features/ai-contacts").then((m) => ({ default: m.GeneratedContactUploadPage })));
const GeneratedContactDashboardPage = lazy(() => import("@/features/ai-contacts").then((m) => ({ default: m.GeneratedContactDashboardPage })));

const AddressCardPrintPage = lazy(() => import("@/features/address-cards").then((m) => ({ default: m.AddressCardPrintPage })));

function App() {
  const user = useSelector((state: RootState) => state.auth.user);
  const authMode = useSelector((state: RootState) => state.auth.authMode);
  const postgresStatus = useSelector((state: RootState) => state.auth.postgresStatus);
  const postgresAccess = useSelector((state: RootState) => state.auth.postgresAccess);
  const selectedOutletId = useSelector((state: RootState) => state.appState.outletInfo?.id);
  const dispatch = useDispatch<AppDispatch>();
  const adminRoles = [ROLES.SUPER_ADMIN, ROLES.ADMIN];

  useEffect(() => {
    if (!user?.id) return;

    // Start real-time permission listener
    const unsubscribe = listenUserPermissions(user.id);

    return () => unsubscribe();
  }, [user?.id]);

  useEffect(() => {
    if (authMode === "postgres" && postgresStatus === "idle") {
      void dispatch(restorePostgresSession());
    }
  }, [authMode, dispatch, postgresStatus]);
  useEffect(() => {
    if (authMode !== "postgres" || !postgresAccess) return;
    const outlet = postgresAccess.outlets.find((item) => item.id === selectedOutletId) ?? postgresAccess.outlets[0];
    if (!outlet) return;
    void outletApi.get(outlet.id).then((result) => dispatch(setOutletInfo(result.outlet)));
    const canReadTeam =
      postgresAccess.tenant.isTenantAdmin ||
      outlet.permissions.includes("team.read") ||
      outlet.permissions.includes("CRM_TEAMTREE_VIEW");
    if (!canReadTeam) {
      dispatch(setTeamTreeData([]));
      return;
    }
    void teamTreeApi.list(outlet.id, true)
      .then((team) => dispatch(setTeamTreeData(team.items)))
      .catch((error) => {
        console.error("Unable to preload Team Tree", error);
        dispatch(setTeamTreeData([]));
      });
  }, [authMode, dispatch, postgresAccess, selectedOutletId]);
  return (
    <BrowserRouter>
      <Suspense fallback={<SpinLoader />}>
        <Routes>
        {/* ======================================================
        🔐 AUTHENTICATED APP (Main Layout)
       ====================================================== */}
        <Route element={<MainLayout />}>
          {/* =====================
          📊 DASHBOARD
         ===================== */}
          <Route
            path={ROUTES_PATHS.DASHBOARD}
            element={
              <PrivateRoute>
                {/* <LeadsDashboard /> */}
                <PermissionRouteGate feature={OUTLET_FEATURE_KEYS.DASHBOARD}>
                  <DashboardPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          {/* =====================
          🧲 LEADS MANAGEMENT
         ===================== */}
          <Route
            path={ROUTES_PATHS.LEADS_MANAGEMENT}
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  permission={PERMISSION_MASTER.CRM_LEADS_VIEW}
                  feature={OUTLET_FEATURE_KEYS.LEADS_LIST}
                >
                  <LeadsPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path={ROUTES_PATHS.TASK_MANAGEMENT}
            element={
              <PrivateRoute>
                <PermissionRouteGate permission={PERMISSION_MASTER.CRM_TASK_VIEW}>
                  <TaskManagementPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path={`${ROUTES_PATHS.TASK_MANAGEMENT}/:taskId`}
            element={
              <PrivateRoute>
                <PermissionRouteGate permission={PERMISSION_MASTER.CRM_TASK_VIEW}>
                  <TaskDetailsPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path={ROUTES_PATHS.LEADS_FUNNEL_DASHBOARD}
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  permission={PERMISSION_MASTER.CRM_LEADS_VIEW}
                  feature={OUTLET_FEATURE_KEYS.LEADS_FUNNEL}
                >
                  <LeadFunnelDashboard />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path={ROUTES_PATHS.LEADS_ACTIVITIES}
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  permission={PERMISSION_MASTER.CRM_ACTIVITY_VIEW}
                  feature={OUTLET_FEATURE_KEYS.LEADS_ACTIVITIES}
                >
                  <ActivityMonthlyPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path={ROUTES_PATHS.LEADS_RINGING}
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  permission={PERMISSION_MASTER.CRM_ACTIVITY_VIEW}
                  feature={OUTLET_FEATURE_KEYS.LEADS_RINGING}
                >
                  <RingingStatusLeads />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path={ROUTES_PATHS.LEADS_REPEATED_ENQUIRIES}
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  permission={PERMISSION_MASTER.CRM_LEADS_VIEW}
                  feature={OUTLET_FEATURE_KEYS.LEADS_LIST}
                >
                  <LeadsPage key="repeated-enquiries" repeatedEnquiriesOnly />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path={ROUTES_PATHS.LEADS_CALL_LATER}
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  permission={PERMISSION_MASTER.CRM_ACTIVITY_VIEW}
                  feature={OUTLET_FEATURE_KEYS.LEADS_ACTIVITIES}
                >
                  <CallLaterPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path={ROUTES_PATHS.LEADS_FUNNEL_DETAILS}
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  permission={PERMISSION_MASTER.CRM_LEADS_VIEW}
                  feature={OUTLET_FEATURE_KEYS.LEADS_FUNNEL}
                >
                  <FunnelLeadDetailsPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path={ROUTES_PATHS.LEAD_SHARE}
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  permission={PERMISSION_MASTER.CRM_LEADS_VIEW}
                  feature={OUTLET_FEATURE_KEYS.LEADS_LIST}
                >
                  <LeadsPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path={ROUTES_PATHS.CUSTOMER_PROFILE}
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  permission={PERMISSION_MASTER.CRM_LEADS_VIEW}
                  feature={OUTLET_FEATURE_KEYS.LEADS_LIST}
                >
                  <CustomerProfilePage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          {/* =====================
          📈 REPORTS
         ===================== */}
          <Route
            path={ROUTES_PATHS.SOURCE_WISE_REPORT}
            element={
              <PrivateRoute>
                <PermissionRouteGate feature={OUTLET_FEATURE_KEYS.REPORTS_SOURCE_WISE}>
                  <SourceWiseReport />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path={ROUTES_PATHS.EMPLOYEE_WISE_REPORT}
            element={
              <PrivateRoute>
                <PermissionRouteGate feature={OUTLET_FEATURE_KEYS.REPORTS_EMPLOYEE_WISE}>
                  <EmployeeWiseReport />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path={ROUTES_PATHS.CITY_WISE_REPORT}
            element={
              <PrivateRoute>
                <PermissionRouteGate feature={OUTLET_FEATURE_KEYS.REPORTS_CITY_STATE_WISE}>
                  <CityStateReport />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path={ROUTES_PATHS.CALL_LOGS_REPORT}
            element={
              <PrivateRoute>
                <PermissionRouteGate feature={OUTLET_FEATURE_KEYS.REPORTS_CALL_LOGS}>
                  <CallLogsReportPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          {/* =====================
          🕒 ATTENDANCE
         ===================== */}

          <Route
            path={ROUTES_PATHS.ATTENDANCE_RECORDS}
            element={
              <PrivateRoute>
                <PermissionRouteGate feature={OUTLET_FEATURE_KEYS.ATTENDANCE_RECORDS}>
                  <AttendanceRecordsPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path={ROUTES_PATHS.LEAVE_APPLICATION}
            element={
              <PrivateRoute>
                <PermissionRouteGate feature={OUTLET_FEATURE_KEYS.LEAVE_MANAGEMENT}>
                  <LeaveManagementPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path={ROUTES_PATHS.LEAVE_BALANCE}
            element={
              <PrivateRoute>
                <PermissionRouteGate feature={OUTLET_FEATURE_KEYS.LEAVE_BALANCE}>
                  <LeaveBalancePage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path={ROUTES_PATHS.HOLIDAY_CALENDAR}
            element={
              <PrivateRoute>
                <PermissionRouteGate feature={OUTLET_FEATURE_KEYS.LEAVE_HOLIDAY_CALENDAR}>
                  <HolidayCalendarPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path={ROUTES_PATHS.SALARY_MASTER}
            element={
              <PrivateRoute>
                <PermissionRouteGate feature={OUTLET_FEATURE_KEYS.ATTENDANCE_SALARY_MASTER}>
                  <LegacySalaryMasterPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path={ROUTES_PATHS.PAYROLL}
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  permission={PERMISSION_MASTER.CRM_PAYROLL_VIEW}
                  roles={adminRoles}
                  feature={OUTLET_FEATURE_KEYS.PAYROLL}
                >
                  <SalaryMasterPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          {/* =====================
          📍 TRACKING
         ===================== */}
          <Route
            path={ROUTES_PATHS.USER_TRACKING_PAGE}
            element={
              <PrivateRoute>
                <PermissionRouteGate feature={OUTLET_FEATURE_KEYS.USER_TRACKING}>
                  <UserTrackingPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          {/* =====================
          👥 TEAM & USERS
         ===================== */}
          <Route
            path={ROUTES_PATHS.TEAM_TREE_PAGE}
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  permission={PERMISSION_MASTER.CRM_TEAMTREE_VIEW}
                  feature={OUTLET_FEATURE_KEYS.TEAM_TREE}
                >
                  <TeamTreePage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          {/* =====================
          🔐 PERMISSIONS & ACCESS
         ===================== */}
          <Route
            path={ROUTES_PATHS.PERMISSION_MANAGEMENT}
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  permission={PERMISSION_MASTER.CRM_PERMISSION_VIEW}
                  roles={[ROLES.SUPER_ADMIN, ROLES.ADMIN]}
                  feature={OUTLET_FEATURE_KEYS.PERMISSIONS}
                >
                  <PermissionManagementPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path={ROUTES_PATHS.PERMISSION_MASTER_PAGE}
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  permission={PERMISSION_MASTER.CRM_PERMISSION_MASTER_VIEW}
                  roles={[ROLES.SUPER_ADMIN]}
                  feature={OUTLET_FEATURE_KEYS.PERMISSIONS_MASTER}
                >
                  <PermissionsMasterPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path={ROUTES_PATHS.PERMISSION_EDIT}
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  permission={PERMISSION_MASTER.CRM_PERMISSION_EDIT}
                  roles={[ROLES.SUPER_ADMIN, ROLES.ADMIN]}
                  feature={OUTLET_FEATURE_KEYS.PERMISSIONS}
                >
                  <EditPermissionsPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path={ROUTES_PATHS.OUTLET_FEATURE_ACCESS}
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  permission={PERMISSION_MASTER.CRM_SETTINGS_EDIT}
                  roles={[ROLES.SUPER_ADMIN, ROLES.ADMIN]}
                >
                  <OutletFeatureAccessPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          {/* =====================
          🔌 INTEGRATIONS
         ===================== */}
          <Route
            path={ROUTES_PATHS.INTEGRATION_MASTER_PAGE}
            element={
              <PrivateRoute>
                <PermissionRouteGate feature={OUTLET_FEATURE_KEYS.INTEGRATION}>
                  <IntegrationMasterPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path={ROUTES_PATHS.DELETE_FACEBOOK_DATA}
            element={
              <PrivateRoute>
                <PermissionRouteGate feature={OUTLET_FEATURE_KEYS.INTEGRATION}>
                  <DeleteFacebookDataPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          {/* =====================
          🛒 PRODUCTS & EXPENSES
         ===================== */}
          <Route
            path={ROUTES_PATHS.PRODUCT_PAGE}
            element={
              <PrivateRoute>
                <PermissionRouteGate feature={OUTLET_FEATURE_KEYS.PRODUCTS}>
                  <ProductsPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path={ROUTES_PATHS.EXPENSE_PAGE}
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  permission={PERMISSION_MASTER.CRM_EXPENSE_VIEW_ADMIN}
                  roles={adminRoles}
                  feature={OUTLET_FEATURE_KEYS.EXPENSE}
                >
                  <ExpenseApprovalPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

         

          {/* =====================
          💬 COMMUNICATION
         ===================== */}
          <Route
            path={ROUTES_PATHS.WHATSAPP}
            element={
              <PrivateRoute>
                <PermissionRouteGate feature={OUTLET_FEATURE_KEYS.WHATSAPP}>
                  <WhatsAppChatPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />
          <Route
            path={ROUTES_PATHS.WHATSAPP_AUTOMATION}
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  permission={PERMISSION_MASTER.CRM_WHATSAPP_AUTOMATION_VIEW}
                  feature={OUTLET_FEATURE_KEYS.WHATSAPP_AUTOMATION}
                >
                  <WhatsAppAutomationPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path={ROUTES_PATHS.EMAIL_AUTOMATION}
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  permission={PERMISSION_MASTER.CRM_EMAIL_AUTOMATION_VIEW}
                  feature={OUTLET_FEATURE_KEYS.EMAIL_AUTOMATION}
                >
                  <EmailAutomationPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path={ROUTES_PATHS.APPLY_LEAVE}
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  permission={PERMISSION_MASTER.CRM_LEAVE_VIEW}
                  feature={OUTLET_FEATURE_KEYS.LEAVE_MANAGEMENT}
                >
                  <ApplyLeavePage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />
          <Route
            path={ROUTES_PATHS.SMS_AUTOMATION}
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  permission={PERMISSION_MASTER.CRM_SMS_AUTOMATION_VIEW}
                  feature={OUTLET_FEATURE_KEYS.SMS_AUTOMATION}
                >
                  <SmsAutomationPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />
          <Route
            path={ROUTES_PATHS.AI_SCRAP}
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  permission={PERMISSION_MASTER.CRM_AI_SCRAP_VIEW}
                  feature={OUTLET_FEATURE_KEYS.AI_SCRAP}
                >
                  <AiScrapPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />
          <Route
            path={ROUTES_PATHS.GENERATED_CONTACT_UPLOAD}
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  permission={PERMISSION_MASTER.CRM_CONTACT_UPLOAD_VIEW}
                  feature={OUTLET_FEATURE_KEYS.AI_SCRAP}
                >
                  <GeneratedContactUploadPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />
          <Route
            path={ROUTES_PATHS.GENERATED_CONTACT_UPLOAD_DASHBOARD}
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  permission={PERMISSION_MASTER.CRM_CONTACT_UPLOAD_VIEW}
                  feature={OUTLET_FEATURE_KEYS.AI_SCRAP}
                >
                  <GeneratedContactDashboardPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path={ROUTES_PATHS.SENDESK_ADMIN}
            element={
              <PrivateRoute>
                <PermissionRouteGate feature={OUTLET_FEATURE_KEYS.SENDESK_ADMIN}>
                  <SendeskAdminPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path={ROUTES_PATHS.EMPLOYEE_TARGET}
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  permission={PERMISSION_MASTER.CRM_EMPLOYEE_TARGET_VIEW}
                  feature={OUTLET_FEATURE_KEYS.REPORTS_EMPLOYEE_TARGET}
                >
                  <EmployeeTargetingPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />
          <Route
            path={ROUTES_PATHS.WAREHOUSE}
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  any={[
                    PERMISSION_MASTER.CRM_WAREHOUSE_VIEW,
                    PERMISSION_MASTER.CRM_WAREHOUSE_DASHBOARD_VIEW,
                  ]}
                  feature={OUTLET_FEATURE_KEYS.WAREHOUSE_DASHBOARD}
                >
                  <WarehouseDashboardPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path={ROUTES_PATHS.WAREHOUSE_ADD_PRODUCTS}
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  any={[
                    PERMISSION_MASTER.CRM_WAREHOUSE_VIEW,
                    PERMISSION_MASTER.CRM_WAREHOUSE_CREATE,
                  ]}
                  feature={OUTLET_FEATURE_KEYS.WAREHOUSE_PRODUCTS}
                >
                  <WarehouseAddProductsPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />
          <Route
            path={ROUTES_PATHS.WAREHOUSE_CREATE_PRODUCT}
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  any={[
                    PERMISSION_MASTER.CRM_WAREHOUSE_VIEW,
                    PERMISSION_MASTER.CRM_WAREHOUSE_CREATE,
                  ]}
                  feature={OUTLET_FEATURE_KEYS.WAREHOUSE_PRODUCTS}
                >
                  <CreateWarehouseProductPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />
          <Route
            path={ROUTES_PATHS.WAREHOUSE_TRANSFER_REQUEST}
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  any={[
                    PERMISSION_MASTER.CRM_WAREHOUSE_VIEW,
                    PERMISSION_MASTER.CRM_WAREHOUSE_CREATE,
                  ]}
                  feature={OUTLET_FEATURE_KEYS.WAREHOUSE_TRANSFER_REQUEST}
                >
                  <TransferRequestPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />


           <Route
            path={ROUTES_PATHS.DEALER_DASHBOARD}
            element={
              <PrivateRoute>
                <DealerDashboardPage/>
              </PrivateRoute>
            }
          />

           <Route
            path={ROUTES_PATHS.ADD_SUBSCRIPTION}
            element={
              <PrivateRoute>
                <AddSubscriptionPage/>
              </PrivateRoute>
            }
          />

          <Route
            path={ROUTES_PATHS.BILLING_WALLET}
            element={
              <PrivateRoute>
                <WalletDashboardPage />
              </PrivateRoute>
            }
          />
          <Route
            path={ROUTES_PATHS.BILLING_TRANSACTIONS}
            element={
              <PrivateRoute>
                <TransactionHistoryPage />
              </PrivateRoute>
            }
          />
          <Route
            path={ROUTES_PATHS.BILLING_TOPUP}
            element={
              <PrivateRoute>
                <TopUpPage />
              </PrivateRoute>
            }
          />
          <Route
            path={ROUTES_PATHS.BILLING_PAYMENT_RETURN}
            element={
              <PrivateRoute>
                <PaymentReturnPage />
              </PrivateRoute>
            }
          />
          <Route
            path={ROUTES_PATHS.BILLING_RATE_CARDS}
            element={
              <PrivateRoute>
                <RateCardListPage />
              </PrivateRoute>
            }
          />
          <Route
            path={ROUTES_PATHS.BILLING_RATE_CARD_NEW}
            element={
              <PrivateRoute>
                <RateCardFormPage />
              </PrivateRoute>
            }
          />
          <Route
            path={`${ROUTES_PATHS.BILLING_RATE_CARDS}/:id/edit`}
            element={
              <PrivateRoute>
                <RateCardFormPage />
              </PrivateRoute>
            }
          />

          <Route
            path="/events"
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  permission={PERMISSION_MASTER.CRM_EVENTS_VIEW}
                  roles={adminRoles}
                  feature={OUTLET_FEATURE_KEYS.EVENTS}
                >
                  <EventListPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path="/events/create"
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  permission={PERMISSION_MASTER.CRM_EVENTS_CREATE}
                  roles={adminRoles}
                  feature={OUTLET_FEATURE_KEYS.EVENTS}
                >
                  <CreateEventPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path="/events/:eventId"
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  permission={PERMISSION_MASTER.CRM_EVENTS_VIEW}
                  roles={adminRoles}
                  feature={OUTLET_FEATURE_KEYS.EVENTS}
                >
                  <EventDetailsPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />

          <Route
            path="/events/:eventId/edit"
            element={
              <PrivateRoute>
                <PermissionRouteGate
                  permission={PERMISSION_MASTER.CRM_EVENTS_EDIT}
                  roles={adminRoles}
                  feature={OUTLET_FEATURE_KEYS.EVENTS}
                >
                  <EditEventPage />
                </PermissionRouteGate>
              </PrivateRoute>
            }
          />
             
        </Route>
        {/* ===== END MAIN LAYOUT ===== */}

        <Route
          path="/address-card-print"
          element={
            <PrivateRoute>
              <MainLayout />
            </PrivateRoute>
          }
        >
          <Route index element={<AddressCardPrintPage />} />
        </Route>

        <Route
          path={ROUTES_PATHS.OUTLET_DETAILS}
          element={
            <PrivateRoute>
              <OutletDetailsPage />
            </PrivateRoute>
          }
        />

        {/* ======================================================
        🌐 PUBLIC / STANDALONE ROUTES
       ====================================================== */}
        <Route
          path={ROUTES_PATHS.OUTLETS}
          element={
            <PrivateRoute>
              <PermissionRouteGate
                roles={[ROLES.SUPER_ADMIN, ROLES.SUB_SUPER_ADMIN]}
                feature={OUTLET_FEATURE_KEYS.ALL_OUTLETS}
              >
                <OutletListPage />
              </PermissionRouteGate>
            </PrivateRoute>
          }
        />

        <Route path={ROUTES_PATHS.LOGIN} element={<LoginPage />} />
        <Route path={ROUTES_PATHS.HOME} element={<LoginPage />} />
        <Route path="/setup" element={<PrivateRoute><WorkspaceSetupWizard /></PrivateRoute>} />
        <Route path={ROUTES_PATHS.NO_ACCESS} element={<NoAccess />} />
        <Route path="/event-register" element={<EventRegisterPage />} />
        <Route path="/event-register/:eventId" element={<EventRegisterPage />} />
        <Route path="/event-pamphlet/:token" element={<EventPamphletLeadPage />} />
        <Route
          path="/event-payment-success"
          element={<EventPaymentSuccessPage />}
        />
        <Route path="/event-payment-failed" element={<EventPaymentFailedPage />} />
        <Route path={ROUTES_PATHS.ALL} element={<NotFound />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
