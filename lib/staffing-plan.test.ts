import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CraftRow } from "./craft-labor.ts";
import {
  EAST_COAST_CRAFTS,
  P66_CONTRACTOR,
  WEST_COAST_CRAFTS,
  matchIpsCraft,
  staffingCoastFromSite,
} from "./p66-ips-crafts.ts";
import type { PhaseRow } from "./phase-schedule.ts";
import {
  cellValue,
  exportStaffingRows,
  generateStaffingPlan,
  staffingExportCells,
  staffingPhasesFromSchedule,
  staffingPlanToXlsx,
  visibleStaffingRows,
} from "./staffing-plan.ts";
import { buildSheetXml } from "./xlsx-minimal.ts";

function craft(position: string, shift: CraftRow["shift"], ranges: CraftRow["ranges"]): CraftRow {
  return {
    id: `cr-${position}`,
    position,
    shift,
    st: 0,
    ot: 0,
    dt: 0,
    pd: 0,
    hours: 0,
    cost: "",
    clockOverride: "auto",
    laborClassOverride: null,
    ranges,
  };
}

function phase(partial: Partial<PhaseRow> & Pick<PhaseRow, "id" | "start" | "stop">): PhaseRow {
  return {
    name: partial.name || partial.id,
    on: partial.on ?? true,
    daysPerWeek: partial.daysPerWeek ?? 6,
    hoursPerDay: partial.hoursPerDay ?? 10,
    otAfter8: false,
    sundaysOff: partial.sundaysOff ?? [],
    ...partial,
  };
}

const MECH = phase({
  id: "mech",
  name: "Mechanical Window",
  start: "2026-09-07",
  stop: "2026-09-09",
  daysPerWeek: 6,
});

describe("P66 coast lists", () => {
  it("Wood River / Bayway are East; Rodeo / Ferndale are West", () => {
    assert.equal(staffingCoastFromSite("Wood River — Roxana, IL"), "east");
    assert.equal(staffingCoastFromSite("Bayway — Linden, NJ"), "east");
    assert.equal(staffingCoastFromSite("Rodeo — Rodeo, CA"), "west");
    assert.equal(staffingCoastFromSite("Ferndale — Ferndale, WA"), "west");
    assert.equal(
      EAST_COAST_CRAFTS.some((row) => /ironworker/i.test(row.name)),
      false,
    );
    assert.equal(
      WEST_COAST_CRAFTS.some((row) => /ironworker/i.test(row.name)),
      true,
    );
    assert.equal(
      WEST_COAST_CRAFTS.some((row) => /crane operator/i.test(row.name)),
      true,
    );
    assert.equal(matchIpsCraft("Boilermaker Journeyman", EAST_COAST_CRAFTS)?.code, "201");
    assert.equal(matchIpsCraft("Foreman", EAST_COAST_CRAFTS)?.name, "Foreman");
    assert.equal(matchIpsCraft("General Foreman", EAST_COAST_CRAFTS)?.name, "General Foreman");
  });
});

