import { GeoPoint, Timestamp } from "firebase-admin/firestore";
import { firestore } from "../src/config/firebase.js";

interface PayrollTools {
  SAMPLE_SALARY_EARNINGS: Record<string, unknown>;
  calculatePayroll(input: Record<string, unknown>): Record<string, unknown>;
  createEmployeeSalaryStructureDocument(
    input: Record<string, unknown>,
  ): Record<string, unknown>;
  createPayrollRunDocument(input: Record<string, unknown>): Record<string, unknown>;
  deriveSalaryComponentsFromGross(
    grossSalary: number,
    options: Record<string, unknown>,
  ): Record<string, unknown>;
}

let payrollTools: PayrollTools;

const OUTLET_ID = "sensibledemo2-0";
const BUSINESS_ID = "business-sensibledemo2-0";
const ADMIN_ID = "sensibledemo2-admin";
const ADMIN_EMAIL = "demo.admin@sensiblecrm.in";
const ADMIN_PASSWORD = "SensibleDemo@2026";
const EMPLOYEE_PASSWORD = "DemoEmployee@2026";
const TIME_ZONE_OFFSET = "+05:30";

const CUSTOMER_FEATURES = [
  ["dashboard", "Dashboard"],
  ["leads", "Leads Management"],
  ["leads_list", "Leads"],
  ["leads_funnel", "Lead Funnel"],
  ["leads_activities", "Activities"],
  ["leads_ringing", "Ringing Leads"],
  ["address_cards", "Address Card Print"],
  ["reports", "Reports"],
  ["reports_source_wise", "Source-wise Report"],
  ["reports_employee_wise", "Employee-wise Report"],
  ["reports_city_state_wise", "City/State Report"],
  ["reports_call_logs", "Call Logs Report"],
  ["reports_employee_target", "Employee Targets"],
  ["attendance", "Attendance"],
  ["attendance_records", "Attendance Records"],
  ["attendance_salary_master", "Salary Master"],
  ["payroll", "Payroll"],
  ["leave", "Leave"],
  ["leave_management", "Leave Management"],
  ["leave_balance", "Leave Balance"],
  ["leave_holiday_calendar", "Holiday Calendar"],
  ["expense", "Expense"],
  ["events", "Events"],
  ["warehouse", "Warehouse"],
  ["warehouse_dashboard", "Warehouse Dashboard"],
  ["warehouse_products", "Warehouse Products"],
  ["warehouse_transfer_request", "Warehouse Transfer Requests"],
  ["sales_orders", "Sales Orders"],
  ["ai_scrap", "Generate Contact (AI)"],
  ["user_tracking", "User Tracking"],
  ["permissions", "User Permissions"],
  ["whatsapp", "WhatsApp"],
  ["sendesk_admin", "Support"],
  ["team_tree", "Team Tree"],
  ["integration", "Integration"],
  ["products", "Products"],
] as const;

const EXTRA_ADMIN_PERMISSIONS = [
  "CRM_PAYROLL_VIEW",
  "CRM_EXPENSE_BUDGET_ALLOCATE",
  "CRM_EXPENSE_BUDGET_OVERSPEND",
  "CRM_EVENTS_VIEW",
  "CRM_EVENTS_CREATE",
  "CRM_EVENTS_EDIT",
  "CRM_EVENTS_DELETE",
  "CRM_SALES_ORDER_VIEW",
  "CRM_SALES_ORDER_CREATE",
  "CRM_SALES_ORDER_EDIT",
  "CRM_SALES_ORDER_DELETE",
  "CRM_WAREHOUSE_VIEW",
  "CRM_WAREHOUSE_CREATE",
  "CRM_WAREHOUSE_DELETE",
  "CRM_PERMISSION_MASTER_VIEW",
  "CRM_SETTINGS_EDIT",
  "CRM_AI_SCRAP_VIEW",
  "CRM_CONTACT_UPLOAD_VIEW",
  "CRM_CONTACT_UPLOAD_CREATE",
  "CRM_CONTACT_UPLOAD_UPDATE",
  "CRM_CONTACT_UPLOAD_DELETE",
  "CRM_SUPPORT_VIEW",
] as const;

interface DemoEmployee {
  id: string;
  empCode: string;
  name: string;
  email: string;
  phone: string;
  gender: "FEMALE" | "MALE";
  department: string;
  designation: string;
  zone: string;
  salary: number;
  joiningDate: string;
  dateOfBirth: string;
  address: string;
  bankAccountMasked: string;
  panMasked: string;
}

const employees: DemoEmployee[] = [
  {
    id: "sensibledemo2-emp-001",
    empCode: "SD2-001",
    name: "Ritesh Kinge",
    email: "ritesh.kinge@sensibledemo.in",
    phone: "9100000201",
    gender: "MALE",
    department: "SALES",
    designation: "Senior Sales Executive",
    zone: "West",
    salary: 42_000,
    joiningDate: "2023-04-10",
    dateOfBirth: "1994-02-18",
    address: "Kothrud, Pune, Maharashtra 411038",
    bankAccountMasked: "XXXXXX1201",
    panMasked: "ABCDE1201F",
  },
  {
    id: "sensibledemo2-emp-002",
    empCode: "SD2-002",
    name: "Sakshi Shedge",
    email: "sakshi.shedge@sensibledemo.in",
    phone: "9100000202",
    gender: "FEMALE",
    department: "SALES",
    designation: "Sales Executive",
    zone: "South",
    salary: 32_000,
    joiningDate: "2024-01-15",
    dateOfBirth: "1997-08-06",
    address: "Baner, Pune, Maharashtra 411045",
    bankAccountMasked: "XXXXXX1202",
    panMasked: "ABCDE1202F",
  },
  {
    id: "sensibledemo2-emp-003",
    empCode: "SD2-003",
    name: "Harsh Warkhedkar",
    email: "harsh.warkhedkar@sensibledemo.in",
    phone: "9100000203",
    gender: "MALE",
    department: "SALES",
    designation: "Field Sales Executive",
    zone: "North",
    salary: 28_000,
    joiningDate: "2024-07-01",
    dateOfBirth: "1998-11-24",
    address: "Viman Nagar, Pune, Maharashtra 411014",
    bankAccountMasked: "XXXXXX1203",
    panMasked: "ABCDE1203F",
  },
  {
    id: "sensibledemo2-emp-004",
    empCode: "SD2-004",
    name: "Samiksha Chaudhri",
    email: "samiksha.chaudhri@sensibledemo.in",
    phone: "9100000204",
    gender: "FEMALE",
    department: "HR",
    designation: "HR & Payroll Executive",
    zone: "Head Office",
    salary: 38_000,
    joiningDate: "2022-09-05",
    dateOfBirth: "1993-05-12",
    address: "Aundh, Pune, Maharashtra 411007",
    bankAccountMasked: "XXXXXX1204",
    panMasked: "ABCDE1204F",
  },
  {
    id: "sensibledemo2-emp-005",
    empCode: "SD2-005",
    name: "Nikhil Gawde",
    email: "nikhil.gawde@sensibledemo.in",
    phone: "9100000205",
    gender: "MALE",
    department: "OPERATIONS",
    designation: "Warehouse Coordinator",
    zone: "Head Office",
    salary: 20_000,
    joiningDate: "2025-02-03",
    dateOfBirth: "1999-01-30",
    address: "Hadapsar, Pune, Maharashtra 411028",
    bankAccountMasked: "XXXXXX1205",
    panMasked: "ABCDE1205F",
  },
];

