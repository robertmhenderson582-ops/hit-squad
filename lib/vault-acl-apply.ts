import { driveAdapter } from "./drive-estimates.ts";
import { hydratePositionStore } from "./org-positions-store.ts";
import { mergePositions } from "./org-positions.ts";
import { doorsFor, setDoors } from "./privileges-store.ts";
import {
  doorsFromQualitySeat,
  normalizeSeatDoors,
  shareVaultFoldersForSeat,
  type SeatDoorId,
  type VaultShareResult,
} from "./vault-acl.ts";

export async function applyVaultAclForSeat(
  email: string,
  extraDoors: readonly SeatDoorId[] = [],
  user?: { email?: string; role?: string } | null,
): Promise<VaultShareResult> {
  const key = email.trim().toLowerCase();
  let fromSeat: SeatDoorId[] = [];
  try {
    const data = await hydratePositionStore();
    fromSeat = doorsFromQualitySeat(key, data.holds, mergePositions(data.positions, data.removedIds), user ?? { email: key });
  } catch {
    fromSeat = doorsFromQualitySeat(key, [], [], user ?? { email: key });
  }
  const doors = [...new Set([...await doorsFor(key), ...normalizeSeatDoors(extraDoors), ...fromSeat])];
  if (extraDoors.length) await setDoors(key, doors);
  const drive = driveAdapter();
  return shareVaultFoldersForSeat(drive.configured ? drive : null, key, doors);
}
