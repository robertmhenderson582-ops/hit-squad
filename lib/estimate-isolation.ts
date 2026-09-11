import { seedCompanyForEmail } from "./companies.ts";
import { canonicalEmail, isOwnerIdentity } from "./identity.ts";

/**
 * Non-Madison / sandbox estimate seats (Mark, James, Joseph, field testers, …).
 * Owner and Madison PMs (Nathan, John Beech) stay on the live HIS / wake world.
 * Unstamped leftover rows are not sandbox — they can still reclaim a known HIS id.
 */
export function isSandboxEstimateOwner(email?: string | null): boolean {
  const key = canonicalEmail(email) || (email || "").trim().toLowerCase();
  if (!key) return false;
  if (isOwnerIdentity(key)) return false;
  return seedCompanyForEmail(key) !== "madison";
}

/** Concrete mint / job-code ids. A leftover menu title is not a pack id. */
export function isMintedEstimatePackId(packId?: string | null): boolean {
  const id = (packId || "").trim();
  if (!id) return false;
  return /^new-/i.test(id) || /^EST-[A-Z0-9]{6}/i.test(id);
}
