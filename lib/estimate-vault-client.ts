import {
  collectPack,
  mergeVaultIntoLocal,
  scheduleOnce,
  type EstimatePackSnapshot,
} from "./estimate-pack.ts";
import { isLocalPackId, type StorageLike } from "./local-estimates.ts";

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
        const data = (await response.json()) as { packs?: EstimatePackSnapshot[] };
        const packs = Array.isArray(data.packs) ? data.packs : [];
        for (const pack of packs) mergeVaultIntoLocal(target, pack);
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