const outletRef = firestore.collection("OUTLET").doc(OUTLET_ID);
const profileRef = (id: string) => firestore.collection("USER_PROFILE").doc(id);
const subRef = (collection: string, id: string) =>
  outletRef.collection(collection).doc(id);

const pad = (value: number) => String(value).padStart(2, "0");
const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();
const dateKey = (year: number, month: number, day: number) =>
  `${year}-${pad(month)}-${pad(day)}`;
const dayId = (year: number, month: number, day: number) =>
  `${pad(day)}-${pad(month)}-${year}`;
const monthId = (year: number, month: number) => `${pad(month)}-${year}`;
const localMillis = (
  year: number,
  month: number,
  day: number,
  time = "09:30:00",
) => Date.parse(`${dateKey(year, month, day)}T${time}${TIME_ZONE_OFFSET}`);
const isSunday = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 0;
const nearestWorkingDay = (year: number, month: number, preferred: number) => {
  let day = Math.max(1, Math.min(preferred, daysInMonth(year, month)));
  while (isSunday(year, month, day) && day > 1) day -= 1;
  return day;
};

const kolkataParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).formatToParts(new Date());
const part = (type: Intl.DateTimeFormatPartTypes) =>
  Number(kolkataParts.find((item) => item.type === type)?.value);
const currentYear = part("year");
const currentMonth = part("month");
const currentDay = part("day");
const lastMonthDate = new Date(Date.UTC(currentYear, currentMonth - 2, 1));
const payrollYear = lastMonthDate.getUTCFullYear();
const payrollMonth = lastMonthDate.getUTCMonth() + 1;
const now = Date.now();
const monthStart = localMillis(currentYear, currentMonth, 1, "00:00:00");
const todayStart = localMillis(currentYear, currentMonth, currentDay, "00:00:00");
const todayEnd = localMillis(currentYear, currentMonth, currentDay, "23:59:59") + 999;
const payrollMonthStart = localMillis(payrollYear, payrollMonth, 1, "00:00:00");
const renewalDate = Date.parse(
  `${currentYear + 1}-${pad(currentMonth)}-${pad(currentDay)}T23:59:59${TIME_ZONE_OFFSET}`,
);

const pendingWrites: Array<() => Promise<unknown>> = [];
const write = (
  reference: FirebaseFirestore.DocumentReference,
  data: FirebaseFirestore.DocumentData,
) => pendingWrites.push(() => reference.set(data, { merge: true }));

const runWrites = async () => {
  const concurrency = 25;
  for (let index = 0; index < pendingWrites.length; index += concurrency) {
    await Promise.all(pendingWrites.slice(index, index + concurrency).map((job) => job()));
  }
};

const buildProfile = ({
  id,
  name,
  email,
  phone,
  role,
  password,
  departmentAccessList,
  permissions,
  extra = {},
}: {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  password: string;
  departmentAccessList: string[];
  permissions: string[];
  extra?: Record<string, unknown>;
}) => ({
  id,
  uid: id,
  name,
  email,
  phone_number: phone,
  password,
  role,
  outletId: OUTLET_ID,
  outlets: [OUTLET_ID],
  permissions: [
    { outletId: OUTLET_ID, role, departmentAccessList, outletPermissions: permissions },
  ],
  isActive: true,
  isDemo: true,
  created_time: new Date(now).toISOString(),
  updatedAt: now,
  ...extra,
});

