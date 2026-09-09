/**
 * Family A (Rodeo U110 / U250) vault write gate.
 * Hydrated packs must match the locked contractor desk before Drive create/PATCH.
 * Identity-only reserved slots stay skipped. Do not upload other+markup-only seed.
 */
import { deskPackageTotal } from "./estimate-desk-total.ts";
import { packSnapshotToXlsxInput } from "./estimate-pack-xlsx.ts";
import type { EstimatePackSnapshot } from "./estimate-pack.ts";
import { computeRowHours } from "./hours-clock.ts";
import { checkPackBaseline, PACK_INTEGRITY_ERROR_PREFIX } from "./pack-integrity.ts";
import { RODEO_U110_PACK_ID, RODEO_U250_PACK_ID } from "./rodeo-monroe-wake.ts";

const FAMILY_A_PACK_IDS = new Set([RODEO_U110_PACK_ID, RODEO_U250_PACK_ID]);

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

/** Specific reason to refuse Drive write, or null when create/PATCH may proceed. */
export function familyAVaultWriteError(pack: EstimatePackSnapshot): string | null {
  if (!isFamilyAPackId(pack.packId)) return null;
  const desk = packFamilyADesk(pack);
  const check = checkPackBaseline(pack, desk);
  if (check.ok) return null;
  return check.fault || "Rodeo Family A desk does not match the locked contractor total.";
}

export function familyAVaultWriteException(pack: EstimatePackSnapshot): Error | null {
  const fault = familyAVaultWriteError(pack);
  return fault ? new Error(`${PACK_INTEGRITY_ERROR_PREFIX}${fault}`) : null;
}

/** Integrity / lock faults must paint immediately — never hide behind a generic store banner. */
export function isVaultIntegrityError(message = "") {
  return /≠ locked|integrity fault|cannot overwrite|cannot seed|Demo seed clock|Identity-only card|Empty crew cannot|Thinner package|Cross-pack|Family A desk/i.test(
    message,
  );
}
