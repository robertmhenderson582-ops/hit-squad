import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  RODEO_FILL_ERROR,
  RODEO_TAB_ID,
  RODEO_TAB_LABEL,
  compositeRate,
  rodeoFormToXlsx,
  rodeoLaborLines,
  rodeoRowBucket,
  rodeoSupportBucket,
  sanitizeRodeoUnit,
  showsRodeoTab,
} from "./rodeo-form.ts";

describe("Rodeo tab gate", () => {
  it("never shows the Rodeo tab on Wood River or the other locked plants", () => {
    assert.equal(showsRodeoTab("Wood River — Roxana, IL", "Phillips 66"), false);
    assert.equal(showsRodeoTab("Bayway — Linden, NJ", "Phillips 66"), false);
    assert.equal(showsRodeoTab("Ferndale — Ferndale, WA", "Phillips 66"), false);
    assert.equal(showsRodeoTab("Billings", "Phillips 66"), false);
    assert.equal(showsRodeoTab("Yates", "Georgia Power"), false);
    assert.equal(showsRodeoTab("Monroe Energy", "Monroe"), false);
    assert.equal(showsRodeoTab("Rodeo — Rodeo, CA", "Phillips 66"), true);
    assert.equal(RODEO_TAB_ID, "rodeo");
    assert.equal(RODEO_TAB_LABEL, "Rodeo");
    const workspace = readFileSync(fileURLToPath(new URL("../components/EstimateWorkspace.tsx", import.meta.url)), "utf8");
    assert.match(workspace, /showsRodeoTab|estimateTabsForSite/);
    assert.match(workspace, /RODEO_TAB/);
    assert.doesNotMatch(workspace, /id: "rodeo"/);
  });
});

describe("Rodeo hinge remap", () => {
  it("uses total hours and composite rate, not ST/OT/DT columns", () => {
    assert.equal(rodeoRowBucket("direct", { position: "Boilermaker Journeyman", ranges: [] }), "direct");
    assert.equal(rodeoRowBucket("staff", { position: "Superintendent 01", ranges: [] }), "indirect");
    assert.equal(rodeoRowBucket("foreman", { position: "Foreman PF", ranges: [] }), "indirect");
    assert.equal(rodeoSupportBucket("Boilermaker Journeyman", "Hole Watch"), "direct");
    assert.equal(rodeoSupportBucket("Foreman PF", "Hole Watch"), "indirect");
    assert.equal(compositeRate(1083.8, 10), 108.38);
    const lines = rodeoLaborLines({
      direct: [
        {
          position: "Boilermaker Journeyman",
          ranges: [
            {
              start: "2026-09-14",
              end: "2026-09-14",
              hoursPerShift: 10,
              headcount: 1,
              nightHeadcount: 0,
              perDiemPeople: 1,
              days: [false, true, true, true, true, true, false],
            },
          ],
        },
      ],
    }, "Rodeo — Rodeo, CA", "Phillips 66");
    assert.equal(lines[0]?.bucket, "direct");
    assert.equal(lines[0]?.hours, 10);
    assert.equal(lines[0]?.compositeRate, compositeRate(lines[0]!.dollars, lines[0]!.hours));
  });

  it("strips the plant name Rodeo from UNIT and errors instead of a silent empty file", () => {
    assert.equal(sanitizeRodeoUnit("Rodeo"), "");
    assert.equal(sanitizeRodeoUnit("CAT"), "CAT");
    const bytes = rodeoFormToXlsx({
      form: { tarUnit: "Rodeo", contractor: "Hit Squad", block: "A" },
      crew: {},
      site: "Rodeo — Rodeo, CA",
      client: "Phillips 66",
    });
    assert.equal(bytes.byteLength > 0, true);
    assert.equal(RODEO_FILL_ERROR.includes("Could not fill"), true);
  });
});
