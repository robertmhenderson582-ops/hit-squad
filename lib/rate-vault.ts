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

/** First-class workshop module — not nested under P66 / site rules. */
export const RATE_VAULT_CBA_PLA_ID = "cba-pla" as const;

export const RATE_VAULT_CBA_PLA_RULES = [
  { id: "ot", label: "OT" },
  { id: "fringes", label: "Fringes" },
  { id: "eligibility", label: "Eligibility" },
  { id: "clock", label: "Clock" },
] as const;

export const RATE_VAULT_CBA_PLA_SECTION = {
  id: RATE_VAULT_CBA_PLA_ID,
  label: "CBA / PLA",
  title: "CBA & PLA vault",
  note: "For sites without a dedicated P66 rate book (Wood River, Bayway), hall CBA/PLA rules drive OT, fringes, eligibility, and clock — and must feed the published rate package.",
} as const;

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
  RATE_VAULT_CBA_PLA_SECTION,
  {
    id: "p66",
    label: "P66 / site rules",
    note: "Phillips 66 and site rules land here later. CBA / PLA is its own vault — not this pane.",
  },
  {
    id: "publish",
    label: "Publish rate package",
    note: "Stub only — does not write live estimate Rate Tables.",
  },
] as const;

export type RateVaultSectionId = (typeof RATE_VAULT_SECTIONS)[number]["id"];
export type RateVaultCbaPlaRuleId = (typeof RATE_VAULT_CBA_PLA_RULES)[number]["id"];

export type RateVaultCbaPlaEntry = {
  id: string;
  name: string;
  siteHint: string | null;
  captured: false;
};

export type RateVaultCbaPlaVault = {
  id: typeof RATE_VAULT_CBA_PLA_ID;
  label: typeof RATE_VAULT_CBA_PLA_SECTION.label;
  entries: readonly RateVaultCbaPlaEntry[];
  rules: ReadonlyArray<(typeof RATE_VAULT_CBA_PLA_RULES)[number] & { captured: false }>;
};

export function emptyCbaPlaVault(): RateVaultCbaPlaVault {
  return {
    id: RATE_VAULT_CBA_PLA_ID,
    label: RATE_VAULT_CBA_PLA_SECTION.label,
    entries: [],
    rules: RATE_VAULT_CBA_PLA_RULES.map((rule) => ({ ...rule, captured: false as const })),
  };
}

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
  cbaPla: RateVaultCbaPlaVault;
  publish: RateVaultPublishStub;
};

export function emptyRateVaultWorkshop(): RateVaultWorkshop {
  return {
    id: "rate-vault",
    name: RATE_VAULT_TITLE,
    purpose: "B-1 / rate builder workshop",
    ownerNote: RATE_VAULT_OWNER_NOTE,
    sections: RATE_VAULT_SECTIONS,
    cbaPla: emptyCbaPlaVault(),
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
