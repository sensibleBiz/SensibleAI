import crypto from "node:crypto";
import { eventGatewayConfig } from "./eventGateway.config.js";

interface PhonePeEnvironment {
  merchantId: string;
  storeId: string;
  terminalId: string;
  saltKey: string;
  hostUrl: string;
  providerId: string;
}

const resolveEnvironment = (isProd: boolean): PhonePeEnvironment => {
  const config = eventGatewayConfig.phonePe;
  if (isProd) {
    return {
      merchantId: config.merchantIdProd,
      storeId: config.storeIdProd,
      terminalId: config.terminalIdProd,
      saltKey: config.saltKeyProd,
      hostUrl: config.prodHostUrl,
      providerId: config.providerIdProd,
    };
  }
  return {
    merchantId: config.merchantIdTest,
    storeId: config.storeIdTest,
    terminalId: config.terminalIdTest,
    saltKey: config.saltKeyTest,
    hostUrl: config.testHostUrl,
    providerId: config.providerIdTest,
  };
};

const buildChecksum = (payload: string, path: string, saltKey: string) => {
  const sha256 = crypto.createHash("sha256").update(`${payload}${path}${saltKey}`).digest("hex");
  return `${sha256}###${eventGatewayConfig.phonePe.saltIndex}`;
};

export class PhonePeOfflineService {
  async initiatePayLink(params: {
    isProd: boolean;
    transactionId: string;
    merchantOrderId: string;
    amount: number;
    customerPhoneNumber: string;
  }) {
    const envConfig = resolveEnvironment(params.isProd);
    if (!envConfig.saltKey) {
      throw new Error("PhonePe salt key is not configured");
    }

    const requestBody = {
      merchantId: envConfig.merchantId,
      transactionId: params.transactionId,
      merchantOrderId: params.merchantOrderId,
      amount: Math.round(Number(params.amount) * 100),
      storeId: envConfig.storeId,
      terminalId: envConfig.terminalId,
      intentExpiryInSeconds: 1800,
      solutionType: "PAY_LINK",
      sendToCustomer: true,
      customerPhoneNumber: params.customerPhoneNumber,
      generatePaylink: true,
    };

    const payloadMain = Buffer.from(JSON.stringify(requestBody)).toString("base64");
    const intentPath = eventGatewayConfig.phonePe.intentPath;
    const url = `${envConfig.hostUrl}${intentPath}`;
    const checkSum = buildChecksum(payloadMain, intentPath, envConfig.saltKey);

    const headers: Record<string, string> = {
      "X-PROVIDER-ID": envConfig.providerId,
      "X-VERIFY": checkSum,
      "X-CALL-MODE": "POST",
      "Content-Type": "application/json",
    };
    if (eventGatewayConfig.phonePe.callbackUrl) {
      headers["X-CALLBACK-URL"] = eventGatewayConfig.phonePe.callbackUrl;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ request: payloadMain }),
    });
    const bodyText = await response.text();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(bodyText) as Record<string, unknown>;
    } catch {
      body = { message: bodyText };
    }
    return { ok: response.ok, status: response.status, body };
  }

  async getTransactionStatus(params: { isProd: boolean; transactionId: string }) {
    const envConfig = resolveEnvironment(params.isProd);
    if (!envConfig.saltKey) {
      throw new Error("PhonePe salt key is not configured");
    }

    const statusPath =
      `${eventGatewayConfig.phonePe.statusPathPrefix}${envConfig.merchantId}/${params.transactionId}/status`;
    const url = `${envConfig.hostUrl}${statusPath}`;
    const checkSum = buildChecksum("", statusPath, envConfig.saltKey);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
        "X-VERIFY": checkSum,
        "X-PROVIDER-ID": envConfig.providerId,
      },
    });
    const bodyText = await response.text();
    return JSON.parse(bodyText) as Record<string, unknown>;
  }
}

export const phonePeOfflineService = new PhonePeOfflineService();
