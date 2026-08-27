import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NOVUS_EMAIL } from "./desk-role.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { JOSEPH_EMAIL, SHANE_EMAIL } from "./tester-seats.ts";
import { memoryDrive, type DriveAdapter } from "./drive-estimates.ts";
import { responseLeaksDrive, type EstimatePackSnapshot } from "./estimate-pack.ts";
import {
  archiveVisiblePack,
  deleteVisiblePack,
  listVisiblePacks,
  packsResponse,
  returnVisiblePack,
  shareVisiblePack,
  TRANSFER_WRITE_ERROR,
  transferVisiblePack,
  unshareVisiblePack,
  upsertVisiblePack,
} from "./estimate-vault.ts";

const owner = { email: OWNER_LOGIN_EMAIL, role: "owner" as const };
const novus = { email: NOVUS_EMAIL, role: "operator" as const };
const tester = { email: "nathanboyte@gmail.com", role: "tester" as const };
const joseph = { email: JOSEPH_EMAIL, role: "tester" as const };
const shane = { email: SHANE_EMAIL, role: "tester" as const };

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
    ownerEmail: OWNER_LOGIN_EMAIL,
    crew: { support: [{ id: "sup-1" }] },
    schedule: { phases: [{ id: "pre", on: true, start: "2026-09-01" }] },
    ...over,
  };
}

