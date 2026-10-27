import type { LeaveDocument, LeaveItem, LeaveStatusInput, LeaveTypeDocument, LeaveTypeItem } from "../../types/leave.types.js";
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
const text = (value: unknown) => typeof value === "string" ? value : "";
const optional = (value: unknown) => text(value) || undefined;
export const mapLeaveItem = (document: LeaveDocument): LeaveItem => {
  const data = document.data;
  const remark = typeof data.remark === "string" || data.remark === null ? data.remark : undefined;
  const status: LeaveItem["status"] = data.status === "APPROVED" || data.status === "REJECTED" ? data.status : "REQUESTED";
  return { id: document.id, ...(optional(data.actionTakenBy) ? { actionTakenBy: text(data.actionTakenBy) } : {}), createdDate: number(data.createdDate), dayId: text(data.dayId), duration: text(data.duration), fromDate: number(data.fromDate), ...(optional(data.leaveApplicationId) ? { leaveApplicationId: text(data.leaveApplicationId) } : {}), leaveNote: text(data.leaveNote), leaveType: text(data.leaveType), managerId: text(data.managerId), managerName: text(data.managerName), monthId: text(data.monthId), noDays: number(data.noDays), ...(remark === undefined ? {} : { remark }), status, toDate: number(data.toDate), ...(number(data.updateddate) > 0 ? { updateddate: number(data.updateddate) } : {}), ...(optional(data.userName) ? { userName: text(data.userName) } : {}), userProfileId: text(data.userProfileId) };
};
export const mapLeaveTypeItem = (document: LeaveTypeDocument): LeaveTypeItem => ({ id: document.id, name: text(document.data.name).trim(), shortCode: text(document.data.shortCode).trim() });
export const calculateLeaveBalanceAdjustment = ({ currentStatus, nextStatus, noDays, totalLeaves, usedLeaves }: { currentStatus: string; nextStatus: LeaveStatusInput["status"]; noDays: number; totalLeaves: number; usedLeaves: number }) => {
  const delta = nextStatus === "APPROVED" && currentStatus !== "APPROVED" ? noDays : nextStatus === "REJECTED" && currentStatus === "APPROVED" ? -noDays : 0;
  if (!delta) return null;
  const nextUsedLeaves = Math.max(0, usedLeaves + delta);
  return { remainingLeaves: totalLeaves - nextUsedLeaves, usedLeaves: nextUsedLeaves };
};
