import {
  FEATURE_ACCESS_ADMIN_OUTLET_IDS,
  PERMISSION_MASTER,
  ROUTES_PATHS,
  ROLES,
} from "@/shared/lib/constants";

export const OUTLET_FEATURE_KEYS = {
  DASHBOARD: "dashboard",
  LEADS: "leads",
  LEADS_LIST: "leads_list",
  LEADS_FUNNEL: "leads_funnel",
  LEADS_ACTIVITIES: "leads_activities",
  LEADS_RINGING: "leads_ringing",
  ADDRESS_CARDS: "address_cards",
  REPORTS: "reports",
  REPORTS_SOURCE_WISE: "reports_source_wise",
  REPORTS_EMPLOYEE_WISE: "reports_employee_wise",
  REPORTS_CITY_STATE_WISE: "reports_city_state_wise",
  REPORTS_CALL_LOGS: "reports_call_logs",
  REPORTS_EMPLOYEE_TARGET: "reports_employee_target",
  ATTENDANCE: "attendance",
  ATTENDANCE_RECORDS: "attendance_records",
  ATTENDANCE_SALARY_MASTER: "attendance_salary_master",
  PAYROLL: "payroll",
  LEAVE: "leave",
  LEAVE_MANAGEMENT: "leave_management",
  LEAVE_BALANCE: "leave_balance",
  LEAVE_HOLIDAY_CALENDAR: "leave_holiday_calendar",
  EXPENSE: "expense",
  EVENTS: "events",
  WAREHOUSE: "warehouse",
  WAREHOUSE_DASHBOARD: "warehouse_dashboard",
  WAREHOUSE_PRODUCTS: "warehouse_products",
  WAREHOUSE_TRANSFER_REQUEST: "warehouse_transfer_request",
  SALES_ORDERS: "sales_orders",
  EXPORT_OPERATIONS: "export_operations",
  AI_SCRAP: "ai_scrap",
  USER_TRACKING: "user_tracking",
  PERMISSIONS: "permissions",
  PERMISSIONS_MASTER: "permissions_master",
  WHATSAPP: "whatsapp",
  WHATSAPP_AUTOMATION: "whatsapp_automation",
  EMAIL_AUTOMATION: "email_automation",
  SMS_AUTOMATION: "sms_automation",
  SENDESK_ADMIN: "sendesk_admin",
  TEAM_TREE: "team_tree",
  INTEGRATION: "integration",
  PRODUCTS: "products",
  ALL_OUTLETS: "all_outlets",
  AI_CUSTOMER_DOSSIERS: "ai_customer_dossiers",
} as const;

export type OutletFeatureKey =
  (typeof OUTLET_FEATURE_KEYS)[keyof typeof OUTLET_FEATURE_KEYS];

export type SidebarIconKey =
  | "addressCards"
  | "ai"
  | "attendance"
  | "dashboard"
  | "events"
  | "integration"
  | "leads"
  | "leave"
  | "outlets"
  | "outletFeatureAccess"
  | "payroll"
  | "permissions"
  | "permissionsMaster"
  | "products"
  | "reports"
  | "support"
  | "team"
  | "tracking"
  | "warehouse"
  | "whatsapp";

export interface SidebarPermissionSection {
  label: string;
  prefixes: readonly string[];
}

export interface SidebarPermissionLocation {
  sectionLabel: string;
  submoduleLabel: string;
}

export interface SidebarPermissionSectionRule
  extends SidebarPermissionSection,
    SidebarPermissionLocation {
  featureKey?: OutletFeatureKey;
}

interface SidebarMenuOptionBase {
  menuKey: string;
  label: string;
  icon?: SidebarIconKey;
  sectionIcon?: string;
  comingSoon?: boolean;
  requiredPermissions: readonly string[];
  fallbackRoles?: readonly string[];
  featureBypassRoles?: readonly string[];
  /** Restrict this navigation entry to the CRM's internal administration outlets. */
  internalOnly?: boolean;
  /** Optional exact outlet allowlist for especially restricted screens. */
  allowedOutletIds?: readonly string[];
  /** Optional business vertical allowlist, for example export-only workspaces. */
  verticals?: readonly string[];
  /** Optional commercial-footprint allowlist stored in business settings. */
  salesFootprints?: readonly string[];
  permissionSections?: readonly SidebarPermissionSection[];
  children?: readonly SidebarMenuOption[];
}