const seedCore = async () => {
  const permissionsSnapshot = await firestore.collection("PERMISSIONS_MASTER").get();
  const masterPermissions = permissionsSnapshot.docs
    .map((document) => String(document.data().key || document.id).trim())
    .filter(Boolean);
  const adminPermissions = Array.from(
    new Set([...masterPermissions, ...EXTRA_ADMIN_PERMISSIONS]),
  );
  const employeePermissions = [
    "CRM_DASHBOARD_VIEW",
    "CRM_LEADS_VIEW",
    "CRM_ACTIVITY_VIEW",
    "CRM_ACTIVITY_CREATE",
    "CRM_ATTENDENCE_VIEW",
    "CRM_ATTENDANCE_MARK",
    "CRM_LEAVE_VIEW",
    "CRM_LEAVE_CREATE",
    "CRM_EXPENSE_VIEW",
    "CRM_EXPENSE_CREATE",
    "CRM_BACKGROUND_TRACK",
  ];

  write(profileRef(ADMIN_ID), buildProfile({
    id: ADMIN_ID,
    name: "Sensible Demo Administrator",
    email: ADMIN_EMAIL,
    phone: "9100000200",
    password: ADMIN_PASSWORD,
    role: "SUPER_ADMIN",
    departmentAccessList: ["SALES", "HR", "OPERATIONS", "FINANCE", "WAREHOUSE"],
    permissions: adminPermissions,
    extra: {
      designation: "Outlet Administrator",
      employeeCode: "SD2-ADMIN",
      address: "Sensible Demo House, Baner Road, Pune, Maharashtra 411045",
    },
  }));

  const businessRef = firestore.collection("BUSINESSS_MASTER").doc(BUSINESS_ID);
  write(businessRef, {
    id: BUSINESS_ID,
    name: "sensibledemo2.0",
    businessName: "sensibledemo2.0",
    legalName: "Sensible Demo Solutions Private Limited",
    ownerName: "Sensible Demo Administrator",
    email: ADMIN_EMAIL,
    phone_number: "9100000200",
    gstin: "27ABCDE1234F1Z5",
    pan: "ABCDE1234F",
    industry: "CRM Software Demonstration",
    active: true,
    isDemo: true,
    createdDate: now,
    createdBy: profileRef(ADMIN_ID),
  });
  write(outletRef, {
    id: OUTLET_ID,
    outletCode: "SD2-PUNE-01",
    name: "sensibledemo2.0",
    branch: "Pune Demo Branch",
    address: "Office 201, Sensible Demo House, Baner Road",
    city: "Pune",
    state: "Maharashtra",
    pincode: "411045",
    email: ADMIN_EMAIL,
    phone: "9100000200",
    active: true,
    eraseOutlet: false,
    billingType: "DEMO",
    packageName: "Complete Demo",
    isDemo: true,
    isProd: false,
    latLang: new GeoPoint(18.5590, 73.7868),
    businessMaster: businessRef,
    createdBy: profileRef(ADMIN_ID),
    createdDate: now,
    renewalDate,
    enabledFeatureKeys: CUSTOMER_FEATURES.map(([key]) => key),
    featureAccessUpdatedAt: now,
    featureAccessUpdatedBy: ADMIN_ID,
  });

  write(subRef("TEAM_TREE", ADMIN_ID), {
    id: ADMIN_ID,
    uid: ADMIN_ID,
    userProfileId: ADMIN_ID,
    userName: "Sensible Demo Administrator",
    empCode: "SD2-ADMIN",
    code: "SD2-ADMIN",
    designation: "Outlet Administrator",
    department: "ADMINISTRATION",
    roleInZone: "SUPER_ADMIN",
    teamHeadProfileId: ADMIN_ID,
    zoneHeadProfileId: ADMIN_ID,
    zoneList: ["All Zones"],
    stageAccessList: [],
    team: "Management",
    isActive: true,
    isOnPayRoll: false,
    onRole: true,
    createdDate: now,
  });

  for (const employee of employees) {
    write(profileRef(employee.id), buildProfile({
      id: employee.id,
      name: employee.name,
      email: employee.email,
      phone: employee.phone,
      password: EMPLOYEE_PASSWORD,
      role: "EMPLOYEE",
      departmentAccessList: [employee.department],
      permissions: employeePermissions,
      extra: {
        empCode: employee.empCode,
        designation: employee.designation,
        department: employee.department,
        gender: employee.gender,
        dateOfBirth: employee.dateOfBirth,
        joiningDate: employee.joiningDate,
        address: employee.address,
        bankAccountMasked: employee.bankAccountMasked,
        panMasked: employee.panMasked,
      },
    }));
    write(subRef("TEAM_TREE", employee.id), {
      id: employee.id,
      uid: employee.id,
      userProfileId: employee.id,
      userName: employee.name,
      empCode: employee.empCode,
      code: employee.empCode,
      designation: employee.designation,
      department: employee.department,
      roleInZone: employee.department === "HR" ? "HR_EXECUTIVE" : "EMPLOYEE",
      teamHeadProfileId: ADMIN_ID,
      zoneHeadProfileId: ADMIN_ID,
      zoneList: [employee.zone],
      stageAccessList: [],
      team: `${employee.zone} Team`,
      isActive: true,
      isOnPayRoll: true,
      onRole: true,
      joiningDate: employee.joiningDate,
      gender: employee.gender,
      createdDate: now,
    });
  }

  const activeUserIds = [ADMIN_ID, ...employees.map((employee) => employee.id)];
  CUSTOMER_FEATURES.forEach(([featureKey, name]) => {
    write(subRef("MODULE_SUBSCRIPTION", featureKey), {
      id: featureKey,
      featureKey,
      name,
      isActive: true,
      activeUserIds,
      amount: 0,
      duration: 365,
      permittedUsers: activeUserIds.length,
      renewalDate,
      transactionId: "DEMO-NO-CHARGE",
      createdDate: now,
      updatedDate: now,
      updatedAt: now,
      updatedBy: ADMIN_ID,
    });
  });
};

