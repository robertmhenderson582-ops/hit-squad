import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  SHAHAN_BOOK_LABEL,
  SHAHAN_CRAFT_PD,
  SHAHAN_EQUIPMENT,
  SHAHAN_LABOR,
  SHAHAN_LABOR_FIXTURE,
  SHAHAN_STAFF_PD,
  SHAHAN_WET_EQUIPMENT_HEADER,
  emptyJobRates,
  formatShahanCrewCost,
  hydrateJobRates,
  isNathanEstimateTitle,
  lookupShahanLabor,
  shahanCrewCostAmount,
  shahanEquipmentRows,
  shahanLaborByGroup,
} from "./shahan-wood-river.ts";
import { emptyJobMeta } from "./staffing-plan.ts";
import { blankTravel, defaultTravelLine, syncTravelFromCrew } from "./other-cost.ts";

describe("Shahan TM OCIP — Wood River", () => {
  it("keeps the live catalog empty until the Shahan sheet is pasted", () => {
    assert.equal(SHAHAN_BOOK_LABEL, "Shahan TM OCIP — Wood River");
    assert.equal(SHAHAN_LABOR.length, 0);
    assert.equal(SHAHAN_EQUIPMENT.length, 0);
    assert.equal(lookupShahanLabor("MANAGER, PROJECT 01"), null);
    assert.equal(formatShahanCrewCost("MANAGER, PROJECT 01", { st: 10, ot: 0, dt: 0 }), "");
    assert.equal(SHAHAN_LABOR.some((row) => /merit|nathan|rrff/i.test(row.craftName)), false);
    assert.equal(/nathan|rrff|comp/i.test(SHAHAN_BOOK_LABEL), false);
  });

  it("looks up official B-1 picker titles on the Shahan fixture and skips Nathan names", () => {
    const opts = { catalog: SHAHAN_LABOR_FIXTURE };
    assert.equal(lookupShahanLabor("MANAGER, PROJECT 01", opts)?.craftName, "MANAGER, PROJECT 01");
    assert.equal(lookupShahanLabor("manager, project 01", opts)?.st, 110);
    assert.equal(lookupShahanLabor("COORDINATOR QA-QC 01", opts)?.craftName, "COORDINATOR QA-QC 1");
    assert.equal(isNathanEstimateTitle("Project Manager Merit 01"), true);
    assert.equal(lookupShahanLabor("Project Manager Merit 01", opts), null);
    assert.equal(lookupShahanLabor("Made Up Title", opts), null);
    assert.equal(formatShahanCrewCost("Project Manager Merit 01", { st: 10, ot: 0, dt: 0 }, opts), "");
  });

  it("fills Cost from Shahan bill rates only when ST/OT/DT exist", () => {
    const opts = { catalog: SHAHAN_LABOR_FIXTURE };
    assert.equal(shahanCrewCostAmount("MANAGER, PROJECT 01", { st: 10, ot: 0, dt: 0 }, opts), 1100);
    assert.equal(formatShahanCrewCost("MANAGER, PROJECT 01", { st: 10, ot: 0, dt: 0 }, opts), "$1,100.00");
    assert.equal(shahanCrewCostAmount("MANAGER, PROJECT 01", { st: 8, ot: 2, dt: 1 }, opts), 8 * 110 + 2 * 165 + 220);
    assert.equal(formatShahanCrewCost("Unknown", { st: 10, ot: 2, dt: 1 }, opts), "");
  });

  it("defaults Job setup Staff/Craft PD and leaves mileage blank", () => {
    const fresh = emptyJobMeta();
    assert.equal(fresh.staffPerDiemRate, SHAHAN_STAFF_PD);
    assert.equal(fresh.craftPerDiemRate, SHAHAN_CRAFT_PD);
    assert.equal(fresh.staffMileageRate, 0);
    assert.equal(fresh.craftMileageRate, 0);
    const hydrated = hydrateJobRates({});
    assert.equal(hydrated.staffPerDiemRate, 140);
    assert.equal(hydrated.craftPerDiemRate, 130);
    assert.deepEqual(emptyJobRates(), { staffPerDiemRate: 140, craftPerDiemRate: 130, staffMileageRate: 0, craftMileageRate: 0 });
    const leftover = hydrateJobRates({ mileageRate: 0.67, perDiemRate: 185 });
    assert.equal(leftover.staffMileageRate, 0.67);
    assert.equal(leftover.craftMileageRate, 0.67);
    assert.equal(leftover.staffPerDiemRate, 140);
    assert.equal(leftover.craftPerDiemRate, 130);
  });

  it("inherits Travel mileage from Job setup Staff vs Craft and keeps a typed override", () => {
    const crew = {
      staff: [{ ranges: [{ headcount: 1 }] }],
      direct: [{ ranges: [{ headcount: 4 }] }],
    };
    const first = syncTravelFromCrew([], crew, { staffPerMile: 0.67, craftPerMile: 0.55 });
    assert.equal(first[0].kind, "staff");
    assert.equal(first[0].perMile, 0.67);
    assert.equal(first[1].kind, "craft");
    assert.equal(first[1].perMile, 0.55);
    const typed = [
      { ...first[0], perMile: 0.8, travelers: 1, miles: 10 },
      { ...first[1], perMile: 0.4, travelers: 2, miles: 20 },
    ];
    const kept = syncTravelFromCrew(typed, crew, { staffPerMile: 0.99, craftPerMile: 0.11 });
    assert.equal(kept[0].perMile, 0.8);
    assert.equal(kept[1].perMile, 0.4);
    const extra = blankTravel("staff", 0.67);
    assert.equal(extra.perMile, 0.67);
    assert.equal(defaultTravelLine("craft", 2, undefined, 0.55).perMile, 0.55);
  });

  it("lists the Rate tab as Shahan, not Nathan or RRFF, and skips the WET header", () => {
    const groups = shahanLaborByGroup(SHAHAN_LABOR_FIXTURE);
    assert.equal(groups.some((item) => item.group === "Staff|MERIT STAFF"), true);
    assert.equal(
      groups.some((item) => item.rows.some((row) => /nathan|merit 01|rrff/i.test(row.craftName))),
      false,
    );
    assert.match(SHAHAN_BOOK_LABEL, /Shahan TM OCIP/);
    assert.deepEqual(
      shahanEquipmentRows([
        { description: SHAHAN_WET_EQUIPMENT_HEADER, daily: 1, weekly: 2, monthly: 3 },
        { description: "AIR MOVER", daily: 32, weekly: 96, monthly: 288 },
      ]).map((row) => row.description),
      ["AIR MOVER"],
    );
    const rateTab = readFileSync(fileURLToPath(new URL("../components/RateBuilder.tsx", import.meta.url)), "utf8");
    assert.match(rateTab, /SHAHAN_BOOK_LABEL/);
    assert.equal(/useDeskBoard|field-trial|Nathan CAT|RRFF official/i.test(rateTab), false);
  });

  it("does not put workbooks in the repo", () => {
    const listed = execSync('git ls-files "*.xlsx" "*.xlsm" "*.xls" "*.pdf"', { encoding: "utf8" }).trim();
    assert.equal(listed, "");
  });
});