export interface SidebarFeatureMenuOption extends SidebarMenuOptionBase {
  systemOnly?: false;
  featureKey: OutletFeatureKey;
  featureLabel?: string;
  featureCategory: string;
  featureDescription: string;
}

export interface SidebarSystemMenuOption extends SidebarMenuOptionBase {
  /** Navigation or a placeholder that is not an assignable outlet feature. */
  systemOnly: true;
  featureKey?: never;
  featureLabel?: never;
  featureCategory?: never;
  featureDescription?: never;
}

export type SidebarMenuOption =
  | SidebarFeatureMenuOption
  | SidebarSystemMenuOption;

const section = (
  menuKey: string,
  label: string,
  sectionIcon: string,
  children: readonly SidebarMenuOption[]
): SidebarSystemMenuOption => ({
  menuKey,
  label,
  sectionIcon,
  requiredPermissions: [],
  systemOnly: true,
  children,
});

const comingSoon = (menuKey: string, label: string): SidebarSystemMenuOption => ({
  menuKey,
  label,
  comingSoon: true,
  requiredPermissions: [],
  systemOnly: true,
});

const systemLink = (
  menuKey: string,
  label: string
): SidebarSystemMenuOption => ({
  menuKey,
  label,
  requiredPermissions: [],
  systemOnly: true,
});

const permissionSection = (label: string, ...prefixes: string[]) => [
  { label, prefixes },
];

/**
 * Shared source of truth for the sidebar, Outlet Feature Access and user
 * permission grouping. Top-level section names intentionally match the new
 * sidebar so administration screens use the same language and order.
 */