const seedAttendanceAndTracking = () => {
  const currentLeaveDay = nearestWorkingDay(
    currentYear,
    currentMonth,
    Math.max(2, currentDay - 2),
  );
  const currentAbsentDay = nearestWorkingDay(
    currentYear,
    currentMonth,
    Math.max(1, currentDay - 1),
  );
  const payrollHolidayDay = nearestWorkingDay(payrollYear, payrollMonth, 15);
  const periods = [
    { year: payrollYear, month: payrollMonth, throughDay: daysInMonth(payrollYear, payrollMonth) },
    { year: currentYear, month: currentMonth, throughDay: currentDay },
  ];

  periods.forEach(({ year, month, throughDay }) => {
    for (let day = 1; day <= throughDay; day += 1) {
      if (isSunday(year, month, day)) continue;
      if (year === payrollYear && month === payrollMonth && day === payrollHolidayDay) continue;

      employees.forEach((employee, employeeIndex) => {
        if (
          year === currentYear &&
          month === currentMonth &&
          ((employeeIndex === 1 && day === currentLeaveDay) ||
            (employeeIndex === 0 && day === currentAbsentDay))
        ) return;

        const checkInTime = localMillis(year, month, day, `09:${pad(10 + employeeIndex * 4)}:00`);
        const checkOutTime = localMillis(year, month, day, `18:${pad(5 + employeeIndex * 3)}:00`);
        const id = `${employee.id}_${dateKey(year, month, day)}`;
        write(subRef("ATTENDANCE", id), {
          id,
          outletId: OUTLET_ID,
          userId: employee.id,
          userName: employee.name,
          empCode: employee.empCode,
          dayId: dayId(year, month, day),
          monthId: monthId(year, month),
          yearId: String(year),
          checkInTime,
          checkOutTime,
          checkInLocation: "LatLng(18.5590, 73.7868)",
          checkOutLocation: "LatLng(18.5594, 73.7873)",
          checkInLocationDetails: {
            name: "Sensible Demo House",
            street: "Baner Road",
            locality: "Baner",
            subLocality: "Pune",
            postalCode: "411045",
          },
          checkOutLocationDetails: {
            name: "Sensible Demo House",
            street: "Baner Road",
            locality: "Baner",
            subLocality: "Pune",
            postalCode: "411045",
          },
          checkInSource: employeeIndex < 3 ? "MOBILE" : "BIOMETRIC",
          checkOutSource: employeeIndex < 3 ? "MOBILE" : "BIOMETRIC",
          source: employeeIndex < 3 ? "MOBILE" : "BIOMETRIC",
          device: employeeIndex < 3 ? "ANDROID" : "BIOMETRIC",
          note: "Demo attendance record",
          isPresent: true,
          status: true,
          attendanceStatus: "PRESENT",
          createdDate: checkInTime,
          updatedAt: checkOutTime,
        });
      });
    }
  });

  const trackingBase = [
    [18.5590, 73.7868, "Sensible Demo House, Baner"],
    [18.5572, 73.7921, "Baner Road"],
    [18.5545, 73.7983, "Aundh-Baner Link Road"],
    [18.5520, 73.8039, "Aundh IT Park"],
    [18.5490, 73.8078, "Westend Mall, Aundh"],
    [18.5464, 73.8120, "University Road, Pune"],
  ] as const;
  employees.filter((employee) => employee.department === "SALES").forEach((employee, employeeIndex) => {
    trackingBase.forEach(([latitude, longitude, address], pointIndex) => {
      const timestamp = localMillis(
        currentYear,
        currentMonth,
        currentDay,
        `${pad(9 + pointIndex)}:${pad(5 + employeeIndex * 3)}:00`,
      );
      const id = `${employee.id}_${dateKey(currentYear, currentMonth, currentDay)}_${pad(pointIndex + 1)}`;
      write(subRef("TRACKING_HISTORY", id), {
        id,
        userID: employee.id,
        name: employee.name,
        mobile: employee.phone,
        currentlocation: {
          latitude: latitude + employeeIndex * 0.0002,
          longitude: longitude + employeeIndex * 0.0002,
        },
        latitude: latitude + employeeIndex * 0.0002,
        longitude: longitude + employeeIndex * 0.0002,
        address,
        timestamp: Timestamp.fromMillis(timestamp),
      });
    });
  });

  const leaveStart = localMillis(currentYear, currentMonth, currentLeaveDay, "00:00:00");
  write(subRef("LEAVE_APPLICATION", "demo-leave-approved"), {
    id: "demo-leave-approved",
    leaveApplicationId: "SD2-LV-001",
    userProfileId: employees[1].id,
    userName: employees[1].name,
    managerId: ADMIN_ID,
    managerName: "Sensible Demo Administrator",
    leaveType: "Casual Leave",
    leaveNote: "Personal work - approved demo leave",
    duration: "Full Day",
    noDays: 1,
    status: "APPROVED",
    fromDate: leaveStart,
    toDate: leaveStart + 86_399_999,
    createdDate: monthStart + 86_400_000,
    updateddate: monthStart + 172_800_000,
    dayId: dateKey(currentYear, currentMonth, currentLeaveDay),
    monthId: `${currentYear}-${pad(currentMonth)}`,
    actionTakenBy: ADMIN_ID,
    remark: "Approved for demo",
  });
  write(subRef("LEAVE_APPLICATION", "demo-leave-pending"), {
    id: "demo-leave-pending",
    leaveApplicationId: "SD2-LV-002",
    userProfileId: employees[2].id,
    userName: employees[2].name,
    managerId: ADMIN_ID,
    managerName: "Sensible Demo Administrator",
    leaveType: "Sick Leave",
    leaveNote: "Medical appointment",
    duration: "Half Day",
    noDays: 0.5,
    status: "REQUESTED",
    fromDate: localMillis(currentYear, currentMonth, currentDay, "00:00:00"),
    toDate: localMillis(currentYear, currentMonth, currentDay, "23:59:59"),
    createdDate: now - 3_600_000,
    dayId: dateKey(currentYear, currentMonth, currentDay),
    monthId: `${currentYear}-${pad(currentMonth)}`,
    remark: null,
  });

  [
    ["CL", "Casual Leave", true, 12],
    ["SL", "Sick Leave", true, 10],
    ["EL", "Earned Leave", true, 15],
    ["LWP", "Leave Without Pay", false, 0],
  ].forEach(([code, name, isPaid, maxPerYear]) => {
    write(subRef("LEAVE_TYPE", String(code)), {
      id: code,
      code,
      shortCode: code,
      name,
      description: `${name} demo policy`,
      isPaid,
      maxPerYear,
      accrualType: "YEARLY",
      carryForward: code === "EL",
      requiresApproval: true,
      allowHalfDay: true,
      isActive: true,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    });
  });
  employees.forEach((employee, index) => {
    const usedLeaves = index === 1 ? 1 : index % 2;
    write(subRef("LEAVE_BALANCE", `${employee.id}_${currentYear}`), {
      id: `${employee.id}_${currentYear}`,
      userId: employee.id,
      userName: employee.name,
      empCode: employee.empCode,
      designation: employee.designation,
      managerId: ADMIN_ID,
      managerName: "Sensible Demo Administrator",
      totalLeaves: 24,
      usedLeaves,
      remainingLeaves: 24 - usedLeaves,
      year: currentYear,
      isActive: true,
      lastUpdated: now,
      updatedBy: ADMIN_ID,
    });
  });

  [
    ["payroll-holiday", payrollYear, payrollMonth, payrollHolidayDay, "Demo Foundation Day"],
    ["current-holiday", currentYear, currentMonth, nearestWorkingDay(currentYear, currentMonth, 15), "Independence Day"],
  ].forEach(([id, year, month, day, name]) => {
    const date = dateKey(Number(year), Number(month), Number(day));
    write(subRef("HOLIDAY", String(id)), {
      id,
      title: name,
      name,
      date,
      dateString: date,
      year: String(year),
      type: "NATIONAL",
      isPaid: true,
      isActive: true,
      applicableStates: ["Maharashtra"],
      applicableOutlets: [OUTLET_ID],
      description: "Demo paid holiday",
      createdAt: now,
      lastUpdated: now,
      updatedBy: ADMIN_ID,
    });
  });
};

