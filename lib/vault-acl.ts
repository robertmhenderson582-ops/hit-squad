import { ESTIMATES_ROOM_ID, type DriveAdapter } from "./drive-estimates.ts";
import { hseFolderId, qualityFolderId } from "./drive-data.ts";
import { inviteEmailAllowed } from "./invite-policy.ts";
import {
  CORPORATE_QC_MANAGER_POSITION_ID,
  SITE_QC_MANAGER_POSITION_ID,
  holdsForEmail,
  type OrgPosition,
  type OrgPositionHold,
} from "./org-positions.ts";
import { holdsCorporateQualityPosition, holdsFieldQualityPosition, isQualitySeatLabel } from "./quality-company-doc-acl.ts";
import { isQualityVaultSeat } from "./desk-role.ts";
import { type SeatDoorId } from "./seat-doors.ts";

export { SEAT_DOORS, isSeatDoorId, normalizeSeatDoors, type SeatDoorId } from "./seat-doors.ts";
export {
  VAULT_SITE_JSON_NAMES,
  filterVaultBriefsForViewer,
  filterVaultFilesByFolder,
  filterVaultListedFiles,
  filterVaultTreeForViewer,
  isVaultInfrastructureFile,
  vaultFileVisibleToViewer,
  vaultListViewerForSeat,
  type VaultListViewer,
} from "./vault-list-filter.ts";

export const VAULT_ACL_SHARE_ERROR = "Could not share the vault folder. Confirm the desk Drive account can add people.";

export type VaultShareTarget = {
  id: string;
  door: SeatDoorId;
  role: "writer";
};

export function vaultTargetsForDoors(doors: readonly SeatDoorId[]): VaultShareTarget[] {
  const targets: VaultShareTarget[] = [];
  if (doors.includes("quality")) {
    targets.push({ id: qualityFolderId(), door: "quality", role: "writer" });
  }
  if (doors.includes("hse")) {
    targets.push({ id: hseFolderId(), door: "hse", role: "writer" });
  }
  if (doors.includes("estimates")) {
    targets.push({ id: ESTIMATES_ROOM_ID, door: "estimates", role: "writer" });
  }
  return targets;
}

export function doorsFromQualitySeat(
  email: string | undefined,
  holds: OrgPositionHold[] = [],
  catalog: OrgPosition[] = [],
  user?: { email?: string; role?: string } | null,
): SeatDoorId[] {
  const doors: SeatDoorId[] = [];
  const quality =
    isQualityVaultSeat(user) ||
    holdsCorporateQualityPosition(email, holds, catalog) ||
    holdsFieldQualityPosition(email, holds, catalog) ||
    holdsForEmail(holds, email || "").some((hold) => {
      const row = catalog.find((item) => item.id === hold.positionId);
      return (
        hold.positionId === CORPORATE_QC_MANAGER_POSITION_ID ||
        hold.positionId === SITE_QC_MANAGER_POSITION_ID ||
        isQualitySeatLabel(row?.label)
      );
    });
  if (quality) doors.push("quality");
  return doors;
}

export type VaultShareResult = {
  email: string;
  shared: Array<{ door: SeatDoorId; ok: boolean; already?: boolean }>;
  error?: string;
};

export async function shareVaultFoldersForSeat(
  drive: DriveAdapter | null | undefined,
  email: string,
  doors: readonly SeatDoorId[],
): Promise<VaultShareResult> {
  const key = email.trim().toLowerCase();
  if (!inviteEmailAllowed(key)) {
    return { email: key, shared: [], error: "That email cannot receive a vault share." };
  }
  const targets = vaultTargetsForDoors(doors);
  if (!targets.length) return { email: key, shared: [] };
  if (!drive?.configured || !drive.shareWithEmail) {
    return { email: key, shared: targets.map((row) => ({ door: row.door, ok: false })), error: VAULT_ACL_SHARE_ERROR };
  }
  const shared: VaultShareResult["shared"] = [];
  for (const target of targets) {
    try {
      const result = await drive.shareWithEmail(target.id, key, target.role);
      shared.push({ door: target.door, ok: Boolean(result?.ok !== false), already: result?.already });
    } catch {
      shared.push({ door: target.door, ok: false });
    }
  }
  if (shared.some((row) => !row.ok)) {
    return { email: key, shared, error: VAULT_ACL_SHARE_ERROR };
  }
  return { email: key, shared };
}