export const SIDEBAR_MENU_OPTIONS: readonly SidebarMenuOption[] = [
  section("sub_home", "HOME", "🏠", [
    {
      menuKey: ROUTES_PATHS.DASHBOARD,
      label: "Dashboard",
      requiredPermissions: [],
      featureKey: OUTLET_FEATURE_KEYS.DASHBOARD,
      featureCategory: "HOME",
      featureDescription: "Main CRM dashboard after outlet selection.",
      permissionSections: permissionSection(
        "HOME",
        "CRM_DASHBOARD_",
        "CRM_MANAGEMENT_",
        "CRM_NOTIFICATION_"
      ),
    },
  ]),

  section("sub_sales", "SALES", "🎯", [
    {
      menuKey: ROUTES_PATHS.LEADS_MANAGEMENT,
      label: "Leads",
      featureLabel: "Leads & Repeated Enquiries",
      requiredPermissions: [PERMISSION_MASTER.CRM_LEADS_VIEW],
      featureKey: OUTLET_FEATURE_KEYS.LEADS_LIST,
      featureCategory: "SALES",
      featureDescription: "Lead list, details, and assignment workspace.",
      permissionSections: permissionSection("SALES", "CRM_LEADS_"),
    },

    comingSoon("coming-soon-opportunities", "Opportunities"),
    {
      menuKey: ROUTES_PATHS.LEADS_FUNNEL_DASHBOARD,
      label: "Pipeline",
      requiredPermissions: [PERMISSION_MASTER.CRM_LEADS_VIEW],
      featureKey: OUTLET_FEATURE_KEYS.LEADS_FUNNEL,
      featureCategory: "SALES",
      featureDescription: "Lead pipeline and funnel dashboard.",
    },
    {
      menuKey: ROUTES_PATHS.LEADS_CALL_LATER,
      label: "Follow-ups",
      featureLabel: "Follow-ups & Activities",
      requiredPermissions: [PERMISSION_MASTER.CRM_ACTIVITY_VIEW],
      featureKey: OUTLET_FEATURE_KEYS.LEADS_ACTIVITIES,
      featureCategory: "SALES",
      featureDescription: "Scheduled lead follow-ups and call-later records.",
      permissionSections: permissionSection("SALES", "CRM_ACTIVITY_"),
    },
    {
      menuKey: ROUTES_PATHS.LEADS_ACTIVITIES,
      label: "Activities",
      featureLabel: "Follow-ups & Activities",
      requiredPermissions: [PERMISSION_MASTER.CRM_ACTIVITY_VIEW],
      featureKey: OUTLET_FEATURE_KEYS.LEADS_ACTIVITIES,
      featureCategory: "SALES",
      featureDescription: "Lead activity records and monthly activity view.",
      permissionSections: permissionSection("SALES", "CRM_ACTIVITY_"),
    },
    {
      menuKey: ROUTES_PATHS.LEADS_RINGING,
      label: "Ringing",
      requiredPermissions: [PERMISSION_MASTER.CRM_ACTIVITY_VIEW],
      featureKey: OUTLET_FEATURE_KEYS.LEADS_RINGING,
      featureCategory: "SALES",
      featureDescription: "Ringing lead records.",
    },
    {
      menuKey: ROUTES_PATHS.TASK_MANAGEMENT,
      label: "Task Management",
      requiredPermissions: [PERMISSION_MASTER.CRM_TASK_VIEW],
      fallbackRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN],
      systemOnly: true,
      permissionSections: permissionSection("SALES", "CRM_TASK_"),
    },
  ]),

  section("sub_ai_intelligence", "AI INTELLIGENCE", "🤖", [
    comingSoon("coming-soon-find-dealers", "Find Dealers"),
    comingSoon("coming-soon-find-buyers", "Find Buyers"),
    {
      menuKey: ROUTES_PATHS.AI_SCRAP,
      label: "AI Contacts",
      featureLabel: "AI Contacts",
      requiredPermissions: [PERMISSION_MASTER.CRM_AI_SCRAP_VIEW],
      featureKey: OUTLET_FEATURE_KEYS.AI_SCRAP,
      featureCategory: "AI INTELLIGENCE",
      featureDescription: "AI-powered contact generation tools.",
      permissionSections: permissionSection(
        "AI INTELLIGENCE",
        "CRM_AI_SCRAP_"
      ),
    },
    {
      menuKey: ROUTES_PATHS.GENERATED_CONTACT_UPLOAD,
      label: "Upload Contacts",
      featureLabel: "Upload Contacts",
      requiredPermissions: [PERMISSION_MASTER.CRM_CONTACT_UPLOAD_VIEW],
      featureKey: OUTLET_FEATURE_KEYS.AI_SCRAP,
      featureCategory: "AI INTELLIGENCE",
      featureDescription: "Upload generated contacts from Excel.",
      permissionSections: permissionSection(
        "AI INTELLIGENCE",
        "CRM_CONTACT_UPLOAD_"
      ),
    },
    comingSoon("coming-soon-company-intelligence", "Company Intelligence"),
    comingSoon("coming-soon-contact-intelligence", "Contact Intelligence"),
    comingSoon("coming-soon-match-score", "Match & Score"),
    comingSoon("coming-soon-intent", "Intent"),
    comingSoon("coming-soon-enrichment", "Enrichment"),
  ]),

  section("sub_engagement", "ENGAGEMENT", "📞", [
    {
      menuKey: ROUTES_PATHS.CALL_LOGS_REPORT,
      label: "Calls",
      requiredPermissions: [PERMISSION_MASTER.CRM_CALL_LOGS_REPORT_VIEW],
      featureKey: OUTLET_FEATURE_KEYS.REPORTS_CALL_LOGS,
      featureCategory: "ENGAGEMENT",
      featureDescription: "Call logs and call activity reporting.",
      permissionSections: permissionSection(
        "ENGAGEMENT",
        "CRM_CALL_LOGS_REPORT_"
      ),
    },
    comingSoon("coming-soon-ai-voice", "AI Voice"),
    {
      menuKey: ROUTES_PATHS.WHATSAPP,
      label: "WhatsApp",
      requiredPermissions: [PERMISSION_MASTER.CRM_WHATSAPP_VIEW],
      featureKey: OUTLET_FEATURE_KEYS.WHATSAPP,
      featureCategory: "ENGAGEMENT",
      featureDescription: "WhatsApp chat and message handling.",
      permissionSections: permissionSection("ENGAGEMENT", "CRM_WHATSAPP_"),
    },
    {
      menuKey: ROUTES_PATHS.EMAIL_AUTOMATION,
      label: "Email",
      featureLabel: "Email",
      requiredPermissions: [PERMISSION_MASTER.CRM_EMAIL_AUTOMATION_VIEW],
      featureKey: OUTLET_FEATURE_KEYS.EMAIL_AUTOMATION,
      featureCategory: "ENGAGEMENT",
      featureDescription: "Email automation templates.",
      permissionSections: permissionSection(
        "ENGAGEMENT",
        "CRM_EMAIL_AUTOMATION_"
      ),
    },
    comingSoon("coming-soon-campaigns", "Campaigns"),
    {
      menuKey: ROUTES_PATHS.WHATSAPP_AUTOMATION,
      label: "Automations",
      featureLabel: "Automations",
      requiredPermissions: [PERMISSION_MASTER.CRM_WHATSAPP_AUTOMATION_VIEW],
      featureKey: OUTLET_FEATURE_KEYS.WHATSAPP_AUTOMATION,
      featureCategory: "ENGAGEMENT",
      featureDescription: "WhatsApp automation templates.",
      permissionSections: permissionSection(
        "ENGAGEMENT",
        "CRM_WHATSAPP_AUTOMATION_"
      ),
    },
    {
      menuKey: ROUTES_PATHS.SMS_AUTOMATION,
      label: "SMS Automations",
      requiredPermissions: [PERMISSION_MASTER.CRM_SMS_AUTOMATION_VIEW],
      featureKey: OUTLET_FEATURE_KEYS.SMS_AUTOMATION,
      featureCategory: "ENGAGEMENT",
      featureDescription: "SMS automation templates.",
      permissionSections: permissionSection(
        "ENGAGEMENT",
        "CRM_SMS_AUTOMATION_"
      ),
    },
    {
      menuKey: ROUTES_PATHS.SENDESK_ADMIN,
      label: "Sendesk Admin",
      requiredPermissions: [PERMISSION_MASTER.CRM_SUPPORT_VIEW],
      featureKey: OUTLET_FEATURE_KEYS.SENDESK_ADMIN,
      featureCategory: "ENGAGEMENT",
      featureDescription: "Support ticket administration.",
      permissionSections: permissionSection(
        "ENGAGEMENT",
        "CRM_SUPPORT_",
        "CRM_SENDESK_"
      ),
    },
    {
      menuKey: ROUTES_PATHS.ADDRESS_CARD_PRINT,
      label: "Address Cards",
      requiredPermissions: [PERMISSION_MASTER.CRM_LEADS_VIEW],
      fallbackRoles: [ROLES.SUPER_ADMIN],
      featureBypassRoles: [ROLES.SUPER_ADMIN],
      featureKey: OUTLET_FEATURE_KEYS.ADDRESS_CARDS,
      featureCategory: "ENGAGEMENT",
      featureDescription: "Import and print invitation address cards.",
    },
  ]),

  section("sub_analytics", "ANALYTICS", "📊", [
    {
      menuKey: ROUTES_PATHS.SOURCE_WISE_REPORT,
      label: "Reports",
      requiredPermissions: [PERMISSION_MASTER.CRM_SORCE_WISE_REPORT_VIEW],
      featureKey: OUTLET_FEATURE_KEYS.REPORTS_SOURCE_WISE,
      featureCategory: "ANALYTICS",
      featureDescription: "Source-wise lead reporting.",
      permissionSections: permissionSection(
        "ANALYTICS",
        "CRM_REPORTS_",
        "CRM_SORCE_WISE_REPORT_",
        "CRM_SOURCE_WISE_REPORT_"
      ),
    },
    {
      menuKey: ROUTES_PATHS.CITY_WISE_REPORT,
      label: "Sales Analytics",
      requiredPermissions: [PERMISSION_MASTER.CRM_CITY_WISE_REPORT_VIEW],
      featureKey: OUTLET_FEATURE_KEYS.REPORTS_CITY_STATE_WISE,
      featureCategory: "ANALYTICS",
      featureDescription: "City and state sales analytics.",
      permissionSections: permissionSection(
        "ANALYTICS",
        "CRM_CITY_WISE_REPORT_"
      ),
    },
    {
      menuKey: ROUTES_PATHS.EMPLOYEE_WISE_REPORT,
      label: "Team Performance",
      requiredPermissions: [PERMISSION_MASTER.CRM_EMPLOYEE_WISE_REPORT_VIEW],
      featureKey: OUTLET_FEATURE_KEYS.REPORTS_EMPLOYEE_WISE,
      featureCategory: "ANALYTICS",
      featureDescription: "Employee-wise performance reporting.",
      permissionSections: permissionSection(
        "ANALYTICS",
        "CRM_EMPLOYEE_WISE_REPORT_"
      ),
    },
    {
      menuKey: ROUTES_PATHS.EMPLOYEE_TARGET,
      label: "Employee Target",
      requiredPermissions: [PERMISSION_MASTER.CRM_EMPLOYEE_TARGET_VIEW],
      featureKey: OUTLET_FEATURE_KEYS.REPORTS_EMPLOYEE_TARGET,
      featureCategory: "ANALYTICS",
      featureDescription: "Employee target reporting.",
      permissionSections: permissionSection(
        "ANALYTICS",
        "CRM_EMPLOYEE_TARGET_"
      ),
    },
    comingSoon("coming-soon-campaign-analytics", "Campaign Analytics"),
    comingSoon("coming-soon-dealer-network", "Dealer Network"),
    comingSoon("coming-soon-buyer-network", "Buyer Network"),
    comingSoon("coming-soon-ai-performance", "AI Performance"),
  ]),

  section("sub_operations", "OPERATIONS", "⚙️", [
    {
      menuKey: ROUTES_PATHS.ATTENDANCE_RECORDS,
      label: "Attendance",
      requiredPermissions: [PERMISSION_MASTER.CRM_ATTENDANCE_VIEW_ADMIN],
      featureKey: OUTLET_FEATURE_KEYS.ATTENDANCE_RECORDS,
      featureCategory: "OPERATIONS",
      featureDescription: "Monthly employee attendance records.",
      permissionSections: permissionSection(
        "OPERATIONS",
        "CRM_ATTENDANCE_",
        "CRM_TRACK_BACKGROUND_"
      ),
    },
    {
      menuKey: ROUTES_PATHS.SALARY_MASTER,
      label: "Salary Master",
      requiredPermissions: [PERMISSION_MASTER.CRM_ATTENDANCE_VIEW_ADMIN],
      featureKey: OUTLET_FEATURE_KEYS.ATTENDANCE_SALARY_MASTER,
      featureCategory: "OPERATIONS",
      featureDescription: "Employee salary master records.",
    },
    {
      menuKey: ROUTES_PATHS.LEAVE_APPLICATION,
      label: "Leave",
      requiredPermissions: [PERMISSION_MASTER.CRM_LEAVE_VIEW_ADMIN],
      featureKey: OUTLET_FEATURE_KEYS.LEAVE_MANAGEMENT,
      featureCategory: "OPERATIONS",
      featureDescription: "Leave applications and approvals.",
      permissionSections: permissionSection("OPERATIONS", "CRM_LEAVE_"),
    },
    {
      menuKey: ROUTES_PATHS.APPLY_LEAVE,
      label: "Apply Leave",
      requiredPermissions: [PERMISSION_MASTER.CRM_LEAVE_VIEW],
      featureKey: OUTLET_FEATURE_KEYS.LEAVE_MANAGEMENT,
      featureCategory: "OPERATIONS",
      featureDescription: "Employee leave request submission.",
    },
    {
      menuKey: ROUTES_PATHS.LEAVE_BALANCE,
      label: "Leave Balance",
      requiredPermissions: [PERMISSION_MASTER.CRM_ATTENDANCE_VIEW_ADMIN],
      featureKey: OUTLET_FEATURE_KEYS.LEAVE_BALANCE,
      featureCategory: "OPERATIONS",
      featureDescription: "Employee leave balances.",
    },
    {
      menuKey: ROUTES_PATHS.HOLIDAY_CALENDAR,
      label: "Holiday Calendar",
      requiredPermissions: [PERMISSION_MASTER.CRM_ATTENDANCE_VIEW_ADMIN],
      featureKey: OUTLET_FEATURE_KEYS.LEAVE_HOLIDAY_CALENDAR,
      featureCategory: "OPERATIONS",
      featureDescription: "Holiday calendar setup.",
    },
    {
      menuKey: ROUTES_PATHS.EXPENSE_PAGE,
      label: "Expense",
      requiredPermissions: [PERMISSION_MASTER.CRM_EXPENSE_VIEW_ADMIN],
      fallbackRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN],
      featureKey: OUTLET_FEATURE_KEYS.EXPENSE,
      featureCategory: "OPERATIONS",
      featureDescription: "Expense management and approvals.",
      permissionSections: permissionSection("OPERATIONS", "CRM_EXPENSE_"),
    },
    {
      menuKey: ROUTES_PATHS.PAYROLL,
      label: "Payroll",
      requiredPermissions: [PERMISSION_MASTER.CRM_PAYROLL_VIEW],
      fallbackRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN],
      featureKey: OUTLET_FEATURE_KEYS.PAYROLL,
      featureCategory: "OPERATIONS",
      featureDescription: "Salary structures, payroll, payslips, and reports.",
      permissionSections: permissionSection("OPERATIONS", "CRM_PAYROLL_"),
    },
    comingSoon("coming-soon-sales-orders", "Sales Orders"),
    comingSoon("coming-soon-export-operations", "Export Operations"),
    {
      menuKey: ROUTES_PATHS.EVENTS,
      label: "Events",
      requiredPermissions: [PERMISSION_MASTER.CRM_EVENTS_VIEW],
      fallbackRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN],
      featureKey: OUTLET_FEATURE_KEYS.EVENTS,
      featureCategory: "OPERATIONS",
      featureDescription: "Event list, creation, and registration details.",
      permissionSections: permissionSection("OPERATIONS", "CRM_EVENTS_"),
    },
    {
      menuKey: ROUTES_PATHS.USER_TRACKING_PAGE,
      label: "User Tracking",
      requiredPermissions: [PERMISSION_MASTER.CRM_USERS_TRACKING_VIEW],
      featureKey: OUTLET_FEATURE_KEYS.USER_TRACKING,
      featureCategory: "OPERATIONS",
      featureDescription: "Field-user tracking map and location history.",
      permissionSections: permissionSection(
        "OPERATIONS",
        "CRM_USERS_TRACKING_",
        "CRM_USER_TRACKING_"
      ),
    },
  ]),

  section("sub_billing", "BILLING", "💳", [
    systemLink(ROUTES_PATHS.BILLING_WALLET, "Wallet"),
    systemLink(ROUTES_PATHS.BILLING_TRANSACTIONS, "Transactions"),
    systemLink(ROUTES_PATHS.BILLING_TOPUP, "Top Up"),
    {
      menuKey: ROUTES_PATHS.BILLING_RATE_CARDS,
      label: "Rate Cards",
      requiredPermissions: [],
      systemOnly: true,
      internalOnly: true,
    },
  ]),

  section("sub_settings", "SETTINGS", "⚙️", [
    {
      menuKey: ROUTES_PATHS.TEAM_TREE_PAGE,
      label: "Users & Teams",
      requiredPermissions: [PERMISSION_MASTER.CRM_TEAMTREE_VIEW],
      featureKey: OUTLET_FEATURE_KEYS.TEAM_TREE,
      featureCategory: "SETTINGS",
      featureDescription: "Team hierarchy and reporting structure.",
      permissionSections: permissionSection(
        "SETTINGS",
        "CRM_TEAMTREE_",
        "CRM_TEAM_TREE_"
      ),
    },
    {
      menuKey: ROUTES_PATHS.PERMISSION_MANAGEMENT,
      label: "Roles & Permissions",
      requiredPermissions: [PERMISSION_MASTER.CRM_PERMISSION_VIEW],
      fallbackRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN],
      featureKey: OUTLET_FEATURE_KEYS.PERMISSIONS,
      featureCategory: "SETTINGS",
      featureDescription: "Outlet user roles and permission assignment.",
      permissionSections: permissionSection("SETTINGS", "CRM_PERMISSION_"),
    },
    {
      menuKey: ROUTES_PATHS.PERMISSION_MASTER_PAGE,
      label: "Permissions Master",
      requiredPermissions: [PERMISSION_MASTER.CRM_PERMISSION_MASTER_VIEW],
      fallbackRoles: [ROLES.SUPER_ADMIN],
      featureKey: OUTLET_FEATURE_KEYS.PERMISSIONS_MASTER,
      featureCategory: "SETTINGS",
      featureDescription: "Master permission setup for internal administrators.",
      internalOnly: true,
      permissionSections: permissionSection(
        "SETTINGS",
        "CRM_PERMISSION_MASTER_"
      ),
    },
    systemLink(ROUTES_PATHS.OUTLET_DETAILS, "Business Profile"),
    systemLink("/setup", "Workspace & Vertical Setup"),
    {
      menuKey: ROUTES_PATHS.INTEGRATION_MASTER_PAGE,
      label: "Integrations",
      requiredPermissions: [PERMISSION_MASTER.CRM_INTEGRATION_VIEW],
      featureKey: OUTLET_FEATURE_KEYS.INTEGRATION,
      featureCategory: "SETTINGS",
      featureDescription: "Third-party integration setup.",
      permissionSections: permissionSection(
        "SETTINGS",
        "CRM_INTEGRATION_"
      ),
    },
    {
      menuKey: ROUTES_PATHS.PRODUCT_PAGE,
      label: "Products",
      requiredPermissions: [PERMISSION_MASTER.CRM_PRODUCTS_VIEW],
      featureKey: OUTLET_FEATURE_KEYS.PRODUCTS,
      featureCategory: "SETTINGS",
      featureDescription: "Product master access.",
      permissionSections: permissionSection("SETTINGS", "CRM_PRODUCTS_"),
    },
    {
      menuKey: ROUTES_PATHS.OUTLETS,
      label: "Outlet Monitoring",
      requiredPermissions: [],
      fallbackRoles: [ROLES.SUPER_ADMIN, ROLES.SUB_SUPER_ADMIN],
      featureKey: OUTLET_FEATURE_KEYS.ALL_OUTLETS,
      featureCategory: "SETTINGS",
      featureDescription: "Outlet selector and outlet monitoring page.",
      permissionSections: permissionSection(
        "SETTINGS",
        "CRM_OUTLET_",
        "CRM_ALL_OUTLETS_"
      ),
    },
    {
      menuKey: ROUTES_PATHS.OUTLET_FEATURE_ACCESS,
      label: "Outlet Feature Access",
      requiredPermissions: [PERMISSION_MASTER.CRM_SETTINGS_EDIT],
      fallbackRoles: [ROLES.SUPER_ADMIN, ROLES.ADMIN],
      permissionSections: permissionSection("SETTINGS", "CRM_SETTINGS_"),
      systemOnly: true,
      internalOnly: true,
      allowedOutletIds: FEATURE_ACCESS_ADMIN_OUTLET_IDS,
    },
    systemLink(ROUTES_PATHS.ADD_SUBSCRIPTION, "Subscription"),
  ]),
];

