import type { QueryResultRow } from "pg";
import type { TransactionDatabase } from "../../db/context.js";
import type { CalculatedQuotationItem, QuotationCreateInput, QuotationRecord, QuotationTotals } from "./quotation.types.js";

interface QuotationRow extends QueryResultRow {
  id: string; outlet_id: string; lead_id: string | null; quotation_number: string;
  customer_name: string; customer_mobile: string; currency_code: QuotationRecord["currencyCode"];
  incoterm: QuotationRecord["incoterm"]; terms: string; subtotal: string; discount_amount: string;
  tax_percent: string; tax_amount: string; total_amount: string; created_by_user_id: string; created_at: Date;
}

const map = (row: QuotationRow, items: CalculatedQuotationItem[]): QuotationRecord => ({
  id: row.id, outletId: row.outlet_id, leadId: row.lead_id, quotationNumber: row.quotation_number,
  customerName: row.customer_name, customerMobile: row.customer_mobile, currencyCode: row.currency_code,
  incoterm: row.incoterm, terms: row.terms, subtotal: Number(row.subtotal),
  discountAmount: Number(row.discount_amount), taxPercent: Number(row.tax_percent),
  taxAmount: Number(row.tax_amount), totalAmount: Number(row.total_amount),
  createdByUserId: row.created_by_user_id, createdAt: row.created_at.getTime(), items,
});

export const postgresQuotationRepository = {
  async leadExists(database: TransactionDatabase, tenantId: string, outletId: string, leadId: string) {
    const result = await database.client.query(
      "SELECT 1 FROM crm.leads WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3", [tenantId, outletId, leadId],
    );
    return (result.rowCount ?? 0) > 0;
  },

  async create(
    database: TransactionDatabase, tenantId: string, userId: string, input: QuotationCreateInput,
    calculated: { items: CalculatedQuotationItem[]; totals: QuotationTotals },
  ) {
    const header = await database.client.query<QuotationRow>(`
      WITH seed AS (SELECT public.uuid_generate_v7() AS id)
      INSERT INTO crm.quotations (
        id, tenant_id, outlet_id, lead_id, quotation_number, customer_name, customer_mobile,
        currency_code, incoterm, terms, subtotal, discount_amount, tax_percent, tax_amount,
        total_amount, created_by_user_id
      ) SELECT id, $1, $2, $3, 'QT-' || to_char(now(), 'YYYYMMDD') || '-' ||
          upper(replace(id::text, '-', '')), $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14 FROM seed
      RETURNING id, outlet_id, lead_id, quotation_number, customer_name, customer_mobile,
        currency_code, incoterm, terms, subtotal::text, discount_amount::text, tax_percent::text,
        tax_amount::text, total_amount::text, created_by_user_id, created_at
    `, [tenantId, input.outletId, input.leadId ?? null, input.customerName, input.customerMobile ?? "",
      input.currencyCode, input.incoterm ?? null, input.terms ?? "", calculated.totals.subtotal,
      calculated.totals.discountAmount, input.taxPercent ?? 18, calculated.totals.taxAmount,
      calculated.totals.totalAmount, userId]);
    const quotation = header.rows[0]!;
    for (const item of calculated.items) {
      await database.client.query(`INSERT INTO crm.quotation_items (
        tenant_id, quotation_id, product_id, line_number, product_name, quantity, mrp_unit_price,
        unit_price, line_subtotal, discount_amount, tax_amount, line_total
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [tenantId, quotation.id,
        item.productId ?? null, item.lineNumber, item.productName, item.quantity, item.mrpUnitPrice,
        item.unitPrice, item.lineSubtotal, item.discountAmount, item.taxAmount, item.lineTotal]);
    }
    return map(quotation, calculated.items);
  },
};
