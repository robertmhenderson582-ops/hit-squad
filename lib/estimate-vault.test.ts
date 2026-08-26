import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NOVUS_EMAIL } from "./desk-role.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { memoryDrive } from "./drive-estimates.ts";
import { responseLeaksDrive, type EstimatePackSnapshot } from "./estimate-pack.ts";
import { listVisiblePacks, packsResponse, upsertVisiblePack } from "./estimate-vault.ts";

const owner = { email: OWNER_LOGIN_EMAIL, role: "owner" as const };
const novus = { email: NOVUS_EMAIL, role: "operator" as const };
const tester = { email: "nathanboyte@gmail.com", role: "tester" as const };

function cat2(): EstimatePackSnapshot {
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
    assert.equal(testerPut.ok, true);
    if (testerPut.ok) assert.equal(testerPut.stored, false);
    assert.equal(drive.files.size, 1);
    const hidden = packsResponse(tester, ownerList.packs, "drive");
    assert.equal("store" in hidden, false);
    assert.equal(responseLeaksDrive(hidden), false);
    assert.equal(responseLeaksDrive(packsResponse(novus, novusList.packs, "drive")), false);
  });
});