describe("generate staffing from crew + phases", () => {
  it("fills Day / Night from crew ranges and the phase calendar", () => {
    const plan = generateStaffingPlan({
      site: "Wood River — Roxana, IL",
      phases: [MECH],
      crew: {
        direct: [
          craft("Boilermaker Journeyman", "Days", [
            {
              id: "rg-1",
              start: "2026-09-07",
              end: "2026-09-09",
              headcount: 4,
              nightHeadcount: 1,
              hoursPerShift: 10,
              perDiemPeople: 4,
              days: [false, true, true, true, true, true, true],
              shift: "Days",
            },
          ]),
          craft("Pipefitter Journeyman", "Nights", [
            {
              id: "rg-2",
              start: "2026-09-07",
              end: "2026-09-09",
              headcount: 2,
              nightHeadcount: 0,
              hoursPerShift: 10,
              perDiemPeople: 2,
              days: [false, true, true, true, true, true, true],
              shift: "Nights",
            },
          ]),
        ],
      },
    });

    assert.equal(plan.coast, "east");
    assert.deepEqual(
      plan.dates.map((d) => d.header),
      ["09/07/2026 (M)", "09/08/2026 (T)", "09/09/2026 (W)"],
    );
    const bm = plan.rows.find((row) => row.code === "201");
    const pf = plan.rows.find((row) => row.code === "301");
    assert.equal(bm?.cells["2026-09-07"]?.day, 4);
    assert.equal(bm?.cells["2026-09-07"]?.night, undefined);
    assert.equal(pf?.cells["2026-09-07"]?.night, 2);
    assert.equal(pf?.cells["2026-09-07"]?.day, undefined);
    assert.equal(cellValue(bm?.cells["2026-09-07"], "night"), undefined);
  });

  it("Days & nights is dual count, not doubled", () => {
    const plan = generateStaffingPlan({
      site: "Rodeo — Rodeo, CA",
      phases: [MECH],
      crew: {
        direct: [
          craft("Ironworker Journeyman", "Days & nights", [
            {
              id: "rg-iw",
              start: "2026-09-07",
              end: "2026-09-09",
              headcount: 6,
              nightHeadcount: 3,
              hoursPerShift: 10,
              perDiemPeople: 9,
              days: [false, true, true, true, true, true, true],
              shift: "Days & nights",
            },
          ]),
        ],
      },
    });
    const iw = plan.rows.find((row) => row.code === "601");
    assert.equal(plan.coast, "west");
    assert.equal(iw?.cells["2026-09-07"]?.day, 6);
    assert.equal(iw?.cells["2026-09-07"]?.night, 3);
    assert.notEqual(iw?.cells["2026-09-07"]?.day, 12);
    assert.notEqual(iw?.cells["2026-09-07"]?.night, 6);
    assert.notEqual((iw?.cells["2026-09-07"]?.day ?? 0) + (iw?.cells["2026-09-07"]?.night ?? 0), 18);
  });

  it("leaves empty P66 crafts blank, not zero, and hides them unless the full template is shown", () => {
    const plan = generateStaffingPlan({
      site: "Wood River — Roxana, IL",
      phases: [MECH],
      crew: {
        staff: [
          craft("Superintendent", "Days", [
            {
              id: "rg-s",
              start: "2026-09-07",
              end: "2026-09-09",
              headcount: 1,
              nightHeadcount: 0,
              hoursPerShift: 10,
              perDiemPeople: 1,
              days: [false, true, true, true, true, true, true],
              shift: "Days",
            },
          ]),
        ],
      },
    });
    const laborer = plan.rows.find((row) => row.code === "901");
    assert.equal(laborer?.hasAny, false);
    assert.deepEqual(laborer?.cells["2026-09-07"], undefined);
    assert.equal(cellValue(laborer?.cells["2026-09-07"], "day"), undefined);
    assert.equal(cellValue({ day: 0, night: 0 }, "day"), undefined);
    const hidden = visibleStaffingRows(plan, false);
    assert.equal(hidden.some((row) => row.code === "901"), false);
    assert.equal(hidden.some((row) => row.code === "101"), true);
    const full = visibleStaffingRows(plan, true);
    assert.equal(full.some((row) => row.code === "901"), true);
    assert.equal(full.find((row) => row.code === "901")?.hasAny, false);
  });

  it("skips unworked days so Sunday stays blank on a 6-day window", () => {
    const week = phase({
      id: "mech",
      name: "Mechanical Window",
      start: "2026-09-07",
      stop: "2026-09-13",
      daysPerWeek: 6,
    });
    const plan = generateStaffingPlan({
      site: "Wood River — Roxana, IL",
      phases: [week],
      crew: {
        direct: [
          craft("Laborer", "Days", [
            {
              id: "rg-lb",
              start: "2026-09-07",
              end: "2026-09-13",
              headcount: 8,
              nightHeadcount: 0,
              hoursPerShift: 10,
              perDiemPeople: 8,
              days: [false, true, true, true, true, true, true],
              shift: "Days",
            },
          ]),
        ],
      },
    });
    const laborer = plan.rows.find((row) => row.code === "901");
    assert.equal(laborer?.cells["2026-09-12"]?.day, 8);
    assert.equal(laborer?.cells["2026-09-13"], undefined);
    assert.equal(plan.dates.at(-1)?.header, "09/13/2026 (S)");
  });

  it("Multiple units uses unit phase dates, not only the job timeline", () => {
    const job = phase({ id: "mech", start: "2026-09-01", stop: "2026-09-03" });
    const later = phase({ id: "mech", start: "2026-09-10", stop: "2026-09-12" });
    const phases = staffingPhasesFromSchedule({
      multiUnits: true,
      phases: [job],
      units: [{ phases: [job] }, { phases: [later] }],
    });
    const plan = generateStaffingPlan({
      site: "Wood River — Roxana, IL",
      phases,
      crew: {
        direct: [
          craft("Boilermaker Journeyman", "Days", [
            {
              id: "rg-u2",
              start: "2026-09-10",
              end: "2026-09-12",
              headcount: 2,
              nightHeadcount: 0,
              hoursPerShift: 10,
              perDiemPeople: 2,
              days: [false, true, true, true, true, true, true],
              shift: "Days",
            },
          ]),
        ],
      },
    });
    assert.equal(plan.dates.some((date) => date.ymd === "2026-09-10"), true);
    assert.equal(plan.rows.find((row) => row.code === "201")?.cells["2026-09-10"]?.day, 2);
  });
});

describe("P66 staffing xlsx", () => {
  it("writes contractor 50413486, blank empty crafts, and SUM totals", () => {
    const plan = generateStaffingPlan({
      site: "Wood River — Roxana, IL",
      phases: [MECH],
      crew: {
        direct: [
          craft("Boilermaker Journeyman", "Days", [
            {
              id: "rg-1",
              start: "2026-09-07",
              end: "2026-09-09",
              headcount: 4,
              nightHeadcount: 0,
              hoursPerShift: 10,
              perDiemPeople: 4,
              days: [false, true, true, true, true, true, true],
              shift: "Days",
            },
          ]),
        ],
      },
    });
    const { cells, merges } = staffingExportCells(plan, {
      projectName: "CAT 2",
      afeName: "U250 Coker North",
      area: "Coker",
    });
    const xml = buildSheetXml(cells, merges);
    assert.match(xml, /AFE Name/);
    assert.match(xml, /U250 Coker North/);
    assert.match(xml, /MADISON INDUSTRIAL SVCS TEAM LLC \(50413486\)/);
    assert.match(xml, /Mechanical Window/);
    assert.match(xml, /09\/07\/2026 \(M\)/);
    assert.match(xml, /<f>SUM\(/);
    assert.equal(xml.includes("<v>0</v>"), false);
    assert.equal(exportStaffingRows(plan).some((row) => row.code === "901"), true);
    const bytes = staffingPlanToXlsx(plan, { projectName: "CAT 2", afeName: "U250 Coker North", area: "Coker" });
    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);
    const asText = new TextDecoder().decode(bytes);
    assert.match(asText, /50413486/);
    assert.match(asText, /SUM\(/);
    assert.equal(asText.includes("<v>0</v>"), false);
  });
});
