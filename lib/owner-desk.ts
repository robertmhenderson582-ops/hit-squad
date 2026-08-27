import type { AliasSeat } from "@/lib/catalog-aliases";

export type VisualSeat = {
  id: "wendell" | "benny" | "chance" | "nathan" | "john" | "joseph" | "mark" | "cody" | "bill" | "james";
  name: string;
  email: string;
  permission: string;
  shop: "madison" | "field";
};

export const VISUAL_ROSTER: VisualSeat[] = [
  { id: "wendell", name: "Wendell", email: "wlanderno@yahoo.com", permission: "Trusted / HSE", shop: "field" },
  { id: "benny", name: "Benny", email: "bccamp2@gmail.com", permission: "Trusted / HSE", shop: "field" },
  { id: "chance", name: "Chance", email: "chancec318@yahoo.com", permission: "Trusted / Quality", shop: "field" },
  { id: "nathan", name: "Nathan Boyte", email: "nathanboyte@gmail.com", permission: "PM / estimator · Madison", shop: "madison" },
  { id: "john", name: "John Beech", email: "johnbeech.madison@gmail.com", permission: "PM / estimator · Madison", shop: "madison" },
  { id: "joseph", name: "Joseph Henderson", email: "josephmhenderson2002@gmail.com", permission: "Look & feel", shop: "field" },
  { id: "mark", name: "Mark Schneider", email: "marks544@yahoo.com", permission: "Staff / numbers", shop: "field" },
  { id: "cody", name: "Cody Puma", email: "puma.cody@gmail.com", permission: "Staff", shop: "field" },
  { id: "bill", name: "Bill Stubblebine", email: "bstubby@aol.com", permission: "Staff / numbers", shop: "field" },
  { id: "james", name: "James Cain", email: "jameshcainjr@gmail.com", permission: "Staff", shop: "field" },
];

export type FollowSeat = VisualSeat["id"] | "owner";
export type ViewAsSeat = FollowSeat;
export type ViewResponsibility =
  | "Project manager"
  | "Quality manager"
  | "Safety/HSE"
  | "Estimator"
  | "Change-order lead";

export const VIEW_RESPONSIBILITIES: ViewResponsibility[] = [
  "Project manager",
  "Quality manager",
  "Safety/HSE",
  "Estimator",
  "Change-order lead",
];

export const VIEW_SITES = [
  "Wood River — Roxana, IL",
  "Yates — Newnan, GA",
  "Rodeo — Rodeo, CA",
  "Bayway — Linden, NJ",
  "Ferndale — Ferndale, WA",
  "Billings — Billings, MT",
];

export const FOLLOW_SEATS: FollowSeat[] = [
  "owner",
  "wendell",
  "benny",
  "chance",
  "nathan",
  "john",
  "joseph",
  "mark",
  "cody",
  "bill",
  "james",
];

export function isFollowSeat(value: unknown): value is FollowSeat {
  return typeof value === "string" && (FOLLOW_SEATS as string[]).includes(value);
}

export function isViewAsSeat(value: unknown): value is ViewAsSeat {
  return isFollowSeat(value);
}

/** Client store wins so a serverless GET cannot reset the lens to owner. */
export function preferredViewAs(stored: ViewAsSeat | undefined, server?: ViewAsSeat): ViewAsSeat {
  if (stored) return stored;
  return server && isViewAsSeat(server) ? server : "owner";
}

export function preferredFollowSeat(stored: FollowSeat | undefined, server?: FollowSeat): FollowSeat {
  if (stored) return stored;
  return server && isFollowSeat(server) ? server : "owner";
}

export function aliasLensFor(seat: FollowSeat): AliasSeat {
  if (seat === "owner") return "owner";
  if (seat === "nathan" || seat === "john" || seat === "wendell" || seat === "benny" || seat === "chance") {
    return "real";
  }
  return "aliased";
}

export type RepublishWait = 0 | 5 | 10 | 15;

export type RepublishState = {
  waitMinutes: RepublishWait;
  note: string;
  until: number | null;
  active: boolean;
  buildStamp: string;
  inboxNotice: string | null;
};

const BUILD_STAMP = process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "local";

export type OwnerSettings = {
  aliasesOn: boolean;
  followSeat: FollowSeat;
  viewAs: ViewAsSeat;
  viewResponsibility: ViewResponsibility;
  viewSite: string;
  republish: RepublishState;
};

const settings: OwnerSettings = {
  aliasesOn: false,
  followSeat: "owner",
  viewAs: "owner",
  viewResponsibility: "Estimator",
  viewSite: "Wood River — Roxana, IL",
  republish: {
    waitMinutes: 5,
    note: "",
    until: null,
    active: false,
    buildStamp: BUILD_STAMP,
    inboxNotice: null,
  },
};

export type { ActivityKind, ActivityRow } from "./activity-store.ts";
export {
  addActivity,
  clearActivity,
  listActivity,
  removeActivity,
  removeActivityOlderThan,
} from "./activity-store.ts";

function clearStaleRepublish() {
  if (settings.republish.buildStamp !== BUILD_STAMP) {
    settings.republish = {
      waitMinutes: 5,
      note: "",
      until: null,
      active: false,
      buildStamp: BUILD_STAMP,
      inboxNotice: null,
    };
  }
}

export function getOwnerSettings(): OwnerSettings {
  clearStaleRepublish();
  return { ...settings, republish: { ...settings.republish } };
}

export function setOwnerSettings(next: Partial<OwnerSettings>): OwnerSettings {
  if (typeof next.aliasesOn === "boolean") settings.aliasesOn = next.aliasesOn;
  if (isFollowSeat(next.followSeat)) settings.followSeat = next.followSeat;
  if (isViewAsSeat(next.viewAs)) settings.viewAs = next.viewAs;
  if (next.viewResponsibility) settings.viewResponsibility = next.viewResponsibility;
  if (typeof next.viewSite === "string") settings.viewSite = next.viewSite;
  if (next.republish) settings.republish = { ...settings.republish, ...next.republish, buildStamp: BUILD_STAMP };
  return getOwnerSettings();
}

export function startRepublish(waitMinutes: RepublishWait, note: string): OwnerSettings {
  const until = waitMinutes === 0 ? Date.now() : Date.now() + waitMinutes * 60 * 1000;
  settings.republish = {
    waitMinutes,
    note,
    until,
    active: true,
    buildStamp: BUILD_STAMP,
    inboxNotice: waitMinutes === 0 ? "Desk locked for a republish. Owner stays in." : `Desk republish in ${waitMinutes} minutes.${note ? ` ${note}` : ""}`,
  };
  return getOwnerSettings();
}

export function clearRepublish(): OwnerSettings {
  settings.republish = {
    waitMinutes: 5,
    note: "",
    until: null,
    active: false,
    buildStamp: BUILD_STAMP,
    inboxNotice: "We’re back.",
  };
  return getOwnerSettings();
}

export const VIEW_AS_HIDDEN_SETTINGS = [
  "/settings/users",
  "/settings/follow",
  "/settings/activity",
  "/settings/view-as",
  "/settings/aliases",
  "/settings/vault",
  "/settings/republish",
  "/settings/branding",
  "/settings/checks",
] as const;

export function seatLabel(seat: FollowSeat): string {
  if (seat === "owner") return "Robert (owner)";
  return VISUAL_ROSTER.find((row) => row.id === seat)?.name ?? seat;
}
