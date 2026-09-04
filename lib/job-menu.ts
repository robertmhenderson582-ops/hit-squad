import { isHisProtectedMenuItem, NATHAN_DESK_EMAIL } from "./his-wood-river.ts";
import { canonicalEmail } from "./identity.ts";
import { isLocalPackId, type StorageLike } from "./local-estimates.ts";

export const JOB_MENU_KEY = "hs_job_menu_v1";
export const VAULT_SEEN_KEY = "hs_vault_seen_v1";

/** Owner keeps the bare key. View as / Follow uses that person's copy. */
export function jobMenuKey(seat?: string | null) {
  const id = (seat || "").trim();
  if (!id || id === "owner") return JOB_MENU_KEY;
  return `${JOB_MENU_KEY}:${id}`;
}

export type TransferredJob = {
  id: string;
  title: string;
  toName: string;
  at: number;
};

export type JobMenuState = {
  archived: string[];
  deleted: string[];
  transferred: TransferredJob[];
};

export type MenuItem = {
  id: string;
  title?: string;
  packId?: string;
};

function asStore(store?: StorageLike | null): StorageLike | null {
  if (store) return store;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function unique(ids: string[]) {
  return [...new Set(ids.filter(Boolean))];
}

export function emptyJobMenu(): JobMenuState {
  return { archived: [], deleted: [], transferred: [] };
}

export function readJobMenu(store?: StorageLike | null, seat?: string | null): JobMenuState {
  const target = asStore(store);
  if (!target) return emptyJobMenu();
  try {
    const raw = target.getItem(jobMenuKey(seat));
    if (!raw) return emptyJobMenu();
    const parsed = JSON.parse(raw) as Partial<JobMenuState>;
    return {
      archived: Array.isArray(parsed.archived) ? parsed.archived.filter((id) => typeof id === "string") : [],
      deleted: Array.isArray(parsed.deleted) ? parsed.deleted.filter((id) => typeof id === "string") : [],
      transferred: Array.isArray(parsed.transferred)
        ? parsed.transferred.filter(
            (row): row is TransferredJob =>
              Boolean(row && typeof row.id === "string" && typeof row.title === "string" && typeof row.toName === "string"),
          )
        : [],
    };
  } catch {
    return emptyJobMenu();
  }
}

export function writeJobMenu(next: JobMenuState, store?: StorageLike | null, seat?: string | null) {
  const target = asStore(store);
  if (!target) return next;
  target.setItem(jobMenuKey(seat), JSON.stringify(next));
  return next;
}

export function keysForItem(item: MenuItem): string[] {
  const keys = [item.id];
  if (item.packId) keys.push(item.packId, `job-${item.packId}`);
  if (item.id.startsWith("job-") && isLocalPackId(item.id.slice(4))) {
    keys.push(item.id.slice(4));
  }
  if (isLocalPackId(item.id)) keys.push(`job-${item.id}`);
  return unique(keys);
}

function touches(item: MenuItem, ids: string[]) {
  const keys = keysForItem(item);
  return ids.some((id) => keys.includes(id));
}

export function menuStatus(item: MenuItem, menu: JobMenuState = readJobMenu()): "archived" | "deleted" | "transferred" | null {
  if (touches(item, menu.deleted)) return "deleted";
  if (touches(item, menu.transferred.map((row) => row.id))) return "transferred";
  if (touches(item, menu.archived)) return "archived";
  return null;
}

/**
 * Nathan login and View as Nathan share hs_job_menu_v1:nathan.
 * Owner leftover stays on the bare key so owner HIS paint cannot be erased.
 */
export function menuSeatForDesk(
  viewingAs = false,
  seat?: string | null,
  user?: { email?: string } | null,
): string | null {
  const viewed = (seat || "").trim().toLowerCase();
  if (viewingAs && viewed && viewed !== "owner") return viewed;
  if (viewed === "nathan" || canonicalEmail(user?.email) === NATHAN_DESK_EMAIL) return "nathan";
  return null;
}

/** Drop HIS ids from the owner leftover key only. Nathan's seat menu is authoritative. */
export function clearHisJobMenuLeftover(store?: StorageLike | null, seat?: string | null) {
  const leftoverSeat = (seat || "").trim().toLowerCase();
  if (leftoverSeat && leftoverSeat !== "owner") return readJobMenu(store, seat);
  const menu = readJobMenu(store, seat);
  const keep = (id: string) => !isHisProtectedMenuItem({ id, packId: id });
  return writeJobMenu(
    {
      archived: menu.archived.filter(keep),
      deleted: menu.deleted.filter(keep),
      transferred: menu.transferred.filter((row) => keep(row.id)),
    },
    store,
    seat,
  );
}

export function isActiveMenuItem(item: MenuItem, menu: JobMenuState = readJobMenu()) {
  return menuStatus(item, menu) === null;
}

/**
 * View as is a real desk: archive / delete apply to that seat's copy.
 * Owner Transferred notes stay on the owner key — they do not leak onto the viewed seat.
 */
export function menuForViewedDesk(
  viewingAs: boolean,
  store?: StorageLike | null,
  seat?: string | null,
  user?: { email?: string } | null,
): JobMenuState {
  const menuSeat = menuSeatForDesk(viewingAs, seat, user);
  if (viewingAs && !menuSeat) return emptyJobMenu();
  return readJobMenu(store, menuSeat);
}

export function archiveMenuItem(item: MenuItem, store?: StorageLike | null, seat?: string | null) {
  const menu = readJobMenu(store, seat);
  const keys = keysForItem(item);
  const next: JobMenuState = {
    archived: unique([...menu.archived, ...keys]),
    deleted: menu.deleted.filter((id) => !keys.includes(id)),
    transferred: menu.transferred.filter((row) => !keys.includes(row.id)),
  };
  return writeJobMenu(next, store, seat);
}

export function unarchiveMenuItem(item: MenuItem, store?: StorageLike | null, seat?: string | null) {
  const menu = readJobMenu(store, seat);
  const keys = keysForItem(item);
  return writeJobMenu(
    {
      ...menu,
      archived: menu.archived.filter((id) => !keys.includes(id)),
    },
    store,
    seat,
  );
}

export function deleteMenuItem(item: MenuItem, store?: StorageLike | null, seat?: string | null) {
  const menu = readJobMenu(store, seat);
  const keys = keysForItem(item);
  const next: JobMenuState = {
    archived: menu.archived.filter((id) => !keys.includes(id)),
    deleted: unique([...menu.deleted, ...keys]),
    transferred: menu.transferred.filter((row) => !keys.includes(row.id)),
  };
  return writeJobMenu(next, store, seat);
}

export function clearTransferredMenuItem(item: MenuItem, store?: StorageLike | null, seat?: string | null) {
  const menu = readJobMenu(store, seat);
  const keys = keysForItem(item);
  return writeJobMenu(
    {
      ...menu,
      transferred: menu.transferred.filter((row) => !keys.includes(row.id)),
    },
    store,
    seat,
  );
}

export function recordTransferredMenuItem(
  item: MenuItem & { toName: string },
  store?: StorageLike | null,
  seat?: string | null,
) {
  const menu = readJobMenu(store, seat);
  const keys = keysForItem(item);
  const next: JobMenuState = {
    archived: menu.archived.filter((id) => !keys.includes(id)),
    deleted: menu.deleted.filter((id) => !keys.includes(id)),
    transferred: [
      { id: item.id, title: item.title || "Working estimate", toName: item.toName, at: Date.now() },
      ...menu.transferred.filter((row) => !keys.includes(row.id)),
    ],
  };
  return writeJobMenu(next, store, seat);
}

/** Deleted sample / seed ids stay off this seat after a reload or poll. */
export function omitDeletedJobs<T extends MenuItem>(jobs: T[], menu: JobMenuState, keepHis = false): T[] {
  return jobs.filter((job) => {
    if (keepHis && isHisProtectedMenuItem(job)) return true;
    return menuStatus(job, menu) !== "deleted";
  });
}

export function readVaultSeen(store?: StorageLike | null): string[] {
  const target = asStore(store);
  if (!target) return [];
  try {
    const parsed = JSON.parse(target.getItem(VAULT_SEEN_KEY) || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function writeVaultSeen(ids: string[], store?: StorageLike | null) {
  const target = asStore(store);
  if (!target) return ids;
  target.setItem(VAULT_SEEN_KEY, JSON.stringify(unique(ids)));
  return unique(ids);
}

export function packsMissingFromVault(visibleIds: string[], store?: StorageLike | null) {
  const seen = readVaultSeen(store);
  const now = new Set(visibleIds);
  return seen.filter((id) => !now.has(id));
}