const seedPayroll = () => {
  const monthDays = daysInMonth(payrollYear, payrollMonth);
  const weeklyOff = Array.from({ length: monthDays }, (_, index) => index + 1)
    .filter((day) => isSunday(payrollYear, payrollMonth, day)).length;

  employees.forEach((employee, index) => {
    const absentDays = index === 2 ? 1 : 0;
    const paidLeave = index === 1 ? 1 : 0;
    const paidHolidays = 1;
    const presentDays = monthDays - weeklyOff - paidHolidays - paidLeave - absentDays;
    const payrollEmployee: Record<string, unknown> = {
      id: employee.empCode,
      userProfileId: employee.id,
      employeeRef: employee.id,
      name: employee.name,
      empCode: employee.empCode,
      department: employee.department,
      designation: employee.designation,
      workLocationState: "Maharashtra",
      dateOfJoining: employee.joiningDate,
      gender: employee.gender,
    };
    const salaryStructure: Record<string, unknown> = {
      salaryType: "MONTHLY",
      grossSalary: employee.salary,
      isMetroCity: true,
      earnings: payrollTools.deriveSalaryComponentsFromGross(employee.salary, {
        isMetroCity: true,
        earnings: payrollTools.SAMPLE_SALARY_EARNINGS,
      }),
      deductions: { loan: 0, advance: index === 2 ? 750 : 0, otherDeductions: 0 },
      payrollOptions: {
        pfApplicable: true,
        pfCeilingApplicable: true,
        esiApplicable: true,
        ptApplicable: true,
        lwfApplicable: true,
        bonusApplicable: true,
        gratuityApplicable: true,
        tdsApplicable: true,
        otApplicable: true,
      },
      attendanceSettings: {
        monthDayRule: "ACTUAL_DAYS",
        weeklyOffPaid: true,
        paidHolidayIncluded: true,
        leavePolicyId: "standard-demo-policy",
      },
    };
    const attendance: Record<string, unknown> = {
      employeeId: employee.empCode,
      month: payrollMonth,
      year: payrollYear,
      presentDays,
      paidLeave,
      weeklyOff,
      paidHolidays,
      absentDays,
      unpaidLeave: 0,
      monthDays,
      attendanceRecordCount: presentDays,
      pendingAttendanceDays: 0,
      otHours: index < 3 ? 4 + index : 0,
      overtimeHours: index < 3 ? 4 + index : 0,
      incentive: index < 3 ? 2_000 + index * 500 : 0,
      performanceIncentive: index === 0 ? 1_500 : 0,
      loanDeduction: 0,
      advanceDeduction: index === 2 ? 750 : 0,
      otherDeduction: 0,
      arrears: index === 4 ? 500 : 0,
    };
    const result = payrollTools.calculatePayroll({
      employee: payrollEmployee,
      salaryStructure,
      attendance,
      payrollMonth,
      payrollYear,
      state: "Maharashtra",
      tdsInput: { remainingMonths: Math.max(12 - payrollMonth + 1, 1) },
    });
    const salaryDocument = payrollTools.createEmployeeSalaryStructureDocument({
      employee: payrollEmployee,
      salaryStructure,
      preview: result,
      createdBy: ADMIN_ID,
      now: payrollMonthStart,
    });
    write(subRef("SALARY_MASTER", employee.id), {
      ...salaryDocument,
      id: employee.id,
      salaryRevisions: [{
        revisionId: `${employee.id}-${payrollYear}-01`,
        employeeId: employee.empCode,
        effectiveFrom: `${payrollYear}-01-01`,
        salaryStructure,
        reason: "Initial demo salary structure",
        approvedBy: ADMIN_ID,
        approvedAt: payrollMonthStart,
        updatedAt: payrollMonthStart,
        updatedBy: ADMIN_ID,
      }],
    });

    const payrollDocument = payrollTools.createPayrollRunDocument({
      result,
      attendance,
      createdBy: ADMIN_ID,
      outletId: OUTLET_ID,
      status: "PAID",
      idempotencyKey: `${OUTLET_ID}_${employee.empCode}_${payrollYear}_${payrollMonth}`,
      now: payrollMonthStart + 2_678_400_000,
    });
    const payrollId = `${OUTLET_ID}_${employee.empCode}_${payrollYear}_${payrollMonth}`;
    write(subRef("PAYROLL", payrollId), {
      ...payrollDocument,
      id: payrollId,
      outletId: OUTLET_ID,
      payrollId,
      approvedBy: ADMIN_ID,
      approvedAt: payrollMonthStart + 2_678_400_000,
      lockedBy: ADMIN_ID,
      lockedAt: payrollMonthStart + 2_678_500_000,
      paidBy: ADMIN_ID,
      paidAt: payrollMonthStart + 2_678_600_000,
      updatedAt: payrollMonthStart + 2_678_600_000,
    });
  });
};

