import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, beforeEach, describe, it } from "node:test";

import { memoryDrive } from "./drive-estimates.ts";
import { canUseRateBuilder } from "./desk-role.ts";
import { JOSEPH_EMAIL } from "./tester-seats.ts";
import { WOOD_RIVER_THIRD_PARTY_RENTAL } from "./third-party-rental.ts";
import {
  forgetThirdPartyCacheForTests,
  listThirdPartyCatalog,
  resetThirdPartyStoreForTests,
  saveThirdPartyCatalog,
  deleteThirdPartyRow,
  useThirdPartyVaultForTests,
} from "./third-party-rental-store.ts";

const dir = mkdtempSync(join(tmpdir(), "hs-rates-"));
process.env.RATES_STORE_PATH = join(dir, "rates.json");

beforeEach(() => {
  resetThirdPartyStoreForTests();
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("third-party rental vault", () => {
  it("seeds the Wood River table and keeps an edited monthly after cache wipe", async () => {
    const drive = memoryDrive();
    useThirdPartyVaultForTests(drive);
    const seeded = await listThirdPartyCatalog();
    assert.equal(seeded.length, 69);
    assert.equal(seeded.find((row) => row.description === "Spider box / 220 Vote cords")?.monthly, 75);

    const next = seeded.map((row) =>
      row.description === "Skip Pan" ? { ...row, monthly: 900 } : row,
    );
    await saveThirdPartyCatalog(next);
    forgetThirdPartyCacheForTests();
    useThirdPartyVaultForTests(drive);
    const listed = await listThirdPartyCatalog();
    assert.equal(listed.find((row) => row.description === "Skip Pan")?.monthly, 900);
    assert.equal(listed.find((row) => row.description === "Spider box / 220 Vote cords")?.freight, 150);
    assert.notEqual(listed.find((row) => row.description === "Skip Pan")?.monthly, WOOD_RIVER_THIRD_PARTY_RENTAL.find((row) => row.description === "Skip Pan")?.monthly);
  });

  it("a deleted catalog row stays gone after cache wipe", async () => {
    const drive = memoryDrive();
    useThirdPartyVaultForTests(drive);
    const seeded = await listThirdPartyCatalog();
    const skipIndex = seeded.findIndex((row) => row.description === "Skip Pan");
    assert.ok(skipIndex >= 0);
    await deleteThirdPartyRow(skipIndex);
    forgetThirdPartyCacheForTests();
    useThirdPartyVaultForTests(drive);
    const listed = await listThirdPartyCatalog();
    assert.equal(listed.some((row) => row.description === "Skip Pan"), false);
    assert.equal(listed.length, seeded.length - 1);
  });

  it("Rate builder write gate stays owner/Novus plus Joseph; other testers cannot edit", () => {
    assert.equal(canUseRateBuilder({ email: "robertmhenderson582@gmail.com", role: "owner" }), true);
    assert.equal(canUseRateBuilder({ email: "nathanboyte@gmail.com", role: "tester" }), false);
    assert.equal(canUseRateBuilder({ email: JOSEPH_EMAIL, role: "tester" }), true);
    const route = readFileSync(fileURLToPath(new URL("../app/api/desk/rates/third-party/route.ts", import.meta.url)), "utf8");
    assert.match(route, /canUseRateBuilder/);
    assert.match(route, /listThirdPartyCatalog/);
    assert.match(route, /saveThirdPartyCatalog/);
    const desk = readFileSync(fileURLToPath(new URL("../components/ThirdPartyRentalDesk.tsx", import.meta.url)), "utf8");
    assert.match(desk, /Wood River third-party/);
    assert.match(desk, /editable/);
  });
});
