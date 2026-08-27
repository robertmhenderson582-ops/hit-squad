import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ESTIMATES_ROOM_ID,
  driveConfigured,
  driveStoreKind,
  deleteEstimateInDrive,
  findDrivePackFile,
  listDrivePacks,
  memoryDrive,
  overwriteEstimateInDrive,
  parseServiceAccount,
  resolveEstimatesFolder,
  upsertEstimateInDrive,
} from "./drive-estimates.ts";
import { estimateFileName, publicPack, responseLeaksDrive, type EstimatePackSnapshot } from "./estimate-pack.ts";

function cat2(over: Partial<EstimatePackSnapshot> = {}): EstimatePackSnapshot {
  return {
    packId: "new-cat2pit",
    key: "new:new-cat2pit",
    title: "Cat 2 Pit Stop",
    client: "Phillips 66",
    site: "Wood River — Roxana, IL",
    siteId: "site-madison",
    createdAt: 100,
    updatedAt: 200,
    ownerEmail: "robertmhenderson582@gmail.com",
    crew: { support: [{ id: "sup-1", position: "Tool Room Attendant" }] },
    ...over,
  };
}

describe("drive estimate upsert", () => {
  it("reads service account env without treating SMTP as Drive", () => {
    assert.equal(parseServiceAccount({ GMAIL_APP_PASSWORD: "x" }), null);
    assert.equal(driveConfigured({ GMAIL_APP_PASSWORD: "x" }), false);
    assert.equal(driveStoreKind({}), "unconfigured");
    const parsed = parseServiceAccount({
      GOOGLE_CLIENT_EMAIL: "vault@hitsquad.iam.gserviceaccount.com",
      GOOGLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n",
    });
    assert.equal(parsed?.client_email, "vault@hitsquad.iam.gserviceaccount.com");
    assert.match(parsed?.private_key || "", /BEGIN PRIVATE KEY/);
    assert.match(parsed?.private_key || "", /\n/);
  });

  it("updates the same file in place and keeps testers off owner packs", async () => {
    const drive = memoryDrive();
    const first = await upsertEstimateInDrive(drive, cat2(), "folder");
    assert.equal(first.name, "wood-river-cat-2-pit-stop.json");
    const second = await upsertEstimateInDrive(
      drive,
      cat2({ updatedAt: 400, crew: { support: [{ id: "sup-2" }] } }),
      "folder",
    );
    assert.equal(second.id, first.id);
    assert.equal(drive.files.size, 1);
    const listed = await listDrivePacks(drive, "folder");
    assert.equal(listed.length, 1);
    assert.equal((listed[0].crew as { support: Array<{ id: string }> }).support[0].id, "sup-2");
    assert.equal(responseLeaksDrive(listed.map(publicPack)), false);

    await upsertEstimateInDrive(
      drive,
      cat2({ packId: "new-nathan1", ownerEmail: "nathanboyte@gmail.com", title: "Nathan trial" }),
      "folder",
    );
    assert.equal(drive.files.size, 2);
    const ownerFile = await findDrivePackFile(drive, "folder", "new-cat2pit", "robertmhenderson582@gmail.com");
    const testerFile = await findDrivePackFile(drive, "folder", "new-cat2pit", "nathanboyte@gmail.com");
    assert.ok(ownerFile);
    assert.equal(testerFile, null);
    assert.equal(estimateFileName(cat2()), "wood-river-cat-2-pit-stop.json");
    assert.equal(resolveEstimatesFolder(), ESTIMATES_ROOM_ID);
    assert.equal(resolveEstimatesFolder("1QtYnsIw_Os3nYKAdByS9V1mzsv2A6dWy"), ESTIMATES_ROOM_ID);
    assert.equal(resolveEstimatesFolder("1OvNT1G9UR69hXjIeR1DpJLFZPIhoPhuQ"), ESTIMATES_ROOM_ID);
    const firstName = [...drive.files.values()][0]?.file.name;
    assert.equal(firstName, "wood-river-cat-2-pit-stop.json");
    assert.equal(drive.files.size, 2);
  });

  it("overwrites the same file when the owner email changes and can delete that file", async () => {
    const drive = memoryDrive();
    const first = await upsertEstimateInDrive(drive, cat2(), "folder");
    const handed = await overwriteEstimateInDrive(
      drive,
      cat2({ ownerEmail: "nathanboyte@gmail.com", updatedAt: 800 }),
      "folder",
    );
    assert.equal(handed.id, first.id);
    assert.equal(drive.files.size, 1);
    assert.equal(handed.properties?.ownerEmail, "nathanboyte@gmail.com");
    const ownerFile = await findDrivePackFile(drive, "folder", "new-cat2pit", "robertmhenderson582@gmail.com");
    const testerFile = await findDrivePackFile(drive, "folder", "new-cat2pit", "nathanboyte@gmail.com");
    assert.equal(ownerFile, null);
    assert.ok(testerFile);
    const removed = await deleteEstimateInDrive(drive, "new-cat2pit", "nathanboyte@gmail.com", "folder");
    assert.equal(removed, true);
    assert.equal(drive.files.size, 0);
  });
});
