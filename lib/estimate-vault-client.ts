import {
  collectPack,
  mergeVaultIntoLocal,
  scheduleOnce,
  type EstimatePackSnapshot,
} from "./estimate-pack.ts";
import { archiveMenuItem, packsMissingFromVault, unarchiveMenuItem, writeVaultSeen } from "./job-menu.ts";
import { deleteLocalPack, isLocalPackId, type StorageLike } from "./local-estimates.ts";

export const ESTIMATE_VAULT_DEBOUNCE_MS = 1500;

const debounce = scheduleOnce(ESTIMATE_VAULT_DEBOUNCE_MS);
const lastBody = new Map<string, string>();
let hydratePromise: Promise<EstimatePackSnapshot[]> | null = null;

function browserStore(store?: StorageLike | null): StorageLike | null {
  if (store) return store;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function resetVaultHydrateForTests() {
  hydratePromise = null;
  lastBody.clear();
}

export async function hydrateFromVault(store?: StorageLike | null): Promise<EstimatePackSnapshot[]> {
  const target = browserStore(store);
  if (!target) return [];
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const response = await fetch("/api/desk/estimates", {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) return [];
        const data = (await response.json()) as { packs?: EstimatePackSnapshot[]; persisted?: boolean };
        const packs = Array.isArray(data.packs) ? data.packs : [];
        if (data.persisted) {
          for (const packId of packsMissingFromVault(packs.map((pack) => pack.packId), target)) {
            deleteLocalPack(packId, target);
          }
          writeVaultSeen(
            packs.map((pack) => pack.packId),
            target,
          );
        }
        for (const pack of packs) {
          mergeVaultIntoLocal(target, pack);
          if (pack.archived) archiveMenuItem({ id: pack.packId, title: pack.title, packId: pack.packId }, target);
          else unarchiveMenuItem({ id: pack.packId, packId: pack.packId }, target);
        }
        return packs;
      } catch {
        return [];
      }
    })();
  }
  return hydratePromise;
}

export async function flushVaultUpsert(packId: string, store?: StorageLike | null) {
  if (!isLocalPackId(packId)) return;
  const target = browserStore(store);
  if (!target) return;
  const pack = collectPack(target, packId);
  if (!pack) return;
  const body = JSON.stringify({ pack });
  if (lastBody.get(packId) === body) return;
  try {
    const response = await fetch("/api/desk/estimates", {
      method: "PUT",
      credentials: "include",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body,
    });
    if (response.ok) lastBody.set(packId, body);
  } catch {
    // local copy stays; next edit retries
  }
}

export function scheduleVaultUpsert(packId: string, store?: StorageLike | null) {
  if (!isLocalPackId(packId)) return;
  debounce(packId, () => {
    void flushVaultUpsert(packId, store);
  });
}

export async function transferVaultPack(packId: string, email: string) {
  const response = await fetch(`/api/desk/estimates/${encodeURIComponent(packId)}/transfer`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
    pack?: EstimatePackSnapshot;
    to?: { name: string; email: string };
  };
  if (!response.ok) return { ok: false as const, error: data.error || "Could not turn that job over." };
  return { ok: true as const, pack: data.pack, to: data.to };
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
