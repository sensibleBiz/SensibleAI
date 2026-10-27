import { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Card,
  DatePicker,
  Form,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Typography,
} from "antd";
import {
  EditOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { useSelector } from "react-redux";
import dayjs, { Dayjs } from "dayjs";
import type { RootState } from "@/app/store";
import { useMessageApi } from "@/shared/hooks";
import { formatEmployeeName } from "@/shared/utils/helperFunctions";
import { teamTreeApi } from "@/features/team";
import { payrollApi } from "../api/payrollApi";
import { attendanceApi } from "@/features/attendance";
import { deriveSalaryComponentsFromGross } from "@/features/payroll/domain/utils";
import type { EmployeeSalaryStructureDocument } from "@/features/payroll/domain";
import fileExport, { TableColumn } from "@/shared/utils/fileExport";
import type { AttendanceRecord } from "@/features/attendance";
import type { HolidayDTO, LeaveApplication } from "@/features/leave";
import type { SalaryMaster } from "../types/types";
import type { TeamTreeDTO } from "@/features/team";

const { Title, Text } = Typography;
const BRAND_NAVY = "#0a3750";

interface EmployeeRow {
  employee: TeamTreeDTO;
  salary?: SalaryMaster;
  calculation?: SalaryCalculation;
  status: "Configured" | "Not Configured";
}

interface SalaryCalculation {
  absentDays: number;
  basicSalary: number;
  dailyDetails: DailySalaryDetail[];
  earlyCutDays: number;
  grossSalary: number;
  holidayDays: number;
  lateCutDays: number;
  lateDays: number;
  leaveDays: number;
  monthDays: number;
  monthlySalary: number;
  netSalary: number;
  otAmount: number;
  otDays: number;
  otHours: string;
  payDays: number;
  perDaySalary: number;
  presentDays: number;
  totalDeduction: number;
  totalHours: string;
  woffDays: number;
}

interface DailySalaryDetail {
  dateLabel: string;
  day: number;
  inTime: string;
//   ot: string;
  outTime: string;
//   shift: string;
//   status: string;
//   totalHours: string;
}

interface FormValues {
  employeeId?: string;
  monthlySalary?: number;
  otAllowed?: boolean;
  otRatePerHour?: number;
  pfDeduction?: number;
  esiDeduction?: number;
  professionalTax?: number;
  advanceDeduction?: number;
  otherDeduction?: number;
  isActive?: boolean;
}

type SalaryReportExportRow = Record<string, string | number>;

const mapSalaryStructureToMaster = (
  structure: EmployeeSalaryStructureDocument,
): SalaryMaster => ({
  userId: structure.userProfileId || structure.userId,
  userName: structure.userName || structure.employeeName || "",
  empCode: structure.empCode || "",
  designation: structure.designation || "",
  department: structure.department || "",
  monthlySalary: Number(structure.monthlySalary ?? structure.grossSalary ?? 0),
  salaryType: "MONTHLY",
  otAllowed: structure.otApplicable === true,
  otRatePerHour: 0,
  pfDeduction: 0,
  esiDeduction: 0,
  professionalTax: 0,
  advanceDeduction: 0,
  otherDeduction: 0,
  isActive: structure.isActive !== false,
  createdAt: structure.createdAt ?? Date.now(),
  updatedAt: structure.updatedAt ?? Date.now(),
});

const SalaryMasterPage = () => {
  const outletId = useSelector(
    (state: RootState) => state?.appState?.outletInfo?.id
  );
  const messageApi = useMessageApi();

  const [form] = Form.useForm<FormValues>();
  const tableWrapperRef = useRef<HTMLDivElement | null>(null);
  const tableDragRef = useRef({
    isDragging: false,
    pointerId: 0,
    scrollLeft: 0,
    startX: 0,
  });
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const rowsRef = useRef<EmployeeRow[]>([]);
  const [employees, setEmployees] = useState<TeamTreeDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [calculationLoading, setCalculationLoading] = useState(false);
  const [calculationMonth, setCalculationMonth] = useState<Dayjs>(dayjs());
  const calculationMonthRef = useRef<Dayjs>(calculationMonth);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<TeamTreeDTO | null>(
    null
  );
  const [editingSalary, setEditingSalary] = useState<SalaryMaster | null>(null);

  const formatDuration = useCallback((hours: number, minutes: number) =>
    `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`, []);

  const timeToDecimalHours = useCallback((time: string): number => {
    if (!time || !time.includes(":")) return 0;
    const [hours, minutes] = time.split(":").map(Number);
    return Number((hours + minutes / 60).toFixed(2));
  }, []);

  const formatTime = useCallback((timestamp?: number) => {
    if (!timestamp || timestamp === 0) return "00:00";
    const time = timestamp < 1e12 ? timestamp * 1000 : timestamp;
    return dayjs(time).format("HH:mm");
  }, []);

  const calculateHours = useCallback((
    checkIn?: number,
    checkOut?: number
  ): { hours: number; minutes: number } => {
    if (!checkIn || !checkOut || checkIn === 0 || checkOut === 0) {
      return { hours: 0, minutes: 0 };
    }

    const inTime = checkIn < 1e12 ? checkIn * 1000 : checkIn;
    const outTime = checkOut < 1e12 ? checkOut * 1000 : checkOut;
    const diffMs = outTime - inTime;

    if (diffMs <= 0) return { hours: 0, minutes: 0 };

    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    return {
      hours: Math.floor(totalMinutes / 60),
      minutes: totalMinutes % 60,
    };
  }, []);

  const calculateOvertime = useCallback((
    checkIn?: number,
    checkOut?: number,
    standardHours = 8
  ) => {
    const { hours, minutes } = calculateHours(checkIn, checkOut);
    const workedMinutes = hours * 60 + minutes;
    const standardMinutes = standardHours * 60;

    if (workedMinutes > standardMinutes) {
      const otMinutes = workedMinutes - standardMinutes;
      return {
        hours: Math.floor(otMinutes / 60),
        minutes: otMinutes % 60,
      };
    }

    return { hours: 0, minutes: 0 };
  }, [calculateHours]);

  const isLate = useCallback((checkIn?: number, expectedTime = "09:30"): boolean => {
    if (!checkIn || checkIn === 0) return false;
    const inTime = checkIn < 1e12 ? checkIn * 1000 : checkIn;
    const [expHour, expMin] = expectedTime.split(":").map(Number);
    const expected = dayjs(inTime).hour(expHour).minute(expMin).second(0);
    return dayjs(inTime).isAfter(expected);
  }, []);

  const calculateSalaryAmount = useCallback(({
    monthlySalary,
    monthDays,
    payDays,
    otHours,
    otAllowed,
    otRatePerHour,
    pfDeduction,
    esiDeduction,
    professionalTax,
    advanceDeduction,
    otherDeduction,
  }: {
    monthlySalary: number;
    monthDays: number;
    payDays: number;
    otHours: number;
    otAllowed: boolean;
    otRatePerHour: number;
    pfDeduction: number;
    esiDeduction: number;
    professionalTax: number;
    advanceDeduction: number;
    otherDeduction: number;
  }) => {
    const perDaySalary = monthDays > 0 ? monthlySalary / monthDays : 0;
    const basicSalary = perDaySalary * payDays;
    const otAmount = otAllowed ? otHours * otRatePerHour : 0;
    const totalDeduction =
      pfDeduction +
      esiDeduction +
      professionalTax +
      advanceDeduction +
      otherDeduction;
    const grossSalary = basicSalary + otAmount;
    const netSalary = grossSalary - totalDeduction;

    return {
      perDaySalary: Math.round(perDaySalary),
      basicSalary: Math.round(basicSalary),
      otAmount: Math.round(otAmount),
      grossSalary: Math.round(grossSalary),
      totalDeduction: Math.round(totalDeduction),
      netSalary: Math.round(netSalary),
    };
  }, []);

  const getHolidayMap = useCallback((holidays: HolidayDTO[], month: Dayjs) => {
    const monthStart = month.startOf("month");
    const monthEnd = month.endOf("month");
    const holidayMap = new Map<string, HolidayDTO>();

    holidays.forEach((holiday) => {
      const holidayDate = holiday.dateString
        ? dayjs(holiday.dateString)
        : typeof holiday.date === "number"
        ? dayjs(holiday.date)
        : dayjs(holiday.date);

      if (
        holidayDate.isValid() &&
        !holidayDate.isBefore(monthStart, "day") &&
        !holidayDate.isAfter(monthEnd, "day")
      ) {
        holidayMap.set(holidayDate.format("DD-MM-YYYY"), holiday);
      }
    });

    return holidayMap;
  }, []);

  const loadSalaryCalculations = useCallback(async (
    sourceRows: EmployeeRow[],
    month: Dayjs
  ) => {
    if (!outletId || sourceRows.length === 0) return;

    setCalculationLoading(true);

    try {
      const monthStart = month.startOf("month");
      const monthEnd = month.endOf("month");
      const monthStartTimestamp = monthStart.valueOf();
      const monthEndTimestamp = monthEnd.valueOf();

      let monthlyAttendance: AttendanceRecord[];
      let approvedLeavesForMonth: LeaveApplication[];
      let holidayList: HolidayDTO[];

      const monthly = await attendanceApi.getMonthly({ outletId, month: month.format("YYYY-MM"), includeSalary: true });
      monthlyAttendance = monthly.attendance as AttendanceRecord[];
      approvedLeavesForMonth = monthly.leaves.filter((leave) => leave.fromDate <= monthEndTimestamp && leave.toDate >= monthStartTimestamp) as LeaveApplication[];
      holidayList = monthly.holidays as HolidayDTO[];

      const holidayMap = getHolidayMap(holidayList, month);
      const attendanceMap = new Map<string, Map<string, AttendanceRecord>>();
      monthlyAttendance.forEach((attendance) => {
        if (!attendance.userId || !attendance.dayId) return;
        if (!attendanceMap.has(attendance.userId)) {
          attendanceMap.set(attendance.userId, new Map());
        }
        attendanceMap.get(attendance.userId)?.set(attendance.dayId, attendance);
      });

      const leaveMap = new Map<string, LeaveApplication[]>();
      approvedLeavesForMonth.forEach((leave) => {
        if (!leaveMap.has(leave.userProfileId)) {
          leaveMap.set(leave.userProfileId, []);
        }
        leaveMap.get(leave.userProfileId)?.push(leave);
      });

      const daysInMonth = month.daysInMonth();
      const rowsWithCalculations = sourceRows.map((row) => {
        const userAttendance = attendanceMap.get(row.employee.userProfileId);
        const userLeaves = leaveMap.get(row.employee.userProfileId) || [];

        let presentDays = 0;
        let absentDays = 0;
        let lateDays = 0;
        let woffDays = 0;
        let leaveDays = 0;
        let totalHours = 0;
        let totalMinutes = 0;
        let otDays = 0;
        let totalOtHours = 0;
        let totalOtMinutes = 0;
        let holidayDays = 0;
        const coffDays = 0;
        const lwpDays = 0;
        const lateCutDays = 0;
        const earlyCutDays = 0;
        const dailyDetails: DailySalaryDetail[] = [];

        for (let day = 1; day <= daysInMonth; day += 1) {
          const date = month.date(day);
          const dayId = date.format("DD-MM-YYYY");
          const dateLabel = date.format("DD MMM ddd");
          const dayStart = date.startOf("day").valueOf();
          const dayEnd = date.endOf("day").valueOf();
          const isSunday = date.day() === 0;
          const attendance = userAttendance?.get(dayId);
          const leaveOnDay = userLeaves.find(
            (leave) => leave.fromDate <= dayEnd && leave.toDate >= dayStart
          );
          const holiday = holidayMap.get(dayId);

          if (holiday) {
            holidayDays += 1;
            dailyDetails.push({
              dateLabel,
              day,
            //   shift: "",
              inTime: "",
              outTime: "",
             // ot: "",
            //   totalHours: "",
            //   status: "H",
            });
          } else if (isSunday) {
            woffDays += 1;
            dailyDetails.push({
              dateLabel,
              day,
            //   shift: "",
              inTime: "",
              outTime: "",
             // ot: "",
            //   totalHours: "",
            //   status: "WO",
            });
          } else if (leaveOnDay) {
            leaveDays += 1;
            dailyDetails.push({
              dateLabel,
              day,
            //   shift: "",
              inTime: "",
              outTime: "",
             // ot: "",
            //   totalHours: "",
            //   status: "L",
            });
          } else if (attendance?.isPresent) {
            presentDays += 1;

            const { hours: otHours, minutes: otMinutes } = calculateOvertime(
              attendance.checkInTime,
              attendance.checkOutTime
            );
            totalOtHours += otHours;
            totalOtMinutes += otMinutes;

            const { hours, minutes } = calculateHours(
              attendance.checkInTime,
              attendance.checkOutTime
            );
            totalHours += hours;
            totalMinutes += minutes;

            if (otHours > 0 || otMinutes > 0) {
              otDays += 1;
            }

            if (isLate(attendance.checkInTime)) {
              lateDays += 1;
              dailyDetails.push({
                dateLabel,
                day,
            //   shift: "GS",
                inTime: formatTime(attendance.checkInTime),
                outTime: formatTime(attendance.checkOutTime),
               // ot: formatDuration(otHours, otMinutes),
                // totalHours: totalHoursForDay,
                // status: "p*",
              });
            } else {
              dailyDetails.push({
                dateLabel,
                day,
            //   shift: "GS",
                inTime: formatTime(attendance.checkInTime),
                outTime: formatTime(attendance.checkOutTime),
               // ot: formatDuration(otHours, otMinutes),
                // totalHours: totalHoursForDay,
                // status: "P",
              });
            }
          } else {
            absentDays += 1;
            dailyDetails.push({
              dateLabel,
              day,
            //   shift: "",
              inTime: "",
              outTime: "",
              //ot: "",
              // totalHours: "",
              // status: "A",
            });
          }
        }

        const finalHours = totalHours + Math.floor(totalMinutes / 60);
        const finalMinutes = totalMinutes % 60;
        const totalHoursText = formatDuration(finalHours, finalMinutes);

        const finalOtHours = totalOtHours + Math.floor(totalOtMinutes / 60);
        const finalOtMinutes = totalOtMinutes % 60;
        const otHoursText = formatDuration(finalOtHours, finalOtMinutes);

        const payDays =
          presentDays +
          woffDays +
          holidayDays +
          leaveDays +
          coffDays -
          lwpDays -
          lateCutDays -
          earlyCutDays;

        const salary = row.salary;
        const calculatedSalary = salary
          ? calculateSalaryAmount({
              monthlySalary: salary.monthlySalary || 0,
              monthDays: daysInMonth,
              payDays,
              otHours: timeToDecimalHours(otHoursText),
              otAllowed: salary.otAllowed || false,
              otRatePerHour: salary.otRatePerHour || 0,
              pfDeduction: salary.pfDeduction || 0,
              esiDeduction: salary.esiDeduction || 0,
              professionalTax: salary.professionalTax || 0,
              advanceDeduction: salary.advanceDeduction || 0,
              otherDeduction: salary.otherDeduction || 0,
            })
          : {
              perDaySalary: 0,
              basicSalary: 0,
              otAmount: 0,
              grossSalary: 0,
              totalDeduction: 0,
              netSalary: 0,
            };

        return {
          ...row,
          calculation: {
            absentDays,
            basicSalary: calculatedSalary.basicSalary,
            dailyDetails,
            earlyCutDays,
            grossSalary: calculatedSalary.grossSalary,
            holidayDays,
            lateCutDays,
            lateDays,
            leaveDays,
            monthDays: daysInMonth,
            monthlySalary: salary?.monthlySalary || 0,
            netSalary: calculatedSalary.netSalary,
            otAmount: calculatedSalary.otAmount,
            otDays,
            otHours: otHoursText,
            payDays,
            perDaySalary: calculatedSalary.perDaySalary,
            presentDays,
            totalDeduction: calculatedSalary.totalDeduction,
            totalHours: totalHoursText,
            woffDays,
          },
        };
      });

      setRows(rowsWithCalculations);
    } catch (error) {
      console.error("Failed to calculate salaries", error);
      messageApi.error("Failed to calculate salaries");
    } finally {
      setCalculationLoading(false);
    }
  }, [
    outletId,
    messageApi,
    getHolidayMap,
    calculateOvertime,
    calculateHours,
    isLate,
    formatTime,
    formatDuration,
    calculateSalaryAmount,
    timeToDecimalHours,
  ]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    calculationMonthRef.current = calculationMonth;
  }, [calculationMonth]);

  const loadData = useCallback(async () => {
    if (!outletId) {
      rowsRef.current = [];
      setRows([]);
      setEmployees([]);
      return;
    }

    rowsRef.current = [];
    setLoading(true);

    try {
      const [teamResult, overview] = await Promise.all([
          teamTreeApi.list(outletId, true),
          payrollApi.getOverview(outletId),
        ]);
        const teamList = teamResult.items.filter(
          (employee) => employee.isActive && employee.isOnPayRoll && employee.userProfileId,
        );
        const salaryMap = new Map(
          overview.map((record) => [
            record.employeeId,
            mapSalaryStructureToMaster(record.salaryStructure),
          ]),
        );
        const mergedRows: EmployeeRow[] = teamList.map((employee) => {
          const salary = salaryMap.get(employee.userProfileId);
          return {
            employee,
            salary,
            status: salary ? "Configured" : "Not Configured",
          };
        });
        setEmployees(teamList);
        setRows(mergedRows);
      await loadSalaryCalculations(mergedRows, calculationMonthRef.current);
    } catch (error) {
      console.error("Failed to load salary master data", error);
      messageApi.error("Failed to load salary master data");
    } finally {
      setLoading(false);
    }
  }, [outletId, messageApi, loadSalaryCalculations]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const currentRows = rowsRef.current;
    if (currentRows.length) {
      void loadSalaryCalculations(currentRows, calculationMonth);
    }
  }, [calculationMonth, loadSalaryCalculations]);

  const openAddModal = () => {
    setEditingSalary(null);
    setSelectedEmployee(null);
    setModalVisible(true);

    window.setTimeout(() => {
      form.resetFields();
      form.setFieldsValue({
        employeeId: undefined,
        monthlySalary: 0,
        otAllowed: false,
        otRatePerHour: 0,
        pfDeduction: 0,
        esiDeduction: 0,
        professionalTax: 0,
        advanceDeduction: 0,
        otherDeduction: 0,
        isActive: true,
      });
    }, 0);
  };

  const openEditModal = (row: EmployeeRow) => {
    const salary = row.salary ?? null;
    setEditingSalary(salary);
    setSelectedEmployee(row.employee);
    setModalVisible(true);

    window.setTimeout(() => {
      form.setFieldsValue({
        employeeId: row.employee.userProfileId,
        monthlySalary: salary?.monthlySalary ?? 0,
        otAllowed: salary?.otAllowed ?? false,
        otRatePerHour: salary?.otRatePerHour ?? 0,
        pfDeduction: salary?.pfDeduction ?? 0,
        esiDeduction: salary?.esiDeduction ?? 0,
        professionalTax: salary?.professionalTax ?? 0,
        advanceDeduction: salary?.advanceDeduction ?? 0,
        otherDeduction: salary?.otherDeduction ?? 0,
        isActive: salary?.isActive ?? true,
      });
    }, 0);
  };

  const handleEmployeeSelect = (userId: string) => {
    const employee = employees.find((item) => item.userProfileId === userId) || null;
    setSelectedEmployee(employee);
  };

  const handleSave = async (values: FormValues) => {
    if (!outletId) {
      messageApi.error("Outlet ID not found");
      return;
    }

    const employee = employees.find((item) => item.userProfileId === values.employeeId);

    if (!employee) {
      messageApi.error("Please select an employee");
      return;
    }

    try {
      const grossSalary = Number(values.monthlySalary ?? 0);
      const month = dayjs();
      await payrollApi.saveSalaryStructure({
          outletId,
          employee: {
            id: employee.userProfileId,
            userProfileId: employee.userProfileId,
            name: employee.userName || employee.empCode || employee.userProfileId,
            empCode: employee.empCode,
            department: employee.department,
            designation: employee.designation,
          },
          salaryStructure: {
            salaryType: "MONTHLY",
            grossSalary,
            earnings: deriveSalaryComponentsFromGross(grossSalary, { isMetroCity: false }),
            deductions: {
              loan: 0,
              advance: Number(values.advanceDeduction ?? 0),
              otherDeductions: Number(values.otherDeduction ?? 0),
            },
            payrollOptions: {
              pfApplicable: true,
              esiApplicable: true,
              ptApplicable: true,
              lwfApplicable: true,
              otApplicable: Boolean(values.otAllowed),
            },
          },
          month: (month.month() + 1) as 1,
          year: month.year(),
          effectiveFrom: month.format("YYYY-MM-DD"),
        });

      messageApi.success("Salary master saved successfully");
      setModalVisible(false);
      form.resetFields();
      setSelectedEmployee(null);
      setEditingSalary(null);
      await loadData();
    } catch (error) {
      console.error("Failed to save salary master", error);
      messageApi.error("Failed to save salary master");
    }
  };

  const getTableScrollElement = () =>
    tableWrapperRef.current?.querySelector<HTMLElement>(".ant-table-body") ||
    tableWrapperRef.current?.querySelector<HTMLElement>(".ant-table-content") ||
    null;

  const handleTableWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const scrollElement = getTableScrollElement();
    if (!scrollElement || scrollElement.scrollWidth <= scrollElement.clientWidth) {
      return;
    }

    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    const maxScrollLeft = scrollElement.scrollWidth - scrollElement.clientWidth;
    const nextScrollLeft = scrollElement.scrollLeft + delta;
    const canScroll =
      (delta < 0 && scrollElement.scrollLeft > 0) ||
      (delta > 0 && scrollElement.scrollLeft < maxScrollLeft);

    if (!canScroll) return;

    event.preventDefault();
    scrollElement.scrollLeft = Math.max(
      0,
      Math.min(maxScrollLeft, nextScrollLeft)
    );
  };

  const handleTablePointerDown = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    const target = event.target as HTMLElement;
    const scrollElement = getTableScrollElement();
    if (
      event.button !== 0 ||
      Boolean(target.closest("button, input, textarea, select, .ant-picker")) ||
      !scrollElement ||
      scrollElement.scrollWidth <= scrollElement.clientWidth
    ) {
      return;
    }

    tableDragRef.current = {
      isDragging: true,
      pointerId: event.pointerId,
      scrollLeft: scrollElement.scrollLeft,
      startX: event.clientX,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.style.cursor = "grabbing";
    event.currentTarget.style.userSelect = "none";
    event.preventDefault();
  };

  const handleTablePointerMove = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (
      !tableDragRef.current.isDragging ||
      tableDragRef.current.pointerId !== event.pointerId
    ) {
      return;
    }

    const scrollElement = getTableScrollElement();
    if (!scrollElement) return;

    event.preventDefault();
    scrollElement.scrollLeft =
      tableDragRef.current.scrollLeft -
      (event.clientX - tableDragRef.current.startX);
  };

  const stopTableDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (
      tableDragRef.current.pointerId &&
      tableDragRef.current.pointerId !== event.pointerId
    ) {
      return;
    }

    tableDragRef.current.isDragging = false;
    tableDragRef.current.pointerId = 0;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    event.currentTarget.style.cursor = "";
    event.currentTarget.style.userSelect = "";
  };

  const getDailyDetailValue = (
    row: EmployeeRow,
    day: number,
    field: keyof Omit<DailySalaryDetail, "day" | "dateLabel">
  ) =>
    row.calculation?.dailyDetails.find((detail) => detail.day === day)?.[
      field
    ] ?? "";

  const dayColumns = Array.from(
    { length: calculationMonth.daysInMonth() },
    (_, index) => {
      const day = index + 1;
      const date = calculationMonth.date(day);

      return {
        title: (
          <div className="leading-tight">
            <div>{date.format("DD")}</div>
            <div>{date.format("ddd")}</div>
          </div>
        ),
        children: [
        //   {
        //     title: "Shift",
        //     key: `day_${day}_shift`,
        //     width: 70,
        //     render: (_value: unknown, row: EmployeeRow) =>
        //       getDailyDetailValue(row, day, "shift"),
        //   },
        //   {
        //     title: "In",
        //     key: `day_${day}_in`,
        //     width: 70,
        //     render: (_value: unknown, row: EmployeeRow) =>
        //       getDailyDetailValue(row, day, "inTime"),
        //   },
        //   {
        //     title: "Out",
        //     key: `day_${day}_out`,
        //     width: 70,
        //     render: (_value: unknown, row: EmployeeRow) =>
        //       getDailyDetailValue(row, day, "outTime"),
        //   },
        //   {
        //     title: "OT",
        //     key: `day_${day}_ot`,
        //     width: 70,
        //     render: (_value: unknown, row: EmployeeRow) =>
        //       getDailyDetailValue(row, day, "ot"),
        //   },
        //   {
        //     title: "Total Hrs",
        //     key: `day_${day}_total`,
        //     width: 90,
        //     render: (_value: unknown, row: EmployeeRow) =>
        //       getDailyDetailValue(row, day, "totalHours"),
        //   },
        //   {
        //     title: "Status",
        //     key: `day_${day}_status`,
        //     width: 80,
        //     render: (_value: unknown, row: EmployeeRow) =>
        //       getDailyDetailValue(row, day, "status"),
        //   },
          {
            title: "In/Out",
            key: `day_${day}_check`,
            width: 56,
            render: (_value: unknown, row: EmployeeRow) => {
              const checkIn = getDailyDetailValue(row, day, "inTime");
              const checkOut = getDailyDetailValue(row, day, "outTime");

              if (!checkIn && !checkOut) return "-";

              return (
                <div className="text-[11px] leading-tight">
                  <div>{checkIn || "-"}</div>
                  <div>{checkOut || "-"}</div>
                </div>
              );
            },
          },
        ],
      };
    }
  );

  const columns = [
    // {
    //   title: "Emp Code",
    //   dataIndex: ["employee", "empCode"],
    //   key: "empCode",
    //   fixed: "left" as const,
    //   width: 110,
    //   render: (value?: string) => value || "-",
    // },
    // {
    //   title: "Employee Name",
    //   dataIndex: ["employee", "userName"],
    //   key: "userName",
    //   fixed: "left" as const,
    //   width: 170,
    //   render: (value?: string) => value || "-",
    // },
    // {
    //   title: "Designation",
    //   dataIndex: ["employee", "designation"],
    //   key: "designation",
    //   render: (value?: string) => value || "-",
    // },
    // {
    //   title: "Department",
    //   dataIndex: ["employee", "department"],
    //   key: "department",
    //   render: (value?: string) => value || "-",
    // },
    {
      title: "Employee",
      key: "employee",
      fixed: "left" as const,
      width: 170,
      render: (_value: unknown, row: EmployeeRow) => (
        <div className="text-xs leading-tight">
          <div className="font-medium">
            {formatEmployeeName(row.employee.userName)}
          </div>
          <Text type="secondary">{row.employee.empCode || "-"}</Text>
          <div>
            <Text type="secondary">{row.employee.department || "-"}</Text>
          </div>
        </div>
      ),
    },
    ...dayColumns,
    {
      title: "Present Days",
      dataIndex: ["calculation", "presentDays"],
      key: "presentDays",
      width: 110,
      render: (_value: number | undefined, row: EmployeeRow) =>
        row.calculation?.presentDays ?? 0,
    },
    {
      title: "WOFF",
      dataIndex: ["calculation", "woffDays"],
      key: "woffDays",
      width: 80,
      render: (_value: number | undefined, row: EmployeeRow) =>
        row.calculation?.woffDays ?? 0,
    },
    {
      title: "Leave",
      dataIndex: ["calculation", "leaveDays"],
      key: "leaveDays",
      width: 80,
      render: (_value: number | undefined, row: EmployeeRow) =>
        row.calculation?.leaveDays ?? 0,
    },
    {
      title: "COFF",
      key: "coffDays",
      width: 80,
      render: () => 0,
    },
    // {
    //   title: "OT Hrs",
    //   dataIndex: ["calculation", "otHours"],
    //   key: "otHours",
    //   width: 90,
    //   render: (_value: string | undefined, row: EmployeeRow) =>
    //     row.calculation?.otHours ?? "00:00",
    // },
    {
      title: "OT Days",
      dataIndex: ["calculation", "otDays"],
      key: "otDays",
      width: 90,
      render: (_value: number | undefined, row: EmployeeRow) =>
        row.calculation?.otDays ?? 0,
    },
    {
      title: "Absent Days",
      dataIndex: ["calculation", "absentDays"],
      key: "absentDays",
      width: 110,
      render: (_value: number | undefined, row: EmployeeRow) =>
        row.calculation?.absentDays ?? 0,
    },
    {
      title: "Late Days",
      dataIndex: ["calculation", "lateDays"],
      key: "lateDays",
      width: 100,
      render: (_value: number | undefined, row: EmployeeRow) =>
        row.calculation?.lateDays ?? 0,
    },
    {
      title: "Late Cut",
      dataIndex: ["calculation", "lateCutDays"],
      key: "lateCutDays",
      width: 90,
      render: (_value: number | undefined, row: EmployeeRow) =>
        row.calculation?.lateCutDays ?? 0,
    },
    {
      title: "Late Leave",
      key: "lateLeaveDays",
      width: 100,
      render: () => 0,
    },
    {
      title: "LWP",
      key: "lwpDays",
      width: 80,
      render: () => 0,
    },
    {
      title: "Pay Days",
      dataIndex: ["calculation", "payDays"],
      key: "payDays",
      width: 90,
      render: (_value: number | undefined, row: EmployeeRow) =>
        row.calculation?.payDays ?? 0,
    },
    {
      title: "Early Days",
      key: "earlyDays",
      width: 100,
      render: () => 0,
    },
    {
      title: "Early Cut",
      dataIndex: ["calculation", "earlyCutDays"],
      key: "earlyCutDays",
      width: 100,
      render: (_value: number | undefined, row: EmployeeRow) =>
        row.calculation?.earlyCutDays ?? 0,
    },
    {
      title: "Monthly Salary",
      dataIndex: ["salary", "monthlySalary"],
      key: "monthlySalary",
      width: 130,
      render: (_value: number | undefined, row: EmployeeRow) =>
        row.salary?.monthlySalary ?? 0,
    },
    {
      title: "Per Day Salary",
      dataIndex: ["calculation", "perDaySalary"],
      key: "perDaySalary",
      width: 130,
      render: (_value: number | undefined, row: EmployeeRow) =>
        row.calculation?.perDaySalary ?? 0,
    },
    {
      title: "Basic Salary",
      dataIndex: ["calculation", "basicSalary"],
      key: "basicSalary",
      width: 120,
      render: (_value: number | undefined, row: EmployeeRow) =>
        row.calculation?.basicSalary ?? 0,
    },
    {
      title: "OT Amount",
      dataIndex: ["calculation", "otAmount"],
      key: "otAmount",
      width: 110,
      render: (_value: number | undefined, row: EmployeeRow) =>
        row.calculation?.otAmount ?? 0,
    },
    {
      title: "Gross Salary",
      dataIndex: ["calculation", "grossSalary"],
      key: "grossSalary",
      width: 120,
      render: (_value: number | undefined, row: EmployeeRow) =>
        row.calculation?.grossSalary ?? 0,
    },
    {
      title: "PF",
      dataIndex: ["salary", "pfDeduction"],
      key: "pfDeduction",
      width: 80,
      render: (_value: number | undefined, row: EmployeeRow) =>
        row.salary?.pfDeduction ?? 0,
    },
    {
      title: "ESI",
      dataIndex: ["salary", "esiDeduction"],
      key: "esiDeduction",
      width: 80,
      render: (_value: number | undefined, row: EmployeeRow) =>
        row.salary?.esiDeduction ?? 0,
    },
    {
      title: "PT",
      dataIndex: ["salary", "professionalTax"],
      key: "professionalTax",
      width: 80,
      render: (_value: number | undefined, row: EmployeeRow) =>
        row.salary?.professionalTax ?? 0,
    },
    {
      title: "Other Deduction",
      dataIndex: ["salary", "otherDeduction"],
      key: "otherDeduction",
      width: 130,
      render: (_value: number | undefined, row: EmployeeRow) =>
        row.salary?.otherDeduction ?? 0,
    },
    {
      title: "Total Deduction",
      dataIndex: ["calculation", "totalDeduction"],
      key: "totalDeduction",
      width: 130,
      render: (_value: number | undefined, row: EmployeeRow) =>
        row.calculation?.totalDeduction ?? 0,
    },
    {
      title: "Net Salary",
      dataIndex: ["calculation", "netSalary"],
      key: "netSalary",
      width: 120,
      render: (_value: number | undefined, row: EmployeeRow) => (
        <Text strong style={{ color: "#389e0d" }}>
          {row.calculation?.netSalary ?? 0}
        </Text>
      ),
    },
    {
      title: "Total Hrs (Monthly)",
      dataIndex: ["calculation", "totalHours"],
      key: "totalHours",
      width: 150,
      render: (_value: string | undefined, row: EmployeeRow) =>
        row.calculation?.totalHours ?? "00:00",
    },
    {
      title: "Action",
      key: "action",
      render: (_: unknown, row: EmployeeRow) => (
        <Button
          type="link"
          icon={<EditOutlined />}
          onClick={() => openEditModal(row)}
          style={{ color: BRAND_NAVY }}
        >
          Edit
        </Button>
      ),
    },
  ];

  const getExportFileName = (extension: "pdf" | "xlsx") =>
    `Salary_Report_${calculationMonth.format("MM_YYYY")}.${extension}`;

  const getSalaryReportExport = () => {
    const dayExportColumns: TableColumn<SalaryReportExportRow>[] = Array.from(
      { length: calculationMonth.daysInMonth() },
      (_, index) => {
        const day = index + 1;
        const date = calculationMonth.date(day);
        return {
          title: `${date.format("DD MMM ddd")} In/Out`,
          dataIndex: `day_${day}`,
          width: 12,
        };
      }
    );

    const exportColumns: TableColumn<SalaryReportExportRow>[] = [
      { title: "Employee", dataIndex: "employee", width: 24 },
      ...dayExportColumns,
      { title: "Present Days", dataIndex: "presentDays", width: 12 },
      { title: "WOFF", dataIndex: "woffDays", width: 8 },
      { title: "Leave", dataIndex: "leaveDays", width: 8 },
      { title: "COFF", dataIndex: "coffDays", width: 8 },
      { title: "OT Hrs", dataIndex: "otHours", width: 10 },
      { title: "OT Days", dataIndex: "otDays", width: 10 },
      { title: "Absent Days", dataIndex: "absentDays", width: 12 },
      { title: "Late Days", dataIndex: "lateDays", width: 10 },
      { title: "Late Cut", dataIndex: "lateCutDays", width: 10 },
      { title: "Late Leave", dataIndex: "lateLeaveDays", width: 10 },
      { title: "LWP", dataIndex: "lwpDays", width: 8 },
      { title: "Pay Days", dataIndex: "payDays", width: 10 },
      { title: "Early Days", dataIndex: "earlyDays", width: 10 },
      { title: "Early Cut", dataIndex: "earlyCutDays", width: 10 },
      { title: "Monthly Salary", dataIndex: "monthlySalary", width: 14 },
      { title: "Per Day Salary", dataIndex: "perDaySalary", width: 14 },
      { title: "Basic Salary", dataIndex: "basicSalary", width: 14 },
      { title: "OT Amount", dataIndex: "otAmount", width: 12 },
      { title: "Gross Salary", dataIndex: "grossSalary", width: 14 },
      { title: "PF", dataIndex: "pf", width: 8 },
      { title: "ESI", dataIndex: "esi", width: 8 },
      { title: "PT", dataIndex: "pt", width: 8 },
      { title: "Other Deduction", dataIndex: "otherDeduction", width: 14 },
      { title: "Total Deduction", dataIndex: "totalDeduction", width: 14 },
      { title: "Net Salary", dataIndex: "netSalary", width: 14 },
      { title: "Total Hrs (Monthly)", dataIndex: "totalHours", width: 16 },
    ];

    const exportRows: SalaryReportExportRow[] = rows.map((row) => {
      const calculation = row.calculation;
      const exportRow: SalaryReportExportRow = {
        employee: [
          row.employee.userName || "-",
          row.employee.empCode || "-",
          row.employee.department || "-",
        ].join(" / "),
        presentDays: calculation?.presentDays ?? 0,
        woffDays: calculation?.woffDays ?? 0,
        leaveDays: calculation?.leaveDays ?? 0,
        coffDays: 0,
        otHours: calculation?.otHours ?? "00:00",
        otDays: calculation?.otDays ?? 0,
        absentDays: calculation?.absentDays ?? 0,
        lateDays: calculation?.lateDays ?? 0,
        lateCutDays: calculation?.lateCutDays ?? 0,
        lateLeaveDays: 0,
        lwpDays: 0,
        payDays: calculation?.payDays ?? 0,
        earlyDays: 0,
        earlyCutDays: calculation?.earlyCutDays ?? 0,
        monthlySalary: calculation?.monthlySalary ?? row.salary?.monthlySalary ?? 0,
        perDaySalary: calculation?.perDaySalary ?? 0,
        basicSalary: calculation?.basicSalary ?? 0,
        otAmount: calculation?.otAmount ?? 0,
        grossSalary: calculation?.grossSalary ?? 0,
        pf: row.salary?.pfDeduction ?? 0,
        esi: row.salary?.esiDeduction ?? 0,
        pt: row.salary?.professionalTax ?? 0,
        otherDeduction: row.salary?.otherDeduction ?? 0,
        totalDeduction: calculation?.totalDeduction ?? 0,
        netSalary: calculation?.netSalary ?? 0,
        totalHours: calculation?.totalHours ?? "00:00",
      };

      for (let day = 1; day <= calculationMonth.daysInMonth(); day += 1) {
        const detail = calculation?.dailyDetails.find(
          (item) => item.day === day
        );
        exportRow[`day_${day}`] =
          detail && (detail.inTime || detail.outTime)
            ? `${detail.inTime || "-"} / ${detail.outTime || "-"}`
            : "-";
      }

      return exportRow;
    });

    return { exportColumns, exportRows };
  };

  const getSalaryReportPdfExport = () => {
    const exportColumns: TableColumn<SalaryReportExportRow>[] = [
      { title: "Employee", dataIndex: "employee", width: 28 },
      { title: "Present Days", dataIndex: "presentDays", width: 12 },
      { title: "WOFF", dataIndex: "woffDays", width: 8 },
      { title: "Leave", dataIndex: "leaveDays", width: 8 },
      { title: "OT Hrs", dataIndex: "otHours", width: 12 },
      { title: "OT Days", dataIndex: "otDays", width: 10 },
      { title: "Absent Days", dataIndex: "absentDays", width: 10 },
      { title: "Late Days", dataIndex: "lateDays", width: 10 },
      { title: "Pay Days", dataIndex: "payDays", width: 10 },
      { title: "Monthly Salary", dataIndex: "monthlySalary", width: 14 },
      { title: "Gross Salary", dataIndex: "grossSalary", width: 14 },
      { title: "Total Deduction", dataIndex: "totalDeduction", width: 14 },
      { title: "Net Salary", dataIndex: "netSalary", width: 14 },
      { title: "Total Hrs", dataIndex: "totalHours", width: 14 },
    ];

    const exportRows: SalaryReportExportRow[] = rows.map((row) => {
      const calculation = row.calculation;
      return {
        employee: [
          row.employee.userName || "-",
          row.employee.empCode || "-",
          row.employee.department || "-",
        ].join(" / "),
        presentDays: calculation?.presentDays ?? 0,
        woffDays: calculation?.woffDays ?? 0,
        leaveDays: calculation?.leaveDays ?? 0,
        otHours: calculation?.otHours ?? "00:00",
        otDays: calculation?.otDays ?? 0,
        absentDays: calculation?.absentDays ?? 0,
        lateDays: calculation?.lateDays ?? 0,
        payDays: calculation?.payDays ?? 0,
        monthlySalary: calculation?.monthlySalary ?? row.salary?.monthlySalary ?? 0,
        grossSalary: calculation?.grossSalary ?? 0,
        totalDeduction: calculation?.totalDeduction ?? 0,
        netSalary: calculation?.netSalary ?? 0,
        totalHours: calculation?.totalHours ?? "00:00",
      };
    });

    return { exportColumns, exportRows };
  };

  const handleExportExcel = () => {
    if (!rows.length) {
      messageApi.warning("No salary report data to export");
      return;
    }

    const { exportColumns, exportRows } = getSalaryReportExport();
    fileExport.exportToExcel(
      exportRows,
      exportColumns,
      getExportFileName("xlsx"),
      "Salary Report"
    );
  };

  const handleExportPDF = () => {
    if (!rows.length) {
      messageApi.warning("No salary report data to export");
      return;
    }
    const { exportColumns, exportRows } = getSalaryReportPdfExport();
    fileExport.exportToPDF(exportRows, exportColumns, getExportFileName("pdf"), {
      format: "a3",
      margin: { top: 30, left: 12, right: 12, bottom: 20 },
    });
  };

  return (
    <div className="bg-slate-50 p-6 min-h-screen">
      <Card
        className="!rounded-xl border-0 shadow-sm"
        title={
          <Title level={3} style={{ margin: 0, color: BRAND_NAVY }}>
            Salary Master
          </Title>
        }
        extra={
          <Space wrap>
            <DatePicker
              picker="month"
              value={calculationMonth}
              onChange={(value) => setCalculationMonth(value || dayjs())}
              allowClear={false}
            />
            <Button
              icon={<FileExcelOutlined />}
              onClick={handleExportExcel}
              disabled={loading || calculationLoading}
            >
              Excel
            </Button>
            <Button
              icon={<FilePdfOutlined />}
              onClick={handleExportPDF}
              disabled={loading || calculationLoading}
              style={{ color: "#ff3228", borderColor: "#ff3228" }}
            >
              PDF
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openAddModal}
              style={{ backgroundColor: BRAND_NAVY, borderColor: BRAND_NAVY }}
            >
              Add Salary
            </Button>
          </Space>
        }
      >
        <Text type="secondary">
          Manage salary details and view monthly salary calculations for active
          payroll employees.
        </Text>

        <div
          ref={tableWrapperRef}
          onPointerCancel={stopTableDrag}
          onPointerDown={handleTablePointerDown}
          onPointerLeave={stopTableDrag}
          onPointerMove={handleTablePointerMove}
          onPointerUp={stopTableDrag}
          onWheel={handleTableWheel}
          className="salary-report-table"
          style={{
            cursor: "grab",
            marginTop: 16,
            overflowX: "auto",
          }}
        >
          <style>
            {`
              .salary-report-table .ant-table {
                font-size: 12px;
              }

              .salary-report-table .ant-table-thead > tr > th,
              .salary-report-table .ant-table-tbody > tr > td {
                padding: 4px 6px;
                white-space: nowrap;
              }

              .salary-report-table .ant-table-thead > tr > th {
                text-align: center;
              }
            `}
          </style>
          <Table
            rowKey={(row) => row.employee.userProfileId || row.employee.id || row.employee.empCode || row.employee.userName}
            columns={columns}
            dataSource={rows}
            loading={loading || calculationLoading}
            pagination={{ pageSize: 10 }}
            scroll={{ x: "max-content" }}
            bordered
          />
        </div>
      </Card>

      <Modal
        title={editingSalary ? "Edit Salary" : "Add Salary"}
        open={modalVisible}
        forceRender
        onCancel={() => {
          setModalVisible(false);
          setSelectedEmployee(null);
          setEditingSalary(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        okText="Save"
        okButtonProps={{ style: { backgroundColor: BRAND_NAVY, borderColor: BRAND_NAVY } }}
        width={760}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          initialValues={{
            monthlySalary: 0,
            otAllowed: false,
            otRatePerHour: 0,
            pfDeduction: 0,
            esiDeduction: 0,
            professionalTax: 0,
            advanceDeduction: 0,
            otherDeduction: 0,
            isActive: true,
          }}
        >
          <Form.Item
            label="Employee"
            name="employeeId"
            rules={[{ required: true, message: "Employee is required" }]}
          >
            <Select
              placeholder="Select employee"
              options={employees.map((employee) => ({
                label: `${employee.empCode || ""} - ${formatEmployeeName(
                  employee.userName
                )}`.trim(),
                value: employee.userProfileId,
              }))}
              onChange={handleEmployeeSelect}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>

          {selectedEmployee && (
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary">
                {formatEmployeeName(selectedEmployee.userName)} • {selectedEmployee.empCode || "-"} {/*• {selectedEmployee.designation || "-"} */}
              </Text>
            </div>
          )}

          <Form.Item
            label="Monthly Salary"
            name="monthlySalary"
            rules={[
              { required: true, message: "Monthly salary is required" },
              { type: "number", min: 0, message: "Monthly salary must be 0 or greater" },
            ]}
          >
            <InputNumber style={{ width: "100%" }} min={0} precision={2} />
          </Form.Item>

          <Form.Item label="OT Allowed" name="otAllowed" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item noStyle dependencies={["otAllowed"]}>
            {() => (
              <Form.Item label="OT Rate Per Hour" name="otRatePerHour">
                <InputNumber
                  style={{ width: "100%" }}
                  min={0}
                  precision={2}
                  disabled={!form.getFieldValue("otAllowed")}
                />
              </Form.Item>
            )}
          </Form.Item>

          <Form.Item label="PF Deduction" name="pfDeduction">
            <InputNumber style={{ width: "100%" }} min={0} precision={2} />
          </Form.Item>

          <Form.Item label="ESI Deduction" name="esiDeduction">
            <InputNumber style={{ width: "100%" }} min={0} precision={2} />
          </Form.Item>

          <Form.Item label="Professional Tax" name="professionalTax">
            <InputNumber style={{ width: "100%" }} min={0} precision={2} />
          </Form.Item>

          <Form.Item label="Advance Deduction" name="advanceDeduction">
            <InputNumber style={{ width: "100%" }} min={0} precision={2} />
          </Form.Item>

          <Form.Item label="Other Deduction" name="otherDeduction">
            <InputNumber style={{ width: "100%" }} min={0} precision={2} />
          </Form.Item>

          <Form.Item label="Active" name="isActive" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SalaryMasterPage;
