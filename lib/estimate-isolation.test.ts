import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryDrive } from "./drive-estimates.ts";
import { isMintedEstimatePackId, isSandboxEstimateOwner } from "./estimate-isolation.ts";
import { newEstimateKey, newEstimatePackId } from "./estimate-open.ts";
import { packOwnerEmailForWrite } from "./estimate-scope.ts";
import {
  HIS_AROMATICS_FILE_ID,
  HIS_AROMATICS_PACK_ID,
  HIS_CAT2_PACK_ID,
  NATHAN_DESK_EMAIL,
  applyHisIdentity,
  hisFileForPackId,
  hisMatchForPack,
  isHisProtectedMenuItem,
  isHisWoodRiverJob,
  mergeHisWoodRiverCards,
  persistHisWoodRiverCards,
} from "./his-wood-river.ts";
import { rememberLocalPack, renameLocalPackTitle, type StorageLike } from "./local-estimates.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { RODEO_U110_PACK_ID, wakeMatchForPack } from "./rodeo-monroe-wake.ts";
import { JAMES_EMAIL, JOHN_BEECH_EMAIL, JOSEPH_EMAIL } from "./tester-seats.ts";
import { listVisiblePacks, upsertVisiblePack } from "./estimate-vault.ts";
import type { EstimatePackSnapshot } from "./estimate-pack.ts";

const MARK_EMAIL = "marks544@yahoo.com";
const mark = { email: MARK_EMAIL, role: "tester" as const };
const nathan = { email: NATHAN_DESK_EMAIL, role: "tester" as const };
const owner = { email: OWNER_LOGIN_EMAIL, role: "owner" as const };
const james = { email: JAMES_EMAIL, role: "tester" as const };
const joseph = { email: JOSEPH_EMAIL, role: "tester" as const };
const johnBeech = { email: JOHN_BEECH_EMAIL, role: "tester" as const };

function memoryStore(seed: Record<string, string> = {}): StorageLike {
  const data = { ...seed };
  return {
    getItem(key) {
      return key in data ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = value;
    },
    removeItem(key) {
      delete data[key];
    },
  };
}

function markAromaticsPack(over: Partial<EstimatePackSnapshot> = {}): EstimatePackSnapshot {
  const packId = over.packId || "new-mark-arom-1";
  return {
    packId,
    key: newEstimateKey(packId),
    title: "2027 Aromatics Turnaround",
    client: "Phillips 66",
    site: "Wood River — Roxana, IL",
    siteId: "site-madison",
    createdAt: 500,
    updatedAt: 600,
    ownerEmail: MARK_EMAIL,
    crew: { support: [{ id: "sup-mark" }] },
    ...over,
  };
}

