import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NOVUS_EMAIL } from "./desk-role.ts";
import { canTransferPack, canWritePack } from "./estimate-scope.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { JOSEPH_EMAIL, SHANE_EMAIL } from "./tester-seats.ts";
import { memoryDrive, type DriveAdapter } from "./drive-estimates.ts";
import { responseLeaksDrive, type EstimatePackSnapshot } from "./estimate-pack.ts";
import { HIS_AROMATICS_FILE_ID, HIS_AROMATICS_FREEZE_FILE_ID, HIS_AROMATICS_PACK_ID } from "./his-wood-river.ts";
import { defaultPhaseSchedule } from "./phase-schedule.ts";
import {
  archiveVisiblePack,
  deleteVisiblePack,
  getVisiblePack,
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
    const one = await getVisiblePack(owner, "new-cat2pit", drive);
    assert.equal(one?.title, "Cat 2 Pit Stop");
    assert.equal(await getVisiblePack(tester, "new-cat2pit", drive), null);
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
    assert.deepEqual(ownerList.packs.map((row) => row.packId), ["new-cat2pit"]);
    assert.equal(ownerList.packs[0]?.ownerEmail, tester.email);
    assert.equal(ownerList.packs[0]?.transferredFrom, OWNER_LOGIN_EMAIL);
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
    assert.deepEqual(ownerList.packs.map((row) => row.packId), ["new-cat2pit"]);
    assert.equal(ownerList.packs[0]?.ownerEmail, tester.email);
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

  it("archives and deletes only as the owner and never auto-removes Cat 2", async () => {
    const drive = memoryDrive();
    await upsertVisiblePack(owner, cat2(), drive);
    await upsertVisiblePack(tester, cat2({ packId: "new-nathan1", title: "Nathan trial", ownerEmail: tester.email }), drive);
    const testerArchive = await archiveVisiblePack(tester, "new-nathan1", true, drive);
    assert.equal(testerArchive.ok, false);
    if (!testerArchive.ok) {
      assert.equal(testerArchive.status, 403);
      assert.equal(testerArchive.error, "Owner tools stay with the owner.");
    }
    const testerRestore = await archiveVisiblePack(tester, "new-nathan1", false, drive);
    assert.equal(testerRestore.ok, false);
    if (!testerRestore.ok) assert.equal(testerRestore.status, 403);
    const testerDelete = await deleteVisiblePack(tester, "new-nathan1", drive);
    assert.equal(testerDelete.ok, false);
    if (!testerDelete.ok) assert.equal(testerDelete.status, 403);
    const stealDelete = await deleteVisiblePack(joseph, "new-cat2pit", drive);
    assert.equal(stealDelete.ok, false);
    const stealArchive = await archiveVisiblePack(shane, "new-cat2pit", true, drive);
    assert.equal(stealArchive.ok, false);
    const archived = await archiveVisiblePack(owner, "new-nathan1", true, drive);
    assert.equal(archived.ok, true);
    if (archived.ok) assert.equal(archived.pack?.archived, true);
    const ownerStill = await listVisiblePacks(owner, drive);
    assert.equal(ownerStill.packs.find((row) => row.packId === "new-cat2pit")?.archived, false);
    const restored = await archiveVisiblePack(owner, "new-nathan1", false, drive);
    assert.equal(restored.ok, true);
    if (restored.ok) assert.equal(restored.pack?.archived, false);
    const removed = await deleteVisiblePack(owner, "new-nathan1", drive);
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

  it("shares a tester-owned pack to the owner without taking ownership; unshare keeps owner visibility", async () => {
    const drive = memoryDrive();
    const nathanPack = cat2({ packId: "new-nathan1", title: "Nathan trial", ownerEmail: tester.email });
    const saved = await upsertVisiblePack(tester, nathanPack, drive);
    assert.equal(saved.ok, true);
    const shared = await shareVisiblePack(tester, "new-nathan1", owner.email, drive);
    assert.equal(shared.ok, true);
    if (!shared.ok) return;
    assert.equal(shared.pack.ownerEmail, tester.email);
    assert.deepEqual(shared.pack.sharedWith, [owner.email]);

    const ownerList = await listVisiblePacks(owner, drive);
    const nathanList = await listVisiblePacks(tester, drive);
    const josephList = await listVisiblePacks(joseph, drive);
    assert.equal(ownerList.packs.some((row) => row.packId === "new-nathan1"), true);
    assert.equal(ownerList.packs.find((row) => row.packId === "new-nathan1")?.ownerEmail, tester.email);
    assert.equal(nathanList.packs[0]?.ownerEmail, tester.email);
    assert.equal(nathanList.packs[0]?.title, "Nathan trial");
    assert.deepEqual(josephList.packs, []);

    const unshared = await unshareVisiblePack(tester, "new-nathan1", owner.email, drive);
    assert.equal(unshared.ok, true);
    if (unshared.ok) assert.equal(unshared.pack.ownerEmail, tester.email);
    assert.equal((await listVisiblePacks(owner, drive)).packs.some((row) => row.packId === "new-nathan1"), true);
    assert.equal((await listVisiblePacks(owner, drive)).packs.find((row) => row.packId === "new-nathan1")?.ownerEmail, tester.email);
    assert.equal((await listVisiblePacks(tester, drive)).packs[0]?.ownerEmail, tester.email);
  });

  it("Share keeps Nathan's equipment, subs, and FCR when the incoming leftover sheets are empty", async () => {
    const drive = memoryDrive();
    const full = cat2({
      packId: "new-mtaajdwa-f7539",
      title: "Madison CAT 2 (Pit Stop)",
      ownerEmail: tester.email,
      transferredFrom: OWNER_LOGIN_EMAIL,
      equipment: { largeTools: [{ id: "lt-1", itemId: "air-mover", qty: 2 }], thirdParty: [{ id: "tp-1", item: "Crane", rate: 400 }] },
      otherCost: { perDiemRate: 140, travel: [{ id: "travel-staff", travelers: 1 }], misc: [{ id: "m1", item: "Steel", qty: 2, each: 40 }] },
      subcontractor: { lines: [{ id: "sb-1", vendor: "Apex NDE", qty: 2, rate: 85 }], cards: [] },
      fcr: { log: [{ id: "fcr-1", scr: "SCR-1" }], people: [], sub: 0, equipment: 0, misc: 0 },
    });
    const saved = await upsertVisiblePack(tester, full, drive);
    assert.equal(saved.ok, true);
    const thin = cat2({
      packId: "new-mtaajdwa-f7539",
      title: "Madison CAT 2 (Pit Stop)",
      ownerEmail: tester.email,
      updatedAt: Date.now(),
      equipment: { largeTools: [], thirdParty: [] },
      otherCost: { perDiemRate: 140, travel: [{ id: "travel-staff", travelers: 1 }], misc: [] },
      subcontractor: { lines: [], cards: [] },
      fcr: { log: [], people: [], sub: 0, equipment: 0, misc: 0 },
    });
    const shared = await shareVisiblePack(tester, "new-mtaajdwa-f7539", owner.email, drive, thin);
    assert.equal(shared.ok, true);
    if (!shared.ok) return;
    assert.equal(shared.pack.ownerEmail, tester.email);
    assert.deepEqual(shared.pack.sharedWith, [owner.email]);
    assert.equal(((shared.pack.equipment as { largeTools: unknown[] }).largeTools || []).length, 1);
    assert.equal(((shared.pack.equipment as { thirdParty: unknown[] }).thirdParty || []).length, 1);
    assert.equal(((shared.pack.subcontractor as { lines: unknown[] }).lines || []).length, 1);
    assert.equal(((shared.pack.otherCost as { misc: unknown[] }).misc || []).length, 1);
    assert.equal(((shared.pack.fcr as { log: unknown[] }).log || []).length, 1);
    const leftoverFlush = await upsertVisiblePack(
      owner,
      cat2({
        packId: "new-mtaajdwa-f7539",
        title: "Madison CAT 2 (Pit Stop)",
        ownerEmail: OWNER_LOGIN_EMAIL,
        updatedAt: Date.now() + 5_000,
        equipment: { largeTools: [], thirdParty: [] },
        otherCost: { perDiemRate: 140, travel: [{ id: "travel-staff", travelers: 1 }], misc: [] },
        subcontractor: { lines: [], cards: [] },
        fcr: { log: [], people: [], sub: 0, equipment: 0, misc: 0 },
      }),
      drive,
    );
    assert.equal(leftoverFlush.ok, true);
    if (leftoverFlush.ok) {
      assert.equal(leftoverFlush.pack.ownerEmail, tester.email);
      assert.equal(((leftoverFlush.pack.equipment as { largeTools: unknown[] }).largeTools || []).length, 1);
      assert.equal(((leftoverFlush.pack.subcontractor as { lines: unknown[] }).lines || []).length, 1);
      assert.equal(((leftoverFlush.pack.otherCost as { misc: unknown[] }).misc || []).length, 1);
    }
    const unshared = await unshareVisiblePack(tester, "new-mtaajdwa-f7539", owner.email, drive, thin);
    assert.equal(unshared.ok, true);
    if (!unshared.ok) return;
    assert.equal(unshared.pack.ownerEmail, tester.email);
    assert.equal(((unshared.pack.equipment as { largeTools: unknown[] }).largeTools || []).length, 1);
    assert.equal(((unshared.pack.subcontractor as { lines: unknown[] }).lines || []).length, 1);
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

  it("returns the recipient's latest save instantly with no accept step", async () => {
    const drive = memoryDrive();
    await upsertVisiblePack(owner, cat2(), drive);
    const handed = await transferVisiblePack(owner, "new-cat2pit", tester.email, drive);
    assert.equal(handed.ok, true);
    const latest = cat2({
      ownerEmail: tester.email,
      transferredFrom: OWNER_LOGIN_EMAIL,
      transferredFromName: "Robert Henderson",
      transferredTo: tester.email,
      updatedAt: 1200,
      crew: { support: [{ id: "sup-nate-latest" }] },
    });
    const back = await returnVisiblePack(tester, "new-cat2pit", drive, latest);
    assert.equal(back.ok, true);
    if (!back.ok) return;
    assert.equal(back.pack.ownerEmail, OWNER_LOGIN_EMAIL);
    assert.equal((back.pack.crew as { support: Array<{ id: string }> }).support[0].id, "sup-nate-latest");
    assert.equal(back.pack.transferredFrom, undefined);
    const ownerList = await listVisiblePacks(owner, drive);
    const nathanList = await listVisiblePacks(tester, drive);
    assert.equal((ownerList.packs[0]?.crew as { support: Array<{ id: string }> }).support[0].id, "sup-nate-latest");
    assert.deepEqual(nathanList.packs, []);
    const accept = await returnVisiblePack(tester, "new-cat2pit", drive, latest);
    assert.equal(accept.ok, false);
  });

  it("refuses a leftover owner upsert after Turn over so Nathan keeps Cat 2", async () => {
    const drive = memoryDrive();
    await upsertVisiblePack(owner, cat2(), drive);
    const handed = await transferVisiblePack(owner, "new-cat2pit", tester.email, drive);
    assert.equal(handed.ok, true);
    const undo = await upsertVisiblePack(
      owner,
      cat2({
        updatedAt: Date.now() + 5000,
        ownerEmail: OWNER_LOGIN_EMAIL,
        transferredFrom: undefined,
        transferredTo: undefined,
      }),
      drive,
    );
    assert.equal(undo.ok, true);
    assert.equal(drive.files.size, 1);

    const ownerList = await listVisiblePacks(owner, drive);
    const nathanList = await listVisiblePacks(tester, drive);
    assert.deepEqual(ownerList.packs.map((row) => row.packId), ["new-cat2pit"]);
    assert.equal(ownerList.packs[0]?.ownerEmail, tester.email);
    assert.equal(canWritePack(owner, ownerList.packs[0]!), true);
    assert.equal(canTransferPack(owner, ownerList.packs[0]!), false);
    assert.equal(nathanList.packs[0]?.ownerEmail, tester.email);
    assert.equal(nathanList.packs[0]?.transferredFrom, OWNER_LOGIN_EMAIL);
    assert.equal(nathanList.packs[0]?.title, "Cat 2 Pit Stop");
  });

  it("lists and hydrates the richer 2027 Aromatics copy when a thin same-packId leftover remains", async () => {
    const drive = memoryDrive();
    const packId = "new-mtj7bvtk-akmei";
    await drive.createJson(
      "folder",
      "wood-river-2027-aromatics-turnaround.json",
      JSON.stringify({
        packId,
        key: `new:${packId}`,
        title: "2027 Aromatics Turnaround",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        siteId: "site-madison",
        createdAt: 50,
        updatedAt: Date.now(),
        ownerEmail: OWNER_LOGIN_EMAIL,
        crew: { staff: [], support: [] },
      }),
      { packId, ownerEmail: OWNER_LOGIN_EMAIL },
    );
    await drive.createJson(
      "folder",
      "wood-river-2027-aromatics-turnaround.json",
      JSON.stringify({
        packId,
        key: `new:${packId}`,
        title: "2027 Aromatics Turnaround",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        siteId: "site-madison",
        createdAt: 50,
        updatedAt: 400,
        ownerEmail: tester.email,
        sharedWith: [OWNER_LOGIN_EMAIL],
        transferredFrom: OWNER_LOGIN_EMAIL,
        transferredTo: tester.email,
        equipment: { largeTools: [{ id: "lt-1", itemId: "wet:8:truck-crew", qty: 1 }], thirdParty: [{ id: "tp-1", item: "6 pack Stick/Tig / Mig pulse", rate: 1225, qty: 12, freight: 50 }] },
        otherCost: { travel: [{ id: "travel-staff", travelers: 39, miles: 1700, perMile: 0.76 }], misc: [{ id: "mc-1", item: "Alloy rod", qty: 65, each: 1000 }] },
        subcontractor: { cards: [{ id: "sc-1", vendor: "JVIC Tensioning/Torquing/Machining/Bundle Equipment and Labor" }] },
        crew: { staff: Array.from({ length: 15 }, (_, index) => ({ id: `st-${index + 1}` })), support: [{ id: "su-1" }] },
      }),
      { packId, ownerEmail: tester.email },
    );
    const ownerList = await listVisiblePacks(owner, drive);
    const nathanList = await listVisiblePacks(tester, drive);
    assert.equal(ownerList.packs.length, 1);
    assert.equal(nathanList.packs.length, 1);
    assert.equal(ownerList.packs[0]?.ownerEmail, tester.email);
    assert.equal(((ownerList.packs[0]?.equipment as { largeTools: unknown[] }).largeTools || []).length, 1);
    assert.equal(((nathanList.packs[0]?.subcontractor as { cards: unknown[] }).cards || []).length, 1);
    const leftoverFlush = await upsertVisiblePack(
      owner,
      {
        packId,
        key: `new:${packId}`,
        title: "2027 Aromatics Turnaround",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        siteId: "site-madison",
        createdAt: 50,
        updatedAt: Date.now() + 5_000,
        ownerEmail: OWNER_LOGIN_EMAIL,
        equipment: { largeTools: [], thirdParty: [] },
        otherCost: { travel: [{ id: "travel-staff", travelers: 0, miles: 0, perMile: 0 }, { id: "travel-craft", travelers: 0, miles: 0, perMile: 0 }], misc: [{ id: "mc-seed", item: "Alloy rod", qty: 1, each: 0 }] },
        subcontractor: { lines: [], cards: [] },
      },
      drive,
    );
    assert.equal(leftoverFlush.ok, true);
    if (leftoverFlush.ok) {
      assert.equal(leftoverFlush.pack.ownerEmail, tester.email);
      assert.equal(((leftoverFlush.pack.equipment as { largeTools: unknown[] }).largeTools || []).length, 1);
      assert.equal(((leftoverFlush.pack.otherCost as { misc: Array<{ qty: number }> }).misc || [])[0]?.qty, 65);
      assert.equal(((leftoverFlush.pack.subcontractor as { cards: unknown[] }).cards || []).length, 1);
    }
  });

  it("ignores a newer leftover Drive file and keeps the transferred copy", async () => {
    const drive = memoryDrive();
    await upsertVisiblePack(owner, cat2(), drive);
    const handed = await transferVisiblePack(owner, "new-cat2pit", tester.email, drive);
    assert.equal(handed.ok, true);
    await drive.createJson(
      "folder",
      "wood-river-cat-2-pit-stop-leftover.json",
      JSON.stringify(
        cat2({
          updatedAt: Date.now() + 10_000,
          ownerEmail: OWNER_LOGIN_EMAIL,
          transferredFrom: undefined,
          transferredTo: undefined,
        }),
      ),
      { packId: "new-cat2pit", ownerEmail: OWNER_LOGIN_EMAIL },
    );
    assert.equal(drive.files.size, 2);

    const ownerList = await listVisiblePacks(owner, drive);
    const nathanList = await listVisiblePacks(tester, drive);
    assert.deepEqual(ownerList.packs.map((row) => row.packId), ["new-cat2pit"]);
    assert.equal(ownerList.packs[0]?.ownerEmail, tester.email);
    assert.equal(nathanList.packs.length, 1);
    assert.equal(nathanList.packs[0]?.ownerEmail, tester.email);
    assert.equal(nathanList.packs[0]?.transferredFrom, OWNER_LOGIN_EMAIL);
  });

  it("upserts a Wood River ECR log on the pack and reads it back from the vault", async () => {
    const drive = memoryDrive();
    const saved = await upsertVisiblePack(
      owner,
      cat2({
        fcr: {
          header: { pm: "Ben Peffley", costTracker: "", publishDate: "2026-09-05", nte: "", projectScope: "Pit stop extras" },
          log: [{ id: "ecr-1", scr: "ECR-12", scope: "Extra weld", status: "Open", requestedBy: "Ben Peffley" }],
          people: [],
          sub: 0,
          equipment: 0,
          misc: 0,
          scr: { taRm: "", categories: "", moc: "", sap: "", costNote: "", scheduleNote: "", signOff: "" },
        },
      }),
      drive,
    );
    assert.equal(saved.ok, true);
    const got = await getVisiblePack(owner, "new-cat2pit", drive);
    assert.equal(((got?.fcr as { log: Array<{ id: string; scope: string }> }).log || [])[0]?.id, "ecr-1");
    assert.equal(((got?.fcr as { log: Array<{ scope: string }> }).log || [])[0]?.scope, "Extra weld");
    assert.equal(((got?.fcr as { header: { pm: string } }).header || {}).pm, "Ben Peffley");
    const emptyFlush = await upsertVisiblePack(
      owner,
      cat2({
        updatedAt: 50,
        fcr: { log: [], people: [], sub: 0, equipment: 0, misc: 0 },
      }),
      drive,
    );
    assert.equal(emptyFlush.ok, true);
    if (emptyFlush.ok) {
      assert.equal(((emptyFlush.pack.fcr as { log: unknown[] }).log || []).length, 1);
    }
  });

  it("upserts a Wood River cost report snapshot on the pack and reads it back from the vault", async () => {
    const drive = memoryDrive();
    const saved = await upsertVisiblePack(
      owner,
      cat2({
        costReport: {
          statusDate: "2026-09-05",
          notes: "Friday PPR",
          export15: { raw: "Date\tHours\n09/05/2026\t20", rows: [{ date: "2026-09-05", hours: 20 }] },
          export16: { raw: "", rows: [] },
          snapshots: [
            {
              id: "ppr-1",
              statusDate: "2026-09-05",
              savedAt: 9,
              notes: "Friday PPR",
              budget: { total: 88000, hours: 240, lines: [] },
              actuals: { hours: 20, dollars: 0, headcount: 2, byDate: {} },
            },
          ],
        },
      }),
      drive,
    );
    assert.equal(saved.ok, true);
    const got = await getVisiblePack(owner, "new-cat2pit", drive);
    assert.equal(((got?.costReport as { snapshots: Array<{ id: string }> }).snapshots || [])[0]?.id, "ppr-1");
    assert.equal(((got?.costReport as { notes: string }).notes), "Friday PPR");
    const emptyFlush = await upsertVisiblePack(
      owner,
      cat2({
        updatedAt: 50,
        costReport: { statusDate: "", notes: "", export15: { raw: "", rows: [] }, export16: { raw: "", rows: [] }, snapshots: [] },
      }),
      drive,
    );
    assert.equal(emptyFlush.ok, true);
    if (emptyFlush.ok) {
      assert.equal(((emptyFlush.pack.costReport as { snapshots: unknown[] }).snapshots || []).length, 1);
    }
  });

  it("upserts Wood River purchasing lines on the pack and reads them back from the vault", async () => {
    const drive = memoryDrive();
    const saved = await upsertVisiblePack(
      owner,
      cat2({
        purchasing: {
          statusDate: "2026-09-06",
          notes: "Saturday buys",
          lines: [
            {
              id: "po-1",
              date: "2026-09-06",
              vendor: "Airgas",
              description: "C-25 bottles",
              category: "consumables",
              amount: 75,
              status: "charged",
            },
          ],
          snapshots: [
            {
              id: "buy-1",
              statusDate: "2026-09-06",
              savedAt: 9,
              notes: "Saturday buys",
              totals: { grand: 75, toolsConsumables: 75, lineCount: 1 },
              vsBudget: { toolsConsumables: 75, miscBudget: 150, variance: 75, hasMiscBudget: true },
              lineCount: 1,
            },
          ],
        },
      }),
      drive,
    );
    assert.equal(saved.ok, true);
    const got = await getVisiblePack(owner, "new-cat2pit", drive);
    assert.equal(((got?.purchasing as { notes: string }).notes), "Saturday buys");
    assert.equal(((got?.purchasing as { lines: Array<{ vendor: string }> }).lines || [])[0]?.vendor, "Airgas");
    const emptyFlush = await upsertVisiblePack(
      owner,
      cat2({
        updatedAt: 50,
        purchasing: { statusDate: "", notes: "", lines: [], snapshots: [] },
      }),
      drive,
    );
    assert.equal(emptyFlush.ok, true);
    if (emptyFlush.ok) {
      assert.equal(((emptyFlush.pack.purchasing as { lines: unknown[] }).lines || []).length, 1);
    }
  });

  it("upsert of stub-smashed local Aromatics restores from healthy Drive and does not persist stubs", async () => {
    const drive = memoryDrive();
    const job2027 = {
      projectStart: "2027-01-11",
      phases: defaultPhaseSchedule().phases.map((row) => {
        if (row.id === "pre") return { ...row, start: "2027-01-11", stop: "2027-02-28" };
        if (row.id === "oil-out") return { ...row, start: "2027-03-01", stop: "2027-03-10" };
        if (row.id === "mech") return { ...row, start: "2027-03-11", stop: "2027-04-17" };
        if (row.id === "oil-in") return { ...row, start: "2027-04-18", stop: "2027-05-03" };
        return { ...row, start: "2027-05-04", stop: "2027-05-21" };
      }),
    };
    const healthy = {
      packId: HIS_AROMATICS_PACK_ID,
      key: `new:${HIS_AROMATICS_PACK_ID}`,
      title: "2027 Aromatics Turnaround",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 50,
      updatedAt: 400,
      ownerEmail: tester.email,
      schedule: job2027,
      crew: { staff: [{ id: "st-1", ranges: [{ phaseId: "pre", start: "2027-01-11", end: "2027-02-28" }] }] },
      otherCost: { misc: [{ id: "mc-1", item: "Alloy rod", qty: 65, each: 1000 }] },
    };
    drive.files.set(HIS_AROMATICS_FILE_ID, {
      file: {
        id: HIS_AROMATICS_FILE_ID,
        name: "wood-river-2027-aromatics-turnaround.json",
        properties: { packId: HIS_AROMATICS_PACK_ID, ownerEmail: tester.email },
      },
      content: JSON.stringify(healthy),
    });
    drive.files.set(HIS_AROMATICS_FREEZE_FILE_ID, {
      file: { id: HIS_AROMATICS_FREEZE_FILE_ID, name: "2026-09-02 2027 Aromatics freeze.json" },
      content: JSON.stringify({ ...healthy, ownerEmail: "freeze-should-not-win@example.com" }),
    });
    const smashed = {
      ...healthy,
      updatedAt: Date.now() + 5_000,
      ownerEmail: OWNER_LOGIN_EMAIL,
      crew: { staff: [{ id: "st-1", ranges: [{ phaseId: "pre", start: "2027-01-11", end: "2027-01-11" }] }] },
      otherCost: { misc: [{ id: "mc-thin", item: "Seed leftover", qty: 1, each: 50 }] },
    };
    const saved = await upsertVisiblePack(owner, smashed, drive);
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    assert.equal(
      ((saved.pack.crew as { staff: Array<{ ranges: Array<{ end: string }> }> }).staff[0]?.ranges[0]?.end),
      "2027-02-28",
    );
    const liveWritten = JSON.parse(await drive.readJson(HIS_AROMATICS_FILE_ID));
    assert.equal(
      ((liveWritten.crew as { staff: Array<{ ranges: Array<{ end: string }> }> }).staff[0]?.ranges[0]?.end),
      "2027-02-28",
    );
    assert.equal(((liveWritten.otherCost as { misc: Array<{ qty: number }> }).misc || [])[0]?.qty, 65);
    const freezeWritten = JSON.parse(await drive.readJson(HIS_AROMATICS_FREEZE_FILE_ID));
    assert.equal(freezeWritten.ownerEmail, "freeze-should-not-win@example.com");
  });

  it("viewer smashed local cannot overwrite the shared vault pack", async () => {
    const drive = memoryDrive();
    const live = cat2({
      packId: "new-mtaajdwa-f7539",
      title: "Madison CAT 2 (Pit Stop)",
      updatedAt: 400,
      schedule: { projectStart: "2026-09-01", phases: [{ id: "pre", on: true, start: "2026-09-01", stop: "2026-09-03" }] },
      crew: { direct: [{ id: "bm-1", ranges: [{ start: "2026-09-01", end: "2026-09-03" }] }] },
    });
    assert.equal((await upsertVisiblePack(owner, live, drive)).ok, true);
    const shared = await shareVisiblePack(owner, "new-mtaajdwa-f7539", tester.email, drive, live);
    assert.equal(shared.ok, true);
    const smash = {
      ...live,
      updatedAt: 99_000,
      ownerEmail: tester.email,
      sharedWith: [tester.email],
      schedule: defaultPhaseSchedule(),
      crew: { staff: [], direct: [] },
    };
    const flushed = await upsertVisiblePack(tester, smash, drive);
    assert.equal(flushed.ok, false);
    if (!flushed.ok) {
      assert.equal(flushed.status, 409);
      assert.match(flushed.error || "", /Viewer local/i);
    }
    const kept = await getVisiblePack(owner, "new-mtaajdwa-f7539", drive);
    assert.equal((kept?.schedule as { projectStart?: string }).projectStart, "2026-09-01");
    assert.equal(((kept?.crew as { direct: unknown[] }).direct || []).length, 1);
  });

  it("creates Family A vault JSON on first Save and 409s a broken other+markup seed", async () => {
    const { rodeoU110FilledSnapshot, RODEO_U110_VAULT_FILE } = await import("./madison-u110.ts");
    const { rodeoU250FilledSnapshot, RODEO_U250_VAULT_FILE } = await import("./madison-u250.ts");
    const { DriveApiError } = await import("./drive-estimates.ts");
    const { vaultWriteUserError } = await import("./estimate-vault.ts");

    const drive = memoryDrive();
    const u110 = rodeoU110FilledSnapshot({ createdAt: 9_000, updatedAt: 9_001, ownerEmail: OWNER_LOGIN_EMAIL });
    const created = await upsertVisiblePack(owner, u110, drive);
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.stored, true);
    const names = [...drive.files.values()].map((row) => row.file.name);
    assert.equal(names.includes(RODEO_U110_VAULT_FILE), true);

    const u250 = rodeoU250FilledSnapshot({ createdAt: 9_000, updatedAt: 9_001, ownerEmail: OWNER_LOGIN_EMAIL });
    const created250 = await upsertVisiblePack(owner, u250, drive);
    assert.equal(created250.ok, true);
    const names2 = [...drive.files.values()].map((row) => row.file.name);
    assert.equal(names2.includes(RODEO_U250_VAULT_FILE), true);

    const dropRate = (rows: unknown[] | undefined) =>
      (rows ?? []).map((row) => {
        if (!row || typeof row !== "object") return row;
        const next = { ...(row as Record<string, unknown>) };
        delete next.bookRate;
        return next;
      });
    const crew = u110.crew as {
      staff?: unknown[];
      generalForeman?: unknown[];
      foreman?: unknown[];
      direct?: unknown[];
      support?: unknown[];
    };
    const other = u110.otherCost as { misc?: Array<Record<string, unknown>> };
    const broken = {
      ...u110,
      packId: u110.packId,
      crew: {
        ...crew,
        staff: dropRate(crew.staff),
        generalForeman: dropRate(crew.generalForeman),
        foreman: dropRate(crew.foreman),
        direct: dropRate(crew.direct),
        support: dropRate(crew.support),
      },
      otherCost: {
        ...other,
        misc: (other.misc ?? []).map((row) => {
          const next = { ...row };
          delete next.bookPriced;
          return next;
        }),
      },
    };
    const refused = await upsertVisiblePack(owner, broken, memoryDrive());
    assert.equal(refused.ok, false);
    if (!refused.ok) {
      assert.equal(refused.status, 409);
      assert.match(refused.error || "", /Rodeo U110 desk \$815,?419(?:\.38)? ≠ locked \$5,?247,?587/);
    }

    const denied = vaultWriteUserError(new DriveApiError(403, "The user does not have sufficient permissions for this file.", "service-account"));
    assert.equal(denied.status, 403);
    assert.match(denied.error, /Estimates folder|owner OAuth/i);
    const generic = vaultWriteUserError(new Error("boom"));
    assert.equal(generic.error, "Could not store that package.");
  });
});
