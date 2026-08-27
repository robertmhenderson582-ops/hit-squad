import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AliasSeat } from "@/lib/catalog-aliases";
import { SETTINGS_VAULT_KIND, SETTINGS_VAULT_NAME, readVaultJson, writeVaultJson } from "./drive-data.ts";
import { driveAdapter, type DriveAdapter } from "./drive-estimates.ts";

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

const REPUBLISH_WAITS: RepublishWait[] = [0, 5, 10, 15];

function defaultSettings(): OwnerSettings {
  return {
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
}

let settings: OwnerSettings = defaultSettings();
let hydrated = false;
let injectedAdapter: DriveAdapter | null | undefined;

export function ownerSettingsPath() {
  if (process.env.OWNER_SETTINGS_PATH) return process.env.OWNER_SETTINGS_PATH;
  if (process.env.VERCEL) return "/tmp/hit-squad-settings.json";
  return join(process.cwd(), "data", "owner-settings.json");
}

function isRepublishWait(value: unknown): value is RepublishWait {
  return typeof value === "number" && (REPUBLISH_WAITS as number[]).includes(value);
}

export function parseOwnerSettings(raw: unknown): OwnerSettings {
  const next = defaultSettings();
  if (!raw || typeof raw !== "object") return next;
  const row = raw as Partial<OwnerSettings>;
  if (typeof row.aliasesOn === "boolean") next.aliasesOn = row.aliasesOn;
  if (isFollowSeat(row.followSeat)) next.followSeat = row.followSeat;
  if (isViewAsSeat(row.viewAs)) next.viewAs = row.viewAs;
  if (row.viewResponsibility && VIEW_RESPONSIBILITIES.includes(row.viewResponsibility)) {
    next.viewResponsibility = row.viewResponsibility;
  }
  if (typeof row.viewSite === "string") next.viewSite = row.viewSite;
  if (row.republish && typeof row.republish === "object") {
    const pub = row.republish;
    next.republish = {
      waitMinutes: isRepublishWait(pub.waitMinutes) ? pub.waitMinutes : 5,
      note: typeof pub.note === "string" ? pub.note : "",
      until: typeof pub.until === "number" && Number.isFinite(pub.until) ? pub.until : null,
      active: Boolean(pub.active),
      buildStamp: typeof pub.buildStamp === "string" ? pub.buildStamp : BUILD_STAMP,
      inboxNotice: typeof pub.inboxNotice === "string" ? pub.inboxNotice : null,
    };
  }
  return next;
}

function snapshot(): OwnerSettings {
  return { ...settings, republish: { ...settings.republish } };
}

function readCache(): OwnerSettings | null {
  try {
    return parseOwnerSettings(JSON.parse(readFileSync(ownerSettingsPath(), "utf8")));
  } catch {
    return null;
  }
}

function writeCache(data: OwnerSettings) {
  settings = parseOwnerSettings(data);
  try {
    const file = ownerSettingsPath();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(settings, null, 2) + "\n", "utf8");
  } catch {
    // Best-effort only. A failed write must not wipe the previous file.
  }
}

function resolveAdapter(): DriveAdapter | null {
  if (injectedAdapter !== undefined) return injectedAdapter;
  if (process.env.OWNER_SETTINGS_PATH) return null;
  const drive = driveAdapter();
  return drive.configured ? drive : null;
}

async function persist() {
  writeCache(settings);
  const drive = resolveAdapter();
  if (drive) await writeVaultJson(drive, SETTINGS_VAULT_NAME, SETTINGS_VAULT_KIND, snapshot());
}

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
    return true;
  }
  return false;
}

async function hydrateOwnerSettings(): Promise<OwnerSettings> {
  if (hydrated) {
    clearStaleRepublish();
    return snapshot();
  }
  const cache = readCache();
  const drive = resolveAdapter();
  if (drive) {
    try {
      const vault = await readVaultJson(drive, SETTINGS_VAULT_NAME, SETTINGS_VAULT_KIND);
      if (vault) writeCache(parseOwnerSettings(vault));
      else if (cache) {
        writeCache(cache);
        await writeVaultJson(drive, SETTINGS_VAULT_NAME, SETTINGS_VAULT_KIND, snapshot());
      }
    } catch {
      if (cache) writeCache(cache);
    }
  } else if (cache) {
    writeCache(cache);
  }
  hydrated = true;
  if (clearStaleRepublish()) await persist();
  return snapshot();
}

export type { ActivityKind, ActivityRow } from "./activity-store.ts";
export {
  addActivity,
  clearActivity,
  listActivity,
  removeActivity,
  removeActivityOlderThan,
} from "./activity-store.ts";

export async function getOwnerSettings(): Promise<OwnerSettings> {
  return hydrateOwnerSettings();
}

export async function setOwnerSettings(next: Partial<OwnerSettings>): Promise<OwnerSettings> {
  await hydrateOwnerSettings();
  if (typeof next.aliasesOn === "boolean") settings.aliasesOn = next.aliasesOn;
  if (isFollowSeat(next.followSeat)) settings.followSeat = next.followSeat;
  if (isViewAsSeat(next.viewAs)) settings.viewAs = next.viewAs;
  if (next.viewResponsibility && VIEW_RESPONSIBILITIES.includes(next.viewResponsibility)) {
    settings.viewResponsibility = next.viewResponsibility;
  }
  if (typeof next.viewSite === "string") settings.viewSite = next.viewSite;
  if (next.republish) settings.republish = { ...settings.republish, ...next.republish, buildStamp: BUILD_STAMP };
  await persist();
  return snapshot();
}

export async function startRepublish(waitMinutes: RepublishWait, note: string): Promise<OwnerSettings> {
  await hydrateOwnerSettings();
  const until = waitMinutes === 0 ? Date.now() : Date.now() + waitMinutes * 60 * 1000;
  settings.republish = {
    waitMinutes,
    note,
    until,
    active: true,
    buildStamp: BUILD_STAMP,
    inboxNotice: waitMinutes === 0 ? "Desk locked for a republish. Owner stays in." : `Desk republish in ${waitMinutes} minutes.${note ? ` ${note}` : ""}`,
  };
  await persist();
  return snapshot();
}

export async function clearRepublish(): Promise<OwnerSettings> {
  await hydrateOwnerSettings();
  settings.republish = {
    waitMinutes: 5,
    note: "",
    until: null,
    active: false,
    buildStamp: BUILD_STAMP,
    inboxNotice: "We’re back.",
  };
  await persist();
  return snapshot();
}

export function resetOwnerSettingsForTests() {
  settings = defaultSettings();
  hydrated = false;
  injectedAdapter = undefined;
  const path = ownerSettingsPath();
  if (process.env.OWNER_SETTINGS_PATH && existsSync(path)) {
    writeFileSync(path, JSON.stringify(defaultSettings(), null, 2) + "\n", "utf8");
  }
}

export function forgetOwnerSettingsCacheForTests() {
  settings = defaultSettings();
  hydrated = false;
  const path = ownerSettingsPath();
  if (existsSync(path)) unlinkSync(path);
}

export function useOwnerSettingsVaultForTests(adapter: DriveAdapter | null) {
  injectedAdapter = adapter;
  hydrated = false;
  settings = defaultSettings();
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
