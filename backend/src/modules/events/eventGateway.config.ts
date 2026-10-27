import { env } from "../../config/env.js";

export const eventGatewayConfig = {
  phonePe: env.events.phonePe,
  invoiceApiUrl: env.events.invoiceApiUrl,
  whatsapp: env.events.whatsapp,
};
