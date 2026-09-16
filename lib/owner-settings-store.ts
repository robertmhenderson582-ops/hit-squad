import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { SETTINGS_VAULT_KIND, SETTINGS_VAULT_NAME, readVaultJson, writeVaultJson } from "./drive-data.ts";
import { setRegularClientOverrides, writeRegularClientOverride } from "./site-regular-overrides.ts";
import { driveAdapter, type DriveAdapter } from "./drive-estimates.ts";
import {
  VIEW_RESPONSIBILITIES,
  isFollowSeat,
  isViewAsSeat,
  type OwnerSettings,
  type RepublishWait,
} from "./owner-desk.ts";
import { DEFAULT_HIGH_USAGE_THRESHOLD, parseUsagePercent, parseUsageThreshold } from "./usage-clock.ts";

const BUILD_STAMP = process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "local";
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
    showInboxSuggestionBox: false,
    showHighUsageNote: false,
    usagePercent: null,
    highUsageThreshold: DEFAULT_HIGH_USAGE_THRESHOLD,
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
  if (typeof row.showInboxSuggestionBox === "boolean") next.showInboxSuggestionBox = row.showInboxSuggestionBox;
  if (typeof row.showHighUsageNote === "boolean") next.showHighUsageNote = row.showHighUsageNote;
  if ("usagePercent" in row) next.usagePercent = parseUsagePercent(row.usagePercent);
  if (row.highUsageThreshold !== undefined) next.highUsageThreshold = parseUsageThreshold(row.highUsageThreshold);
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
  if (row.regularClient && typeof row.regularClient === "object") {
    const nextMap: Record<string, boolean> = {};
    for (const [id, value] of Object.entries(row.regularClient)) {
      if (typeof value === "boolean" && /^site-[a-z0-9-]+$/.test(id)) nextMap[id] = value;
    }
    next.regularClient = nextMap;
  }
  return next;
}

function snapshot(): OwnerSettings {
  return {
    ...settings,
    republish: { ...settings.republish },
    regularClient: { ...(settings.regularClient ?? {}) },
  };
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
    // Best-effort only. A failed sidecar write must not undo a confirmed vault write.
  }
}

function resolveAdapter(): DriveAdapter | null {
  if (injectedAdapter !== undefined) return injectedAdapter;
  if (process.env.OWNER_SETTINGS_PATH) return null;
  const drive = driveAdapter();
  return drive.configured ? drive : null;
}

