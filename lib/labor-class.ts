export type LaborClass = "Merit" | "Union";

const UNION_CODES = ["PF", "BM", "OE", "LB", "IW", "TM"] as const;

export function craftCodeFromRole(role: string): string | null {
  const match = role.match(/\b(PF|BM|OE|LB|IW|TM|M)\b/i);
  return match ? match[1].toUpperCase() : null;
}

export function defaultLaborClass(role: string): LaborClass {
  const code = craftCodeFromRole(role);
  if (code === "M") return "Merit";
  if (code && (UNION_CODES as readonly string[]).includes(code)) return "Union";
  return "Merit";
}
