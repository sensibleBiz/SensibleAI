import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import { buildExpenseBudgetSummary } from "../../services/expenseBudgetSummary.js";
import { normalizeMoney } from "../../services/expenseBudgetCalculations.js";
import type {
  CreateExpenseBudgetInput,
  ExpenseBudgetHistoryQuery,
  ExpenseBudgetSummaryQuery,
  ExpenseDeleteQuery,
  ExpenseStatusHistoryQuery,
  ExpenseStatusInput,
  ExpenseTransitionPermissions,
  UpdateExpenseBudgetInput,
} from "../../types/expenseBudget.types.js";
import { PostgresAuthorizationRepository, postgresAuthorizationRepository } from "../authorization/postgresAuthorization.repository.js";
import {
  PostgresExpenseRepository,
  postgresExpenseRepository,
  type PostgresExpenseCreateInput,
} from "./postgresExpense.repository.js";

export class PostgresExpenseService {
  constructor(
    private readonly repository: PostgresExpenseRepository = postgresExpenseRepository,
    private readonly authorization: PostgresAuthorizationRepository = postgresAuthorizationRepository,
  ) {}

  private async requirePermission(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string,
    permission: string,
  ) {
    if (!await this.authorization.hasOutletPermission(database, userId, tenantId, outletId, permission)) {
      throw new AppError(403, `Permission denied for ${permission}`, "PERMISSION_DENIED");
    }
  }

  private async outletBusiness(database: TransactionDatabase, tenantId: string, outletId: string) {
    const businessId = await this.repository.resolveOutletBusiness(database, tenantId, outletId);
    if (!businessId) throw new AppError(404, "Outlet not found", "OUTLET_NOT_FOUND");
    return businessId;
  }

  async createAllocation(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    input: CreateExpenseBudgetInput,
  ) {
    await this.requirePermission(database, tenantId, userId, input.outletId, "expense.budget.allocate");
    const businessId = await this.outletBusiness(database, tenantId, input.outletId);
    const target = await this.repository.resolveAllocationTarget(
      database, tenantId, input.outletId, input.targetType, input.targetId,
    );
    return this.repository.createAllocation(
      database, tenantId, businessId,
      { ...input, allocatedAmount: normalizeMoney(input.allocatedAmount) },
      userId, target,
    );
  }

  async updateAllocation(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    allocationId: string,
    input: UpdateExpenseBudgetInput,
  ) {
    await this.requirePermission(database, tenantId, userId, input.outletId, "expense.budget.allocate");
    const allowOverspend = await this.authorization.hasOutletPermission(
      database, userId, tenantId, input.outletId, "expense.budget.overspend",
    );
    return this.repository.updateAllocation(database, tenantId, allocationId, {
      ...input,
      allocatedAmount: normalizeMoney(input.allocatedAmount),
    }, userId, allowOverspend);
  }

  async getSummary(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    query: ExpenseBudgetSummaryQuery,
  ) {
    await this.requirePermission(database, tenantId, userId, query.outletId, "expense.read");
    const [allocations, expenses, team, categories] = await Promise.all([
      this.repository.listMonthAllocations(database, tenantId, query.outletId, query.month),
      this.repository.listMonthExpenses(database, tenantId, query.outletId, query.month),
      this.repository.listTeam(database, tenantId, query.outletId),
      this.repository.listExpenseCategories(database, tenantId, query.outletId),
    ]);
    return buildExpenseBudgetSummary({
      month: query.month, allocations, expenses, team, categories, actorId: userId,
    });
  }

  async getTransactions(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    allocationId: string,
    query: ExpenseBudgetHistoryQuery,
  ) {
    await this.requirePermission(database, tenantId, userId, query.outletId, "expense.read");
    return this.repository.listTransactions(database, tenantId, allocationId, query);
  }

  async listExpenses(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string,
    startDate: number,
    endDate: number,
  ) {
    await this.requirePermission(database, tenantId, userId, outletId, "expense.read");
    return this.repository.listExpensesByCreatedDate(database, tenantId, outletId, startDate, endDate);
  }

  async createExpense(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    input: PostgresExpenseCreateInput,
  ) {
    await this.requirePermission(database, tenantId, userId, input.outletId, "expense.read");
    const businessId = await this.outletBusiness(database, tenantId, input.outletId);
    return this.repository.createExpense(database, tenantId, businessId, {
      ...input,
      amount: normalizeMoney(input.amount),
      userId: input.userId || userId,
    });
  }

  async getExpenseStatusHistory(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    expenseId: string,
    query: ExpenseStatusHistoryQuery,
  ) {
    await this.requirePermission(database, tenantId, userId, query.outletId, "expense.read");
    return this.repository.listExpenseStatusHistory(database, tenantId, expenseId, query);
  }

  async transitionExpense(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    expenseId: string,
    input: ExpenseStatusInput,
  ) {
    const [canReview, canApprove, canOverspend] = await Promise.all([
      this.authorization.hasOutletPermission(database, userId, tenantId, input.outletId, "expense.review"),
      this.authorization.hasOutletPermission(database, userId, tenantId, input.outletId, "expense.approve"),
      this.authorization.hasOutletPermission(database, userId, tenantId, input.outletId, "expense.budget.overspend"),
    ]);
    const permissions: ExpenseTransitionPermissions = { canReview, canApprove, canOverspend };
    return this.repository.transitionExpense({
      database, tenantId, actorId: userId, expenseId, input, permissions,
    });
  }

  async deleteExpense(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    expenseId: string,
    query: ExpenseDeleteQuery,
  ) {
    await this.requirePermission(database, tenantId, userId, query.outletId, "expense.delete");
    return this.repository.deleteExpense(database, tenantId, expenseId, query, userId);
  }
}

export const postgresExpenseService = new PostgresExpenseService();
