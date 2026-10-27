import { SESClient, SendEmailCommand, type SendEmailCommandInput } from "@aws-sdk/client-ses";
import { env } from "../../config/env.js";

let sesClient: SESClient | null = null;

function getSesClient(): SESClient {
  if (sesClient) return sesClient;

  if (!env.aws.accessKeyId || !env.aws.secretAccessKey) {
    throw new Error("AWS SES credentials are not configured in environment variables (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY).");
  }

  sesClient = new SESClient({
    region: env.aws.region,
    credentials: {
      accessKeyId: env.aws.accessKeyId,
      secretAccessKey: env.aws.secretAccessKey,
    },
  });

  return sesClient;
}

export interface SendSesEmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
}

export interface SendSesEmailResult {
  success: boolean;
  messageId?: string | undefined;
  error?: string | undefined;
}

/**
 * Dispatches an email through Amazon SES using the verified domain sensible.biz.
 * Ensures the Reply-To header points back to sensibleconnect.com (Google Workspace)
 * so recipient replies land directly in the rep's inbox without consuming extra Google licenses.
 */
export async function sendSesEmail(options: SendSesEmailOptions): Promise<SendSesEmailResult> {
  try {
    const client = getSesClient();

    const toAddresses = Array.isArray(options.to) ? options.to : [options.to];
    const ccAddresses = options.cc ? (Array.isArray(options.cc) ? options.cc : [options.cc]) : [];
    const bccAddresses = options.bcc ? (Array.isArray(options.bcc) ? options.bcc : [options.bcc]) : [];
    const replyToAddresses = options.replyTo
      ? Array.isArray(options.replyTo)
        ? options.replyTo
        : [options.replyTo]
      : ["sales@sensibleconnect.com"];

    const fromAddress = options.from || env.aws.sesFromEmail || "communications@sensible.biz";

    const params: SendEmailCommandInput = {
      Source: fromAddress,
      Destination: {
        ToAddresses: toAddresses,
        CcAddresses: ccAddresses.length > 0 ? ccAddresses : undefined,
        BccAddresses: bccAddresses.length > 0 ? bccAddresses : undefined,
      },
      Message: {
        Subject: {
          Data: options.subject,
          Charset: "UTF-8",
        },
        Body: {
          Html: options.html
            ? {
                Data: options.html,
                Charset: "UTF-8",
              }
            : undefined,
          Text: options.text
            ? {
                Data: options.text,
                Charset: "UTF-8",
              }
            : undefined,
        },
      },
      ReplyToAddresses: replyToAddresses,
    };

    const command = new SendEmailCommand(params);
    const response = await client.send(command);

    return {
      success: true,
      messageId: response.MessageId ?? undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[AWS SES Email Dispatch Error]", errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}
