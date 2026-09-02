import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  SHAHAN_BOOK_ID,
  SHAHAN_BOOK_LABEL,
  SHAHAN_CRAFT_PD,
  SHAHAN_CRAFT_TITLES,
  SHAHAN_EQUIPMENT,
  SHAHAN_FOREMAN_TITLES,
  SHAHAN_GENERAL_FOREMAN_TITLES,
  SHAHAN_LABOR,
  SHAHAN_LABOR_FIXTURE,
  SHAHAN_NO_RATE_LABEL,
  SHAHAN_STAFF_PD,
  SHAHAN_STAFF_TITLES,
  SHAHAN_WET_EQUIPMENT_HEADER,
  applyShahanJobRates,
  emptyJobRates,
  formatShahanCrewCost,
  hydrateJobRates,
  isNathanEstimateTitle,
  laborDollarsFromCrew,
  lookupShahanEquipment,
  lookupShahanLabor,
  offerRateBookForSite,
  rematchCrewToShahan,
  rematchEquipmentSheetToShahan,
  rematchShahanEquipmentId,
  shahanCrewCostAmount,
  shahanCrewTitle,
  shahanEquipmentByFuel,
  shahanEquipmentId,
  shahanEquipmentRows,
  shahanLaborByGroup,
  shahanPeriodRate,
  shahanTitleHasNoRate,
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

  it("aliases leftover Cat 2 working titles onto existing Shahan craftName rows", () => {
    assert.equal(lookupShahanLabor("COORDINATOR QA/QC Merit 01")?.craftName, "COORDINATOR QA-QC 1");
    assert.equal(lookupShahanLabor("Coordinator QA/QC Merit 01")?.st, 105.76);
    assert.equal(lookupShahanLabor("Coordinator Safety Merit 01")?.craftName, "Coordinator Safety 01");
    assert.equal(lookupShahanLabor("Coordinator Safety  Merit 01")?.st, 91.02);
    assert.equal(lookupShahanLabor("PF General Superintendent Union 01")?.craftName, "General Superintendent PF 01");
    assert.equal(lookupShahanLabor("PF General Superintendent Union 01")?.st, 123.45);
    assert.equal(lookupShahanLabor("BM General Superintendent Union")?.craftName, "General Superintendent BM 01");
    assert.equal(lookupShahanLabor("BM General Superintendent Union")?.st, 130.99);
    assert.equal(lookupShahanLabor("Pipefitter Direct")?.craftName, "PIPEFITTER JOURNEYMAN");
    assert.equal(lookupShahanLabor("Boilermaker Direct")?.craftName, "Boilermaker Journeyman");
    assert.equal(lookupShahanLabor("Boilermaker Indirect (Tool Room)")?.craftName, "Boilermaker Journeyman");
    assert.equal(lookupShahanLabor("Tool Room Attendant")?.craftName, "Boilermaker Journeyman");
    assert.equal(lookupShahanLabor("Pipefitter GF Union")?.craftName, "Pipefitter General Foreman");
    assert.equal(lookupShahanLabor("Boilermaker GF Union")?.craftName, "Boilermaker General Foreman");
    assert.deepEqual(
      {
        craftName: lookupShahanLabor("Pipefitter Foreman")?.craftName,
        st: lookupShahanLabor("Pipefitter Foreman")?.st,
        ot: lookupShahanLabor("Pipefitter Foreman")?.ot,
        dt: lookupShahanLabor("Pipefitter Foreman")?.dt,
      },
      { craftName: "PIPEFITTER FORMAN", st: 105.28, ot: 147.5, dt: 189.72 },
    );
    assert.equal(isNathanEstimateTitle("COORDINATOR QA/QC Merit 01"), true);
    assert.equal(lookupShahanLabor("Project Manager Merit 01"), null);
    assert.equal(SHAHAN_STAFF_TITLES.includes("COORDINATOR QA/QC Merit 01"), false);
    assert.equal(SHAHAN_CRAFT_TITLES.includes("Boilermaker Direct"), false);
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
    assert.equal(fresh.rateBook, "");
    const hydrated = hydrateJobRates({});
    assert.equal(hydrated.staffPerDiemRate, 140);
    assert.equal(hydrated.craftPerDiemRate, 130);
    assert.deepEqual(emptyJobRates(), {
      staffPerDiemRate: 140,
      craftPerDiemRate: 130,
      staffMileageRate: 0,
      craftMileageRate: 0,
      rateBook: "",
    });
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
    assert.match(rateTab, /BASE WAGE/);
    assert.match(rateTab, /BILLED ST/);
    assert.match(rateTab, /BILLED OT/);
    assert.match(rateTab, /book\.catalog/);
    assert.match(rateTab, /with fuel \(wet\)/);
    assert.match(rateTab, /without fuel \(dry\)/);
    assert.equal(/useDeskBoard|field-trial|Nathan CAT|RRFF official/i.test(rateTab), false);
    const equipmentDesk = readFileSync(fileURLToPath(new URL("../components/EquipmentDesk.tsx", import.meta.url)), "utf8");
    assert.match(equipmentDesk, /With fuel \(wet\)/);
    assert.match(equipmentDesk, /Without fuel \(dry\)/);
    assert.equal(/dry, w\/o fuel|B2_COAST|billableB2Items/i.test(equipmentDesk), false);
    const jobSetup = readFileSync(fileURLToPath(new URL("../components/JobSetupCard.tsx", import.meta.url)), "utf8");
    assert.match(jobSetup, /Update rates/);
    assert.match(jobSetup, /offerRateBookForSite/);
    assert.match(jobSetup, /applyPlantJobRates/);
    const supportCard = readFileSync(fileURLToPath(new URL("../components/SupportCrewCard.tsx", import.meta.url)), "utf8");
    assert.match(supportCard, /shahanCrewTitle/);
    assert.match(supportCard, /formatShahanCrewCost/);
    assert.equal(/cost: row\.cost/.test(supportCard), false);
  });

  it("does not put workbooks in the repo", () => {
    const listed = execSync('git ls-files "*.xlsx" "*.xlsm" "*.xls" "*.pdf"', { encoding: "utf8" }).trim();
    assert.equal(listed, "");
  });

  it("bills ST×st + OT×ot + DT×dt for a Shahan title on each Crew card", () => {
    const hours = { st: 10, ot: 2, dt: 1 };
    const staff = lookupShahanLabor("Lead Site Boilermaker 01");
    const gf = lookupShahanLabor("Boilermaker General Foreman");
    const foreman = lookupShahanLabor("Boilermaker Foreman");
    const craft = lookupShahanLabor("Boilermaker Journeyman");
    assert.ok(staff && gf && foreman && craft);
    assert.equal(SHAHAN_STAFF_TITLES.includes("Lead Site Boilermaker 01"), true);
    assert.equal(SHAHAN_GENERAL_FOREMAN_TITLES.includes("Boilermaker General Foreman"), true);
    assert.equal(SHAHAN_FOREMAN_TITLES.includes("Boilermaker Foreman"), true);
    assert.equal(SHAHAN_CRAFT_TITLES.includes("Boilermaker Journeyman"), true);
    const billed = (st: number, ot: number, dt: number) => Math.round((10 * st + 2 * ot + dt) * 100) / 100;
    assert.equal(shahanCrewCostAmount("Lead Site Boilermaker 01", hours), billed(staff.st!, staff.ot!, staff.dt!));
    assert.equal(shahanCrewCostAmount("Boilermaker General Foreman", hours), billed(gf.st!, gf.ot!, gf.dt!));
    assert.equal(shahanCrewCostAmount("Boilermaker Foreman", hours), billed(foreman.st!, foreman.ot!, foreman.dt!));
    assert.equal(shahanCrewCostAmount("Boilermaker Journeyman", hours), billed(craft.st!, craft.ot!, craft.dt!));
    const billedAs = "Boilermaker Journeyman";
    assert.equal(shahanCrewCostAmount(billedAs, hours), billed(craft.st!, craft.ot!, craft.dt!));
    assert.equal(shahanCrewCostAmount("Fire Watch", hours), 0);
  });

  it("Support Cost and rail labor use billedAs first, then the duty alias", () => {
    const hours = { st: 10, ot: 2, dt: 1 };
    const journeyman = lookupShahanLabor("Boilermaker Journeyman");
    const pipe = lookupShahanLabor("PIPEFITTER JOURNEYMAN");
    assert.ok(journeyman && pipe);
    const billed = (st: number, ot: number, dt: number) => Math.round((10 * st + 2 * ot + dt) * 100) / 100;
    assert.equal(shahanCrewTitle({ position: "Tool Room Attendant", billedAs: "PIPEFITTER JOURNEYMAN" }), "PIPEFITTER JOURNEYMAN");
    assert.equal(shahanCrewTitle({ position: "Tool Room Attendant", billedAs: "" }), "Tool Room Attendant");
    assert.equal(shahanCrewTitle({ position: "Fire Watch" }), "Fire Watch");
    assert.equal(
      shahanCrewCostAmount(shahanCrewTitle({ position: "Tool Room Attendant", billedAs: "PIPEFITTER JOURNEYMAN" }), hours),
      billed(pipe.st!, pipe.ot!, pipe.dt!),
    );
    assert.equal(
      shahanCrewCostAmount(shahanCrewTitle({ position: "Tool Room Attendant", billedAs: "" }), hours),
      billed(journeyman.st!, journeyman.ot!, journeyman.dt!),
    );
    assert.equal(shahanCrewCostAmount(shahanCrewTitle({ position: "Fire Watch", billedAs: "" }), hours), 0);
    assert.equal(shahanTitleHasNoRate("Fire Watch"), true);
    assert.equal(shahanTitleHasNoRate(shahanCrewTitle({ position: "Tool Room Attendant", billedAs: "" })), false);
    const range = {
      start: "2026-09-21",
      end: "2026-09-21",
      hoursPerShift: 10,
      headcount: 1,
      nightHeadcount: 0,
      perDiemPeople: 0,
      days: [false, true, true, true, true, true, false],
    };
    const supportBilled = laborDollarsFromCrew({
      support: [{ position: "Tool Room Attendant", billedAs: "Boilermaker Direct", ranges: [range] }],
    }, "Wood River", "Phillips 66");
    const supportDuty = laborDollarsFromCrew({
      support: [{ position: "Tool Room Attendant", billedAs: "", ranges: [range] }],
    }, "Wood River", "Phillips 66");
    const supportWatch = laborDollarsFromCrew({
      support: [{ position: "Fire Watch", billedAs: "", ranges: [range] }],
    }, "Wood River", "Phillips 66");
    assert.ok(supportBilled > 0);
    assert.equal(supportBilled, supportDuty);
    assert.equal(supportWatch, 0);
  });

  it("leftover Merit 01 bills 0 and shows no-rate", () => {
    assert.equal(isNathanEstimateTitle("Project Manager Merit 01"), true);
    assert.equal(lookupShahanLabor("Project Manager Merit 01"), null);
    assert.equal(shahanCrewCostAmount("Project Manager Merit 01", { st: 10, ot: 2, dt: 1 }), 0);
    assert.equal(formatShahanCrewCost("Project Manager Merit 01", { st: 10, ot: 2, dt: 1 }), "");
    assert.equal(shahanTitleHasNoRate("Project Manager Merit 01"), true);
    assert.equal(SHAHAN_NO_RATE_LABEL, "No rate");
    assert.equal(
      laborDollarsFromCrew({
        staff: [{ position: "Project Manager Merit 01", ranges: [] }],
      }),
      0,
    );
  });

  it("keeps wet and dry copies of the same description as different dollars", () => {
    const rows = shahanEquipmentRows();
    const wet = rows.find((row) => row.wet && row.description === "EXTRACTOR BUNDLE AERIAL <21FT REQUIRES OPERATOR");
    const dry = rows.find((row) => !row.wet && row.description === "EXTRACTOR BUNDLE AERIAL <21FT REQUIRES OPERATOR");
    assert.ok(wet && dry);
    assert.equal(wet.daily, 1592);
    assert.equal(dry.daily, 1512);
    assert.notEqual(wet.daily, dry.daily);
    assert.notEqual(shahanEquipmentId(wet, rows.indexOf(wet)), shahanEquipmentId(dry, rows.indexOf(dry)));
    assert.equal(lookupShahanEquipment(shahanEquipmentId(wet, rows.indexOf(wet)))?.daily, 1592);
    assert.equal(lookupShahanEquipment(shahanEquipmentId(dry, rows.indexOf(dry)))?.daily, 1512);
    const rad = lookupShahanEquipment("RAD GUN TORQUE");
    assert.deepEqual(
      { daily: rad?.daily, weekly: rad?.weekly, monthly: rad?.monthly, wet: rad?.wet },
      { daily: 496, weekly: 1488, monthly: 4464, wet: false },
    );
    assert.equal(shahanPeriodRate(rad!, "hourly"), null);
  });

  it("Update rates sets Wood River PD 140/130, binds the book, and does not wipe hours", () => {
    const bayway = offerRateBookForSite("Bayway");
    assert.equal(bayway.ok, true);
    assert.equal(offerRateBookForSite("Yates — Newnan, GA").ok, true);
    assert.equal(offerRateBookForSite("Billings").ok, false);
    const wood = offerRateBookForSite("Wood River — Roxana, IL");
    assert.equal(wood.ok, true);
    if (!wood.ok) throw new Error("expected Wood River book");
    assert.equal(wood.bookId, SHAHAN_BOOK_ID);
    assert.equal(wood.bookLabel, SHAHAN_BOOK_LABEL);
    const ranges = [
      {
        start: "2026-09-21",
        end: "2026-09-25",
        hoursPerShift: 10,
        headcount: 3,
        nightHeadcount: 1,
        perDiemPeople: 2,
        days: [false, true, true, true, true, true, false],
      },
    ];
    const crew = rematchCrewToShahan({
      staff: [{ position: "MANAGER, PROJECT 01", ranges }],
      generalForeman: [{ position: "Boilermaker GF Union", ranges }],
      support: [
        { position: "Fire Watch", billedAs: "Project Manager Merit 01", ranges },
        { position: "Tool Room Attendant", billedAs: "", ranges },
        { position: "Hole Watch", billedAs: "Boilermaker Indirect (Tool Room)", ranges },
      ],
      otAfter8: false,
    });
    assert.equal(crew.staff?.[0]?.position, "Manager, Project 01");
    assert.equal(crew.generalForeman?.[0]?.position, "Boilermaker General Foreman");
    assert.equal(crew.support?.[0]?.position, "Fire Watch");
    assert.equal(crew.support?.[0]?.billedAs, "Project Manager Merit 01");
    assert.equal(crew.support?.[1]?.position, "Tool Room Attendant");
    assert.equal(crew.support?.[1]?.billedAs, "Boilermaker Journeyman");
    assert.equal(crew.support?.[2]?.position, "Hole Watch");
    assert.equal(crew.support?.[2]?.billedAs, "Boilermaker Journeyman");
    assert.deepEqual(crew.staff?.[0]?.ranges, ranges);
    assert.equal(crew.staff?.[0]?.ranges[0]?.headcount, 3);
    assert.equal(crew.staff?.[0]?.ranges[0]?.hoursPerShift, 10);
    const meta = applyShahanJobRates({
      afeName: "AFE-1",
      area: "CAT",
      staffPerDiemRate: 99,
      craftPerDiemRate: 88,
      staffMileageRate: 0.67,
      craftMileageRate: 0.55,
      rateBook: "",
    });
    assert.equal(meta.staffPerDiemRate, SHAHAN_STAFF_PD);
    assert.equal(meta.craftPerDiemRate, SHAHAN_CRAFT_PD);
    assert.equal(meta.rateBook, SHAHAN_BOOK_ID);
    assert.equal(meta.afeName, "AFE-1");
    assert.equal(meta.staffMileageRate, 0.67);
    const sheet = rematchEquipmentSheetToShahan({
      largeTools: [{ id: "lt-1", itemId: "air-mover", period: "daily", qty: 2, start: "2026-09-21", end: "2026-09-23", freight: 40, enteredCost: 0 }],
      thirdParty: [{ id: "tp-1", item: "Crane", period: "weekly", rate: 1000, freight: 200, qty: 2, start: "2026-09-21", end: "2026-09-28" }],
    });
    assert.equal(sheet.largeTools?.[0]?.qty, 2);
    assert.equal(sheet.largeTools?.[0]?.freight, 40);
    assert.equal(sheet.largeTools?.[0]?.start, "2026-09-21");
    assert.equal(sheet.thirdParty?.[0]?.item, "Crane");
    assert.equal(sheet.thirdParty?.[0]?.rate, 1000);
    assert.match(sheet.largeTools?.[0]?.itemId || "", /^dry:\d+:air-mover$/);
    assert.equal(rematchShahanEquipmentId(""), "");
  });
});
