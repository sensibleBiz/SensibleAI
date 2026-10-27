import { eventGatewayConfig } from "./eventGateway.config.js";

export interface EventInvoiceRequest {
  eventName: string;
  amount: number;
  customerDetails: {
    customerName?: string;
    city?: string;
    mobile?: string;
    companyName?: string;
  };
  invoiceNo: string;
  invoiceDate: Date;
  transactionId: string;
  outletId: string;
}

export const createEventInvoice = async (payload: EventInvoiceRequest) => {
  const response = await fetch(eventGatewayConfig.invoiceApiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      invoiceDate: payload.invoiceDate.toISOString(),
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Invoice API failed (${response.status}): ${text}`);
  }
  return JSON.parse(text) as { fileLink?: string; invoiceNo?: string };
};
