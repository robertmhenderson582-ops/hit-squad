import { NOVUS_EMAIL } from "./desk-role.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { testerByEmail, TESTER_SEATS, type CompanyId } from "./tester-seats.ts";

export type { CompanyId } from "./tester-seats.ts";

export type Company = {
  id: CompanyId;
  name: string;
  /** Root-relative, http(s), or data-image URL already on file. Never invented. */
  logo?: string;
};

export const LUCKY13_ID = "lucky13";
export const LUCKY13_NAME = "Lucky 13 Welding & Fabrication";

/** Quiet one-off lane. Not a client company and not a second product. */
export const STANDALONE_ID = "standalone";
export const STANDALONE_NAME = "Standalone";

/** Seed catalog. Owner can add more; those persist separately. Standalone is not a company row. */
export const COMPANIES: Company[] = [
  { id: "hitsquad", name: "Hit Squad" },
  { id: "madison", name: "Madison" },
  { id: "cbi", name: "CBI" },
  { id: LUCKY13_ID, name: LUCKY13_NAME },
];

export const COMPANY_IDS = COMPANIES.map((row) => row.id);

export type CompanyScope = {
  isOwner: boolean;
  email: string;
  companyId?: CompanyId;
};

const COMPANY_ID_RE = /^[a-z][a-z0-9]{0,39}$/;

export function companyIdFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40);
}

export function isCompanyId(value: string): value is CompanyId {
  return COMPANY_ID_RE.test(value.trim());
}

export function isStandaloneId(id?: string | null): boolean {
  return (id ?? "").trim().toLowerCase() === STANDALONE_ID;
}

export function peopleLane(companyId?: string | null): "company" | "standalone" {
  return isStandaloneId(companyId) ? "standalone" : "company";
}

export function samePeopleLane(a?: string | null, b?: string | null): boolean {
  return peopleLane(a) === peopleLane(b);
}

export function assignmentChoices(catalog: Company[] = COMPANIES): Company[] {
  const rows = catalog.filter((row) => !isStandaloneId(row.id));
  return [...rows, { id: STANDALONE_ID, name: STANDALONE_NAME }];
}

export function companyName(id: CompanyId, catalog: Company[] = COMPANIES): string {
  if (isStandaloneId(id)) return STANDALONE_NAME;
  return catalog.find((row) => row.id === id)?.name ?? id;
}

export function companyLogoSrc(value?: string | null): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\")) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(raw)) return raw;
  return null;
}

export function withCompanyLogo(row: Company): Company {
  const logo = companyLogoSrc(row.logo);
  return logo ? { id: row.id, name: row.name, logo } : { id: row.id, name: row.name };
}

export function mergeCompanies(extra: Company[] = []): Company[] {
  const seen = new Map<string, Company>();
  for (const row of [...COMPANIES, ...extra]) {
    if (!row?.id || !row?.name || !isCompanyId(row.id) || isStandaloneId(row.id)) continue;
    const next = withCompanyLogo(row);
    const prev = seen.get(row.id);
    if (prev) {
      if (next.logo && !prev.logo) seen.set(row.id, { ...prev, logo: next.logo });
      continue;
    }
    seen.set(row.id, next);
  }
  return [...seen.values()];
}

/** Assigned contractor only — not every company an owner can see. */
export function assignedCompaniesForId(assignedId?: CompanyId | null, catalog: Company[] = COMPANIES): Company[] {
  if (!assignedId || isStandaloneId(assignedId)) return [];
  return catalog.filter((row) => row.id === assignedId && !isStandaloneId(row.id)).map(withCompanyLogo);
}

/** Exactly one assigned company with a logo on file. Otherwise keep the text door. */
export function companyDeskLogoSrc(companies: Array<{ logo?: string | null }> = []): string | null {
  const logos = companies.map((row) => companyLogoSrc(row.logo)).filter((src): src is string => Boolean(src));
  return logos.length === 1 ? logos[0] : null;
}

export function seedCompanyForEmail(email: string): CompanyId {
  const key = email.trim().toLowerCase();
  if (!key) return "hitsquad";
  if (key === OWNER_LOGIN_EMAIL) return "hitsquad";
  if (key === NOVUS_EMAIL) return "hitsquad";
  return testerByEmail(key)?.company ?? "hitsquad";
}

/** Seed or override map. Owner stays company-desk; standalone is never inferred from a name. */
export function companyIdForEmail(email: string, assignments: Record<string, string> = {}): CompanyId {
  const key = email.trim().toLowerCase();
  const assigned = assignments[key];
  if (assigned && (isCompanyId(assigned) || isStandaloneId(assigned))) return assigned;
  return seedCompanyForEmail(key);
}

export function companyScopeFor(user?: { email?: string; role?: string } | null, companyId?: CompanyId): CompanyScope | undefined {
  if (!user?.email) return undefined;
  return {
    isOwner: user.role === "owner",
    email: user.email,
    companyId: companyId ?? seedCompanyForEmail(user.email),
  };
}

export function assignedCompanyId(scope?: CompanyScope | null): CompanyId {
  if (!scope) return "hitsquad";
  return scope.companyId ?? seedCompanyForEmail(scope.email);
}

export function companiesForScope(scope?: CompanyScope | null, catalog: Company[] = COMPANIES): Company[] {
  const rows = catalog.filter((row) => !isStandaloneId(row.id));
  if (!scope || scope.isOwner) return rows;
  const id = assignedCompanyId(scope);
  if (isStandaloneId(id)) return [];
  return rows.filter((row) => row.id === id);
}

export function canSeeCompany(scope: CompanyScope | null | undefined, companyId: CompanyId): boolean {
  if (isStandaloneId(companyId)) return false;
  if (!scope || scope.isOwner) return true;
  if (isStandaloneId(assignedCompanyId(scope))) return false;
  return assignedCompanyId(scope) === companyId;
}

/**
 * Infer which contractor a catalog job / site / board estimate belongs to.
 * Madison plant clients (P66, Yates, Georgia Power, Wood River) sit under Madison.
 * CBI is only the CBI label — no invented CBI sites.
 * Lucky 13 matches that name only — no invented Lucky 13 sites.
 */
export function inferCompanyId(text: string | undefined | null): CompanyId {
  const t = (text ?? "").toLowerCase();
  if (/lucky\s*13/.test(t)) return LUCKY13_ID;
  if (/\bcbi\b/.test(t)) return "cbi";
  if (/\bmadison\b|\bp66\b|phillips 66|wood river|\byates\b|georgia power|monroe energy|\bmonroe\b|\btrainer\b/.test(t)) {
    return "madison";
  }
  return "hitsquad";
}

export function inferCompanyIdFromParts(...parts: Array<string | undefined | null>): CompanyId {
  for (const part of parts) {
    const id = inferCompanyId(part);
    if (id !== "hitsquad") return id;
  }
  return inferCompanyId(parts.filter(Boolean).join(" "));
}

export function catalogVisibleTo(scope: CompanyScope | null | undefined, ...parts: Array<string | undefined | null>): boolean {
  if (!scope || scope.isOwner) return true;
  return inferCompanyIdFromParts(...parts) === assignedCompanyId(scope);
}

export function seedCompanyMap(): Record<string, CompanyId> {
  const next: Record<string, CompanyId> = {
    [OWNER_LOGIN_EMAIL]: "hitsquad",
    [NOVUS_EMAIL]: "hitsquad",
  };
  for (const seat of TESTER_SEATS) next[seat.email] = seat.company;
  return next;
}