describe("sandbox estimate isolation", () => {
  it("treats Mark / James / Joseph as sandbox and Nathan / John / owner as live", () => {
    assert.equal(isSandboxEstimateOwner(MARK_EMAIL), true);
    assert.equal(isSandboxEstimateOwner(JAMES_EMAIL), true);
    assert.equal(isSandboxEstimateOwner(JOSEPH_EMAIL), true);
    assert.equal(isSandboxEstimateOwner(NATHAN_DESK_EMAIL), false);
    assert.equal(isSandboxEstimateOwner(JOHN_BEECH_EMAIL), false);
    assert.equal(isSandboxEstimateOwner(OWNER_LOGIN_EMAIL), false);
    assert.equal(isSandboxEstimateOwner(""), false);
    assert.equal(isMintedEstimatePackId("new-mark-arom-1"), true);
    assert.equal(isMintedEstimatePackId("EST-MTKIGB"), true);
    assert.equal(isMintedEstimatePackId("2027 Aromatics Turnaround"), false);
  });

  it("does not HIS-match a Mark create / rename / import / duplicate by title or copied HIS id", () => {
    const created = markAromaticsPack();
    assert.equal(hisMatchForPack(created), null);
    assert.equal(applyHisIdentity(created).ownerEmail, MARK_EMAIL);
    assert.equal(applyHisIdentity(created).packId, created.packId);

    const renamed = { ...created, title: "Madison CAT 2 (Pit Stop)" };
    assert.equal(hisMatchForPack(renamed), null);

    const imported = markAromaticsPack({
      packId: newEstimatePackId(),
      fileId: HIS_AROMATICS_FILE_ID,
      title: "2027 Aromatics Turnaround",
    });
    assert.equal(imported.packId === HIS_AROMATICS_PACK_ID, false);
    assert.equal(hisMatchForPack(imported), null);
    assert.equal(hisFileForPackId(imported.packId), null);

    const duplicate = markAromaticsPack({
      packId: "new-mark-arom-copy",
      title: "2027 Aromatics Turnaround copy",
    });
    assert.equal(hisMatchForPack(duplicate), null);
    assert.equal(isHisWoodRiverJob({ id: `job-${created.packId}`, title: created.title, packId: created.packId }), false);
    assert.equal(isHisWoodRiverJob({ title: "2027 Aromatics Turnaround" }), true);
    assert.equal(isHisProtectedMenuItem({ id: "2027 Aromatics Turnaround", title: "2027 Aromatics Turnaround" }), true);

    const prefix = markAromaticsPack({ packId: `${HIS_AROMATICS_PACK_ID}-sandbox` });
    assert.equal(hisMatchForPack(prefix), null);
    assert.equal(hisFileForPackId(prefix.packId), null);
  });

  it("keeps James leftover on the live CAT 2 pack id so owner paint can still restamp Nathan", () => {
    const leftover = {
      packId: HIS_CAT2_PACK_ID,
      title: "Madison CAT 2 (Pit Stop)",
      ownerEmail: JAMES_EMAIL,
    };
    assert.equal(hisMatchForPack(leftover)?.packId, HIS_CAT2_PACK_ID);
    assert.equal(applyHisIdentity(leftover).ownerEmail, NATHAN_DESK_EMAIL);
  });

  it("does not restamp Mark writes onto Nathan, including a title that matches a live HIS job", () => {
    assert.equal(
      packOwnerEmailForWrite(mark, MARK_EMAIL, {
        packId: "new-mark-arom-1",
        title: "2027 Aromatics Turnaround",
        site: "Wood River — Roxana, IL",
      }),
      MARK_EMAIL,
    );
    assert.equal(
      packOwnerEmailForWrite(mark, MARK_EMAIL, {
        packId: HIS_AROMATICS_PACK_ID,
        title: "2027 Aromatics Turnaround",
      }),
      MARK_EMAIL,
    );
    assert.equal(
      packOwnerEmailForWrite(james, JAMES_EMAIL, {
        packId: "new-james-cat",
        title: "Madison CAT 2 (Pit Stop)",
      }),
      JAMES_EMAIL,
    );
    assert.equal(
      packOwnerEmailForWrite(johnBeech, JOHN_BEECH_EMAIL, {
        packId: "new-john-arom",
        title: "2027 Aromatics Turnaround",
      }),
      JOHN_BEECH_EMAIL,
    );
    assert.equal(
      packOwnerEmailForWrite(nathan, NATHAN_DESK_EMAIL, {
        packId: HIS_AROMATICS_PACK_ID,
        title: "2027 Aromatics Turnaround",
      }),
      NATHAN_DESK_EMAIL,
    );
    assert.equal(
      packOwnerEmailForWrite(owner, OWNER_LOGIN_EMAIL, {
        packId: HIS_CAT2_PACK_ID,
        title: "Madison CAT 2 (Pit Stop)",
      }),
      OWNER_LOGIN_EMAIL,
    );
  });

  it("paints Nathan's HIS cards beside Mark's same-title sandbox pack and does not rewrite Mark", () => {
    const store = memoryStore();
    rememberLocalPack(
      {
        packId: "new-mark-arom-1",
        title: "2027 Aromatics Turnaround",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        ownerEmail: MARK_EMAIL,
      },
      store,
    );
    const renamed = renameLocalPackTitle("new-mark-arom-1", "Madison CAT 2 (Pit Stop)", store);
    assert.equal(renamed?.ownerEmail, MARK_EMAIL);
    assert.equal(renamed?.packId, "new-mark-arom-1");
    assert.equal(hisMatchForPack(renamed), null);

    const painted = persistHisWoodRiverCards(store);
    const markRow = painted.find((row) => row.packId === "new-mark-arom-1");
    const cat = painted.find((row) => row.packId === HIS_CAT2_PACK_ID);
    const aroma = painted.find((row) => row.packId === HIS_AROMATICS_PACK_ID);
    assert.equal(markRow?.ownerEmail, MARK_EMAIL);
    assert.equal(markRow?.title, "Madison CAT 2 (Pit Stop)");
    assert.equal(cat?.ownerEmail, NATHAN_DESK_EMAIL);
    assert.equal(aroma?.ownerEmail, NATHAN_DESK_EMAIL);
    assert.equal(painted.filter((row) => row.title === "Madison CAT 2 (Pit Stop)").length, 2);

    const merged = mergeHisWoodRiverCards([
      {
        packId: "new-mark-arom-1",
        key: "new:new-mark-arom-1",
        title: "2027 Aromatics Turnaround",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        siteId: "site-madison",
        createdAt: 8,
        updatedAt: 9,
        ownerEmail: MARK_EMAIL,
      },
    ]);
    assert.equal(merged.find((row) => row.packId === "new-mark-arom-1")?.ownerEmail, MARK_EMAIL);
    assert.ok(merged.some((row) => row.packId === HIS_AROMATICS_PACK_ID && row.ownerEmail === NATHAN_DESK_EMAIL));
  });

  it("upserts Mark's HIS-titled pack as his own Drive file and leaves Nathan's live Aromatics file alone", async () => {
    const drive = memoryDrive();
    const live: EstimatePackSnapshot = {
      packId: HIS_AROMATICS_PACK_ID,
      key: `new:${HIS_AROMATICS_PACK_ID}`,
      title: "2027 Aromatics Turnaround",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 1,
      updatedAt: 2,
      ownerEmail: NATHAN_DESK_EMAIL,
      crew: { support: [{ id: "sup-nate" }] },
    };
    const liveBefore = JSON.stringify(live);
    await drive.updateJson(HIS_AROMATICS_FILE_ID, liveBefore, "wood-river-2027-aromatics-turnaround.json", {
      packId: HIS_AROMATICS_PACK_ID,
      ownerEmail: NATHAN_DESK_EMAIL,
    });
    const liveFileId = HIS_AROMATICS_FILE_ID;

    const markPut = await upsertVisiblePack(mark, markAromaticsPack(), drive);
    assert.equal(markPut.ok, true);
    if (!markPut.ok) return;
    assert.equal(markPut.pack.ownerEmail, MARK_EMAIL);
    assert.equal(markPut.pack.packId, "new-mark-arom-1");
    assert.equal(markPut.pack.title, "2027 Aromatics Turnaround");
    assert.equal(drive.files.size, 2);
    if (liveFileId) assert.equal(await drive.readJson(liveFileId), liveBefore);

    const markAgain = await upsertVisiblePack(mark, markAromaticsPack({ updatedAt: 900 }), drive);
    assert.equal(markAgain.ok, true);
    const nathanList = await listVisiblePacks(nathan, drive);
    const markDesk = await listVisiblePacks(mark, drive);
    const josephDesk = await listVisiblePacks(joseph, drive);
    assert.equal(nathanList.packs.some((row) => row.packId === "new-mark-arom-1"), false);
    assert.equal(nathanList.packs.some((row) => row.packId === HIS_AROMATICS_PACK_ID), true);
    assert.deepEqual(markDesk.packs.map((row) => row.packId), ["new-mark-arom-1"]);
    assert.deepEqual(josephDesk.packs.map((row) => row.packId), []);

    const hijack = await upsertVisiblePack(mark, markAromaticsPack({ packId: HIS_AROMATICS_PACK_ID }), drive);
    assert.equal(hijack.ok, false);
    if (!hijack.ok) assert.equal(hijack.status, 404);
    if (liveFileId) assert.equal(await drive.readJson(liveFileId), liveBefore);
  });

  it("does not wake-match a Mark Rodeo title or fuzzy U110 job code onto the reserved slot", () => {
    assert.equal(
      wakeMatchForPack({
        packId: "new-mark-u110",
        title: "Rodeo U110 2026 TA",
        ownerEmail: MARK_EMAIL,
      }),
      null,
    );
    assert.equal(
      wakeMatchForPack({
        packId: `${RODEO_U110_PACK_ID}-sandbox`,
        title: "Working estimate",
        ownerEmail: MARK_EMAIL,
      }),
      null,
    );
    assert.equal(
      wakeMatchForPack({
        packId: RODEO_U110_PACK_ID,
        title: "Rodeo U110 2026 TA",
        ownerEmail: MARK_EMAIL,
      }),
      null,
    );
    assert.equal(
      wakeMatchForPack({
        packId: RODEO_U110_PACK_ID,
        title: "Rodeo U110 2026 TA",
        ownerEmail: NATHAN_DESK_EMAIL,
      })?.packId,
      RODEO_U110_PACK_ID,
    );
  });
});
