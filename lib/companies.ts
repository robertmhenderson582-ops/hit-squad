import { NOVUS_EMAIL } from "./desk-role.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { testerByEmail, TESTER_SEATS, type CompanyId } from "./tester-seats.ts";

export type { CompanyId } from "./tester-seats.ts";

export const COMPANY_IDS = ["hitsquad", "madison", "cbi"] as const;

export type Company = {
  id: CompanyId;
  name: string;
};

export const COMPANIES: Company[] = [
  { id: "hitsquad", name: "Hit Squad" },
  { id: "madison", name: "Madison" },
  { id: "cbi", name: "CBI" },
];

export type CompanyScope = {
  isOwner: boolean;
  email: string;
  companyId?: CompanyId;
};

export function isCompanyId(value: string): value is CompanyId {
  return (COMPANY_IDS as readonly string[]).includes(value);
}

export function companyName(id: CompanyId): string {
  return COMPANIES.find((row) => row.id === id)?.name ?? id;
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

export function companiesForScope(scope?: CompanyScope | null): Company[] {
  if (!scope || scope.isOwner) return COMPANIES;
  const id = assignedCompanyId(scope);
  return COMPANIES.filter((row) => row.id === id);
}

export function canSeeCompany(scope: CompanyScope | null | undefined, companyId: CompanyId): boolean {
  if (!scope || scope.isOwner) return true;
  return assignedCompanyId(scope) === companyId;
}

/**
 * Infer which contractor a catalog job / site / board estimate belongs to.
 * Madison plant clients (P66, Yates, Georgia Power, Wood River) sit under Madison.
 * CBI is only the CBI label — no invented CBI sites.
 */
export function inferCompanyId(text: string | undefined | null): CompanyId {
  const t = (text ?? "").toLowerCase();
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
