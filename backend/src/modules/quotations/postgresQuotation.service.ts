import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import { postgresAuthorizationRepository } from "../authorization/postgresAuthorization.repository.js";
import { postgresQuotationRepository } from "./postgresQuotation.repository.js";
import type { CalculatedQuotationItem, QuotationCreateInput, QuotationTotals } from "./quotation.types.js";

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const calculateQuotation = (input: Pick<QuotationCreateInput, "items" | "taxPercent">): {
  items: CalculatedQuotationItem[]; totals: QuotationTotals;
} => {
  const taxPercent = input.taxPercent ?? 18;
  const items = input.items.map((item, index) => {
    const lineSubtotal = roundMoney(item.quantity * item.unitPrice);
    const mrpTotal = roundMoney(item.quantity * item.mrpUnitPrice);
    const discountAmount = roundMoney(mrpTotal - lineSubtotal);
    const taxAmount = roundMoney(lineSubtotal * taxPercent / 100);
    return { ...item, lineNumber: index + 1, lineSubtotal, discountAmount, taxAmount,
      lineTotal: roundMoney(lineSubtotal + taxAmount) };
  });
  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.lineSubtotal, 0));
  const discountAmount = roundMoney(items.reduce((sum, item) => sum + item.discountAmount, 0));
  const taxAmount = roundMoney(items.reduce((sum, item) => sum + item.taxAmount, 0));
  return { items, totals: { subtotal, discountAmount, taxAmount, totalAmount: roundMoney(subtotal + taxAmount) } };
};

export const postgresQuotationService = {
  async create(database: TransactionDatabase, tenantId: string, userId: string, input: QuotationCreateInput) {
    const allowed = await postgresAuthorizationRepository.hasOutletPermission(
      database, userId, tenantId, input.outletId, "leads.create",
    );
    if (!allowed) throw new AppError(403, "Permission denied for quotation creation", "PERMISSION_DENIED");
    if (input.leadId && !await postgresQuotationRepository.leadExists(database, tenantId, input.outletId, input.leadId)) {
      throw new AppError(404, "Lead not found", "LEAD_NOT_FOUND");
    }
    const calculated = calculateQuotation(input);
    return postgresQuotationRepository.create(database, tenantId, userId, input, calculated);
  },
};
