/**
 * Firestore EXPENSE_BUDGET / EXPENSE / EXPENSE_HEADER / STATUS_HISTORY / TRANSACTIONS
 * map onto crm.expense_budget_allocations, crm.expenses, crm.expense_categories,
 * crm.expense_status_history, and crm.expense_budget_transactions.
 */
import type { QueryResultRow } from "pg";
import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import {
  assertExpenseTransitionAllowed,
  calculateAllocationAdjustment,
  calculateBudgetBalance,
  expenseBudgetAllocationId,
  isSameMoney,
  normalizeMoney,
} from "../../services/expenseBudgetCalculations.js";
import type {
  CreateExpenseBudgetInput,
  ExpenseBudgetAllocation,
  ExpenseBudgetHistoryQuery,
  ExpenseBudgetTeamMember,
  ExpenseBudgetTargetType,
  ExpenseBudgetTransaction,
  ExpenseBudgetTransactionType,
  ExpenseDeleteQuery,
  ExpenseDocument,
  ExpenseStatus,
  ExpenseStatusHistoryQuery,
  ExpenseStatusHistoryRecord,
  ExpenseStatusInput,
  ExpenseTransitionPermissions,
  UpdateExpenseBudgetInput,
} from "../../types/expenseBudget.types.js";

const numberValue = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : Number(value ?? 0);

const mapAllocation = (row: QueryResultRow): ExpenseBudgetAllocation => ({
  id: String(row.id),
  month: String(row.month),
  targetType: row.target_type as ExpenseBudgetTargetType,
  targetId: String(row.target_id),
  targetLabel: String(row.target_label),
  originalAllocatedAmount: numberValue(row.original_allocated_amount),
  allocatedAmount: numberValue(row.allocated_amount),
  usedAmount: numberValue(row.used_amount),
  remainingAmount: numberValue(row.remaining_amount),
  approvedExpenseCount: numberValue(row.approved_expense_count),
  currency: "INR",
  notes: row.notes ? String(row.notes) : undefined,
  status: "ACTIVE",
  revision: numberValue(row.revision),
  createdBy: String(row.created_by),
  createdAt: numberValue(row.created_at_ms),
  updatedBy: String(row.updated_by),
  updatedAt: numberValue(row.updated_at_ms),
});

const mapExpense = (row: QueryResultRow): ExpenseDocument => {
  const details = (row.details ?? {}) as Record<string, unknown>;
  return {
    ...details,
    id: String(row.id),
    amount: numberValue(row.amount),
    createdDate: numberValue(row.created_date),
    monthId: String(row.month_id),
    userId: String(row.user_id),
    status: row.status as ExpenseStatus,
    expCatRefId: row.category_id ? String(row.category_id) : undefined,
    purpose: row.purpose ? String(row.purpose) : undefined,
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : undefined,
    reviewedAt: row.reviewed_at ? numberValue(row.reviewed_at) : undefined,
    approvedBy: row.approved_by ? String(row.approved_by) : undefined,
    approvedAt: row.approved_at ? numberValue(row.approved_at) : undefined,
    rejectedBy: row.rejected_by ? String(row.rejected_by) : undefined,
    rejectedAt: row.rejected_at ? numberValue(row.rejected_at) : undefined,
    rejectionReason: row.rejection_reason ? String(row.rejection_reason) : undefined,
    statusChangedBy: row.status_changed_by ? String(row.status_changed_by) : undefined,
    statusChangedAt: row.status_changed_at ? numberValue(row.status_changed_at) : undefined,
    statusVersion: numberValue(row.status_version),
    budgetApplied: row.budget_applied === true,
    budgetAllocationId: row.budget_allocation_id ? String(row.budget_allocation_id) : undefined,
    budgetAppliedAmount: row.budget_applied_amount == null ? undefined : numberValue(row.budget_applied_amount),
    budgetVersion: row.budget_version == null ? undefined : numberValue(row.budget_version),
    updateDate: row.update_date ? numberValue(row.update_date) : undefined,
  };
};