export const flattenSidebarMenuOptions = (
  options: readonly SidebarMenuOption[] = SIDEBAR_MENU_OPTIONS
): SidebarMenuOption[] =>
  options.flatMap((option) => [
    option,
    ...flattenSidebarMenuOptions(option.children ?? []),
  ]);

export const getSidebarMenuOption = (menuKey?: string) =>
  menuKey
    ? flattenSidebarMenuOptions().find((option) => option.menuKey === menuKey)
    : undefined;

export const SIDEBAR_PERMISSION_KEYS = Array.from(
  new Set(
    flattenSidebarMenuOptions().flatMap((option) =>
      Array.from(option.requiredPermissions)
    )
  )
);

const inferPermissionPrefix = (permissionKey: string) => {
  const normalizedKey = permissionKey.trim().toUpperCase();
  const prefix = normalizedKey.replace(
    /_(?:VIEW_ADMIN|CREATE|DELETE|VIEW|EDIT|ASSIGN|APPROVE|REVIEW|MARK|MANAGE)$/,
    ""
  );

  return prefix === normalizedKey ? normalizedKey : `${prefix}_`;
};

const getSidebarPermissionSectionRules = (
  options: readonly SidebarMenuOption[],
  parentSectionLabel?: string
): SidebarPermissionSectionRule[] =>
  options.flatMap((option) => {
    const sectionLabel =
      parentSectionLabel ??
      (option.systemOnly ? option.label : option.featureCategory);
    const sections =
      option.permissionSections ??
      (option.requiredPermissions.length > 0
        ? [
            {
              label: option.label,
              prefixes: Array.from(
                new Set(option.requiredPermissions.map(inferPermissionPrefix))
              ),
            },
          ]
        : []);

    const rules = sections.map((permissionGroup) => ({
      ...permissionGroup,
      sectionLabel,
      submoduleLabel:
        option.systemOnly ? option.label : option.featureLabel ?? option.label,
      featureKey: option.featureKey,
    }));

    return [
      ...rules,
      ...getSidebarPermissionSectionRules(
        option.children ?? [],
        parentSectionLabel ?? (option.children?.length ? option.label : sectionLabel)
      ),
    ];
  });

