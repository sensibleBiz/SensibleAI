import assert from "node:assert/strict";
import test from "node:test";
import { calculateQuotation } from "../src/modules/quotations/postgresQuotation.service.js";
import { postgresQuotationCreateSchema } from "../src/modules/quotations/postgresQuotation.validator.js";

test("quotation validation accepts supported currencies and Incoterms", () => {
  const base = {
    outletId: "11111111-1111-4111-8111-111111111111",
    customerName: "Buyer",
    items: [{ productName: "Machine", quantity: 1, mrpUnitPrice: 100, unitPrice: 90 }],
  };
  for (const currencyCode of ["USD", "EUR", "INR"]) {
    assert.equal(postgresQuotationCreateSchema.safeParse({ ...base, currencyCode, incoterm: "FOB" }).success, true);
  }
  assert.equal(postgresQuotationCreateSchema.safeParse({ ...base, currencyCode: "GBP" }).success, false);
  assert.equal(postgresQuotationCreateSchema.safeParse({
    ...base, currencyCode: "USD", items: [{ ...base.items[0], unitPrice: 110 }],
  }).success, false);
});

test("quotation calculation rounds each line and derives header totals", () => {
  const result = calculateQuotation({
    taxPercent: 18,
    items: [
      { productName: "Machine", quantity: 2, mrpUnitPrice: 125, unitPrice: 99.99 },
      { productName: "Setup", quantity: 1, mrpUnitPrice: 50, unitPrice: 50 },
    ],
  });
  assert.deepEqual(result.totals, {
    subtotal: 249.98, discountAmount: 50.02, taxAmount: 45, totalAmount: 294.98,
  });
  assert.deepEqual(result.items.map((item) => item.lineTotal), [235.98, 59]);
});