const mapTransaction = (row: QueryResultRow): ExpenseBudgetTransaction => ({
  id: String(row.id),
  allocationId: String(row.allocation_id),
  type: row.type as ExpenseBudgetTransactionType,
  amount: numberValue(row.amount),
  balanceAfter: numberValue(row.balance_after),
  allocatedAmountAfter: numberValue(row.allocated_amount_after),
  expenseId: row.expense_id ? String(row.expense_id) : undefined,
  employeeId: row.employee_id ? String(row.employee_id) : undefined,
  employeeName: row.employee_name ? String(row.employee_name) : undefined,
  categoryId: row.category_id ? String(row.category_id) : undefined,
  category: row.category ? String(row.category) : undefined,
  expenseStatus: row.expense_status ? row.expense_status as ExpenseStatus : undefined,
  reason: row.reason ? String(row.reason) : undefined,
  createdBy: String(row.created_by),
  createdByName: row.created_by_name ? String(row.created_by_name) : undefined,
  createdAt: numberValue(row.created_at_ms),
});

const allocationSelect = `
  SELECT id, month, target_type, target_id, target_label, original_allocated_amount,
    allocated_amount, used_amount, remaining_amount, approved_expense_count, notes,
    revision, created_by, created_at_ms, updated_by, updated_at_ms
  FROM crm.expense_budget_allocations
`;

const expenseSelect = `
  SELECT id, user_id, amount, month_id, status, category_id, purpose, created_date, details,
    reviewed_by, reviewed_at, approved_by, approved_at, rejected_by, rejected_at, rejection_reason,
    status_changed_by, status_changed_at, status_version, budget_applied, budget_allocation_id,
    budget_applied_amount, budget_version, last_budget_allocation_id, update_date
  FROM crm.expenses
`;

export interface PostgresExpenseCreateInput {
  outletId: string;
  userId: string;
  amount: number;
  monthId: string;
  categoryId?: string;
  purpose?: string;
  createdDate?: number;
  details?: Record<string, unknown>;
}

export class PostgresExpenseRepository {
  async resolveOutletBusiness(database: TransactionDatabase, tenantId: string, outletId: string) {
    const result = await database.client.query<{ business_id: string }>(
      "SELECT business_id FROM tenancy.outlets WHERE tenant_id = $1 AND id = $2 AND active",
      [tenantId, outletId],
    );
    return result.rows[0]?.business_id ?? null;
  }

  async listTeam(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
  ): Promise<ExpenseBudgetTeamMember[]> {
    const result = await database.client.query<QueryResultRow>(`
      SELECT usr.id AS user_id, usr.display_name, team.department, team.active,
        manager.user_id AS manager_user_id, profile.profile_role
      FROM crm.team_memberships team
      JOIN crm.user_profiles profile ON profile.id = team.user_profile_id AND profile.tenant_id = team.tenant_id
      JOIN iam.users usr ON usr.id = team.user_id
      LEFT JOIN crm.user_profiles manager ON manager.id = team.manager_profile_id AND manager.tenant_id = team.tenant_id
      WHERE team.tenant_id = $1 AND team.outlet_id = $2
      GROUP BY usr.id, usr.display_name, team.department, team.active, manager.user_id, profile.profile_role
    `, [tenantId, outletId]);
    return result.rows.map((row) => ({
      userProfileId: String(row.user_id),
      userName: String(row.display_name ?? ""),
      department: row.department ? String(row.department) : undefined,
      isActive: row.active === true,
      roleInZone: row.profile_role ? String(row.profile_role) : undefined,
      teamHeadProfileId: row.manager_user_id ? String(row.manager_user_id) : undefined,
    }));
  }

  async findTeamMember(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    userId: string,
  ) {
    const members = await this.listTeam(database, tenantId, outletId);
    return members.find((member) => member.userProfileId === userId) ?? null;
  }