async function persist() {
  const data = snapshot();
  const drive = resolveAdapter();
  // Drive is the source of truth on Vercel. /tmp + memory look saved only until the isolate dies.
  if (drive) await writeVaultJson(drive, SETTINGS_VAULT_NAME, SETTINGS_VAULT_KIND, data);
  writeCache(data);
  setRegularClientOverrides(data.regularClient ?? {});
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

type SettingsSource = "vault" | "cache" | "empty";

async function refreshFromVault(): Promise<SettingsSource> {
  const cache = readCache();
  const drive = resolveAdapter();
  if (drive) {
    try {
      const vault = await readVaultJson(drive, SETTINGS_VAULT_NAME, SETTINGS_VAULT_KIND);
      if (vault) {
        writeCache(parseOwnerSettings(vault));
        return "vault";
      }
      if (cache) {
        writeCache(cache);
        return "cache";
      }
      return "empty";
    } catch {
      if (cache) {
        writeCache(cache);
        return "cache";
      }
      return "empty";
    }
  }
  if (cache) {
    writeCache(cache);
    return "cache";
  }
  return "empty";
}

async function hydrateOwnerSettings(opts?: { refresh?: boolean }): Promise<OwnerSettings> {
  if (hydrated && !opts?.refresh) {
    clearStaleRepublish();
    return snapshot();
  }
  const previous = hydrated ? snapshot() : null;
  const source = await refreshFromVault();
  if (source === "empty" && previous) {
    // Failed Drive read with no /tmp — keep the last good snapshot. Do not persist defaults.
    settings = parseOwnerSettings(previous);
  }
  hydrated = true;
  if (source !== "empty" && clearStaleRepublish()) {
    try {
      await persist();
    } catch {
      // Republish stamp cleanup must not fail a settings read.
    }
  }
  setRegularClientOverrides(settings.regularClient ?? {});
  return snapshot();
}

function applyOwnerSettingsPatch(next: Partial<OwnerSettings>) {
  if (typeof next.aliasesOn === "boolean") settings.aliasesOn = next.aliasesOn;
  if (typeof next.showInboxSuggestionBox === "boolean") settings.showInboxSuggestionBox = next.showInboxSuggestionBox;
  if (typeof next.showHighUsageNote === "boolean") settings.showHighUsageNote = next.showHighUsageNote;
  if (next.usagePercent !== undefined) settings.usagePercent = parseUsagePercent(next.usagePercent);
  if (next.highUsageThreshold !== undefined) settings.highUsageThreshold = parseUsageThreshold(next.highUsageThreshold);
  if (isFollowSeat(next.followSeat)) settings.followSeat = next.followSeat;
  if (isViewAsSeat(next.viewAs)) settings.viewAs = next.viewAs;
  if (next.viewResponsibility && VIEW_RESPONSIBILITIES.includes(next.viewResponsibility)) {
    settings.viewResponsibility = next.viewResponsibility;
  }
  if (typeof next.viewSite === "string") settings.viewSite = next.viewSite;
  if (next.republish) settings.republish = { ...settings.republish, ...next.republish, buildStamp: BUILD_STAMP };
  if (next.regularClient && typeof next.regularClient === "object") {
    settings.regularClient = { ...(settings.regularClient ?? {}), ...next.regularClient };
  }
}

export async function getOwnerSettings(): Promise<OwnerSettings> {
  return hydrateOwnerSettings({ refresh: true });
}

export async function setOwnerSettings(next: Partial<OwnerSettings>): Promise<OwnerSettings> {
  return persistPatchedSettings(() => applyOwnerSettingsPatch(next));
}

export function peekRegularClientOverrides(): Record<string, boolean> {
  return { ...(settings.regularClient ?? {}) };
}

async function persistPatchedSettings(apply: () => void): Promise<OwnerSettings> {
  await hydrateOwnerSettings({ refresh: true });
  const previous = snapshot();
  apply();
  try {
    await persist();
  } catch (error) {
    settings = parseOwnerSettings(previous);
    throw error;
  }
  return snapshot();
}

export async function setSiteRegularClient(siteId: string, regularClient: boolean): Promise<OwnerSettings> {
  return persistPatchedSettings(() => {
    settings.regularClient = { ...(settings.regularClient ?? {}), [siteId]: regularClient };
    writeRegularClientOverride(siteId, regularClient);
  });
}

export async function startRepublish(waitMinutes: RepublishWait, note: string): Promise<OwnerSettings> {
  return persistPatchedSettings(() => {
    const until = waitMinutes === 0 ? Date.now() : Date.now() + waitMinutes * 60 * 1000;
    settings.republish = {
      waitMinutes,
      note,
      until,
      active: true,
      buildStamp: BUILD_STAMP,
      inboxNotice:
        waitMinutes === 0
          ? "Desk locked for a republish. Owner stays in."
          : `Desk republish in ${waitMinutes} minutes.${note ? ` ${note}` : ""}`,
    };
  });
}

export async function clearRepublish(): Promise<OwnerSettings> {
  return persistPatchedSettings(() => {
    settings.republish = {
      waitMinutes: 5,
      note: "",
      until: null,
      active: false,
      buildStamp: BUILD_STAMP,
      inboxNotice: "We’re back.",
    };
  });
}

export function resetOwnerSettingsForTests() {
  settings = defaultSettings();
  setRegularClientOverrides({});
  hydrated = false;
  injectedAdapter = undefined;
  const path = ownerSettingsPath();
  if (process.env.OWNER_SETTINGS_PATH && existsSync(path)) {
    writeFileSync(path, JSON.stringify(defaultSettings(), null, 2) + "\n", "utf8");
  }
}

export function forgetOwnerSettingsCacheForTests() {
  settings = defaultSettings();
  setRegularClientOverrides({});
  hydrated = false;
  const path = ownerSettingsPath();
  if (existsSync(path)) unlinkSync(path);
}

export function useOwnerSettingsVaultForTests(adapter: DriveAdapter | null) {
  injectedAdapter = adapter;
  hydrated = false;
  settings = defaultSettings();
}
