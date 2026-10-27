export type CrmIntent =
  | "CRM_DATA"
  | "SALES_ADVICE"
  | "DATA_PLUS_ADVICE"
  | "GENERAL_CRM"
  | "TARGET_WRITE"
  | "UNSUPPORTED";

const UNSUPPORTED_PATTERNS: RegExp[] = [
  /\b(delete|remove|erase)\b.*(lead|record|contact)/i,
  /\b(send|compose|write)\b.*(email|whatsapp|sms|message)\b/i,
  /\b(book|schedule|create|add|insert|update|edit|modify)\b.*(lead|record|meeting|appointment)/i,
  /\bholiday\s*(calend|list|schedul)/i,
  /\b(public|national|bank)\s+holiday/i,
  /\b(payroll|salary|increment|appraisal|leave\s+balance|leave\s+policy)\b/i,
  /\b(hr\s+policy|company\s+policy|employee\s+handbook)\b/i,
  /\b(expense|expenses|reimburs|claim)\b/i,
  /\btoday[''s]?\s+expense/i,
];

const DATA_ONLY_PATTERNS: RegExp[] = [
  /\bhow many\b/i,
  /\btotal\b.*(lead|count|enquir|task|activit|customer)/i,
  /\b(list|show|display|find|search|get)\b.*(lead|contact|enquir|task|activit|customer)/i,
  /\bleads?\s+(in|for|from|during|on|at|today|yesterday|this week|last month)\b/i,
  /\b(today'?s?|yesterday'?s?|this week'?s?|last month'?s?)\s+leads?\b/i,
  /\bwhich leads?\b/i,
  /\bcount of\b/i,
  /\b(stage|pipeline)\s+(count|summary|breakdown|distribution)\b/i,
  /\bleads?\s+in\s+(new|assigned|followup|follow.up|won|lost|disqualified)\b/i,
  /\bdo\s+(i|we)\s+(have|get)\b.*\bleads?\b/i,
  /\bany\s+leads?\b/i,
  /\btasks?\b/i,
  /\boverdue\b/i,
  /\bopen\s+tasks?\b/i,
  /\bpending\s+tasks?\b/i,
  /\bactivit(y|ies)\b/i,
  /\bfollow.?up\s+(activit|schedul|due|pending)\b/i,
  /\b(demo|visit|installation)\s+(schedul|pending|due|count)\b/i,
  /\bcustomers?\b.*(count|total|how many|list|show)\b/i,
  /\bhow many\s+customers?\b/i,
  /\b(repeat|new|prospect)\s+customers?\b/i,
  /\b(which|top|best)\s+cit(y|ies)\b/i,
  /\bleads?\s+(by\s+city|by\s+location|per\s+city)\b/i,
  /\brepeated\b.*\benquir/i,
  /\bduplicate\s+(leads?|enquir)/i,
];

const DATA_PLUS_ADVICE_PATTERNS: RegExp[] = [
  /\bwhy\b.*(low|high|stuck|slow|drop|fail|poor|not\s+clos|less|bad)/i,
  /\b(analyze|analyse|analysis)\b.*\b(my|pipeline|funnel|lead|sales)\b/i,
  /\bstuck\s+in\b/i,
  /\bmy\b.*(closing\s+ratio|conversion\s+rate|funnel|pipeline)\b.*\b(improve|increase|boost|fix|better|why|low|analyze)\b/i,
  /\b(improve|increase|boost)\b.*\bmy\b.*(closing\s+ratio|conversion\s+rate|pipeline|funnel)\b/i,
  /\bwhat\s+should\s+i\s+(focus|do|improve)\b/i,
  /\b(focus\s+on|what\s+to\s+focus)\b/i,
  /\bbased\s+on\s+my\b/i,
  /\b(how\s+many|which|what)\b.*(follow.?up|stuck|stale|old)\b.*(how|what|advice|should)\b/i,
  /\bwhy\s+(is|are|do|does)\s+my\b/i,
];

export const TARGET_WRITE_PATTERNS: RegExp[] = [
  /\bset\s+(a\s+)?target\b/i,
  /\bset\s+[\d₹,]+\s*(as\s+)?target\b/i,
  /\bassign\s+(a\s+)?target\b/i,
  /\bgive\s+(a\s+)?target\b/i,
  /\bupdate\s+(the\s+)?target\b/i,
  /\btarget\s+(of|for|to)\s+[\d₹]/i,
  /\b[\d₹,]+\s+target\b/i,
  /\btarget\b.*\b(to|for)\s+(all|every|each)\b/i,
  /\b(all|every|each)\s+(employee|staff|team|sales)\b.*\btarget\b/i,
  /\bset\b.*\btarget\b.*\b(all|every|each)\b/i,
];

const SALES_ADVICE_PATTERNS: RegExp[] = [
  /\b(tip|tips|advice|technique|strategies?|best\s+practice|approach)\b/i,
  /\bhow\s+(to|do\s+i|can\s+i|should\s+i)\s+(sell|close\s+deal|convert\s+lead|handle\s+lead|follow.?up|improve\s+sales|increase\s+sales|boost\s+sales)\b/i,
  /\bwhat\s+are\s+the\s+best\b/i,
  /\b(improve|increase|boost)\s+(my\s+)?(sales|revenue|closing|team\s+performance)\b/i,
  /\bhow\s+(to|do|can)\s+(improve|increase|boost)\b.*(sales|revenue|closing|performance)\b/i,
];

export function classifyIntent(message: string): CrmIntent {
  if (UNSUPPORTED_PATTERNS.some((p) => p.test(message))) return "UNSUPPORTED";
  if (TARGET_WRITE_PATTERNS.some((p) => p.test(message))) return "TARGET_WRITE";

  const isDataOnly = DATA_ONLY_PATTERNS.some((p) => p.test(message));
  const isDataPlusAdvice = DATA_PLUS_ADVICE_PATTERNS.some((p) => p.test(message));
  const isSalesAdvice = SALES_ADVICE_PATTERNS.some((p) => p.test(message));

  if (isDataPlusAdvice) return "DATA_PLUS_ADVICE";
  if (isDataOnly && !isSalesAdvice) return "CRM_DATA";
  if (isSalesAdvice) return "SALES_ADVICE";
  if (isDataOnly) return "DATA_PLUS_ADVICE";

  return "GENERAL_CRM";
}

export const INTENT_CONTEXT: Partial<Record<CrmIntent, string>> = {
  CRM_DATA:
    "Call the appropriate database tool and return exact numbers only. Do not give generic advice.",
  SALES_ADVICE:
    "Answer from sales knowledge only — do NOT call any database tools.",
  DATA_PLUS_ADVICE:
    "Call the relevant metric tool first, then give brief data-grounded advice based on the real numbers.",
  GENERAL_CRM:
    "Answer from CRM knowledge. Use tools only if specific numbers are needed. " +
    "If the question has nothing to do with CRM or sales, respond in 1-2 short friendly sentences: acknowledge it's outside your area (avoid stiff phrasing), then offer to help with leads, targets, or team performance.",
  TARGET_WRITE:
    "The user wants to set a sales target. " +
    "If a specific employee name is mentioned, call set_employee_target with that name, zone, and amount. " +
    "If the user says 'all employees', 'all staff', 'everyone', or similar, call set_all_employee_targets. " +
    "For set_all_employee_targets: ALWAYS pass the zone if the user mentioned one — when zone is given the tool reaches ALL outlet employees, not just those with existing rows. " +
    "If no zone is mentioned, ask the user which zone before calling the tool. " +
    "Call the appropriate tool immediately — do not give general advice. The tool will request user confirmation before any data is written.",
};
