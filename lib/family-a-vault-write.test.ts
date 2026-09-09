import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { familyAVaultWriteError, isFamilyAPackId, isVaultIntegrityError, packFamilyADesk } from "./family-a-vault-write.ts";
import { rodeoU110FilledSnapshot } from "./madison-u110.ts";
import { rodeoU250FilledSnapshot } from "./madison-u250.ts";
import { RODEO_U110_PACK_ID, RODEO_U250_PACK_ID } from "./rodeo-monroe-wake.ts";
import { moneyEqual, U110_CONTRACTOR_GOLDEN, U250_CONTRACTOR_GOLDEN } from "./wake-golden.ts";

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
    assert.match(fault || "", /Rodeo U110 desk \$815,?419(?:\.38)? ≠ locked \$5,?247,?587/);
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
});
