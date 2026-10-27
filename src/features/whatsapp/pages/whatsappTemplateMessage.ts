type TemplateMessage = {
  template_name?: string;
  originalMsg?: string;
  origialMsg?: string;
  content?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getNonEmptyText = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const getTextParameter = (value: unknown): string | undefined => {
  if (!isRecord(value)) return undefined;
  return getNonEmptyText(value.text);
};

/**
 * Supports both WhatsApp payload shapes currently stored in Firestore:
 * `content.body_1.text` and `content.template.components[].parameters[].text`.
 */
export const getTemplateBodyParameters = (content: unknown): string[] => {
  if (!isRecord(content)) return [];

  const dynamicBodyParameters = Object.entries(content)
    .map(([key, value]) => {
      const match = /^body_(\d+)$/.exec(key);
      return match
        ? { index: Number(match[1]), text: getTextParameter(value) }
        : undefined;
    })
    .filter(
      (item): item is { index: number; text: string } => Boolean(item?.text)
    )
    .sort((a, b) => a.index - b.index)
    .map(({ text }) => text);

  if (dynamicBodyParameters.length > 0) return dynamicBodyParameters;

  const template = content.template;
  if (!isRecord(template) || !Array.isArray(template.components)) return [];

  return template.components.flatMap((component) => {
    if (!isRecord(component) || String(component.type).toLowerCase() !== "body") {
      return [];
    }

    return Array.isArray(component.parameters)
      ? component.parameters
          .map(getTextParameter)
          .filter((text): text is string => Boolean(text))
      : [];
  });
};

const formatRenewalTemplate = (parameters: string[]): string | undefined => {
  const [customerName, businessName, expiryDate, branchName] = parameters;
  if (!customerName || !businessName || !expiryDate || !branchName) {
    return undefined;
  }

  return [
    "*Subscription Renewal Reminder*",
    `Dear ${customerName},`,
    `Your SensiblePOS subscription for ${businessName} (Branch - ${branchName}) will expire on ${expiryDate}.`,
    "To avoid any interruption in billing and daily operations, please renew your subscription before the expiry date.",
    "Renew Now",
  ].join("\n\n");
};

/** Returns the most complete human-readable version of a stored template message. */
export const getTemplateMessageText = (
  message: TemplateMessage
): string | undefined => {
  const parameters = getTemplateBodyParameters(message.content);
  const templateName = getNonEmptyText(message.template_name)?.toLowerCase();

  // Some webhook rows contain an originalMsg with blank variables even though
  // the actual values are present in template.components.
  if (templateName === "renewal_template") {
    const renewalMessage = formatRenewalTemplate(parameters);
    if (renewalMessage) return renewalMessage;
  }

  const originalMessage =
    getNonEmptyText(message.originalMsg) ?? getNonEmptyText(message.origialMsg);
  if (originalMessage) return originalMessage;

  if (isRecord(message.content)) {
    const contentText = getNonEmptyText(message.content.text);
    if (contentText) return contentText;
  }

  return parameters.length > 0 ? parameters.join("\n") : undefined;
};