  async resolveAllocationTarget(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    targetType: ExpenseBudgetTargetType,
    targetId: string,
  ) {
    if (targetType === "DEPARTMENT") {
      const department = targetId.trim().toUpperCase();
      const result = await database.client.query(
        `SELECT 1 FROM crm.team_memberships
         WHERE tenant_id = $1 AND outlet_id = $2 AND department = $3 AND active LIMIT 1`,
        [tenantId, outletId, department],
      );
      if (result.rowCount === 0) {
        throw new AppError(400, "Allocation department was not found", "INVALID_BUDGET_TARGET");
      }
      return { targetId: department, targetLabel: department };
    }

    const member = await this.findTeamMember(database, tenantId, outletId, targetId);
    if (!member?.isActive) {
      throw new AppError(400, "Allocation user was not found or is inactive", "INVALID_BUDGET_TARGET");
    }
    return {
      targetId: member.userProfileId,
      targetLabel: targetType === "MANAGER_TEAM"
        ? `${member.userName || "Manager"} Team`
        : member.userName || member.userProfileId,
    };
  }

  async createAllocation(
    database: TransactionDatabase,
    tenantId: string,
    businessId: string,
    input: CreateExpenseBudgetInput,
    actorId: string,
    target: { targetId: string; targetLabel: string },
  ) {
    const allocationKey = expenseBudgetAllocationId(input.month, input.targetType, target.targetId);
    const allocatedAmount = normalizeMoney(input.allocatedAmount);
    const now = Date.now();
    const existing = await database.client.query(
      `${allocationSelect} WHERE tenant_id = $1 AND outlet_id = $2 AND allocation_key = $3 FOR UPDATE`,
      [tenantId, input.outletId, allocationKey],
    );
    if (existing.rows[0]) {
      const allocation = mapAllocation(existing.rows[0]);
      const sameRequest =
        isSameMoney(allocation.allocatedAmount, allocatedAmount) &&
        (allocation.notes ?? "") === (input.notes ?? "");
      if (sameRequest) return { allocation, created: false };
      throw new AppError(409, "An allocation already exists for this month and target", "DUPLICATE_EXPENSE_BUDGET");
    }

    const inserted = await database.client.query(`
      INSERT INTO crm.expense_budget_allocations (
        tenant_id, business_id, outlet_id, allocation_key, month, target_type, target_id, target_label,
        original_allocated_amount, allocated_amount, used_amount, remaining_amount, notes,
        created_by, created_at_ms, updated_by, updated_at_ms
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,0,$9,$10,$11,$12,$11,$12)
      RETURNING id, month, target_type, target_id, target_label, original_allocated_amount,
        allocated_amount, used_amount, remaining_amount, approved_expense_count, notes,
        revision, created_by, created_at_ms, updated_by, updated_at_ms`,
      [
        tenantId, businessId, input.outletId, allocationKey, input.month, input.targetType,
        target.targetId, target.targetLabel, allocatedAmount, input.notes ?? null, actorId, now,
      ],
    );
    const allocation = mapAllocation(inserted.rows[0]!);
    await database.client.query(`
      INSERT INTO crm.expense_budget_transactions (
        tenant_id, allocation_id, transaction_key, type, amount, balance_after, allocated_amount_after,
        created_by, created_at_ms
      ) VALUES ($1,$2,'ALLOCATION_1','ALLOCATION_CREATED',$3,$3,$3,$4,$5)`,
      [tenantId, allocation.id, allocatedAmount, actorId, now],
    );
    return { allocation, created: true };
  }

