import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deskTotalsForBaselineWrite,
  familyAVaultWriteError,
  isFamilyAPackId,
  isVaultIntegrityError,
  packBaselineWriteCheck,
  packBaselineWriteError,
  packFamilyADesk,
} from "./family-a-vault-write.ts";
import { HIS_AROMATICS_PACK_ID, HIS_CAT2_PACK_ID } from "./his-wood-river.ts";
import { rodeoU110FilledSnapshot } from "./madison-u110.ts";
import { rodeoU250FilledSnapshot } from "./madison-u250.ts";
import { BOILER17_PACK_ID } from "./boiler-17.ts";
import { MONROE_541V_PACK_ID, RODEO_U110_PACK_ID, RODEO_U250_PACK_ID } from "./rodeo-monroe-wake.ts";
import { moneyEqual, U110_CONTRACTOR_GOLDEN, U250_CONTRACTOR_GOLDEN } from "./wake-golden.ts";
import { AROMATICS_FREEZE_GRAND_TOTAL, CAT2_SEP7_GRAND_TOTAL } from "./pack-integrity.ts";

function stripBookRates<T extends { staff?: unknown[]; generalForeman?: unknown[]; foreman?: unknown[]; direct?: unknown[]; support?: unknown[] }>(
  crew: T,
): T {
  const drop = (rows: unknown[] | undefined) =>
    (rows ?? []).map((row) => {
      if (!row || typeof row !== "object") return row;
      const next = { ...(row as Record<string, unknown>) };
      delete next.bookRate;
      return next;
    });
  return {
    ...crew,
    staff: drop(crew.staff),
    generalForeman: drop(crew.generalForeman),
    foreman: drop(crew.foreman),
    direct: drop(crew.direct),
    support: drop(crew.support),
  };
}

describe("Family A vault write gate", () => {
  it("lets a correct U110 / U250 seed through and refuses other+markup-only labor", () => {
    const u110 = rodeoU110FilledSnapshot({ createdAt: 9_000, updatedAt: 9_001 });
    const u250 = rodeoU250FilledSnapshot({ createdAt: 9_000, updatedAt: 9_001 });
    const u110Desk = packFamilyADesk(u110);
    const u250Desk = packFamilyADesk(u250);
    assert.equal(isFamilyAPackId(RODEO_U110_PACK_ID), true);
    assert.equal(isFamilyAPackId(RODEO_U250_PACK_ID), true);
    assert.equal(moneyEqual(u110Desk.grandTotal, U110_CONTRACTOR_GOLDEN.buckets!.grandTotal), true);
    assert.equal(moneyEqual(u250Desk.grandTotal, U250_CONTRACTOR_GOLDEN.buckets!.grandTotal), true);
    assert.equal(Math.round(u110Desk.totalHours), 26_441);
    assert.equal(Math.round(u250Desk.totalHours), 12_881);
    assert.equal(familyAVaultWriteError(u110), null);
    assert.equal(familyAVaultWriteError(u250), null);

    const other = u110.otherCost as { misc?: Array<Record<string, unknown>> };
    const broken = {
      ...u110,
      crew: stripBookRates(u110.crew as never),
      otherCost: {
        ...other,
        misc: (other.misc ?? []).map((row) => {
          const next = { ...row };
          delete next.bookPriced;
          return next;
        }),
      },
    };
    const brokenDesk = packFamilyADesk(broken);
    assert.equal(moneyEqual(brokenDesk.grandTotal, 815_419.38), true);
    const fault = familyAVaultWriteError(broken);
    const refused = packBaselineWriteCheck(broken as never);
    assert.match(fault || "", /Rodeo U110 desk \$815,?419(?:\.38)? ≠ locked \$5,?247,?587/);
    assert.equal(refused.ok, false);
    assert.equal(refused.skipped, "integrity");
    assert.equal(isVaultIntegrityError(fault || ""), true);
    assert.equal(isVaultIntegrityError("Could not store that package."), false);
  });

  it("skips the reserved identity-only card so an empty shell is not a dollar lock", () => {
    const shell = {
      ...rodeoU110FilledSnapshot({ createdAt: 1, updatedAt: 1 }),
      createdAt: 1,
      updatedAt: 1,
      crew: { staff: [], generalForeman: [], foreman: [], direct: [], support: [] },
    };
    assert.equal(familyAVaultWriteError(shell), null);
  });

  it("refuses a smashed or thick Cat 2 / Aromatics write and does not invent Monroe or Boiler $", () => {
    const thinCat = {
      packId: HIS_CAT2_PACK_ID,
      title: "Madison CAT 2 (Pit Stop)",
      createdAt: 400,
      updatedAt: 400,
      schedule: { projectStart: "2026-09-01", phases: [{ id: "pre", on: true, start: "2026-09-01", stop: "2026-09-03" }] },
      crew: { direct: [{ id: "bm-1", ranges: [{ start: "2026-09-01", end: "2026-09-03" }] }] },
    };
    assert.equal(deskTotalsForBaselineWrite(thinCat as never), null);
    assert.equal(packBaselineWriteError(thinCat as never), null);

    const smashedAroma = {
      packId: HIS_AROMATICS_PACK_ID,
      title: "2027 Aromatics Turnaround",
      createdAt: 400,
      updatedAt: 400,
      schedule: { projectStart: "2026-08-21", phases: [{ id: "pre", start: "2026-08-21", stop: "2026-08-21" }] },
      crew: { staff: [{ id: "st-1", ranges: [{ phaseId: "pre", start: "2026-08-21", end: "2026-08-21" }] }] },
    };
    const smash = packBaselineWriteCheck(smashedAroma as never);
    assert.equal(smash.ok, false);
    assert.equal(smash.skipped, "integrity");
    assert.match(smash.error || "", /integrity fault|clock|smash/i);

    const monroe = {
      packId: MONROE_541V_PACK_ID,
      title: "Monroe 541V",
      createdAt: 9_000,
      updatedAt: 9_001,
      crew: { staff: [{ id: "st-1" }] },
      schedule: { projectStart: "2026-06-16", phases: [{ id: "pre", start: "2026-06-16", stop: "2026-07-01" }] },
    };
    const monroeDesk = deskTotalsForBaselineWrite(monroe as never);
    assert.equal(monroeDesk?.grandTotal, undefined);
    assert.equal(packBaselineWriteCheck(monroe as never).ok, true);

    const boiler = {
      packId: BOILER17_PACK_ID,
      title: "Boiler 17 2026",
      createdAt: 9_000,
      updatedAt: 9_001,
      schedule: { projectStart: "2026-08-10", phases: [{ id: "pre", start: "2026-08-10", stop: "2026-12-06" }] },
      crew: { staff: [{ id: "st-1", ranges: [{ phaseId: "pre", start: "2026-08-10", end: "2026-12-06" }] }] },
    };
    assert.equal(deskTotalsForBaselineWrite(boiler as never)?.grandTotal, undefined);
    assert.equal(packBaselineWriteError(boiler as never), null);
    assert.equal(familyAVaultWriteError(thinCat as never), null);
    assert.ok(CAT2_SEP7_GRAND_TOTAL > 0);
    assert.ok(AROMATICS_FREEZE_GRAND_TOTAL > 0);
  });
});
