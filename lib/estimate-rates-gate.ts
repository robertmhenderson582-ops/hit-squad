import { assignedCompanyId, companyScopeFor } from "./companies.ts";
import { isOwner } from "./desk-role.ts";
import type { StorageLike } from "./local-estimates.ts";
import { companyHasEstablishedRates } from "./rate-books.ts";

export const NO_RATES_NOTICE = "This company has no rates saved.";
export const NO_RATES_CHOICES =
  "Upload billing rates or use Rate builder to create your own.";

/** Owner is not gated when Madison plant books are already on the desk. */
export function newEstimateNeedsRatesNotice(
  user?: { email?: string; role?: string } | null,
  store?: StorageLike | null,
): boolean {
  if (!user) return false;
  if (isOwner(user) && companyHasEstablishedRates("madison", store)) return false;
  const companyId = assignedCompanyId(companyScopeFor(user));
  return !companyHasEstablishedRates(companyId, store);
}