  async updateAllocation(
    database: TransactionDatabase,
    tenantId: string,
    allocationId: string,
    input: UpdateExpenseBudgetInput,
    actorId: string,
    allowOverspend: boolean,
  ) {
    const snapshot = await database.client.query(
      `${allocationSelect} WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3 FOR UPDATE`,
      [tenantId, input.outletId, allocationId],
    );
    if (!snapshot.rows[0]) {
      throw new AppError(404, "Expense budget was not found", "EXPENSE_BUDGET_NOT_FOUND");
    }
    const current = mapAllocation(snapshot.rows[0]);
    const adjusted = calculateAllocationAdjustment({
      allocatedAmount: input.allocatedAmount,
      usedAmount: current.usedAmount,
      allowOverspend,
    });
    const notes = input.notes ?? current.notes;
    if (isSameMoney(current.allocatedAmount, adjusted.allocatedAmount) && (current.notes ?? "") === (notes ?? "")) {
      return { allocation: current, updated: false };
    }
    const now = Date.now();
    const revision = current.revision + 1;
    const updated = await database.client.query(`
      UPDATE crm.expense_budget_allocations SET
        allocated_amount = $4, remaining_amount = $5, notes = $6, revision = $7,
        updated_by = $8, updated_at_ms = $9
      WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3
      RETURNING id, month, target_type, target_id, target_label, original_allocated_amount,
        allocated_amount, used_amount, remaining_amount, approved_expense_count, notes,
        revision, created_by, created_at_ms, updated_by, updated_at_ms`,
      [
        tenantId, input.outletId, allocationId, adjusted.allocatedAmount, adjusted.remainingAmount,
        notes ?? null, revision, actorId, now,
      ],
    );
    const allocation = mapAllocation(updated.rows[0]!);
    await database.client.query(`
      INSERT INTO crm.expense_budget_transactions (
        tenant_id, allocation_id, transaction_key, type, amount, balance_after, allocated_amount_after,
        created_by, created_at_ms
      ) VALUES ($1,$2,$3,'ALLOCATION_ADJUSTED',$4,$5,$6,$7,$8)`,
      [
        tenantId, allocationId, `ALLOCATION_${revision}`,
        normalizeMoney(allocation.allocatedAmount - current.allocatedAmount),
        allocation.remainingAmount, allocation.allocatedAmount, actorId, now,
      ],
    );
    return { allocation, updated: true };
  }

  async listMonthAllocations(database: TransactionDatabase, tenantId: string, outletId: string, month: string) {
    const result = await database.client.query(
      `${allocationSelect} WHERE tenant_id = $1 AND outlet_id = $2 AND month = $3`,
      [tenantId, outletId, month],
    );
    return result.rows.map(mapAllocation);
  }

  async listMonthExpenses(database: TransactionDatabase, tenantId: string, outletId: string, month: string) {
    const result = await database.client.query(
      `${expenseSelect} WHERE tenant_id = $1 AND outlet_id = $2 AND month_id = $3`,
      [tenantId, outletId, month],
    );
    return result.rows.map(mapExpense);
  }

  async listExpensesByCreatedDate(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    start: number,
    end: number,
  ) {
    const result = await database.client.query(
      `${expenseSelect} WHERE tenant_id = $1 AND outlet_id = $2 AND created_date >= $3 AND created_date <= $4
       ORDER BY created_date DESC`,
      [tenantId, outletId, start, end],
    );
    return result.rows.map(mapExpense);
  }

  async listExpenseCategories(database: TransactionDatabase, tenantId: string, outletId: string) {
    const result = await database.client.query<{ id: string; category: string }>(
      `SELECT id, category FROM crm.expense_categories WHERE tenant_id = $1 AND outlet_id = $2`,
      [tenantId, outletId],
    );
    return new Map(result.rows.map((row) => [row.id, row.category.trim() || "Uncategorized"]));
  }

  async createCategory(
    database: TransactionDatabase,
    tenantId: string,
    businessId: string,
    outletId: string,
    category: string,
  ) {
    const result = await database.client.query<{ id: string; category: string }>(`
      INSERT INTO crm.expense_categories (tenant_id, business_id, outlet_id, category)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (tenant_id, outlet_id, category) DO UPDATE SET category = EXCLUDED.category
      RETURNING id, category`, [tenantId, businessId, outletId, category.trim()]);
    return result.rows[0]!;
  }

  async createExpense(
    database: TransactionDatabase,
    tenantId: string,
    businessId: string,
    input: PostgresExpenseCreateInput,
  ) {
    const now = input.createdDate ?? Date.now();
    const result = await database.client.query(
      `INSERT INTO crm.expenses (
         tenant_id, business_id, outlet_id, user_id, amount, month_id, category_id, purpose, created_date, details
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       RETURNING id, user_id, amount, month_id, status, category_id, purpose, created_date, details,
         reviewed_by, reviewed_at, approved_by, approved_at, rejected_by, rejected_at, rejection_reason,
         status_changed_by, status_changed_at, status_version, budget_applied, budget_allocation_id,
         budget_applied_amount, budget_version, last_budget_allocation_id, update_date`,
      [
        tenantId, businessId, input.outletId, input.userId, normalizeMoney(input.amount),
        input.monthId, input.categoryId ?? null, input.purpose ?? "", now,
        JSON.stringify(input.details ?? {}),
      ],
    );
    return mapExpense(result.rows[0]!);
  }

