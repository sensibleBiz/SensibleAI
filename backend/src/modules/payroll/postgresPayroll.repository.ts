/**
 * Firestore SALARY_MASTER.document ↔ crm.employee_salary_structures.document (jsonb)
 * Firestore PAYROLL ↔ crm.payroll_runs.document (jsonb) + payroll_key
 */
import type { QueryResultRow } from "pg";
import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import { LOCKED_PAYROLL_STATUSES } from "../../payroll-engine/payrollWorkflow.js";
import type {
  EmployeeSalaryStructureDocument,
  PayrollEmployee,
  PayrollRunDocument,
  SalaryStructureRevision,
} from "../../payroll-engine/types.js";
import type { AttendanceSalary } from "../../types/attendance.types.js";

const revisionSort = (left: SalaryStructureRevision, right: SalaryStructureRevision) =>
  left.effectiveFrom.localeCompare(right.effectiveFrom);

const mergeRevisions = (
  existing: SalaryStructureRevision[] = [],
  incoming: SalaryStructureRevision[] = [],
) => {
  const revisions = new Map(existing.map((revision) => [revision.effectiveFrom, revision]));
  for (const revision of incoming) revisions.set(revision.effectiveFrom, revision);
  return [...revisions.values()].sort(revisionSort);
};

const resolvePayrollWriteAction = ({
  existing,
  incoming,
  summaryExists,
}: {
  existing?: PayrollRunDocument;
  incoming: PayrollRunDocument;
  summaryExists: boolean;
}): "WRITE" | "REUSE" | "REUSE_AND_BACKFILL_SUMMARY" => {
  if (!existing) return "WRITE";
  if (LOCKED_PAYROLL_STATUSES.includes(existing.status)) {
    throw new AppError(
      409,
      `Payroll is ${existing.status} and cannot be overwritten`,
      "PAYROLL_LOCKED",
    );
  }
  if (existing.calculationHash === incoming.calculationHash) {
    return summaryExists ? "REUSE" : "REUSE_AND_BACKFILL_SUMMARY";
  }
  return "WRITE";
};

const mapSalaryDocument = (row: QueryResultRow & { document: EmployeeSalaryStructureDocument; id: string }) => ({
  ...row.document,
  id: row.id,
});

const mapPayrollDocument = (row: QueryResultRow & { document: PayrollRunDocument; id: string }) => ({
  ...row.document,
  id: row.id,
});

const toAttendanceSalary = (
  row: QueryResultRow & { id: string; user_id: string; document: EmployeeSalaryStructureDocument },
): AttendanceSalary => {
  const doc = row.document as EmployeeSalaryStructureDocument & Record<string, unknown>;
  const monthlySalary = Number(doc.monthlySalary ?? doc.grossSalary ?? 0);
  return {
    id: row.id,
    userId: row.user_id,
    monthlySalary,
    otAllowed: doc.otApplicable === true,
    otRatePerHour: 0,
    pfDeduction: Number(doc.pfDeduction ?? 0),
    esiDeduction: Number(doc.esiDeduction ?? 0),
    professionalTax: Number(doc.professionalTax ?? 0),
    advanceDeduction: Number(doc.advanceDeduction ?? 0),
    otherDeduction: Number(doc.otherDeduction ?? 0),
    isActive: doc.isActive !== false,
  };
};

export class PostgresPayrollRepository {
  async resolveOutletBusiness(database: TransactionDatabase, tenantId: string, outletId: string) {
    const result = await database.client.query<{ business_id: string }>(
      "SELECT business_id FROM tenancy.outlets WHERE tenant_id = $1 AND id = $2 AND active",
      [tenantId, outletId],
    );
    return result.rows[0]?.business_id ?? null;
  }

