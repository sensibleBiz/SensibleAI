const LEAKED_DIRECTIVE_PREFIXES = [
  "SYSTEM DIRECTIVE",
  "[TYPE:",
  "<<INTERNAL",
  "INTERNAL_INSTRUCTION",
  "<<DIRECTIVE",
] as const;

export function sanitizeAnswer(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !LEAKED_DIRECTIVE_PREFIXES.some((p) => t.startsWith(p));
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