  async listTransactions(
    database: TransactionDatabase,
    tenantId: string,
    allocationId: string,
    query: ExpenseBudgetHistoryQuery,
  ) {
    const allocation = await database.client.query(
      `${allocationSelect} WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3`,
      [tenantId, query.outletId, allocationId],
    );
    if (!allocation.rows[0]) {
      throw new AppError(404, "Expense budget was not found", "EXPENSE_BUDGET_NOT_FOUND");
    }
    const values: unknown[] = [tenantId, allocationId, query.limit];
    let cursorClause = "";
    if (query.cursor) {
      const cursor = await database.client.query<{ created_at_ms: string; id: string }>(
        `SELECT created_at_ms::text, id FROM crm.expense_budget_transactions
         WHERE tenant_id = $1 AND allocation_id = $2 AND id = $3`,
        [tenantId, allocationId, query.cursor],
      );
      if (!cursor.rows[0]) throw new AppError(400, "History cursor is invalid", "INVALID_CURSOR");
      values.push(Number(cursor.rows[0].created_at_ms), query.cursor);
      cursorClause = ` AND (created_at_ms, id) < ($${values.length - 1}, $${values.length})`;
    }
    const snapshot = await database.client.query(
      `SELECT * FROM crm.expense_budget_transactions
       WHERE tenant_id = $1 AND allocation_id = $2${cursorClause}
       ORDER BY created_at_ms DESC, id DESC LIMIT $3`,
      values,
    );
    const items = snapshot.rows.map(mapTransaction);
    return {
      allocation: mapAllocation(allocation.rows[0]),
      items,
      nextCursor: snapshot.rows.length === query.limit ? items.at(-1)?.id ?? null : null,
    };
  }

  async listExpenseStatusHistory(
    database: TransactionDatabase,
    tenantId: string,
    expenseId: string,
    query: ExpenseStatusHistoryQuery,
  ) {
    const expense = await database.client.query(
      `SELECT id FROM crm.expenses WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3`,
      [tenantId, query.outletId, expenseId],
    );
    if (!expense.rows[0]) throw new AppError(404, "Expense was not found", "EXPENSE_NOT_FOUND");
    const values: unknown[] = [tenantId, expenseId, query.limit];
    let cursorClause = "";
    if (query.cursor) {
      const cursor = await database.client.query<{ changed_at: string; id: string }>(
        `SELECT changed_at::text, id FROM crm.expense_status_history
         WHERE tenant_id = $1 AND expense_id = $2 AND id = $3`,
        [tenantId, expenseId, query.cursor],
      );
      if (!cursor.rows[0]) throw new AppError(400, "History cursor is invalid", "INVALID_CURSOR");
      values.push(Number(cursor.rows[0].changed_at), query.cursor);
      cursorClause = ` AND (changed_at, id) < ($${values.length - 1}, $${values.length})`;
    }
    const snapshot = await database.client.query(
      `SELECT id, from_status, to_status, reason, allocation_id, changed_by, changed_at
       FROM crm.expense_status_history
       WHERE tenant_id = $1 AND expense_id = $2${cursorClause}
       ORDER BY changed_at DESC, id DESC LIMIT $3`,
      values,
    );
    const items = snapshot.rows.map((row): ExpenseStatusHistoryRecord => ({
      id: String(row.id),
      fromStatus: row.from_status,
      toStatus: row.to_status,
      reason: row.reason ? String(row.reason) : undefined,
      allocationId: row.allocation_id ? String(row.allocation_id) : undefined,
      changedBy: String(row.changed_by),
      changedAt: numberValue(row.changed_at),
    }));
    return {
      items,
      nextCursor: snapshot.rows.length === query.limit ? items.at(-1)?.id ?? null : null,
    };
  }