describe("estimate vault service", () => {
  it("upserts the owner pack once and lets Novus read it", async () => {
    const drive = memoryDrive();
    const first = await upsertVisiblePack(owner, cat2(), drive);
    const again = await upsertVisiblePack(novus, { ...cat2(), updatedAt: 500, crew: { support: [{ id: "sup-2" }] } }, drive);
    assert.equal(first.ok, true);
    assert.equal(again.ok, true);
    if (!first.ok || !again.ok) return;
    assert.equal(first.stored, true);
    assert.equal(drive.files.size, 1);
    const ownerList = await listVisiblePacks(owner, drive);
    const novusList = await listVisiblePacks(novus, drive);
    const testerList = await listVisiblePacks(tester, drive);
    assert.equal(ownerList.packs[0]?.title, "Cat 2 Pit Stop");
    assert.equal((novusList.packs[0]?.crew as { support: Array<{ id: string }> }).support[0].id, "sup-2");
    assert.deepEqual(testerList.packs, []);
    const testerPut = await upsertVisiblePack(tester, cat2(), drive);
    assert.equal(testerPut.ok, false);
    if (!testerPut.ok) assert.equal(testerPut.status, 404);
    assert.equal(drive.files.size, 1);
    const hidden = packsResponse(tester, ownerList.packs, "drive");
    assert.equal("store" in hidden, false);
    assert.equal(hidden.persisted, true);
    assert.equal(responseLeaksDrive(hidden), false);
    assert.equal(responseLeaksDrive(packsResponse(novus, novusList.packs, "drive")), false);
  });

  it("lets testers persist their own pack without seeing anyone else's", async () => {
    const drive = memoryDrive();
    await upsertVisiblePack(owner, cat2(), drive);
    const nathan = await upsertVisiblePack(
      tester,
      cat2({ packId: "new-nathan1", title: "Nathan trial", ownerEmail: tester.email }),
      drive,
    );
    assert.equal(nathan.ok, true);
    if (nathan.ok) {
      assert.equal(nathan.stored, true);
      assert.equal(nathan.pack.ownerEmail, tester.email);
    }
    assert.equal(drive.files.size, 2);
    const josephList = await listVisiblePacks(joseph, drive);
    const shaneList = await listVisiblePacks(shane, drive);
    const nathanList = await listVisiblePacks(tester, drive);
    assert.deepEqual(josephList.packs.map((row) => row.packId), []);
    assert.deepEqual(shaneList.packs.map((row) => row.packId), []);
    assert.deepEqual(nathanList.packs.map((row) => row.packId), ["new-nathan1"]);
    const steal = await upsertVisiblePack(joseph, cat2({ packId: "new-nathan1", ownerEmail: tester.email }), drive);
    assert.equal(steal.ok, false);
  });

  it("turns Cat 2 over to Nathan in place so Joseph cannot open it", async () => {
    const drive = memoryDrive();
    await upsertVisiblePack(owner, cat2(), drive);
    const fileId = [...drive.files.values()][0]?.file.id;
    const handed = await transferVisiblePack(owner, "new-cat2pit", tester.email, drive);
    assert.equal(handed.ok, true);
    if (!handed.ok) return;
    assert.equal(handed.pack.ownerEmail, tester.email);
    assert.equal(handed.to.name, "Nathan Boyte");
    assert.equal(drive.files.size, 1);
    assert.equal([...drive.files.values()][0]?.file.id, fileId);
    assert.equal([...drive.files.values()][0]?.file.properties?.ownerEmail, tester.email);

    const ownerList = await listVisiblePacks(owner, drive);
    const nathanList = await listVisiblePacks(tester, drive);
    const josephList = await listVisiblePacks(joseph, drive);
    const shaneList = await listVisiblePacks(shane, drive);
    const novusList = await listVisiblePacks(novus, drive);
    assert.deepEqual(ownerList.packs.map((row) => row.packId), []);
    assert.equal(nathanList.packs[0]?.title, "Cat 2 Pit Stop");
    assert.equal(nathanList.packs[0]?.transferredFrom, OWNER_LOGIN_EMAIL);
    assert.equal(nathanList.packs[0]?.transferredFromName, "Robert Henderson");
    assert.equal(nathanList.packs[0]?.transferredTo, tester.email);
    assert.deepEqual(josephList.packs, []);
    assert.deepEqual(shaneList.packs, []);
    assert.deepEqual(novusList.packs, []);

    const steal = await transferVisiblePack(joseph, "new-cat2pit", tester.email, drive);
    assert.equal(steal.ok, false);
    const random = await transferVisiblePack(owner, "new-cat2pit", "not-a-desk@example.com", drive);
    assert.equal(random.ok, false);
    const novusHand = await transferVisiblePack(novus, "new-cat2pit", tester.email, drive);
    assert.equal(novusHand.ok, false);

    const saved = await upsertVisiblePack(
      tester,
      { ...nathanList.packs[0], updatedAt: 900, crew: { support: [{ id: "sup-nate" }] } },
      drive,
    );
    assert.equal(saved.ok, true);
    if (saved.ok) {
      assert.equal(saved.stored, true);
      assert.equal(saved.pack.ownerEmail, tester.email);
    }
    assert.equal(drive.files.size, 1);
  });

  it("turns a local-only Cat 2 over to Nathan when Drive is configured but empty", async () => {
    const empty = memoryDrive();
    const planted = await transferVisiblePack(joseph, "new-cat2pit", tester.email, empty, cat2());
    assert.equal(planted.ok, false);
    assert.equal(empty.files.size, 0);

    const drive = memoryDrive();
    const handed = await transferVisiblePack(owner, "new-cat2pit", tester.email, drive, cat2());
    assert.equal(handed.ok, true);
    if (!handed.ok) return;
    assert.equal(handed.stored, true);
    assert.equal(handed.pack.ownerEmail, tester.email);
    assert.equal(handed.pack.packId, "new-cat2pit");
    assert.equal(handed.to.name, "Nathan Boyte");
    assert.equal(drive.files.size, 1);
    const stored = JSON.parse([...drive.files.values()][0]?.content || "{}") as EstimatePackSnapshot;
    assert.equal(stored.ownerEmail, tester.email);
    assert.equal(stored.title, "Cat 2 Pit Stop");
    assert.equal([...drive.files.values()][0]?.file.properties?.ownerEmail, tester.email);

    const nathanList = await listVisiblePacks(tester, drive);
    const ownerList = await listVisiblePacks(owner, drive);
    const josephList = await listVisiblePacks(joseph, drive);
    const shaneList = await listVisiblePacks(shane, drive);
    const novusList = await listVisiblePacks(novus, drive);
    assert.equal(nathanList.packs[0]?.title, "Cat 2 Pit Stop");
    assert.deepEqual(ownerList.packs, []);
    assert.deepEqual(josephList.packs, []);
    assert.deepEqual(shaneList.packs, []);
    assert.deepEqual(novusList.packs, []);
    const steal = await transferVisiblePack(joseph, "new-cat2pit", tester.email, drive, cat2());
    assert.equal(steal.ok, false);
  });

  it("keeps Drive empty and returns an error when the write fails", async () => {
    const inner = memoryDrive();
    const drive: DriveAdapter & { files: typeof inner.files } = {
      ...inner,
      async createJson() {
        throw new Error("create");
      },
      async updateJson() {
        throw new Error("update");
      },
    };
    const handed = await transferVisiblePack(owner, "new-cat2pit", tester.email, drive, cat2());
    assert.equal(handed.ok, false);
    if (handed.ok) return;
    assert.equal(handed.status, 502);
    assert.equal(handed.error, TRANSFER_WRITE_ERROR);
    assert.equal(drive.files.size, 0);
    const missing = await transferVisiblePack(owner, "new-cat2pit", tester.email, memoryDrive());
    assert.equal(missing.ok, false);
  });

  it("archives and deletes only the caller's pack and never auto-removes Cat 2", async () => {
    const drive = memoryDrive();
    await upsertVisiblePack(owner, cat2(), drive);
    await upsertVisiblePack(tester, cat2({ packId: "new-nathan1", title: "Nathan trial", ownerEmail: tester.email }), drive);
    const archived = await archiveVisiblePack(tester, "new-nathan1", true, drive);
    assert.equal(archived.ok, true);
    if (archived.ok) assert.equal(archived.pack?.archived, true);
    const ownerStill = await listVisiblePacks(owner, drive);
    assert.equal(ownerStill.packs[0]?.packId, "new-cat2pit");
    assert.equal(ownerStill.packs[0]?.archived, false);
    const stealDelete = await deleteVisiblePack(joseph, "new-cat2pit", drive);
    assert.equal(stealDelete.ok, false);
    const stealArchive = await archiveVisiblePack(shane, "new-cat2pit", true, drive);
    assert.equal(stealArchive.ok, false);
    const removed = await deleteVisiblePack(tester, "new-nathan1", drive);
    assert.equal(removed.ok, true);
    if (removed.ok) assert.equal(removed.deleted, true);
    assert.equal((await listVisiblePacks(tester, drive)).packs.length, 0);
    assert.equal((await listVisiblePacks(owner, drive)).packs[0]?.title, "Cat 2 Pit Stop");
  });

  it("shares Cat 2 so Nathan can work and Robert stays owner; Joseph cannot see it", async () => {
    const drive = memoryDrive();
    await upsertVisiblePack(owner, cat2(), drive);
    const shared = await shareVisiblePack(owner, "new-cat2pit", tester.email, drive);
    assert.equal(shared.ok, true);
    if (!shared.ok) return;
    assert.equal(shared.pack.ownerEmail, OWNER_LOGIN_EMAIL);
    assert.deepEqual(shared.pack.sharedWith, [tester.email]);

    const ownerList = await listVisiblePacks(owner, drive);
    const nathanList = await listVisiblePacks(tester, drive);
    const josephList = await listVisiblePacks(joseph, drive);
    assert.equal(ownerList.packs[0]?.ownerEmail, OWNER_LOGIN_EMAIL);
    assert.equal(nathanList.packs[0]?.title, "Cat 2 Pit Stop");
    assert.deepEqual(josephList.packs, []);

    const saved = await upsertVisiblePack(
      tester,
      { ...nathanList.packs[0], updatedAt: 800, crew: { support: [{ id: "sup-share" }] } },
      drive,
    );
    assert.equal(saved.ok, true);
    if (saved.ok) assert.equal(saved.pack.ownerEmail, OWNER_LOGIN_EMAIL);

    const steal = await shareVisiblePack(joseph, "new-cat2pit", tester.email, drive);
    assert.equal(steal.ok, false);
    const unshared = await unshareVisiblePack(owner, "new-cat2pit", tester.email, drive);
    assert.equal(unshared.ok, true);
    assert.deepEqual((await listVisiblePacks(tester, drive)).packs, []);
    assert.equal((await listVisiblePacks(owner, drive)).packs[0]?.ownerEmail, OWNER_LOGIN_EMAIL);
  });

  it("returns a turned-over Cat 2 to Robert as a working job", async () => {
    const drive = memoryDrive();
    await upsertVisiblePack(owner, cat2(), drive);
    const handed = await transferVisiblePack(owner, "new-cat2pit", tester.email, drive);
    assert.equal(handed.ok, true);
    const stolen = await returnVisiblePack(joseph, "new-cat2pit", drive);
    assert.equal(stolen.ok, false);
    const back = await returnVisiblePack(tester, "new-cat2pit", drive);
    assert.equal(back.ok, true);
    if (!back.ok) return;
    assert.equal(back.pack.ownerEmail, OWNER_LOGIN_EMAIL);
    assert.equal(back.pack.transferredFrom, undefined);
    assert.equal(back.to.email, OWNER_LOGIN_EMAIL);

    const ownerList = await listVisiblePacks(owner, drive);
    const nathanList = await listVisiblePacks(tester, drive);
    assert.equal(ownerList.packs[0]?.title, "Cat 2 Pit Stop");
    assert.equal(ownerList.packs[0]?.ownerEmail, OWNER_LOGIN_EMAIL);
    assert.equal(ownerList.packs[0]?.transferredFrom, undefined);
    assert.deepEqual(nathanList.packs, []);
  });
});
