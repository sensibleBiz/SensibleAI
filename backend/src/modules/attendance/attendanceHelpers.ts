import type { AttendanceDailyRow, AttendanceRecordDocument, AttendanceTeamMember, LeaveApplicationRecord } from "../../types/attendance.types.js";
const text = (value: unknown) => typeof value === "string" ? value : "";
export const buildDailyAttendanceRows = ({ attendance, dayEnd, dayId, dayStart, leaves, team }: { attendance: AttendanceRecordDocument[]; dayEnd: number; dayId: string; dayStart: number; leaves: LeaveApplicationRecord[]; team: AttendanceTeamMember[] }): AttendanceDailyRow[] => {
  const attendanceMap = new Map(attendance.map((record) => [text(record.data.userId), record]));
  const leaveMap = new Map(leaves.filter((leave) => leave.userProfileId && leave.fromDate <= dayEnd && leave.toDate >= dayStart).map((leave) => [leave.userProfileId, leave]));
  return team.map((member) => {
    const record = attendanceMap.get(member.userProfileId);
    if (record) return { ...record.data, id: record.id, attendanceStatus: "PRESENT", dayId, empCode: member.empCode ?? text(record.data.empCode) ?? "NA", isPresent: true, userId: member.userProfileId, userName: member.userName || text(record.data.userName) || "NA" };
    const leave = leaveMap.get(member.userProfileId);
    if (leave) return { id: `${member.userProfileId}_leave`, attendanceStatus: "ON_LEAVE", dayId, empCode: member.empCode ?? "NA", leaveType: leave.leaveType || "Leave", userId: member.userProfileId, userName: member.userName || "NA" };
    return { id: `${member.userProfileId}_absent`, attendanceStatus: "ABSENT", dayId, empCode: member.empCode ?? "NA", isPresent: false, userId: member.userProfileId, userName: member.userName || "NA" };
  });
};
