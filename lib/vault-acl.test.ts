import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { qualityFolderId } from "./drive-data.ts";
import { ESTIMATES_ROOM_ID, memoryDrive } from "./drive-estimates.ts";
import {
  doorsFromQualitySeat,
  normalizeSeatDoors,
  shareVaultFoldersForSeat,
  vaultTargetsForDoors,
} from "./vault-acl.ts";
import type { OrgPosition, OrgPositionHold } from "./org-positions.ts";

const catalog: OrgPosition[] = [
  { id: "corporate-qc-manager", kind: "custom", label: "Corporate QC Manager", desk: "corporate" },
];

function hold(positionId: string, email: string): OrgPositionHold {
  return { id: `${positionId}:${email}`, positionId, email };
}

describe("vault ACL share hooks", () => {
  it("maps Quality doors to the Quality room and shares without mailing madisonltd.com", async () => {
    assert.deepEqual(normalizeSeatDoors(["quality", "bogus", "quality"]), ["quality"]);
    assert.deepEqual(
      vaultTargetsForDoors(["quality", "estimates"]).map((row) => row.id),
      [qualityFolderId(), ESTIMATES_ROOM_ID],
    );
    const president = "johnbeech.madison@gmail.com";
    assert.deepEqual(
      doorsFromQualitySeat(president, [hold("corporate-qc-manager", president)], catalog, {
        email: president,
        role: "president",
      }),
      ["quality"],
    );
    const drive = memoryDrive();
    const shared = await shareVaultFoldersForSeat(drive, "qc@example.com", ["quality"]);
    assert.equal(shared.shared[0]?.ok, true);
    assert.equal(drive.shares.get(qualityFolderId())?.[0]?.email, "qc@example.com");
    const blocked = await shareVaultFoldersForSeat(drive, "beechj@madisonltd.com", ["quality"]);
    assert.equal(blocked.shared.length, 0);
    assert.match(blocked.error || "", /cannot receive/);
  });
});
