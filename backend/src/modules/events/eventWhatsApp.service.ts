import { eventGatewayConfig } from "./eventGateway.config.js";
import { normalizeEventMobileWithCountry } from "./eventMobile.util.js";

export const sendEventPaymentWhatsApp = async (users: Array<{ name: string; mobile: string }>) => {
  const { whatsapp } = eventGatewayConfig;
  if (!whatsapp.authKey || users.length === 0) {
    return;
  }

  const reqBody = {
    integrated_number: whatsapp.integratedNumber,
    content_type: "template",
    payload: {
      messaging_product: "whatsapp",
      type: "template",
      template: {
        name: whatsapp.templateName,
        language: { code: "en", policy: "deterministic" },
        namespace: whatsapp.templateNamespace,
        to_and_components: users.map((user) => ({
          to: [normalizeEventMobileWithCountry(user.mobile)],
          components: {
            body_1: { type: "text", value: user.name },
          },
        })),
      },
    },
  };

  try {
    const response = await fetch(whatsapp.bulkUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authkey: whatsapp.authKey,
      },
      body: JSON.stringify(reqBody),
    });
    const body = await response.text();
    console.log("Event WhatsApp response:", response.status, body);
  } catch (error) {
    console.error("Event WhatsApp send failed:", error);
  }
};
