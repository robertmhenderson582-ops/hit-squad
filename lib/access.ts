export type DeskCapability =
  | "jobs"
  | "estimates"
  | "cost"
  | "hse"
  | "quality"
  | "rates"
  | "sites"
  | "changeOrders"
  | "tickets"
  | "viewAs"
  | "users"
  | "follow"
  | "activity"
  | "republish";

export type SeatPermission =
  | "Owner desk"
  | "Trusted/HSE"
  | "Trusted/Quality"
  | "PM/estimator"
  | "Look & feel"
  | "Staff/numbers";

export type Capabilities = Record<DeskCapability, boolean>;

const OFF: Capabilities = {
  jobs: false,
  estimates: false,
  cost: false,
  hse: false,
  quality: false,
  rates: false,
  sites: false,
  changeOrders: false,
  tickets: false,
  viewAs: false,
  users: false,
  follow: false,
  activity: false,
  republish: false,
};

const EXTRA: Capabilities = {
  ...OFF,
  jobs: true,
  estimates: true,
  cost: true,
  hse: true,
  quality: true,
  rates: true,
  sites: true,
  changeOrders: true,
  tickets: true,
};

export const ALL_CAPABILITIES: Capabilities = {
  ...EXTRA,
  viewAs: false,
  users: true,
  follow: true,
  activity: true,
  republish: true,
};

export function capabilitiesFor(permission: SeatPermission, extras: Partial<Capabilities> = {}): Capabilities {
  if (permission === "Owner desk") return { ...ALL_CAPABILITIES };
  if (permission === "Trusted/HSE") return { ...EXTRA, hse: true, ...extras };
  if (permission === "Trusted/Quality") return { ...EXTRA, quality: true, ...extras };
  if (permission === "PM/estimator") {
    return {
      ...OFF,
      jobs: true,
      estimates: true,
      changeOrders: true,
      cost: true,
      rates: true,
      sites: true,
      ...extras,
    };
  }
  if (permission === "Look & feel") {
    return {
      ...EXTRA,
      rates: false,
      tickets: true,
      viewAs: true,
      ...extras,
    };
  }
  if (permission === "Staff/numbers") {
    return {
      ...OFF,
      estimates: true,
      cost: true,
      rates: true,
      ...extras,
    };
  }
  return { ...OFF, ...extras };
}

export function hasCapability(
  user: { role: "owner" | "tester"; can?: Capabilities } | null | undefined,
  need: DeskCapability,
): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  return Boolean(user.can?.[need]);
}

export const OWNER_ONLY: DeskCapability[] = ["users", "follow", "activity", "republish"];
