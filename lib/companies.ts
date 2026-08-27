import { NOVUS_EMAIL } from "./desk-role.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { testerByEmail, TESTER_SEATS, type CompanyId } from "./tester-seats.ts";

export type { CompanyId } from "./tester-seats.ts";

export type Company = {
  id: CompanyId;
  name: string;
};

export const LUCKY13_ID = "lucky13";
export const LUCKY13_NAME = "Lucky 13 Welding & Fabrication";

/** Seed catalog. Owner can add more; those persist separately. */
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

export function companyName(id: CompanyId, catalog: Company[] = COMPANIES): string {
  return catalog.find((row) => row.id === id)?.name ?? id;
}

export function mergeCompanies(extra: Company[] = []): Company[] {
  const seen = new Set<string>();
  const next: Company[] = [];
  for (const row of [...COMPANIES, ...extra]) {
    if (!row?.id || !row?.name || !isCompanyId(row.id) || seen.has(row.id)) continue;
    seen.add(row.id);
    next.push({ id: row.id, name: row.name });
  }
  return next;
}

export function seedCompanyForEmail(email: string): CompanyId {
  const key = email.trim().toLowerCase();
  if (!key) return "hitsquad";
  if (key === OWNER_LOGIN_EMAIL) return "hitsquad";
  if (key === NOVUS_EMAIL) return "hitsquad";
  return testerByEmail(key)?.company ?? "hitsquad";
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
  if (!scope || scope.isOwner) return catalog;
  const id = assignedCompanyId(scope);
  return catalog.filter((row) => row.id === id);
}

export function canSeeCompany(scope: CompanyScope | null | undefined, companyId: CompanyId): boolean {
  if (!scope || scope.isOwner) return true;
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
  if (/\bmadison\b|\bp66\b|phillips 66|wood river|\byates\b|georgia power/.test(t)) {
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
