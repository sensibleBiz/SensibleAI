import type {
  EmployeeSalaryStructureDocument,
  EmployeeStatutoryProfile,
  PayrollRunDocument,
  PayrollRunStatus,
} from "./types";
import { PAYROLL_FIRESTORE_COLLECTIONS } from "./firestoreSchema";
import { buildPayrollKey } from "./payrollWorkflow";

export interface PayrollMigrationInput {
  outletId: string;
  salaryStructures: EmployeeSalaryStructureDocument[];
  payrollRuns: PayrollRunDocument[];
  dryRun?: boolean;
  now?: number;
}

export interface PayrollMigrationWrite {
  path: string;
  action: "set" | "update";
  data: Record<string, unknown>;
}

export interface PayrollMigrationPlan {
  dryRun: boolean;
  writes: PayrollMigrationWrite[];
  warnings: string[];
}

const maskTrailing = (value?: string, visibleDigits = 4) => {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/g, "");
  const visible = normalized.slice(-visibleDigits);
  return `${"*".repeat(Math.max(normalized.length - visible.length, 0))}${visible}`;
};

const normalizeStatus = (status: PayrollRunStatus): PayrollRunStatus => {
  if (status === "GENERATED") return "CALCULATED";
  return status;
};

export const buildPayrollMigrationPlan = ({
  outletId,
  salaryStructures,
  payrollRuns,
  dryRun = true,
  now = Date.now(),
}: PayrollMigrationInput): PayrollMigrationPlan => {
  const warnings: string[] = [];
  const writes: PayrollMigrationWrite[] = [];

  salaryStructures.forEach((structure) => {
    const employeeId = structure.employeeId || structure.userProfileId || structure.userId;
    if (!employeeId) {
      warnings.push("Skipped salary structure without employeeId/userProfileId.");
      return;
    }

    const statutoryProfile: EmployeeStatutoryProfile = {
      employeeId,
      panMasked: maskTrailing(undefined),
      uanMasked: maskTrailing(undefined),
      esicNumberMasked: maskTrailing(undefined),
      pfApplicable: structure.pfApplicable,
      pfExcludedEmployee: false,
      existingPfMember: structure.pfApplicable,
      pfHigherWageOption: false,
      epsEligible: true,
      esiApplicable: structure.esiApplicable,
      taxRegime: "NEW",
      residentStatus: "RESIDENT",
      gender: structure.gender,
      bankAccountMasked: maskTrailing(undefined),
    };

    writes.push({
      path: `OUTLETS/${outletId}/${PAYROLL_FIRESTORE_COLLECTIONS.EMPLOYEE_STATUTORY_PROFILE}/${employeeId}`,
      action: "set",
      data: {
        ...statutoryProfile,
        migratedAt: now,
      },
    });

    writes.push({
      path: `OUTLETS/${outletId}/SALARY_STRUCTURES/${employeeId}/REVISIONS/${structure.createdAt || now}`,
      action: "set",
      data: {
        revisionId: String(structure.createdAt || now),
        employeeId,
        effectiveFrom: structure.joiningDate || new Date(now).toISOString().slice(0, 10),
        components: {
          basic: structure.basic,
          hra: structure.hra,
          da: structure.da,
          conveyance: structure.conveyance,
          medical: structure.medical,
          specialAllowance: structure.specialAllowance,
          incentive: structure.incentive,
          otherEarnings: structure.otherAllowance,
        },
        reason: "Legacy salary master migration",
        approvedBy: structure.createdBy || "migration",
        approvedAt: structure.updatedAt || now,
        previousRevisionId: undefined,
        sourceCollection: "SALARY_MASTER",
      },
    });
  });

  payrollRuns.forEach((run) => {
    const payrollKey =
      run.payrollKey ||
      buildPayrollKey({
        outletId,
        employeeId: run.employeeId,
        payrollYear: run.year,
        payrollMonth: run.month,
      });
    const status = normalizeStatus(run.status);

    writes.push({
      path: `OUTLETS/${outletId}/PAYROLL_RUNS/${payrollKey}/EMPLOYEE_PAYROLLS/${run.employeeId}`,
      action: "set",
      data: {
        ...run,
        payrollKey,
        runId: payrollKey,
        status,
        migratedAt: now,
      },
    });

    writes.push({
      path: `OUTLETS/${outletId}/PAYROLL_RUNS/${payrollKey}/AUDIT_LOGS/${payrollKey}_MIGRATED`,
      action: "set",
      data: {
        auditId: `${payrollKey}_MIGRATED`,
        action: "GENERATED",
        payrollRunId: payrollKey,
        employeeId: run.employeeId,
        performedBy: "migration",
        performedAt: now,
        newStatus: status,
        reason: dryRun
          ? "Dry-run migration preview"
          : "Legacy payroll migrated into versioned payroll schema",
      },
    });
  });

  return {
    dryRun,
    writes,
    warnings,
  };
};

