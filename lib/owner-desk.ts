import type { AliasSeat } from "@/lib/catalog-aliases";

export type VisualSeat = {
  id: "wendell" | "benny" | "chance" | "nathan" | "joseph" | "mark" | "bill";
  name: string;
  email: string;
  permission: string;
  shop: "madison" | "field";
};

export const VISUAL_ROSTER: VisualSeat[] = [
  { id: "wendell", name: "Wendell", email: "Wlanderno@yahoo.com", permission: "Trusted / HSE", shop: "field" },
  { id: "benny", name: "Benny", email: "bccamp2@gmail.com", permission: "Trusted / HSE · aliases", shop: "field" },
  { id: "chance", name: "Chance", email: "chancec318@yahoo.com", permission: "Trusted / Quality", shop: "field" },
  { id: "nathan", name: "Nathan Boyte", email: "nathanboyte@gmail.com", permission: "PM / estimator · Madison", shop: "madison" },
  { id: "joseph", name: "Joseph Henderson", email: "josephmhenderson2002@gmail.com", permission: "Look & feel", shop: "field" },
  { id: "mark", name: "Mark Schneider", email: "marks544@yahoo.com", permission: "Staff / numbers", shop: "field" },
  { id: "bill", name: "Bill Stubblebine", email: "bstubby@aol.com", permission: "Staff / numbers", shop: "field" },
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
  "joseph",
  "mark",
  "bill",
];

export function isFollowSeat(value: unknown): value is FollowSeat {
  return typeof value === "string" && (FOLLOW_SEATS as string[]).includes(value);
}

export function isViewAsSeat(value: unknown): value is ViewAsSeat {
  return isFollowSeat(value);
}

export function aliasLensFor(seat: FollowSeat): AliasSeat {
  if (seat === "owner") return "owner";
  if (seat === "nathan") return "nathan";
  return "benny";
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
  aliasesOn: true,
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

export type ActivityRow = {
  at: string;
  kind: "sign-in" | "failed" | "feature";
  who: string;
  detail: string;
};

const activity: ActivityRow[] = [
  { at: "25 Aug 2026 · 00:12", kind: "sign-in", who: "Robert Henderson", detail: "Owner desk cookie read" },
  { at: "25 Aug 2026 · 00:08", kind: "failed", who: "unknown", detail: "Wrong password · stayed on /login" },
  { at: "25 Aug 2026 · 00:04", kind: "feature", who: "Robert Henderson", detail: "Opened Sites / Wood River" },
  { at: "24 Aug 2026 · 23:51", kind: "feature", who: "Robert Henderson", detail: "Aliases catalog reviewed" },
];

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

export function listActivity(): ActivityRow[] {
  return [...activity];
}

export function addActivity(row: Omit<ActivityRow, "at">): ActivityRow {
  const entry = { ...row, at: new Date().toLocaleString("en-GB", { hour12: false }) };
  activity.unshift(entry);
  return entry;
}

export function seatLabel(seat: FollowSeat): string {
  if (seat === "owner") return "Robert (owner)";
  return VISUAL_ROSTER.find((row) => row.id === seat)?.name ?? seat;
}