const seedSalesAndOperations = () => {
  const sources = ["Website", "Facebook", "Google", "Indiamart", "Instagram", "JustDail"];
  const stages = ["NEW", "ASSIGNED", "FOLLOWUP", "WON", "LOST", "DISQUALIFIED"];
  const businesses = [
    "Greenfield Traders", "Nova Retail", "Bluebell Foods", "Urban Nest", "Peak Auto",
    "Sunrise Electricals", "Craftline Studio", "Metro Hardware", "FreshCart", "Orbit Systems",
    "Silverline Pharma", "Maple Furnishings", "Prime Packaging", "EcoBuild", "Apex Distributors",
  ];
  businesses.forEach((businessName, index) => {
    const employee = employees[index % 3];
    const stage = stages[index % stages.length];
    // The funnel and call-report pages default to Today. Keep every sales demo
    // record inside today's window so a fresh login always opens with data.
    const createdDate = todayStart + 28_800_000 + index * 1_200_000;
    const leadId = `demo-lead-${pad(index + 1)}`;
    const assignedTo = stage === "NEW" ? "" : employee.id;
    write(subRef("LEADS_MANAGEMENT", leadId), {
      id: leadId,
      leadRefId: leadId,
      logId: 20_000 + index,
      customerId: stage === "WON" ? `demo-customer-${pad(index + 1)}` : null,
      customerType: stage === "WON" ? "CUSTOMER" : "PROSPECT",
      enquiryType: "NEW_LEAD",
      businessName,
      username: ["Ishaan", "Saanvi", "Vihaan", "Diya", "Arjun"][index % 5] + " Demo",
      businessType: ["Dealer", "Retailer", "Distributor"][index % 3],
      mobile: `9200000${String(300 + index)}`,
      mobileAlt: "",
      phone: `9200000${String(300 + index)}`,
      email: `contact${index + 1}@example-demo.in`,
      area: ["Baner", "Kothrud", "Wakad"][index % 3],
      city: ["Pune", "Mumbai", "Nashik"][index % 3],
      state: "Maharashtra",
      source: sources[index % sources.length],
      priority: ["HIGH", "MEDIUM", "LOW"][index % 3],
      requirement: ["CRM annual plan", "Sales automation setup", "Field tracking licenses"][index % 3],
      comments: `Demo ${stage.toLowerCase()} lead with complete contact details`,
      remarks: "Seeded demo record",
      followUpName: stage === "FOLLOWUP" ? "Product demonstration" : "",
      assignedBy: assignedTo ? ADMIN_ID : "",
      assignedTo,
      assignedHistory: assignedTo ? [{ assignTo: assignedTo, assignBy: ADMIN_ID, assignAt: createdDate }] : [],
      leadTag: [index % 2 ? "Warm" : "Demo"],
      leadCampaign: "Sensible Demo Campaign",
      stage,
      status: index === 0 ? "RINGING" : stage,
      isCustomer: stage === "WON",
      isDealerLead: index % 2 === 0,
      isDuplicate: false,
      date: dateKey(currentYear, currentMonth, currentDay),
      leadDate: dateKey(currentYear, currentMonth, currentDay),
      time: "11:00 AM",
      createdDate,
      leadCreatedDate: createdDate,
      updatedDate: createdDate + 3_600_000,
    });

    if (index < 10) {
      const activityId = `demo-activity-${pad(index + 1)}`;
      const scheduledDate = todayStart + 32_400_000 + index * 900_000;
      write(subRef("LEAD_ACTIVITIES", activityId), {
        id: activityId,
        assignedTo: employee.id,
        leadRefId: leadId,
        leadName: businessName,
        description: ["Call decision maker", "Share quotation", "Schedule product demo"][index % 3],
        mode: index % 2 ? "Online" : "Offline",
        type: index % 2 ? "Follow Up" : "Meeting",
        priority: index % 3 === 0 ? "HIGH" : "MEDIUM",
        status: index < 5 ? "DONE" : "PENDING",
        productDealerPrice: 12_500,
        productMrpPrice: 15_000,
        productId: "demo-product-01",
        productName: "Sensible CRM Annual Plan",
        productType: "SUBSCRIPTION",
        createdDate: Timestamp.fromMillis(createdDate),
        createdDateInMili: createdDate,
        createdDateInMill: createdDate,
        scheduledDate,
        scheduledTime: scheduledDate,
      });
    }
    if (index < 15) {
      const callId = `demo-call-${pad(index + 1)}`;
      const callEmployee = employees[index % employees.length];
      write(subRef("CALL_LOGS", callId), {
        id: callId,
        name: businessName,
        number: `9200000${String(300 + index)}`,
        receiverName: callEmployee.name,
        receiverMobileNo: callEmployee.phone,
        direction: ["incoming", "outgoing", "missed", "rejected"][index % 4],
        durationSeconds: index % 3 === 2 ? 0 : 95 + index * 18,
        phoneAccountId: "SIM1",
        simLabel: "Sensible Demo SIM",
        simPhoneNumber: callEmployee.phone,
        subscriptionId: "1",
        deviceId: `demo-device-${(index % 3) + 1}`,
        department: "SALES",
        leadId,
        createdAt: createdDate,
        timestamp: createdDate,
        uploadedAt: new Date(createdDate).toISOString(),
      });
    }
  });

  employees.slice(0, 5).forEach((employee, index) => {
    write(subRef("EMPLOYEE_TARGETING", `${employee.id}_${currentYear}_${currentMonth}`), {
      id: `${employee.id}_${currentYear}_${currentMonth}`,
      zone: employee.zone === "Head Office" ? "Subscriptions" : employee.zone,
      saleExecutive: employee.name,
      saleExecutiveId: employee.id,
      decForecastNetSales: 150_000 + index * 25_000,
      achieveNetSales: 105_000 + index * 20_000,
      achievementPercentage: Math.round(((105_000 + index * 20_000) / (150_000 + index * 25_000)) * 100),
      order: index,
      month: currentMonth,
      year: currentYear,
      createdAt: monthStart,
      updatedAt: now,
    });
  });

  employees.slice(0, 3).forEach((employee, index) => {
    const customerId = `demo-customer-${pad(index + 1)}`;
    const mobile = `9300000${String(400 + index)}`;
    write(subRef("CUSTOMERS", customerId), {
      id: customerId,
      customerCode: `SDC-${pad(index + 1)}`,
      customerName: ["Neha Kapoor", "Aditya Rao", "Pooja Mehta"][index],
      businessName: ["Kapoor Enterprises", "Rao Retail", "Mehta Distributors"][index],
      businessType: ["Dealer", "Retailer", "Distributor"][index],
      mobile,
      normalizedMobile: mobile,
      email: `customer${index + 1}@example-demo.in`,
      city: ["Pune", "Mumbai", "Nashik"][index],
      state: "Maharashtra",
      area: "Demo Market Area",
      priority: "HIGH",
      source: sources[index],
      status: "ACTIVE",
      lifecycle: index === 0 ? "REPEAT_CUSTOMER" : "NEW_CUSTOMER",
      totalEnquiries: 2 + index,
      totalWon: 1 + index,
      totalLost: 0,
      createdDate: payrollMonthStart,
      updatedDate: now,
    });
    write(subRef("CUSTOMER_IDENTITIES", `MOBILE_${mobile}`), {
      id: `MOBILE_${mobile}`,
      identityType: "MOBILE",
      normalizedValue: mobile,
      customerId,
      createdDate: payrollMonthStart,
      updatedDate: now,
    });
  });
};

