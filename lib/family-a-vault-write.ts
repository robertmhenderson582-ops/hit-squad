/**
 * Vault write gate for material packs with locked dollars / hours.
 * checkPackBaseline runs on Drive create and overwrite (writePackFile) and on
 * client flush. Identity-only reserved slots stay skipped. Do not invent
 * Family B / Monroe / Boiler labor $. Do not upload other+markup-only Rodeo seed.
 */
import { deskPackageTotal } from "./estimate-desk-total.ts";
import { packSnapshotToXlsxInput } from "./estimate-pack-xlsx.ts";
import type { EstimatePackSnapshot } from "./estimate-pack.ts";
import { computeRowHours } from "./hours-clock.ts";
import {
  baselineForPack,
  checkPackBaseline,
  PACK_INTEGRITY_ERROR_PREFIX,
  PACK_THICK_BYTES_FLOOR,
  packIsIdentityOnly,
  packLooksSmashed,
  packPayloadBytes,
} from "./pack-integrity.ts";
import { RODEO_U110_PACK_ID, RODEO_U250_PACK_ID } from "./rodeo-monroe-wake.ts";

const FAMILY_A_PACK_IDS = new Set([RODEO_U110_PACK_ID, RODEO_U250_PACK_ID]);

export type BaselineWriteCheck = {
  ok: boolean;
  error?: string;
  skipped?: "integrity" | "identity-only" | "dollars-unavailable" | "structure-only";
};

export function isFamilyAPackId(packId = "") {
  return FAMILY_A_PACK_IDS.has(packId.trim());
}

export function packCrewHours(pack: EstimatePackSnapshot): number {
  const input = packSnapshotToXlsxInput(pack);
  const holidays = input.jobMeta?.holidays ?? [];
  const crew = input.crew ?? {};
  const lanes = [crew.staff, crew.generalForeman, crew.foreman, crew.direct, crew.support];
  return lanes.reduce((sum, rows) => {
    return (
      sum +
      (rows ?? []).reduce((lane, row) => {
        return lane + computeRowHours(row, input.site ?? "", input.client ?? "", crew.otAfter8, "", holidays).hours;
      }, 0)
    );
  }, 0);
}

export function packFamilyADesk(pack: EstimatePackSnapshot): { grandTotal: number; totalHours: number } {
  const input = packSnapshotToXlsxInput(pack);
  return {
    grandTotal: deskPackageTotal(input),
    totalHours: packCrewHours(pack),
  };
}

/**
 * Pass live desk totals into checkPackBaseline when the pack is a filled claim.
 * Thin HIS Cat 2 / Aromatics test shells stay identity/smash-only so share and
 * freeze-restore writes are not blocked. Family A hydrated seeds always check.
 * Monroe / Boiler never receive invented dollars — hours only when thick.
 */
export function deskTotalsForBaselineWrite(pack: EstimatePackSnapshot): { grandTotal?: number; totalHours?: number } | null {
  const baseline = baselineForPack(pack);
  if (!baseline) return null;
  if (packIsIdentityOnly(pack)) return null;
  if (packLooksSmashed(pack)) return null;
  try {
    if (baseline.dollarsStatus === "locked") {
      if (isFamilyAPackId(pack.packId) || packPayloadBytes(pack) >= PACK_THICK_BYTES_FLOOR) {
        return packFamilyADesk(pack);
      }
      return null;
    }
    if (baseline.totalHours != null && packPayloadBytes(pack) >= PACK_THICK_BYTES_FLOOR) {
      return { totalHours: packCrewHours(pack) };
    }
  } catch {
    if (isFamilyAPackId(pack.packId) && baseline.dollarsStatus === "locked") {
      return { grandTotal: 0, totalHours: 0 };
    }
  }
  return null;
}

export function packBaselineWriteCheck(pack: EstimatePackSnapshot): BaselineWriteCheck {
  const desk = deskTotalsForBaselineWrite(pack);
  const check = checkPackBaseline(pack, desk);
  if (check.ok) {
    return check.skipped ? { ok: true, skipped: check.skipped } : { ok: true };
  }
  return {
    ok: false,
    skipped: "integrity",
    error: check.fault || "Estimate desk does not match the locked baseline.",
  };
}

/** Specific reason to refuse Drive write, or null when create/PATCH may proceed. */
export function packBaselineWriteError(pack: EstimatePackSnapshot): string | null {
  const check = packBaselineWriteCheck(pack);
  return check.ok ? null : check.error || null;
}

/** Dollar / hours lock only. Smash vs an existing vault copy stays decidePackWrite. */
export function packBaselineMoneyWriteError(pack: EstimatePackSnapshot): string | null {
  const desk = deskTotalsForBaselineWrite(pack);
  if (!desk) return null;
  const check = checkPackBaseline(pack, desk);
  if (check.ok) return null;
  return check.fault || "Estimate desk does not match the locked baseline.";
}

/** Family A alias — same gate, scoped by pack id for existing callers/tests. */
export function familyAVaultWriteError(pack: EstimatePackSnapshot): string | null {
  if (!isFamilyAPackId(pack.packId)) return null;
  return packBaselineWriteError(pack);
}

export function packBaselineWriteException(pack: EstimatePackSnapshot): Error | null {
  const fault = packBaselineWriteError(pack);
  return fault ? new Error(`${PACK_INTEGRITY_ERROR_PREFIX}${fault}`) : null;
}

export function familyAVaultWriteException(pack: EstimatePackSnapshot): Error | null {
  if (!isFamilyAPackId(pack.packId)) return null;
  return packBaselineWriteException(pack);
}

/** Integrity / lock faults must paint immediately — never hide behind a generic store banner. */
export function isVaultIntegrityError(message = "") {
  return /≠ locked|integrity fault|cannot overwrite|cannot seed|Demo seed clock|Identity-only card|Empty crew cannot|Thinner package|Cross-pack|Family A desk|locked baseline/i.test(
    message,
  );
}
