import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CLIENT_FACE_MAPPER_SPEC } from "./client-estimate-ingest.ts";
import { isWakeIdentityOnly, rodeoMonroeWakeCards, RODEO_U110_PACK_ID } from "./rodeo-monroe-wake.ts";
import {
  bucketSum,
  checkHydratedWakeGolden,
  goldenForPackId,
  MONROE_541V_GOLDEN,
  U110_CONTRACTOR_GOLDEN,
  U250_CONTRACTOR_GOLDEN,
  wakeGoldenFixtures,
} from "./wake-golden.ts";

describe("Rodeo / Monroe golden fixtures", () => {
  it("locks official contractor SUMMARY totals and does not invent Monroe dollars", () => {
    const u110 = U110_CONTRACTOR_GOLDEN.buckets!;
    const u250 = U250_CONTRACTOR_GOLDEN.buckets!;
    assert.equal(bucketSum(u110), u110.grandTotal);
    assert.equal(bucketSum(u250), u250.grandTotal);
    assert.equal(u110.directHours + u110.indirectHours, u110.totalHours);
    assert.equal(u250.directHours + u250.indirectHours, u250.totalHours);
    assert.equal(u110.grandTotal, 5_247_587);
    assert.equal(u250.grandTotal, 2_470_680);
    assert.equal(U110_CONTRACTOR_GOLDEN.family, "madison-contractor");
    assert.equal(U250_CONTRACTOR_GOLDEN.family, "madison-contractor");
    assert.equal(MONROE_541V_GOLDEN.dollarsStatus, "formula-unavailable");
    assert.equal(MONROE_541V_GOLDEN.buckets, null);
    assert.equal(MONROE_541V_GOLDEN.monroeHours?.totalLabor, 8483);
    assert.equal(
      CLIENT_FACE_MAPPER_SPEC["madison-contractor"].exportAs.includes("paste"),
      true,
    );
    assert.notEqual(CLIENT_FACE_MAPPER_SPEC["p66-rodeo-workbook"].family, CLIENT_FACE_MAPPER_SPEC["madison-contractor"].family);
  });

  it("skips identity-only shells and fails a hydrated pack that drifts from the official lock", () => {
    const card = rodeoMonroeWakeCards().find((row) => row.packId === RODEO_U110_PACK_ID)!;
    assert.equal(isWakeIdentityOnly(card), true);
    assert.equal(checkHydratedWakeGolden(card, { grandTotal: 0 }).skipped, "identity-only");
    assert.equal(checkHydratedWakeGolden(card, { grandTotal: 0 }).ok, true);

    const live = { ...card, createdAt: 9_000, updatedAt: 9_001 };
    assert.equal(isWakeIdentityOnly(live), false);
    assert.equal(
      checkHydratedWakeGolden(live, { grandTotal: U110_CONTRACTOR_GOLDEN.buckets!.grandTotal, totalHours: 26441 }).ok,
      true,
    );
    assert.equal(checkHydratedWakeGolden(live, { grandTotal: 1 }).ok, false);
    assert.equal(checkHydratedWakeGolden(live, { grandTotal: 5_247_587, totalHours: 10 }).ok, false);
    assert.equal(goldenForPackId(RODEO_U110_PACK_ID)?.officialRevisionId, U110_CONTRACTOR_GOLDEN.officialRevisionId);
    assert.equal(wakeGoldenFixtures().length, 3);
  });
});