const seedExpensesInventoryAndMessages = () => {
  const categories = [
    ["travel", "Travel", 1],
    ["meals", "Meals", 2],
    ["office", "Office Supplies", 3],
    ["marketing", "Marketing", 4],
  ] as const;
  categories.forEach(([id, category, categoryNo]) => {
    write(subRef("EXPENSE_HEADER", id), { id, category, categoryNo, isActive: true });
  });
  const expenseStatuses = ["PENDING", "REVIEWED", "APPROVED", "REJECTED", "APPROVED", "PENDING"];
  const amounts = [850, 1_250, 2_400, 975, 3_200, 640];
  expenseStatuses.forEach((status, index) => {
    const employee = employees[index % employees.length];
    const id = `demo-expense-${pad(index + 1)}`;
    const createdDate = monthStart + (index + 2) * 86_400_000;
    write(subRef("EXPENSE", id), {
      id,
      amount: amounts[index],
      createdDate,
      updateDate: createdDate + 3_600_000,
      dateTime: new Date(createdDate).toISOString(),
      dayId: dayId(currentYear, currentMonth, Math.min(index + 2, currentDay)),
      monthId: `${currentYear}-${pad(currentMonth)}`,
      userId: employee.id,
      expCatRefId: categories[index % categories.length][0],
      purpose: ["Client visit", "Team lunch", "Printer supplies", "Demo campaign"][index % 4],
      invoiceNo: `SD2-INV-${1001 + index}`,
      invoiceDate: dateKey(currentYear, currentMonth, Math.min(index + 2, currentDay)),
      invoiceImage: "",
      image: "",
      paymentMode: index % 2 ? "UPI" : "CARD",
      journeyFrom: index % 2 ? "" : "Baner",
      journeyTo: index % 2 ? "" : "Hinjewadi",
      totalKm: index % 2 ? 0 : 18,
      travelMode: index % 2 ? "" : "Two Wheeler",
      status,
      editFlag: status === "PENDING",
      reviewedBy: ["REVIEWED", "APPROVED", "REJECTED"].includes(status) ? ADMIN_ID : "",
      reviewedAt: ["REVIEWED", "APPROVED", "REJECTED"].includes(status) ? createdDate + 7_200_000 : null,
      approvedBy: status === "APPROVED" ? ADMIN_ID : "",
      approvedAt: status === "APPROVED" ? createdDate + 10_800_000 : null,
      rejectedBy: status === "REJECTED" ? ADMIN_ID : "",
      rejectedAt: status === "REJECTED" ? createdDate + 10_800_000 : null,
      rejectionReason: status === "REJECTED" ? "Receipt details incomplete (demo)" : "",
      statusChangedBy: status === "PENDING" ? employee.id : ADMIN_ID,
      statusChangedAt: createdDate + 10_800_000,
      statusVersion: 1,
      budgetApplied: status === "APPROVED",
      budgetAllocationId: status === "APPROVED" ? `${currentYear}-${pad(currentMonth)}__DEPARTMENT__U0FMRVM` : "",
      budgetAppliedAmount: status === "APPROVED" ? amounts[index] : 0,
      budgetVersion: status === "APPROVED" ? 1 : 0,
    });
    if (status !== "PENDING") {
      write(subRef("EXPENSE", id).collection("STATUS_HISTORY").doc("history-01"), {
        id: "history-01",
        fromStatus: "PENDING",
        toStatus: status,
        reason: status === "REJECTED" ? "Receipt details incomplete (demo)" : "Demo workflow transition",
        changedBy: ADMIN_ID,
        changedAt: createdDate + 10_800_000,
      });
    }
  });
  const approvedUsed = amounts[2] + amounts[4];
  const allocationId = `${currentYear}-${pad(currentMonth)}__DEPARTMENT__U0FMRVM`;
  write(subRef("EXPENSE_BUDGET", allocationId), {
    id: allocationId,
    month: `${currentYear}-${pad(currentMonth)}`,
    targetType: "DEPARTMENT",
    targetId: "SALES",
    targetLabel: "Sales Department",
    originalAllocatedAmount: 50_000,
    allocatedAmount: 50_000,
    usedAmount: approvedUsed,
    remainingAmount: 50_000 - approvedUsed,
    approvedExpenseCount: 2,
    currency: "INR",
    notes: "Monthly demo travel and sales expense budget",
    status: "ACTIVE",
    revision: 1,
    createdBy: ADMIN_ID,
    createdAt: monthStart,
    updatedBy: ADMIN_ID,
    updatedAt: now,
  });

  const productCategories = ["CRM Subscriptions", "Hardware", "Add-ons"];
  productCategories.forEach((name, index) => {
    write(subRef("CATEGORY", `demo-category-${index + 1}`), {
      id: `demo-category-${index + 1}`,
      name,
      isDeleted: false,
      createdAt: now,
    });
  });
  const products = [
    ["demo-product-01", "Sensible CRM Annual Plan", "CRM-ANNUAL", 18_000, 15_000, "CRM Subscriptions"],
    ["demo-product-02", "Field Tracking Add-on", "TRACK-ADDON", 6_000, 4_500, "Add-ons"],
    ["demo-product-03", "Biometric Attendance Device", "BIO-DEVICE", 12_500, 10_000, "Hardware"],
    ["demo-product-04", "WhatsApp Automation Pack", "WA-PACK", 9_000, 7_500, "Add-ons"],
  ] as const;
  products.forEach(([id, name, sku, mrpPrice, price, category], index) => {
    write(subRef("PRODUCT", id), {
      id,
      name,
      sku,
      description: `${name} configured as a complete demo product`,
      category,
      brand: "Sensible Connect",
      mrpPrice,
      price,
      currentStock: 25 + index * 10,
      reorderLevel: 5,
      isDeleted: false,
      isAddOn: category === "Add-ons",
      minUnit: { length: "1", width: "1", height: "1", weight: "1", volume: "1" },
      customFields: { licenseType: category === "Hardware" ? "N/A" : "Annual" },
      uidMap: {
        GTIN: `89000000000${index + 1}`,
        ISBN: null,
        BatchId: `SD2-BATCH-${index + 1}`,
        QRCode: `SD2-${sku}`,
        IMEI: null,
        SerialNumber: category === "Hardware" ? `SD2-HW-${100 + index}` : null,
        MACAddress: null,
        VIN: null,
        RFID: null,
      },
      createdAt: payrollMonthStart,
      updatedAt: now,
    });
  });
  write(subRef("TRANSFER_REQUEST", "demo-transfer-01"), {
    id: "demo-transfer-01",
    productId: "demo-product-03",
    productName: "Biometric Attendance Device",
    fromWarehouse: "wh-1",
    toWarehouse: "wh-2",
    requestedQuantity: 5,
    acceptedQuantity: 5,
    status: "ACCEPTED",
    requestedBy: employees[4].id,
    requestedByName: employees[4].name,
    actionTakenBy: ADMIN_ID,
    actionTakenByName: "Sensible Demo Administrator",
    requestDate: now - 172_800_000,
    actionDate: now - 86_400_000,
    remarks: "Demo stock replenishment",
    createdAt: now - 172_800_000,
    updatedAt: now - 86_400_000,
  });
  write(subRef("TRANSFER_REQUEST", "demo-transfer-02"), {
    id: "demo-transfer-02",
    productId: "demo-product-02",
    productName: "Field Tracking Add-on",
    fromWarehouse: "wh-1",
    toWarehouse: "wh-3",
    requestedQuantity: 10,
    status: "PENDING",
    requestedBy: employees[4].id,
    requestedByName: employees[4].name,
    requestDate: now,
    remarks: "Pending demo transfer request",
    createdAt: now,
    updatedAt: now,
  });

  const eventId = "SD2-DEMO-EVENT-01";
  write(subRef("EVENTS", eventId), {
    id: eventId,
    eventId,
    outletId: OUTLET_ID,
    title: "Sensible CRM Demo Workshop",
    name: "Sensible CRM Demo Workshop",
    description: "Hands-on CRM, attendance, tracking and payroll feature demonstration.",
    terms: "Demo registration only. No payment is collected.",
    dateTime: new Date(now + 1_209_600_000).toISOString(),
    expiryDate: new Date(now + 1_123_200_000).toISOString(),
    address: "Sensible Demo House, Baner Road",
    city: "Pune",
    location: "Baner, Pune",
    registrationType: "free",
    isPaid: false,
    isFree: true,
    fees: 0,
    offer: 0,
    imageUrl: "",
    postLink: "",
    isActive: true,
    members: [
      {
        id: "SD2-EVT-MEMBER-01",
        eventId,
        outletId: OUTLET_ID,
        name: "Demo Participant",
        fullName: "Demo Participant",
        mobile: "9400000501",
        businessType: "Dealer",
        email: "participant@example-demo.in",
        companyName: "Participant Demo Company",
        city: "Pune",
        amount: 0,
        paymentStatus: "Free Registration",
        registrationDate: new Date(now - 86_400_000).toISOString(),
        registrationType: "free",
        isAgreed: true,
        acceptedTerms: true,
        isAttended: false,
      },
    ],
    createdAt: now,
    updatedAt: now,
  });

  ["renewal", "event", "crm", "others"].forEach((category, index) => {
    const id = `demo-whatsapp-${category}`;
    const messageTime = now - index * 3_600_000;
    write(subRef("WHATSAPP_MESSAGES", id), {
      id,
      mobile: `9500000${600 + index}`,
      integrated_number: "919999999999",
      category,
      customerName: `${category[0].toUpperCase()}${category.slice(1)} Demo Contact`,
      createdDateTime: new Date(messageTime).toISOString(),
      createdDateTimeMili: messageTime,
      updatedDateTime: new Date(messageTime).toISOString(),
      updatedDateTimeMili: messageTime,
      isRead: index % 2 === 0,
      unreadCount: index % 2,
      sentMsgList: [{
        message_uuid: `sd2-${category}-message`,
        request_id: `sd2-${category}-request`,
        content_type: "text",
        status: index % 2 === 0 ? "read" : "delivered",
        message_type: "text",
        direction: "outbound",
        failure_reason: null,
        template_name: `${category}_demo_template`,
        text: `This is a ${category} demo message from Sensible CRM.`,
        createdDateTimeMili: messageTime,
      }],
      replyMsgList: [],
      whatsappCategoryStats: { [category]: { all: 1, read: index % 2 === 0 ? 1 : 0, unread: index % 2 } },
      whatsappStatsVersion: 1,
    });
  });

  [
    ["demo-integration-facebook", "FB", "DEMO_FACEBOOK_KEY_NOT_CONNECTED"],
    ["demo-integration-google", "GOOGLE", "DEMO_GOOGLE_KEY_NOT_CONNECTED"],
  ].forEach(([id, type, integrationKey]) => {
    write(firestore.collection("INTEGRATION").doc(id), {
      id,
      outletId: OUTLET_ID,
      type,
      description: `${type} sandbox placeholder - intentionally inactive`,
      integrationKey,
      accessToken: "DEMO_TOKEN_NOT_CONNECTED",
      isActive: false,
      isDemo: true,
      createdDate: now,
      modifiedDate: now,
    });
  });
};

