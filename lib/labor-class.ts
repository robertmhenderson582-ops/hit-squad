export type LaborClass = "Merit" | "Union";

const UNION_CODES = ["PF", "BM", "OE", "LB", "IW", "TM"] as const;

export function craftCodeFromRole(role: string): string | null {
  const match = role.match(/\b(PF|BM|OE|LB|IW|TM|M)\b/i);
  if (match) return match[1].toUpperCase();
  const lower = role.toLowerCase();
  if (/\bmerit\b/.test(lower)) return "M";
  if (/pipefitter|pipe fitter/.test(lower)) return "PF";
  if (/boilermaker/.test(lower)) return "BM";
  if (/ironworker/.test(lower)) return "IW";
  if (/\boperator\b/.test(lower)) return "OE";
  if (/laborer/.test(lower)) return "LB";
  if (/teamster/.test(lower)) return "TM";
  return null;
}

export function defaultLaborClass(role: string): LaborClass {
  const code = craftCodeFromRole(role);
  if (code === "M") return "Merit";
  if (code && (UNION_CODES as readonly string[]).includes(code)) return "Union";
  return "Merit";
}
