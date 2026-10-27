import type { CallDepartmentSummary, CallLogDocument, CallReportQuery, CallReportResult, CallSummary } from "../../types/call.types.js";

const text = (value: unknown) => typeof value === "string" ? value : "";
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
const empty = (): CallSummary => ({ total: 0, incoming: 0, outgoing: 0, missed: 0, rejected: 0, duration: 0 });
const add = (summary: CallSummary, direction: string, duration: number) => {
  summary.total += 1; summary.duration += duration;
  if (direction === "incoming") summary.incoming += 1;
  else if (direction === "outgoing") summary.outgoing += 1;
  else if (direction === "missed") summary.missed += 1;
  else summary.rejected += 1;
};

export const buildCallReport = (records: Iterable<CallLogDocument>): CallReportResult => {
  const summary = empty();
  const departments: Record<string, CallDepartmentSummary> = {};
  for (const record of records) {
    const department = text(record.data.department) || "Other";
    const employee = text(record.data.receiverName) || "Unknown";
    const direction = text(record.data.direction).toLowerCase();
    const duration = number(record.data.durationSeconds);
    const departmentEntry = (departments[department] ??= { summary: empty(), employees: {} });
    const employeeSummary = (departmentEntry.employees[employee] ??= empty());
    add(summary, direction, duration); add(departmentEntry.summary, direction, duration); add(employeeSummary, direction, duration);
  }
  const topPerformers = Object.entries(departments).flatMap(([dept, entry]) =>
    Object.entries(entry.employees).map(([name, employee]) => ({ name, dept, total: employee.total, duration: employee.duration })),
  ).sort((a, b) => b.total - a.total).slice(0, 3);
  return { summary, departments, availableDepartments: Object.keys(departments).sort(), topPerformers };
};

export const filterCallReport = (report: CallReportResult, query: Pick<CallReportQuery, "department" | "search">): CallReportResult => {
  const search = query.search?.trim().toLowerCase();
  const departments = Object.fromEntries(Object.entries(report.departments).flatMap(([department, entry]) => {
    if (query.department && department !== query.department) return [];
    const employees = Object.fromEntries(Object.entries(entry.employees).filter(([employee]) => !search || employee.toLowerCase().includes(search)));
    return Object.keys(employees).length ? [[department, { ...entry, employees }]] : [];
  }));
  return { ...report, departments };
};

export const normalizeCallNumberVariants = (mobile = "") => {
  let digits = mobile.replace(/\D/g, "");
  if (digits.length > 10) digits = digits.slice(-10);
  return digits ? [...new Set([`+91${digits}`, digits])] : [];
};
