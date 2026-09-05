import type { AliasSeat } from "@/lib/catalog-aliases";
import { testerByEmail, TESTER_SEATS } from "./tester-seats.ts";

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
  { id: "joseph", name: "Joseph Henderson", email: "josephmhenderson2002@gmail.com", permission: "PM / estimator", shop: "field" },
  { id: "mark", name: "Mark Schneider", email: "marks544@yahoo.com", permission: "Staff / numbers", shop: "field" },
  { id: "cody", name: "Cody Puma", email: "puma.cody@gmail.com", permission: "Staff", shop: "field" },
  { id: "bill", name: "Bill Stubblebine", email: "bstubby@aol.com", permission: "Staff / numbers", shop: "field" },
  { id: "james", name: "James Cain", email: "jameshcainjr@gmail.com", permission: "Staff", shop: "field" },
];

export type FollowSeat = string;
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
  if (typeof value !== "string" || !value.trim()) return false;
  if (value === "owner") return true;
  if (value === "novus" || value === "operator-novus" || value.startsWith("operator-")) return false;
  if ((FOLLOW_SEATS as string[]).includes(value)) return true;
  return value.startsWith("custom-") || value.startsWith("tester-");
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
  const visual = VISUAL_ROSTER.find((row) => row.id === seat);
  if (visual) return testerByEmail(visual.email)?.aliased ? "aliased" : "real";
  const seeded = TESTER_SEATS.find((row) => row.id === seat);
  if (seeded) return seeded.aliased ? "aliased" : "real";
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

export type OwnerSettings = {
  aliasesOn: boolean;
  followSeat: FollowSeat;
  viewAs: ViewAsSeat;
  viewResponsibility: ViewResponsibility;
  viewSite: string;
  republish: RepublishState;
  /** Owner overrides of SiteRecord.regularClient, keyed by site id. */
  regularClient?: Record<string, boolean>;
};

export const VIEW_AS_HIDDEN_SETTINGS = [
  "/settings/users",
  "/settings/follow",
  "/settings/activity",
  "/settings/view-as",
  "/settings/aliases",
  "/settings/vault",
  "/settings/republish",
  "/settings/branding",
  "/settings/sites",
  "/settings/checks",
] as const;

export function seatLabel(seat: FollowSeat, people: Array<{ id: string; name: string }> = []): string {
  if (seat === "owner") return "Robert (owner)";
  return (
    VISUAL_ROSTER.find((row) => row.id === seat)?.name ??
    people.find((row) => row.id === seat)?.name ??
    seat
  );
}
