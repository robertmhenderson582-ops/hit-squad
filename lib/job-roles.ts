/**
 * Phase 1 job titles for Managed users.
 * Login seats stay owner / operator / tester / president.
 * These labels are the Role dropdown. Phase 2 module writes (estimate fill,
 * Change Orders, STC order) live on privilege / PM gates — not this list.
 */

/** Parked for a later hall. Not a Phase 1 Role option and not a seeded seat. */
export const PARKED_HALL_JOB_ROLES = ["Hall Local 363"] as const;

export const SEED_JOB_ROLES = [
  "President",
  "Division Manager",
  "HSE Manager",
  "HSE Dispatcher",
  "DISA DER",
  "Hall Local 553",
  "Quality Manager",
  "Accounting Manager",
  "Office Manager",
  "Project Manager",
  "Site Safety Manager",
  "Quality Site Manager",
  "Superintendent",
  "General Superintendent",
  "Project Controls",
  "Document Clerk",
  "Field Clerk",
  "Time Keeper",
  "General Foreman",
  "Foreman",
  "Tool Room attendant",
] as const;

export type SeedJobRole = (typeof SEED_JOB_ROLES)[number];

export const DEFAULT_JOB_ROLE: SeedJobRole = "Project Controls";

const SEEDED_JOB_ROLE_BY_EMAIL: Record<string, SeedJobRole> = {
  "nathanboyte@gmail.com": "Project Manager",
  "johnbeech.madison@gmail.com": "Project Manager",
  "josephmhenderson2002@gmail.com": "Project Manager",
  "chancec318@yahoo.com": "Quality Manager",
  "wlanderno@yahoo.com": "HSE Manager",
  "bccamp2@gmail.com": "Site Safety Manager",
  "jbattuello@ualocal553.org": "Hall Local 553",
};

const JOB_TITLE_MAX = 80;

export function normalizeJobRoleLabel(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function parseJobRoleLabel(value: unknown): { label: string } | { error: string } {
  const label = normalizeJobRoleLabel(value);
  if (label.length < 2) return { error: "Type a role name." };
  if (label.length > JOB_TITLE_MAX) return { error: "That name is too long." };
  return { label };
}

export function isSeedJobRole(value: string): value is SeedJobRole {
  return (SEED_JOB_ROLES as readonly string[]).includes(value);
}

export function isProjectManagerTitle(value?: string | null): boolean {
  return normalizeJobRoleLabel(value) === "Project Manager";
}

export function mergeJobRoleCatalog(custom: readonly string[] = []): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const label of [...SEED_JOB_ROLES, ...custom.map(normalizeJobRoleLabel)]) {
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    next.push(label);
  }
  return next;
}

export function parseJobRoleCatalog(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const extras: string[] = [];
  const seen = new Set(SEED_JOB_ROLES.map((row) => row.toLowerCase()));
  for (const item of raw) {
    const parsed = parseJobRoleLabel(item);
    if ("error" in parsed) continue;
    const key = parsed.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    extras.push(parsed.label);
  }
  return extras;
}

export function loginRoleForJobTitle(title: string): "president" | "tester" {
  return normalizeJobRoleLabel(title) === "President" ? "president" : "tester";
}

export function defaultJobRoleForSeat(user?: {
  email?: string;
  name?: string;
  role?: string;
  jobTitle?: string;
} | null): string {
  if (!user) return DEFAULT_JOB_ROLE;
  if (user.role === "owner") return "Owner";
  if (user.role === "operator") return "Operator";
  const stored = normalizeJobRoleLabel(user.jobTitle);
  if (stored) return stored;
  if (user.role === "president") return "President";
  const email = (user.email || "").trim().toLowerCase();
  if (email && SEEDED_JOB_ROLE_BY_EMAIL[email]) return SEEDED_JOB_ROLE_BY_EMAIL[email];
  const name = (user.name || "").toLowerCase();
  if (/\bfreddy\b/.test(name)) return "President";
  if (/\blisa\b/.test(name)) return "Accounting Manager";
  if (/\bchance\b/.test(name)) return "Quality Manager";
  if (/\bwendell\b/.test(name)) return "HSE Manager";
  if (/\bbenny\b/.test(name)) return "Site Safety Manager";
  if (/\btom fried\b/.test(name)) return "DISA DER";
  if (/\bnathan\b/.test(name) || /\bjohn beech\b/.test(name) || /\bjoseph\b/.test(name)) {
    return "Project Manager";
  }
  return DEFAULT_JOB_ROLE;
}

export function resolveJobRole(
  user: { email?: string; name?: string; role?: string; jobTitle?: string } | null | undefined,
  overrides: Record<string, string> = {},
): string {
  const email = (user?.email || "").trim().toLowerCase();
  const override = email ? normalizeJobRoleLabel(overrides[email]) : "";
  if (override) {
    if (user?.role === "owner") return "Owner";
    if (user?.role === "operator") return "Operator";
    return override;
  }
  return defaultJobRoleForSeat(user);
}

export function parseSeatJobTitles(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const next: Record<string, string> = {};
  for (const [email, value] of Object.entries(raw as Record<string, unknown>)) {
    const key = email.trim().toLowerCase();
    const parsed = parseJobRoleLabel(value);
    if (!key || !key.includes("@") || "error" in parsed) continue;
    next[key] = parsed.label;
  }
  return next;
}

export function systemSeatRoleLabel(role?: string | null): string | null {
  if (role === "owner") return "Owner";
  if (role === "operator") return "Operator";
  return null;
}