const verifySeed = async () => {
  const credentialsSnapshot = await firestore
    .collection("USER_PROFILE")
    .where("email", "==", ADMIN_EMAIL)
    .where("password", "==", ADMIN_PASSWORD)
    .limit(1)
    .get();
  const collections = [
    "TEAM_TREE", "ATTENDANCE", "TRACKING_HISTORY", "SALARY_MASTER", "PAYROLL",
    "LEADS_MANAGEMENT", "LEAD_ACTIVITIES", "CALL_LOGS", "EXPENSE", "LEAVE_APPLICATION",
    "EMPLOYEE_TARGETING", "PRODUCT", "TRANSFER_REQUEST", "EVENTS", "WHATSAPP_MESSAGES",
    "MODULE_SUBSCRIPTION",
  ];
  const counts = Object.fromEntries(
    await Promise.all(collections.map(async (name) => {
      const aggregate = await outletRef.collection(name).count().get();
      return [name, aggregate.data().count];
    })),
  );
  const [todayLeads, todayCalls, todayActivities, todayAttendance, todayTracking] =
    await Promise.all([
      outletRef.collection("LEADS_MANAGEMENT")
        .where("createdDate", ">=", todayStart)
        .where("createdDate", "<=", todayEnd)
        .count().get(),
      outletRef.collection("CALL_LOGS")
        .where("timestamp", ">=", todayStart)
        .where("timestamp", "<=", todayEnd)
        .count().get(),
      outletRef.collection("LEAD_ACTIVITIES")
        .where("scheduledDate", ">=", todayStart)
        .where("scheduledDate", "<=", todayEnd)
        .count().get(),
      outletRef.collection("ATTENDANCE")
        .where("dayId", "==", dayId(currentYear, currentMonth, currentDay))
        .count().get(),
      outletRef.collection("TRACKING_HISTORY")
        .where("timestamp", ">=", Timestamp.fromMillis(todayStart))
        .where("timestamp", "<=", Timestamp.fromMillis(todayEnd))
        .count().get(),
    ]);
  const defaultViewCounts = {
    leads: todayLeads.data().count,
    calls: todayCalls.data().count,
    activities: todayActivities.data().count,
    attendance: todayAttendance.data().count,
    tracking: todayTracking.data().count,
  };
  if (credentialsSnapshot.empty) throw new Error("Admin credentials were not written");
  if (counts.TEAM_TREE < 6) throw new Error(`Expected at least 6 team members, found ${counts.TEAM_TREE}`);
  if (counts.SALARY_MASTER < 5 || counts.PAYROLL < 5) {
    throw new Error(`Expected at least 5 salaries and payrolls, found ${counts.SALARY_MASTER}/${counts.PAYROLL}`);
  }
  if (counts.ATTENDANCE < 100 || counts.TRACKING_HISTORY < 10) {
    throw new Error("Attendance or tracking demo data is incomplete");
  }
  if (Object.values(defaultViewCounts).some((count) => count === 0)) {
    throw new Error(`A default daily view is empty: ${JSON.stringify(defaultViewCounts)}`);
  }
  return { counts, defaultViewCounts };
};

const main = async () => {
  const payrollModulePath = "../../src/payroll/index.ts";
  payrollTools = (await import(payrollModulePath)) as unknown as PayrollTools;
  await seedCore();
  seedAttendanceAndTracking();
  seedPayroll();
  seedSalesAndOperations();
  seedExpensesInventoryAndMessages();
  await runWrites();
  const verification = await verifySeed();
  console.log(JSON.stringify({
    success: true,
    outletId: OUTLET_ID,
    outletName: "sensibledemo2.0",
    adminUsername: ADMIN_EMAIL,
    employeeCount: employees.length,
    payrollPeriod: `${payrollYear}-${pad(payrollMonth)}`,
    ...verification,
  }, null, 2));
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
