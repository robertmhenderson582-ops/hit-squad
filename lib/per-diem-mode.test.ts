import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { deskPackageTotal } from "./estimate-desk-total.ts";
import {
  buildEstimateWorkbook,
  ESTIMATE_XLSX_SHEETS,
  JOB_SETUP_PD_MODE_CELL,
  JOB_SETUP_PD_MODE_LABEL,
  laborDayPlug,
} from "./estimate-xlsx.ts";
import { computeRangeHours, computeRowHours, hydratePerDiemMode } from "./hours-clock.ts";
import { otherCostTotals } from "./other-cost.ts";
import { perDiemDaysFromCrew, perDiemDollarsFromCrew } from "./shahan-wood-river.ts";

function read(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const WEEKDAYS = [false, true, true, true, true, true, false] as boolean[];

const staffRow = {
  position: "Superintendent 01",
  ranges: [
    {
      start: "2026-09-14",
      end: "2026-09-20",
      hoursPerShift: 10,
      headcount: 1,
      nightHeadcount: 0,
      perDiemPeople: 1,
      days: WEEKDAYS,
    },
  ],
};

const craftRow = {
  position: "Boilermaker Journeyman",
  ranges: [
    {
      start: "2026-09-14",
      end: "2026-09-20",
      hoursPerShift: 10,
      headcount: 2,
      nightHeadcount: 0,
      perDiemPeople: 2,
      days: WEEKDAYS,
    },
  ],
};

const crew = { staff: [staffRow], direct: [craftRow], otAfter8: true };

describe("per diem mode ripple", () => {
  it("Staff and Craft use the same job-level switch and their own $ / day", () => {
    const days = perDiemDaysFromCrew(crew, "Wood River", "Phillips 66", [], "days-worked");
    const seven = perDiemDaysFromCrew(crew, "Wood River", "Phillips 66", [], "seven-day");
    assert.deepEqual(days, { staff: 5, craft: 10 });
    assert.deepEqual(seven, { staff: 7, craft: 14 });
    const rates = { staffPerDiemRate: 140, craftPerDiemRate: 130, perDiemMode: "seven-day" as const };
    assert.equal(perDiemDollarsFromCrew(crew, rates, "Wood River", "Phillips 66"), 7 * 140 + 14 * 130);
    assert.equal(
      perDiemDollarsFromCrew(crew, { ...rates, perDiemMode: "days-worked" }, "Wood River", "Phillips 66"),
      5 * 140 + 10 * 130,
    );
  });

  it("desk total, Other Cost PD, and Excel Summary share one book", () => {
    const jobMeta = { staffPerDiemRate: 140, craftPerDiemRate: 130, staffMileageRate: 0, craftMileageRate: 0, rateBook: "" };
    const input = {
      crew,
      site: "Wood River — Roxana, IL",
      client: "Phillips 66",
      jobMeta,
      otherCost: { perDiemRate: 0, travel: [], misc: [] },
      equipment: { largeTools: [], thirdParty: [] },
    };
    const worked = deskPackageTotal(input);
    const seven = deskPackageTotal({ ...input, jobMeta: { ...jobMeta, perDiemMode: "seven-day" } });
    assert.equal(seven - worked, 2 * 140 + 4 * 130);
    const rest = otherCostTotals({ perDiemRate: 0, travel: [], misc: [] }, 0);
    assert.equal(rest.perDiem, 0);
    const sheets = buildEstimateWorkbook({
      ...input,
      title: "PD mode",
      schedule: {
        projectStart: "2026-09-14",
        multiUnits: false,
        units: [],
        phases: [
          {
            id: "mech",
            name: "Mechanical Window",
            on: true,
            start: "2026-09-14",
            stop: "2026-09-20",
            daysPerWeek: 5,
            hoursPerDay: 10,
            otAfter8: true,
            sundaysOff: [],
          },
        ],
      },
      jobMeta: { ...jobMeta, perDiemMode: "seven-day" },
    });
    const setup = sheets.find((sheet) => sheet.name === ESTIMATE_XLSX_SHEETS.jobSetup);
    const mode = setup?.cells.find((cell) => cell.ref === JOB_SETUP_PD_MODE_CELL);
    const label = setup?.cells.find((cell) => cell.ref === "A26");
    assert.equal(label?.type === "text" ? label.value : "", JOB_SETUP_PD_MODE_LABEL);
    assert.equal(mode?.type === "text" ? mode.value : "", "7 days a week");
  });

  it("Excel PD day-grid auto-fills from the mode; labor days stay the days-mask", () => {
    const row = {
      id: "dr-1",
      position: "Boilermaker Journeyman",
      shift: "Days" as const,
      st: 0,
      ot: 0,
      dt: 0,
      pd: 0,
      hours: 0,
      cost: "",
      clockOverride: "auto" as const,
      laborClassOverride: null,
      ranges: [craftRow.ranges[0]],
    };
    const sat = laborDayPlug(row, "2026-09-19", false, [], "days-worked");
    const satSeven = laborDayPlug(row, "2026-09-19", false, [], "seven-day");
    const mon = laborDayPlug(row, "2026-09-14", false, [], "days-worked");
    assert.equal(sat.hc, 0);
    assert.equal(sat.pd, 0);
    assert.equal(satSeven.hc, 0);
    assert.equal(satSeven.pd, 2);
    assert.equal(mon.hc, 2);
    assert.equal(mon.pd, 2);
    const holiday = laborDayPlug(row, "2026-09-16", false, ["2026-09-16"], "seven-day");
    assert.equal(holiday.hc, 0);
    assert.equal(holiday.pd, 2);
  });

  it("Job setup + Other Cost + crew cards read the live pack switch — no parallel PD book", () => {
    const setup = read("../components/JobSetupCard.tsx");
    const other = read("../components/OtherCostDesk.tsx");
    const crewGrid = read("../components/CraftLaborGrid.tsx");
    const desk = read("./estimate-desk-total.ts");
    assert.match(setup, /PER DIEM DAYS/);
    assert.match(setup, /days-worked/);
    assert.match(setup, /seven-day/);
    assert.match(other, /perDiemMode/);
    assert.match(crewGrid, /perDiemMode/);
    assert.match(desk, /perDiemDollarsFromCrew/);
    assert.match(other, /does not keep a second PD book/);
  });

  it("row hours follow the same mode the desk total uses", () => {
    const worked = computeRowHours(staffRow, "Wood River", "Phillips 66", false, "", [], "days-worked");
    const seven = computeRowHours(staffRow, "Wood River", "Phillips 66", false, "", [], "seven-day");
    assert.equal(worked.pd, 5);
    assert.equal(seven.pd, 7);
    assert.equal(hydratePerDiemMode("Days worked"), "days-worked");
    const dual = computeRangeHours({
      position: "Cost Analyst",
      site: "Wood River",
      start: "2026-09-14",
      end: "2026-09-20",
      hoursPerShift: 8,
      days: WEEKDAYS,
      shift: "Days & nights",
      headcount: 1,
      nightHeadcount: 1,
      perDiemPeople: 1,
      nightPerDiemPeople: 1,
      perDiemMode: "seven-day",
    });
    assert.equal(dual.pd, 14);
  });
});
