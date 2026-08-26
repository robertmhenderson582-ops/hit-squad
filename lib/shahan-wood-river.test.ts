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
  shahanEquipmentByFuel,
  shahanEquipmentRows,
  shahanLaborByGroup,
} from "./shahan-wood-river.ts";
import { emptyJobMeta } from "./staffing-plan.ts";
import { blankTravel, defaultTravelLine, syncTravelFromCrew } from "./other-cost.ts";

describe("Shahan TM OCIP — Wood River", () => {
  it("loads the live 159-row Shahan labor catalog with sheet dollars", () => {
    assert.equal(SHAHAN_BOOK_LABEL, "Shahan TM OCIP — Wood River");
    assert.equal(SHAHAN_LABOR.length, 159);
    assert.equal(/nathan|rrff|comp/i.test(SHAHAN_BOOK_LABEL), false);
    assert.equal(SHAHAN_LABOR.some((row) => /nathan|merit 0\d|rrff/i.test(row.craftName)), false);
    const lead = lookupShahanLabor("Lead Site Boilermaker 01");
    assert.deepEqual(
      { st: lead?.st, ot: lead?.ot, dt: lead?.dt, pd: lead?.pd },
      { st: 141.9, ot: 201.14, dt: 260.38, pd: 140 },
    );
    const journeyman = lookupShahanLabor("Boilermaker Journeyman");
    assert.deepEqual(
      { st: journeyman?.st, ot: journeyman?.ot, dt: journeyman?.dt, pd: journeyman?.pd },
      { st: 108.38, ot: 152.78, dt: 197.19, pd: 130 },
    );
    const qa = lookupShahanLabor("COORDINATOR QA-QC 1");
    assert.deepEqual(
      { st: qa?.st, ot: qa?.ot, dt: qa?.dt, pd: qa?.pd },
      { st: 105.76, ot: 143.77, dt: 181.79, pd: 140 },
    );
  });

  it("keeps BM vs Merit staff titles apart and aliases official picker names", () => {
    assert.equal(lookupShahanLabor("MANAGER, PROJECT 01")?.craftName, "Manager, Project 01");
    assert.equal(lookupShahanLabor("MANAGER, PROJECT 01")?.group, "Staff|BM UNION STAFF");
    assert.equal(lookupShahanLabor("MANAGER, PROJECT 01")?.st, 133.42);
    assert.equal(lookupShahanLabor("Manager Project 01")?.craftName, "Manager Project 01");
    assert.equal(lookupShahanLabor("Manager Project 01")?.group, "Staff|MERIT STAFF");
    assert.equal(lookupShahanLabor("Manager Project 01")?.st, 130.76);
    assert.equal(lookupShahanLabor("COORDINATOR QA-QC 01")?.craftName, "COORDINATOR QA-QC 1");
    assert.equal(lookupShahanLabor("COORDINATOR QA-QC 2")?.st, 96.78);
    assert.equal(lookupShahanLabor("Boilermaker GF Union")?.craftName, "Boilermaker General Foreman");
    assert.equal(lookupShahanLabor("Boilermaker Foreman")?.st, 112.62);
    assert.equal(lookupShahanLabor("Boilermaker Journeyman")?.st, 108.38);
    assert.equal(lookupShahanLabor("PIPEFITTER JOURNEYMAN")?.st, 99.33);
    assert.equal(lookupShahanLabor("PIPEFITTER FORMAN")?.st, 105.28);
    assert.equal(lookupShahanLabor("Pipefitter Foreman")?.craftName, "PIPEFITTER FORMAN");
    assert.equal(lookupShahanLabor("Pipefitter GF Union")?.craftName, "Pipefitter General Foreman");
    assert.equal(lookupShahanLabor("Laborer Foreman 10-20 GRP 1")?.st, 92.39);
    assert.equal(lookupShahanLabor("Laborer Foreman 3-9")?.craftName, "Laborer Foreman 03-09 GRP 1");
    assert.equal(lookupShahanLabor("Laborer Journeyman GRP1")?.st, 89.97);
    assert.equal(lookupShahanLabor("Operating Eng Grp 01")?.st, 112.95);
    assert.equal(lookupShahanLabor("Operator Foreman Gr XII")?.craftName, "Operating Eng Grp 12");
    assert.equal(lookupShahanLabor("Operating Eng Grp 12")?.st, 116.4);
    assert.equal(isNathanEstimateTitle("Project Manager Merit 01"), true);
    assert.equal(lookupShahanLabor("Project Manager Merit 01"), null);
    assert.equal(lookupShahanLabor("Made Up Title"), null);
  });

  it("uses labor class when the same title sits on BM and Merit", () => {
    assert.equal(lookupShahanLabor("Planner Estimator 01", { laborClass: "Union" })?.group, "Staff|BM UNION STAFF");
    assert.equal(lookupShahanLabor("Planner Estimator 01", { laborClass: "Merit" })?.group, "Staff|MERIT STAFF");
    assert.equal(lookupShahanLabor("Planner Estimator 01", { laborClass: "Union" })?.st, 113.98);
    assert.equal(lookupShahanLabor("Planner Estimator 01", { laborClass: "Merit" })?.st, 85.89);
  });

  it("looks up official B-1 picker titles on the Shahan fixture and skips Nathan names", () => {
    const opts = { catalog: SHAHAN_LABOR_FIXTURE };
    assert.equal(lookupShahanLabor("MANAGER, PROJECT 01", opts)?.craftName, "MANAGER, PROJECT 01");
    assert.equal(lookupShahanLabor("manager, project 01", opts)?.st, 110);
    assert.equal(lookupShahanLabor("COORDINATOR QA-QC 01", opts)?.craftName, "COORDINATOR QA-QC 1");
    assert.equal(lookupShahanLabor("Project Manager Merit 01", opts), null);
    assert.equal(formatShahanCrewCost("Project Manager Merit 01", { st: 10, ot: 0, dt: 0 }, opts), "");
  });

  it("fills Cost from Shahan bill rates only when ST/OT/DT exist", () => {
    assert.equal(shahanCrewCostAmount("Lead Site Boilermaker 01", { st: 10, ot: 0, dt: 0 }), 1419);
    assert.equal(formatShahanCrewCost("Boilermaker Journeyman", { st: 10, ot: 0, dt: 0 }), "$1,083.80");
    assert.equal(formatShahanCrewCost("Unknown", { st: 10, ot: 2, dt: 1 }), "");
    const opts = { catalog: SHAHAN_LABOR_FIXTURE };
    assert.equal(shahanCrewCostAmount("MANAGER, PROJECT 01", { st: 10, ot: 0, dt: 0 }, opts), 1100);
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

  it("lists the Rate tab as Shahan, keeps WET and dry equipment, and skips the WET header", () => {
    const groups = shahanLaborByGroup(SHAHAN_LABOR);
    assert.equal(groups.some((item) => item.group === "Staff|BM UNION STAFF"), true);
    assert.equal(groups.some((item) => item.group === "Staff|MERIT STAFF"), true);
    assert.equal(
      groups.some((item) => item.rows.some((row) => /nathan|merit 01|rrff/i.test(row.craftName))),
      false,
    );
    assert.match(SHAHAN_BOOK_LABEL, /Shahan TM OCIP/);
    assert.deepEqual(
      shahanEquipmentRows([
        { description: SHAHAN_WET_EQUIPMENT_HEADER, daily: 1, weekly: 2, monthly: 3, wet: true },
        { description: "AIR MOVER", daily: 32, weekly: 96, monthly: 288, wet: false },
      ]).map((row) => row.description),
      ["AIR MOVER"],
    );
    const fuel = shahanEquipmentByFuel();
    assert.equal(SHAHAN_EQUIPMENT.length, 53);
    assert.equal(fuel.wet.length, 13);
    assert.equal(fuel.dry.length, 40);
    assert.equal(fuel.wet[0]?.description, "EXTRACTOR BUNDLE AERIAL <21FT REQUIRES OPERATOR");
    assert.equal(fuel.wet[0]?.daily, 1592);
    assert.equal(fuel.wet.at(-1)?.description, "WELDER ARC 301-499 AMO DIESEL");
    const rad = fuel.dry.find((row) => row.description === "RAD GUN TORQUE");
    assert.deepEqual({ daily: rad?.daily, weekly: rad?.weekly, monthly: rad?.monthly }, { daily: 496, weekly: 1488, monthly: 4464 });
    assert.equal(fuel.dry.filter((row) => row.description.trim() === "TRUCK RIG WELDER").length, 1);
    assert.equal(SHAHAN_EQUIPMENT.filter((row) => row.description === "EXTRACTOR BUNDLE AERIAL <21FT REQUIRES OPERATOR").length, 2);
    const rateTab = readFileSync(fileURLToPath(new URL("../components/RateBuilder.tsx", import.meta.url)), "utf8");
    assert.match(rateTab, /SHAHAN_BOOK_LABEL/);
    assert.match(rateTab, /with fuel \(WET\)/);
    assert.equal(/useDeskBoard|field-trial|Nathan CAT|RRFF official/i.test(rateTab), false);
  });

  it("does not put workbooks in the repo", () => {
    const listed = execSync('git ls-files "*.xlsx" "*.xlsm" "*.xls" "*.pdf"', { encoding: "utf8" }).trim();
    assert.equal(listed, "");
  });
});
