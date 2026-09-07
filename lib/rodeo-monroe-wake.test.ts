import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HIS_AROMATICS_PACK_ID, HIS_BOILER17_PACK_ID, HIS_CAT2_PACK_ID, HIS_TM_PACK_ID } from "./his-wood-river.ts";
import { jobCodeFromPackId } from "./his-wood-river.ts";
import { localPackToJob } from "./local-estimates.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import {
  isWakeIdentityOnly,
  mergeRodeoMonroeWakeCards,
  MONROE_541V_JOB_CODE,
  MONROE_541V_PACK_ID,
  oneLivePackPerWakeJob,
  RODEO_MONROE_WAKE_SHELLS,
  RODEO_U110_JOB_CODE,
  RODEO_U110_PACK_ID,
  RODEO_U250_JOB_CODE,
  RODEO_U250_PACK_ID,
  rodeoMonroeWakeCards,
  shouldPaintWakeCards,
  wakeMatchForPack,
  wakeShells,
} from "./rodeo-monroe-wake.ts";
import { JOHN_BEECH_EMAIL } from "./tester-seats.ts";

describe("Rodeo + Monroe wake shells", () => {
  it("reserves one pack slot per job without colliding with Wood River HIS ids", () => {
    const ids = wakeShells().map((row) => row.packId);
    assert.deepEqual(ids, [RODEO_U110_PACK_ID, RODEO_U250_PACK_ID, MONROE_541V_PACK_ID]);
    assert.deepEqual(
      ids.map((id) => jobCodeFromPackId(id)),
      [RODEO_U110_JOB_CODE, RODEO_U250_JOB_CODE, MONROE_541V_JOB_CODE],
    );
    assert.equal(ids.includes(HIS_AROMATICS_PACK_ID), false);
    assert.equal(ids.includes(HIS_CAT2_PACK_ID), false);
    assert.equal(ids.includes(HIS_TM_PACK_ID), false);
    assert.equal(ids.includes(HIS_BOILER17_PACK_ID), false);
    assert.equal(
      RODEO_MONROE_WAKE_SHELLS.every((row) => row.families.length >= 1 && row.officialRevisionId),
      true,
    );
    assert.deepEqual(RODEO_MONROE_WAKE_SHELLS[0]?.families, ["madison-contractor", "p66-rodeo-workbook"]);
    assert.deepEqual(RODEO_MONROE_WAKE_SHELLS[1]?.families, ["madison-contractor", "p66-rodeo-workbook"]);
  });

  it("paints identity cards on owner / Madison seats and does not remap a live pack", () => {
    assert.equal(shouldPaintWakeCards({ email: OWNER_LOGIN_EMAIL, role: "owner" }), true);
    assert.equal(shouldPaintWakeCards({ email: "nathanboyte@gmail.com", role: "tester" }, { isOwner: false, email: "nathanboyte@gmail.com", companyId: "madison" }), true);
    assert.equal(shouldPaintWakeCards({ email: JOHN_BEECH_EMAIL, role: "tester" }, { isOwner: false, email: JOHN_BEECH_EMAIL, companyId: "madison" }), true);
    assert.equal(shouldPaintWakeCards({ email: "jameshcainjr@gmail.com", role: "tester" }, { isOwner: false, email: "jameshcainjr@gmail.com", companyId: "cbi" }), false);

    const live = {
      packId: RODEO_U110_PACK_ID,
      key: `new:${RODEO_U110_PACK_ID}`,
      title: "Rodeo U110 2026 TA",
      client: "Phillips 66",
      site: "Rodeo — Rodeo, CA",
      siteId: "site-rodeo",
      createdAt: 9_000,
      updatedAt: 9_001,
    };
    const merged = mergeRodeoMonroeWakeCards([live]);
    assert.equal(merged.filter((row) => row.packId === RODEO_U110_PACK_ID).length, 1);
    assert.equal(merged.find((row) => row.packId === RODEO_U110_PACK_ID)?.updatedAt, 9_001);
    assert.equal(isWakeIdentityOnly(live), false);
    assert.equal(isWakeIdentityOnly(rodeoMonroeWakeCards()[0]), true);
    assert.equal(oneLivePackPerWakeJob(merged), true);
    assert.equal(wakeMatchForPack(live)?.unit, "U110");

    const job = localPackToJob(rodeoMonroeWakeCards()[0]!);
    assert.equal(job.code, RODEO_U110_JOB_CODE);
    assert.equal(job.workingFigure, "Official revision locked");
    assert.equal(/\$/.test(job.workingFigure), false);
  });
});