  private async readCandidateAllocation(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    month: string,
    actorId: string,
    actorMember: ExpenseBudgetTeamMember | null,
    employeeMember: ExpenseBudgetTeamMember | null,
  ) {
    const candidates: Array<{ targetType: ExpenseBudgetTargetType; targetId: string }> = [];
    if (employeeMember?.teamHeadProfileId) {
      candidates.push({ targetType: "MANAGER_TEAM", targetId: employeeMember.teamHeadProfileId });
    }
    candidates.push({ targetType: "USER", targetId: actorId });
    const actorDepartment = String(actorMember?.department ?? "").trim().toUpperCase();
    if (actorDepartment) candidates.push({ targetType: "DEPARTMENT", targetId: actorDepartment });
    for (const candidate of candidates) {
      const key = expenseBudgetAllocationId(month, candidate.targetType, candidate.targetId);
      const snapshot = await database.client.query(
        `${allocationSelect} WHERE tenant_id = $1 AND outlet_id = $2 AND allocation_key = $3 AND status = 'ACTIVE' FOR UPDATE`,
        [tenantId, outletId, key],
      );
      if (snapshot.rows[0]) return mapAllocation(snapshot.rows[0]);
    }
    return null;
  }

  async transitionExpense({
    database,
    tenantId,
    actorId,
    expenseId,
    input,
    permissions,
  }: {
    database: TransactionDatabase;
    tenantId: string;
    actorId: string;
    expenseId: string;
    input: ExpenseStatusInput;
    permissions: ExpenseTransitionPermissions;
  }) {
    const expenseSnapshot = await database.client.query(
      `${expenseSelect} WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3 FOR UPDATE`,
      [tenantId, input.outletId, expenseId],
    );
    if (!expenseSnapshot.rows[0]) throw new AppError(404, "Expense was not found", "EXPENSE_NOT_FOUND");
    const expense = mapExpense(expenseSnapshot.rows[0]);
    const currentStatus = expense.status ?? "PENDING";
    assertExpenseTransitionAllowed({ currentStatus, nextStatus: input.status, permissions });
    if (!Number.isFinite(expense.amount) || expense.amount <= 0) {
      throw new AppError(409, "Expense amount must be greater than zero", "INVALID_EXPENSE_AMOUNT");
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(expense.monthId)) {
      throw new AppError(409, "Expense month is invalid", "INVALID_EXPENSE_MONTH");
    }

    const [actorMember, employeeMember, categories] = await Promise.all([
      this.findTeamMember(database, tenantId, input.outletId, actorId),
      this.findTeamMember(database, tenantId, input.outletId, expense.userId),
      this.listExpenseCategories(database, tenantId, input.outletId),
    ]);
    const category = expense.expCatRefId ? categories.get(expense.expCatRefId) ?? "" : "";
    const now = Date.now();
    const currentApplied = expense.budgetApplied === true && expense.budgetAllocationId;
    let allocation: ExpenseBudgetAllocation | null = null;
    if (currentApplied) {
      const snapshot = await database.client.query(
        `${allocationSelect} WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3 FOR UPDATE`,
        [tenantId, input.outletId, expense.budgetAllocationId],
      );
      if (!snapshot.rows[0]) {
        throw new AppError(409, "The expense references a missing budget allocation", "EXPENSE_BUDGET_LINK_BROKEN");
      }
      allocation = mapAllocation(snapshot.rows[0]);
    } else if (input.status === "APPROVED" && currentStatus !== "APPROVED") {
      allocation = await this.readCandidateAllocation(
        database, tenantId, input.outletId, expense.monthId, actorId, actorMember, employeeMember,
      );
    }

    const appliedAmount = expense.budgetAppliedAmount ?? 0;
    let usedDelta = 0;
    let countDelta = 0;
    let transactionType: ExpenseBudgetTransactionType | undefined;
    if (input.status === "APPROVED" && currentStatus !== "APPROVED" && allocation) {
      usedDelta = normalizeMoney(expense.amount);
      countDelta = 1;
      transactionType = "EXPENSE_APPROVED";
    } else if (input.status === "APPROVED" && currentStatus === "APPROVED" && allocation && !isSameMoney(expense.amount, appliedAmount)) {
      usedDelta = normalizeMoney(expense.amount - appliedAmount);
      transactionType = "EXPENSE_AMOUNT_ADJUSTED";
    } else if (input.status !== "APPROVED" && currentStatus === "APPROVED" && allocation) {
      usedDelta = -appliedAmount;
      countDelta = -1;
      transactionType = "EXPENSE_APPROVAL_REVERSED";
    }

    if (currentStatus === input.status && !transactionType) {
      return { expenseId, status: currentStatus, budgetApplied: expense.budgetApplied === true, allocation, idempotent: true };
    }

    let nextAllocation = allocation;
    let budgetVersion = expense.budgetVersion ?? 0;
    if (allocation && transactionType) {
      const balance = calculateBudgetBalance({
        allocatedAmount: allocation.allocatedAmount,
        usedAmount: allocation.usedAmount,
        usedDelta,
        allowOverspend: permissions.canOverspend,
      });
      budgetVersion += 1;
      const updated = await database.client.query(`
        UPDATE crm.expense_budget_allocations SET
          used_amount = $4, remaining_amount = $5, approved_expense_count = $6,
          updated_by = $7, updated_at_ms = $8
        WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3
        RETURNING id, month, target_type, target_id, target_label, original_allocated_amount,
          allocated_amount, used_amount, remaining_amount, approved_expense_count, notes,
          revision, created_by, created_at_ms, updated_by, updated_at_ms`,
        [
          tenantId, input.outletId, allocation.id, balance.usedAmount, balance.remainingAmount,
          Math.max(0, allocation.approvedExpenseCount + countDelta), actorId, now,
        ],
      );
      nextAllocation = mapAllocation(updated.rows[0]!);
      await database.client.query(`
        INSERT INTO crm.expense_budget_transactions (
          tenant_id, allocation_id, transaction_key, type, amount, balance_after, allocated_amount_after,
          expense_id, employee_id, employee_name, category_id, category, expense_status, reason,
          created_by, created_by_name, created_at_ms
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          tenantId, allocation.id, `EXPENSE_${expense.id}_${budgetVersion}`, transactionType,
          normalizeMoney(-usedDelta), nextAllocation.remainingAmount, nextAllocation.allocatedAmount,
          expense.id, expense.userId, employeeMember?.userName ?? null, expense.expCatRefId ?? null,
          category || expense.purpose || null, input.status, input.rejectionReason ?? null,
          actorId, actorMember?.userName ?? null, now,
        ],
      );
    }

    const statusVersion = (expense.statusVersion ?? 0) + 1;
    await database.client.query(`
      UPDATE crm.expenses SET
        status = $4::crm.expense_status,
        status_changed_by = $5, status_changed_at = $6, status_version = $7, update_date = $6,
        reviewed_by = CASE WHEN $4 = 'REVIEWED' THEN $5 ELSE reviewed_by END,
        reviewed_at = CASE WHEN $4 = 'REVIEWED' THEN $6 ELSE reviewed_at END,
        approved_by = CASE WHEN $4 = 'APPROVED' THEN $5 ELSE approved_by END,
        approved_at = CASE WHEN $4 = 'APPROVED' THEN $6 ELSE approved_at END,
        rejected_by = CASE WHEN $4 IN ('REJECTED') THEN $5 ELSE CASE WHEN $4 = 'APPROVED' THEN NULL ELSE rejected_by END END,
        rejected_at = CASE WHEN $4 IN ('REJECTED') THEN $6 ELSE CASE WHEN $4 = 'APPROVED' THEN NULL ELSE rejected_at END END,
        rejection_reason = CASE WHEN $4 = 'REJECTED' THEN $8 ELSE CASE WHEN $4 = 'APPROVED' THEN NULL ELSE rejection_reason END END,
        budget_applied = $9,
        budget_allocation_id = $10,
        budget_applied_amount = $11,
        budget_version = $12,
        last_budget_allocation_id = $13
      WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3`,
      [
        tenantId, input.outletId, expenseId, input.status, actorId, now, statusVersion,
        input.rejectionReason ?? null,
        input.status === "APPROVED" && Boolean(allocation),
        input.status === "APPROVED" && allocation ? allocation.id : null,
        input.status === "APPROVED" && allocation ? normalizeMoney(expense.amount) : null,
        allocation && transactionType ? budgetVersion : expense.budgetVersion ?? null,
        input.status !== "APPROVED" && allocation ? allocation.id : null,
      ],
    );
    await database.client.query(`
      INSERT INTO crm.expense_status_history (
        tenant_id, expense_id, history_key, from_status, to_status, reason, allocation_id, changed_by, changed_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        tenantId, expenseId, `STATUS_${statusVersion}`, currentStatus, input.status,
        input.rejectionReason ?? null, allocation?.id ?? null, actorId, now,
      ],
    );
    return {
      expenseId,
      status: input.status,
      budgetApplied: input.status === "APPROVED" && Boolean(allocation),
      allocation: nextAllocation,
      idempotent: false,
    };
  }

  async deleteExpense(
    database: TransactionDatabase,
    tenantId: string,
    expenseId: string,
    query: ExpenseDeleteQuery,
    actorId: string,
  ) {
    const expenseSnapshot = await database.client.query(
      `${expenseSelect} WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3 FOR UPDATE`,
      [tenantId, query.outletId, expenseId],
    );
    if (!expenseSnapshot.rows[0]) return { expenseId, deleted: false, idempotent: true };
    const expense = mapExpense(expenseSnapshot.rows[0]);
    const now = Date.now();
    if (expense.status === "APPROVED" && expense.budgetApplied === true && expense.budgetAllocationId) {
      const snapshot = await database.client.query(
        `${allocationSelect} WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3 FOR UPDATE`,
        [tenantId, query.outletId, expense.budgetAllocationId],
      );
      if (!snapshot.rows[0]) {
        throw new AppError(409, "The expense references a missing budget allocation", "EXPENSE_BUDGET_LINK_BROKEN");
      }
      const current = mapAllocation(snapshot.rows[0]);
      const appliedAmount = expense.budgetAppliedAmount ?? 0;
      const balance = calculateBudgetBalance({
        allocatedAmount: current.allocatedAmount,
        usedAmount: current.usedAmount,
        usedDelta: -appliedAmount,
        allowOverspend: true,
      });
      const next = await database.client.query(`
        UPDATE crm.expense_budget_allocations SET
          used_amount = $4, remaining_amount = $5, approved_expense_count = $6,
          updated_by = $7, updated_at_ms = $8
        WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3
        RETURNING id, month, target_type, target_id, target_label, original_allocated_amount,
          allocated_amount, used_amount, remaining_amount, approved_expense_count, notes,
          revision, created_by, created_at_ms, updated_by, updated_at_ms`,
        [
          tenantId, query.outletId, current.id, balance.usedAmount, balance.remainingAmount,
          Math.max(0, current.approvedExpenseCount - 1), actorId, now,
        ],
      );
      const allocation = mapAllocation(next.rows[0]!);
      const [actorMember, employeeMember, categories] = await Promise.all([
        this.findTeamMember(database, tenantId, query.outletId, actorId),
        this.findTeamMember(database, tenantId, query.outletId, expense.userId),
        this.listExpenseCategories(database, tenantId, query.outletId),
      ]);
      const category = expense.expCatRefId ? categories.get(expense.expCatRefId) ?? "" : "";
      const budgetVersion = (expense.budgetVersion ?? 0) + 1;
      await database.client.query(`
        INSERT INTO crm.expense_budget_transactions (
          tenant_id, allocation_id, transaction_key, type, amount, balance_after, allocated_amount_after,
          expense_id, employee_id, employee_name, category_id, category, expense_status, reason,
          created_by, created_by_name, created_at_ms
        ) VALUES ($1,$2,$3,'APPROVED_EXPENSE_DELETED',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          tenantId, allocation.id, `EXPENSE_${expense.id}_${budgetVersion}`, appliedAmount,
          allocation.remainingAmount, allocation.allocatedAmount, expense.id, expense.userId,
          employeeMember?.userName ?? null, expense.expCatRefId ?? null, category || expense.purpose || null,
          expense.status, "Approved expense deleted", actorId, actorMember?.userName ?? null, now,
        ],
      );
    }
    await database.client.query(
      `DELETE FROM crm.expenses WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3`,
      [tenantId, query.outletId, expenseId],
    );
    return { expenseId, deleted: true, idempotent: false };
  }
}

export const postgresExpenseRepository = new PostgresExpenseRepository();
