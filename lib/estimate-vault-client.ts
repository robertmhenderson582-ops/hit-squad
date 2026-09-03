import { VIEW_AS_HEADER, viewAsInit, viewAsSeatFromValue } from "./desk-scope.ts";
import {
  collectPack,
  mergeVaultIntoLocal,
  scheduleOnce,
  type EstimatePackSnapshot,
} from "./estimate-pack.ts";
import { ownerVaultEmail, packSharedEmails } from "./estimate-scope.ts";
import { RETURN_WRITE_ERROR, SHARE_WRITE_ERROR, TRANSFER_WRITE_ERROR } from "./handoff.ts";
import {
  archiveMenuItem,
  clearTransferredMenuItem,
  menuStatus,
  packsMissingFromVault,
  readJobMenu,
  recordTransferredMenuItem,
  unarchiveMenuItem,
  writeVaultSeen,
  type MenuItem,
} from "./job-menu.ts";
import { findDeskPack, readLensPacks, snapshotLensPack, snapshotOwnerDesk, writeLensPacks } from "./lens-packs.ts";
import {
  deleteLocalPack,
  findLocalPack,
  isLocalPackId,
  listLocalPacks,
  rememberLocalPack,
  type StorageLike,
} from "./local-estimates.ts";

export const ESTIMATE_VAULT_DEBOUNCE_MS = 1500;

const debounce = scheduleOnce(ESTIMATE_VAULT_DEBOUNCE_MS);
const lastBody = new Map<string, string>();
let hydratePromise: Promise<EstimatePackSnapshot[]> | null = null;
let hydrateSeat: string | null = null;
let currentViewAs: string | null = null;

export function setVaultViewAs(seat?: string | null) {
  const next = viewAsSeatFromValue(seat);
  if (next === currentViewAs) return;
  currentViewAs = next;
  hydratePromise = null;
  hydrateSeat = null;
}

export function activeVaultViewAs() {
  return currentViewAs;
}

export function bustVaultHydrate() {
  hydratePromise = null;
  hydrateSeat = null;
}

export function deskFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (headers.has(VIEW_AS_HEADER)) {
    return fetch(input, { ...init, credentials: "include", cache: "no-store", headers });
  }
  return fetch(input, viewAsInit(currentViewAs, init));
}

function requestedVaultSeat(opts?: { viewAs?: string | null }) {
  const requested = opts && Object.prototype.hasOwnProperty.call(opts, "viewAs") ? opts.viewAs : currentViewAs;
  return viewAsSeatFromValue(requested);
}

