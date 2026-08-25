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
export type ViewAsSeat = "owner" | "joseph";

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

export function aliasLensFor(seat: FollowSeat): AliasSeat {
  if (seat === "owner") return "owner";
  if (seat === "nathan") return "nathan";
  return "benny";
}

export type OwnerSettings = {
  aliasesOn: boolean;
  followSeat: FollowSeat;
  viewAs: ViewAsSeat;
};

const settings: OwnerSettings = {
  aliasesOn: true,
  followSeat: "owner",
  viewAs: "owner",
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

export function getOwnerSettings(): OwnerSettings {
  return { ...settings };
}

export function setOwnerSettings(next: Partial<OwnerSettings>): OwnerSettings {
  if (typeof next.aliasesOn === "boolean") settings.aliasesOn = next.aliasesOn;
  if (isFollowSeat(next.followSeat)) settings.followSeat = next.followSeat;
  if (next.viewAs === "owner" || next.viewAs === "joseph") settings.viewAs = next.viewAs;
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
