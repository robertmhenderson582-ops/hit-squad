/**
 * Rate Vault — partitioned B-1 / rate builder workshop.
 *
 * Owns its own types and stub store. Do not import estimate packs, Jobs,
 * Quality, HSE, seats, Inbox, or Rate Tables from this module. A later
 * break-off app can consume this file (and `/api/rate-vault`) as the
 * public boundary.
 */

export const RATE_VAULT_PRIVILEGE = "rate-vault" as const;
export const RATE_VAULT_HREF = "/rate-vault";
export const RATE_VAULT_API = "/api/rate-vault";
export const RATE_VAULT_TITLE = "Rate Vault";
export const RATE_VAULT_KICKER = "B-1 Builder";
export const RATE_VAULT_OWNER_NOTE = "Private workshop — not for testers.";

export const RATE_VAULT_SECTIONS = [
  {
    id: "halls",
    label: "Hall uploads",
    note: "Union / hall books land here later. No ingest in this scaffold.",
  },
  {
    id: "contractor",
    label: "Contractor books",
    note: "Contractor rate books land here later.",
  },
  {
    id: "p66",
    label: "P66 / site rules",
    note: "Phillips 66 and site rules land here later.",
  },
  {
    id: "publish",
    label: "Publish rate package",
    note: "Stub only — does not write live estimate Rate Tables.",
  },
] as const;

export type RateVaultSectionId = (typeof RATE_VAULT_SECTIONS)[number]["id"];

export type RateVaultPublishStub = {
  status: "stub";
  published: false;
  packageId: null;
  note: string;
};

export type RateVaultWorkshop = {
  id: "rate-vault";
  name: typeof RATE_VAULT_TITLE;
  purpose: "B-1 / rate builder workshop";
  ownerNote: typeof RATE_VAULT_OWNER_NOTE;
  sections: typeof RATE_VAULT_SECTIONS;
  publish: RateVaultPublishStub;
};

export function emptyRateVaultWorkshop(): RateVaultWorkshop {
  return {
    id: "rate-vault",
    name: RATE_VAULT_TITLE,
    purpose: "B-1 / rate builder workshop",
    ownerNote: RATE_VAULT_OWNER_NOTE,
    sections: RATE_VAULT_SECTIONS,
    publish: {
      status: "stub",
      published: false,
      packageId: null,
      note: "Publish is a stub. Live Rate Tables stay on Jobs / Rates.",
    },
  };
}

export function stubPublishRateVault(): RateVaultPublishStub {
  return {
    status: "stub",
    published: false,
    packageId: null,
    note: "Publish is a stub. Live Rate Tables stay on Jobs / Rates.",
  };
}

export function rateVaultAccess(user: { role?: string; privileges?: readonly string[] | null } | null | undefined) {
  if (!user) return { ok: false as const, status: 401 as const, error: "Not signed in." };
  const owner = user.role === "owner";
  const granted = (user.privileges ?? []).includes(RATE_VAULT_PRIVILEGE);
  if (!owner && !granted) {
    return { ok: false as const, status: 403 as const, error: "Rate Vault is owner-eyes-only." };
  }
  return { ok: true as const, status: 200 as const };
}