function browserStore(store?: StorageLike | null): StorageLike | null {
  if (store) return store;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function resetVaultHydrateForTests() {
  hydratePromise = null;
  hydrateSeat = null;
  currentViewAs = null;
  lastBody.clear();
}

/** Leftover after Turn over is a pack this desk used to own. Shared-with-me stays. */
export function isLeftoverOwnerCopy(pack: { ownerEmail?: string; sharedWith?: string[] }, email = ownerVaultEmail()) {
  const ownerEmail = (pack.ownerEmail || "").trim().toLowerCase();
  const desk = email.trim().toLowerCase();
  if (packSharedEmails(pack).includes(desk)) return false;
  if (ownerEmail && ownerEmail !== desk) return false;
  return true;
}

export async function hydrateFromVault(
  store?: StorageLike | null,
  opts?: { viewAs?: string | null },
): Promise<EstimatePackSnapshot[]> {
  const target = browserStore(store);
  if (!target) return [];
  const seat = requestedVaultSeat(opts) || "owner";
  if (hydratePromise && hydrateSeat === seat) {
    const packs = await hydratePromise;
    for (const pack of packs) mergeVaultIntoLocal(target, pack);
    if (seat !== "owner") writeLensPacks(seat, packs.map(snapshotLensPack), target);
    else snapshotOwnerDesk({ email: ownerVaultEmail(), role: "owner" }, target);
    return packs;
  }
  hydrateSeat = seat;
  hydratePromise = (async () => {
    try {
      const response = await deskFetch("/api/desk/estimates", viewAsInit(seat === "owner" ? null : seat));
      if (!response.ok) return [];
      const data = (await response.json()) as { packs?: EstimatePackSnapshot[]; persisted?: boolean };
      const packs = Array.isArray(data.packs) ? data.packs : [];
      const viewingAs = seat !== "owner";
      if (viewingAs) writeLensPacks(seat, packs.map(snapshotLensPack), target);
      for (const pack of packs) {
        mergeVaultIntoLocal(target, pack);
        if (viewingAs) continue;
        if (pack.archived) archiveMenuItem({ id: pack.packId, title: pack.title, packId: pack.packId }, target);
        else {
          unarchiveMenuItem({ id: pack.packId, packId: pack.packId }, target);
          if (!pack.transferredFrom) {
            clearTransferredMenuItem({ id: pack.packId, packId: pack.packId }, target);
          }
        }
      }
      if (data.persisted && !viewingAs) {
        const deskEmail = ownerVaultEmail();
        const namedLocal = listLocalPacks(target).filter((pack) => (pack.title || "").trim());
        const vaultIds = new Set(packs.map((pack) => pack.packId));
        const missingNamed = namedLocal.filter((pack) => !vaultIds.has(pack.packId));
        const vaultThin = packs.length === 0 || missingNamed.length > 0 || packs.length < namedLocal.length;
        if (!vaultThin) {
          for (const packId of packsMissingFromVault(packs.map((pack) => pack.packId), target)) {
            const leftover = findLocalPack(packId, target);
            if (leftover && !isLeftoverOwnerCopy(leftover, deskEmail)) continue;
            if (leftover && menuStatus({ id: packId, packId }, readJobMenu(target)) !== "transferred") {
              recordTransferredMenuItem(
                {
                  id: packId,
                  title: leftover.title,
                  packId,
                  toName: leftover.transferredToName || "the other desk",
                },
                target,
              );
            }
            deleteLocalPack(packId, target);
          }
          writeVaultSeen(
            packs.map((pack) => pack.packId),
            target,
          );
        }
        snapshotOwnerDesk({ email: deskEmail, role: "owner" }, target);
      } else if (!viewingAs) {
        snapshotOwnerDesk({ email: ownerVaultEmail(), role: "owner" }, target);
      }
      return packs;
    } catch {
      return [];
    }
  })();
  return hydratePromise;
}

export async function flushVaultUpsert(packId: string, store?: StorageLike | null) {
  if (currentViewAs) return { ok: true as const };
  if (!isLocalPackId(packId)) return { ok: false as const };
  const target = browserStore(store);
  if (!target) return { ok: false as const };
  if (menuStatus({ id: packId, packId }, readJobMenu(target)) === "transferred") {
    deleteLocalPack(packId, target);
    return { ok: true as const, skipped: true as const };
  }
  const pack = collectPack(target, packId);
  if (!pack) return { ok: false as const };
  const body = JSON.stringify({ pack });
  if (lastBody.get(packId) === body) return { ok: true as const };
  if (currentViewAs) return { ok: true as const };
  try {
    const response = await fetch("/api/desk/estimates", {
      method: "PUT",
      credentials: "include",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body,
    });
    if (response.ok) {
      lastBody.set(packId, body);
      return { ok: true as const };
    }
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    return {
      ok: false as const,
      error: typeof data.error === "string" && data.error.trim() ? data.error : "Could not store that package.",
    };
  } catch {
    return { ok: false as const, error: "Could not store that package." };
  }
}

function ownedByThisVault(pack: { ownerEmail?: string }, deskEmail = ownerVaultEmail()) {
  const ownerEmail = (pack.ownerEmail || "").trim().toLowerCase();
  return !ownerEmail || ownerEmail === deskEmail;
}

export async function flushLocalPacksToVault(store?: StorageLike | null, opts?: { viewAs?: string | null }) {
  if (requestedVaultSeat(opts)) return;
  const target = browserStore(store);
  if (!target) return;
  for (const pack of listLocalPacks(target)) {
    if (!ownedByThisVault(pack)) continue;
    await flushVaultUpsert(pack.packId, target);
  }
}

export function scheduleVaultUpsert(packId: string, store?: StorageLike | null) {
  if (!isLocalPackId(packId)) return;
  debounce(packId, () => {
    void flushVaultUpsert(packId, store);
  });
}

export async function transferVaultPack(packId: string, email: string, store?: StorageLike | null) {
  const target = browserStore(store);
  const pack = target ? collectPack(target, packId) : null;
  try {
    const response = await deskFetch(`/api/desk/estimates/${encodeURIComponent(packId)}/transfer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, pack: pack ?? undefined }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      pack?: EstimatePackSnapshot;
      to?: { name: string; email: string };
    };
    if (!response.ok) {
      return { ok: false as const, error: data.error || TRANSFER_WRITE_ERROR };
    }
    return { ok: true as const, pack: data.pack, to: data.to };
  } catch {
    return { ok: false as const, error: TRANSFER_WRITE_ERROR };
  }
}

export function applyTransferLocally(
  ok: boolean,
  packId: string,
  item: MenuItem & { toName: string },
  store?: StorageLike | null,
) {
  if (!ok) return { keptLocal: true as const };
  recordTransferredMenuItem(item, store);
  deleteLocalPack(packId, store);
  bustVaultHydrate();
  return { keptLocal: false as const };
}

function incomingPackForHandoff(packId: string, store: StorageLike | null) {
  if (!store) return null;
  const collected = collectPack(store, packId);
  if (collected) return collected;
  const desk = findDeskPack(packId, currentViewAs, store);
  if (!desk) return null;
  return {
    packId: desk.packId,
    key: desk.key,
    title: desk.title,
    client: desk.client,
    site: desk.site,
    size: desk.size,
    siteId: desk.siteId,
    createdAt: desk.createdAt,
    updatedAt: desk.updatedAt,
    ownerEmail: desk.ownerEmail || "",
    archived: desk.archived,
    sharedWith: desk.sharedWith,
    transferredFrom: desk.transferredFrom,
    transferredTo: desk.transferredTo,
    transferredToName: desk.transferredToName,
    transferredFromName: desk.transferredFromName,
  };
}

function applyShareToDesk(pack: EstimatePackSnapshot, store: StorageLike) {
  mergeVaultIntoLocal(store, pack);
  rememberLocalPack(
    {
      packId: pack.packId,
      title: pack.title,
      client: pack.client,
      site: pack.site,
      size: pack.size,
      ownerEmail: pack.ownerEmail,
      archived: pack.archived,
      sharedWith: pack.sharedWith,
      transferredFrom: pack.transferredFrom,
      transferredTo: pack.transferredTo,
      transferredToName: pack.transferredToName,
      transferredFromName: pack.transferredFromName,
      replaceHandoff: true,
    },
    store,
  );
  if (!currentViewAs) return;
  const lens = readLensPacks(currentViewAs, store);
  writeLensPacks(
    currentViewAs,
    [snapshotLensPack(pack), ...lens.filter((row) => row.packId !== pack.packId)],
    store,
  );
}

export async function shareVaultPack(
  packId: string,
  email: string,
  action: "share" | "unshare" = "share",
  store?: StorageLike | null,
) {
  const target = browserStore(store);
  const pack = incomingPackForHandoff(packId, target);
  try {
    const response = await deskFetch(`/api/desk/estimates/${encodeURIComponent(packId)}/share`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, pack: pack ?? undefined, action }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      pack?: EstimatePackSnapshot;
      to?: { name: string; email: string };
    };
    if (!response.ok) {
      return { ok: false as const, error: data.error || SHARE_WRITE_ERROR };
    }
    if (data.pack && target) applyShareToDesk(data.pack, target);
    bustVaultHydrate();
    return { ok: true as const, pack: data.pack, to: data.to };
  } catch {
    return { ok: false as const, error: SHARE_WRITE_ERROR };
  }
}

export async function returnVaultPack(packId: string, store?: StorageLike | null) {
  const target = browserStore(store);
  const pack = target ? collectPack(target, packId) : null;
  try {
    const response = await deskFetch(`/api/desk/estimates/${encodeURIComponent(packId)}/return`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pack: pack ?? undefined }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      pack?: EstimatePackSnapshot;
      to?: { name: string; email: string };
    };
    if (!response.ok) {
      return { ok: false as const, error: data.error || RETURN_WRITE_ERROR };
    }
    return { ok: true as const, pack: data.pack, to: data.to };
  } catch {
    return { ok: false as const, error: RETURN_WRITE_ERROR };
  }
}

export function applyReturnLocally(ok: boolean, packId: string, store?: StorageLike | null) {
  if (!ok) return { keptLocal: true as const };
  clearTransferredMenuItem({ id: packId, packId }, store);
  deleteLocalPack(packId, store);
  bustVaultHydrate();
  return { keptLocal: false as const };
}

export async function archiveVaultPack(packId: string, archived: boolean) {
  const response = await fetch(`/api/desk/estimates/${encodeURIComponent(packId)}`, {
    method: "PATCH",
    credentials: "include",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ archived }),
  });
  if (!response.ok) return { ok: false as const };
  return { ok: true as const };
}

export async function deleteVaultPack(packId: string) {
  const response = await fetch(`/api/desk/estimates/${encodeURIComponent(packId)}`, {
    method: "DELETE",
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) return { ok: false as const };
  return { ok: true as const };
}