export const SIDEBAR_PERMISSION_SECTION_RULES =
  getSidebarPermissionSectionRules(SIDEBAR_MENU_OPTIONS);

const getMatchingSidebarPermissionRule = (permissionKeyValue: unknown) => {
  const permissionKey = String(permissionKeyValue ?? "")
    .trim()
    .toUpperCase();

  return [...SIDEBAR_PERMISSION_SECTION_RULES]
    .sort(
      (first, second) =>
        Math.max(...second.prefixes.map((prefix) => prefix.length)) -
        Math.max(...first.prefixes.map((prefix) => prefix.length))
    )
    .find(({ prefixes }) =>
      prefixes.some((prefix) => permissionKey.startsWith(prefix))
    );
};

export const getSidebarPermissionLocation = (
  permissionKeyValue: unknown,
  fallbackCategory?: unknown
): SidebarPermissionLocation => {
  const matchingSection = getMatchingSidebarPermissionRule(permissionKeyValue);

  if (matchingSection) {
    return {
      sectionLabel: matchingSection.sectionLabel,
      submoduleLabel: matchingSection.submoduleLabel,
    };
  }

  const category = String(fallbackCategory ?? "").trim();
  const fallbackLabel =
    category && category.toLowerCase() !== "other"
      ? category
      : "Additional Permissions";

  return {
    sectionLabel: fallbackLabel,
    submoduleLabel: fallbackLabel,
  };
};

export const getSidebarPermissionSectionLabel = (
  permissionKeyValue: unknown,
  fallbackCategory?: unknown
) =>
  getSidebarPermissionLocation(permissionKeyValue, fallbackCategory)
    .sectionLabel;