  async getActivePayrollEmployee(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    employeeId: string,
  ): Promise<PayrollEmployee | null> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(employeeId);
    const result = await database.client.query<QueryResultRow & {
      user_id: string; display_name: string; emp_code: string;
      department: string | null; designation: string | null;
    }>(`
      SELECT usr.id AS user_id, usr.display_name, team.emp_code, team.department, team.department AS designation
      FROM crm.team_memberships team
      JOIN iam.users usr ON usr.id = team.user_id
      WHERE team.tenant_id = $1 AND team.outlet_id = $2 AND team.active AND team.is_on_payroll
        AND (${isUuid ? "team.user_id = $3::uuid OR team.user_profile_id = $3::uuid OR team.emp_code = $3::text" : "team.emp_code = $3"})
      LIMIT 1`, [tenantId, outletId, employeeId]);
    const row = result.rows[0];
    if (!row) return null;
    const empCode = String(row.emp_code ?? "");
    const userProfileId = String(row.user_id);
    return {
      id: empCode || userProfileId,
      userProfileId,
      employeeRef: userProfileId,
      name: String(row.display_name ?? empCode ?? userProfileId),
      ...(empCode ? { empCode } : {}),
      ...(row.department ? { department: String(row.department) } : {}),
      ...(row.designation ? { designation: String(row.designation) } : {}),
    };
  }

  async getSalaryStructure(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    employeeId: string,
  ): Promise<EmployeeSalaryStructureDocument | null> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(employeeId);
    const result = await database.client.query<{ id: string; document: EmployeeSalaryStructureDocument }>(
      `SELECT id, document FROM crm.employee_salary_structures
       WHERE tenant_id = $1 AND outlet_id = $2 AND (${isUuid ? "user_id = $3::uuid OR emp_code = $3::text" : "emp_code = $3"})
       LIMIT 1`,
      [tenantId, outletId, employeeId],
    );
    const row = result.rows[0];
    return row ? mapSalaryDocument(row) : null;
  }

  async listSalaryStructures(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
  ): Promise<EmployeeSalaryStructureDocument[]> {
    const result = await database.client.query<{ id: string; document: EmployeeSalaryStructureDocument }>(
      `SELECT id, document FROM crm.employee_salary_structures
       WHERE tenant_id = $1 AND outlet_id = $2 AND is_active`,
      [tenantId, outletId],
    );
    return result.rows.map(mapSalaryDocument);
  }

  async listActiveSalarySummaries(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
  ): Promise<AttendanceSalary[]> {
    const result = await database.client.query<QueryResultRow & {
      id: string; user_id: string; document: EmployeeSalaryStructureDocument;
    }>(
      `SELECT id, user_id, document FROM crm.employee_salary_structures
       WHERE tenant_id = $1 AND outlet_id = $2 AND is_active`,
      [tenantId, outletId],
    );
    return result.rows.map(toAttendanceSalary);
  }

  async listPayrollRuns(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    employeeId: string,
    year?: number,
  ): Promise<PayrollRunDocument[]> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(employeeId);
    const values: unknown[] = [tenantId, outletId, employeeId];
    let yearClause = "";
    if (year !== undefined) {
      values.push(year);
      yearClause = ` AND year = $${values.length}`;
    }
    const userClause = isUuid
      ? `(user_id = $3::uuid OR payroll_key LIKE '%:' || $3::text || ':%')`
      : `payroll_key LIKE '%:' || $3::text || ':%'`;
    const result = await database.client.query<{ id: string; document: PayrollRunDocument }>(
      `SELECT id, document FROM crm.payroll_runs
       WHERE tenant_id = $1 AND outlet_id = $2 AND ${userClause}${yearClause}
       ORDER BY year DESC, month DESC, created_at DESC`,
      values,
    );
    return result.rows.map(mapPayrollDocument);
  }

  async listLatestPayrollSummaries(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
  ): Promise<PayrollRunDocument[]> {
    const result = await database.client.query<{ document: PayrollRunDocument; id: string }>(
      `SELECT s.document, r.id FROM crm.payroll_run_summaries s
       JOIN crm.payroll_runs r ON r.tenant_id = s.tenant_id AND r.id = s.payroll_run_id
       WHERE s.tenant_id = $1 AND s.outlet_id = $2`,
      [tenantId, outletId],
    );
    return result.rows.map(mapPayrollDocument);
  }

  async saveSalaryStructure(
    database: TransactionDatabase,
    tenantId: string,
    businessId: string,
    outletId: string,
    employeeId: string,
    proposed: EmployeeSalaryStructureDocument,
  ): Promise<EmployeeSalaryStructureDocument> {
    let targetUserId = employeeId;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetUserId)) {
      const resolved = await this.getActivePayrollEmployee(database, tenantId, outletId, employeeId);
      if (resolved?.userProfileId) {
        targetUserId = resolved.userProfileId;
      }
    }
    const existing = await this.getSalaryStructure(database, tenantId, outletId, targetUserId);
    const salaryRevisions = mergeRevisions(existing?.salaryRevisions, proposed.salaryRevisions);
    const document: EmployeeSalaryStructureDocument = {
      ...(existing ?? proposed),
      ...proposed,
      salaryRevisions,
      userId: targetUserId,
      userProfileId: proposed.userProfileId || targetUserId,
      createdAt: existing?.createdAt ?? proposed.createdAt,
      createdBy: existing?.createdBy ?? proposed.createdBy,
      updatedAt: proposed.updatedAt,
      isActive: proposed.isActive ?? true,
    };
    const grossSalary = Number(document.grossSalary ?? document.monthlySalary ?? 0);
    const monthlySalary = Number(document.monthlySalary ?? grossSalary);
    const empCode = document.empCode ?? "";

    const upsert = await database.client.query<{ id: string }>(`
      INSERT INTO crm.employee_salary_structures
        (tenant_id, business_id, outlet_id, user_id, emp_code, gross_salary, monthly_salary, is_active, document)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      ON CONFLICT (tenant_id, outlet_id, user_id) DO UPDATE SET
        emp_code = EXCLUDED.emp_code,
        gross_salary = EXCLUDED.gross_salary,
        monthly_salary = EXCLUDED.monthly_salary,
        is_active = EXCLUDED.is_active,
        document = EXCLUDED.document,
        updated_at = now()
      RETURNING id`, [
      tenantId, businessId, outletId, targetUserId, empCode, grossSalary, monthlySalary,
      document.isActive !== false, JSON.stringify(document),
    ]);
    const structureId = upsert.rows[0]?.id;
    const latestRevision = salaryRevisions.at(-1);
    if (structureId && latestRevision) {
      await database.client.query(`
        INSERT INTO crm.salary_structure_revisions
          (tenant_id, structure_id, effective_from, salary_structure, updated_at, updated_by)
        VALUES ($1, $2, $3::date, $4::jsonb, $5, $6)
        ON CONFLICT (tenant_id, structure_id, effective_from) DO UPDATE SET
          salary_structure = EXCLUDED.salary_structure,
          updated_at = EXCLUDED.updated_at,
          updated_by = EXCLUDED.updated_by`,
        [
          tenantId, structureId, latestRevision.effectiveFrom,
          JSON.stringify(latestRevision.salaryStructure),
          latestRevision.updatedAt, latestRevision.updatedBy,
        ],
      );
    }
    return document;
  }

  async savePayrollRun(
    database: TransactionDatabase,
    tenantId: string,
    businessId: string,
    outletId: string,
    employeeId: string,
    payroll: PayrollRunDocument,
  ): Promise<{ payroll: PayrollRunDocument; created: boolean }> {
    const payrollKey = payroll.payrollKey || payroll.runId;
    if (!payrollKey) {
      throw new AppError(500, "Payroll identifier was not generated", "PAYROLL_ID_MISSING");
    }
    let targetUserId = employeeId;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetUserId)) {
      const resolved = await this.getActivePayrollEmployee(database, tenantId, outletId, employeeId);
      if (resolved?.userProfileId) {
        targetUserId = resolved.userProfileId;
      }
    }
    const existingResult = await database.client.query<{ id: string; document: PayrollRunDocument }>(
      `SELECT id, document FROM crm.payroll_runs
       WHERE tenant_id = $1 AND outlet_id = $2 AND payroll_key = $3`,
      [tenantId, outletId, payrollKey],
    );
    const existingRow = existingResult.rows[0];
    const existing = existingRow ? mapPayrollDocument(existingRow) : undefined;
    const summaryExists = (await database.client.query(
      `SELECT 1 FROM crm.payroll_run_summaries WHERE tenant_id = $1 AND outlet_id = $2 AND user_id = $3`,
      [tenantId, outletId, targetUserId],
    )).rowCount === 1;
    const action = resolvePayrollWriteAction({
      ...(existing ? { existing } : {}),
      incoming: payroll,
      summaryExists,
    });
    if (action === "REUSE" || action === "REUSE_AND_BACKFILL_SUMMARY") {
      if (action === "REUSE_AND_BACKFILL_SUMMARY" && existingRow) {
        await database.client.query(`
          INSERT INTO crm.payroll_run_summaries (tenant_id, outlet_id, user_id, payroll_run_id, document, updated_at)
          VALUES ($1, $2, $3, $4, $5::jsonb, now())
          ON CONFLICT (tenant_id, outlet_id, user_id) DO UPDATE SET
            payroll_run_id = EXCLUDED.payroll_run_id,
            document = EXCLUDED.document,
            updated_at = now()`,
          [tenantId, outletId, targetUserId, existingRow.id, JSON.stringify(existing)],
        );
      }
      return { payroll: existing!, created: false };
    }

    const status = payroll.status ?? "GENERATED";
    const insert = await database.client.query<{ id: string }>(`
      INSERT INTO crm.payroll_runs
        (tenant_id, business_id, outlet_id, user_id, payroll_key, month, year, status,
         calculation_hash, gross_salary, net_salary, document)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::crm.payroll_run_status, $9, $10, $11, $12::jsonb)
      ON CONFLICT (tenant_id, outlet_id, payroll_key) DO UPDATE SET
        status = EXCLUDED.status,
        calculation_hash = EXCLUDED.calculation_hash,
        gross_salary = EXCLUDED.gross_salary,
        net_salary = EXCLUDED.net_salary,
        document = EXCLUDED.document,
        updated_at = now()
      RETURNING id`, [
      tenantId, businessId, outletId, targetUserId, payrollKey, payroll.month, payroll.year,
      status, payroll.calculationHash ?? "", payroll.grossSalary ?? 0, payroll.netSalary ?? 0,
      JSON.stringify(payroll),
    ]);
    const runId = insert.rows[0]?.id;
    if (runId) {
      await database.client.query(`
        INSERT INTO crm.payroll_run_summaries (tenant_id, outlet_id, user_id, payroll_run_id, document, updated_at)
        VALUES ($1, $2, $3, $4, $5::jsonb, now())
        ON CONFLICT (tenant_id, outlet_id, user_id) DO UPDATE SET
          payroll_run_id = EXCLUDED.payroll_run_id,
          document = EXCLUDED.document,
          updated_at = now()`,
        [tenantId, outletId, targetUserId, runId, JSON.stringify(payroll)],
      );
    }
    return { payroll, created: !existingRow };
  }
}

export const postgresPayrollRepository = new PostgresPayrollRepository();
