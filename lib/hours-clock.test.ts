import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  boundOtLabel,
  clockNote,
  computeRangeHours,
  computeRowHours,
  eastCoastCraftOtAfter8,
  runningClock,
  seatKind,
  siteClockFromText,
  sumSplits,
} from "./hours-clock.ts";

const WOOD_RIVER = {
  client: "Phillips 66",
  site: "Wood River Refinery",
  plantCode: "PCA0001103",
};

describe("bound site clocks", () => {
  it("Wood River / Bayway / PCA0001103 are East Coast, never PA/Mid-Atlantic", () => {
    assert.equal(siteClockFromText(WOOD_RIVER.site, WOOD_RIVER.client, WOOD_RIVER.plantCode), "east-coast");
    assert.equal(siteClockFromText("Bayway"), "east-coast");
    assert.match(boundOtLabel(WOOD_RIVER.site, WOOD_RIVER.client, WOOD_RIVER.plantCode), /East Coast/);
    assert.equal(boundOtLabel("Bayway").includes("Mid-Atlantic"), false);
    assert.equal(/PA|Mid-Atlantic/i.test(boundOtLabel("Bayway")), false);
  });

  it("Rodeo is CA daily; Yates is Yates", () => {
    assert.equal(siteClockFromText("Rodeo"), "ca-daily");
    assert.match(boundOtLabel("Rodeo"), /CA daily/);
    assert.equal(siteClockFromText("", "Yates Construction"), "yates");
  });
});

describe("seat vs clock override", () => {
  it("Cost Analyst / Analyst Cost / Superintendents / PM / Project Controls are staff", () => {
    assert.equal(seatKind("Analyst Cost 01"), "staff");
    assert.equal(seatKind("Cost Analyst"), "staff");
    assert.equal(seatKind("Project Controls"), "staff");
    assert.equal(seatKind("Superintendent"), "staff");
    assert.equal(seatKind("Project Manager"), "staff");
  });

  it("GF and craft codes stay on the COMP clock", () => {
    assert.equal(seatKind("General Foreman"), "craft");
    assert.equal(seatKind("Foreman"), "craft");
    assert.equal(seatKind("Boilermaker"), "craft");
    assert.equal(seatKind("Pipefitter Journeyman"), "craft");
    assert.equal(seatKind("Pipefitter PF"), "craft");
    assert.equal(runningClock("Pipefitter Journeyman", "Wood River", "Phillips 66", "auto"), "east-coast");
    assert.equal(runningClock("Foreman", "Wood River", "Phillips 66", "auto"), "east-coast");
    assert.equal(runningClock("General Foreman", "Wood River", "Phillips 66", "auto"), "east-coast");
  });

  it("union label does not flip the OT clock; checkbox does", () => {
    assert.equal(runningClock("Superintendent General PF 01", "Wood River", "Phillips 66", "auto"), "staff");
    assert.equal(runningClock("Superintendent General PF 01", "Wood River", "Phillips 66", "comp"), "east-coast");
    assert.equal(runningClock("Boilermaker BM", "Wood River", "Phillips 66", "staff"), "staff");
    const staffNote = clockNote("Analyst Cost 01", "Wood River", "Phillips 66");
    const craftNote = clockNote("General Foreman", "Wood River", "Phillips 66");
    assert.match(staffNote, /staff clock/i);
    assert.match(staffNote, /weekday ST to 10/);
    assert.match(craftNote, /East Coast/);
    assert.match(craftNote, /OT after 8/);
    assert.equal(/weekday ST to 10/.test(craftNote), false);
    assert.equal(eastCoastCraftOtAfter8("mech", false), true);
    assert.equal(eastCoastCraftOtAfter8("oil-out", false), true);
    assert.equal(eastCoastCraftOtAfter8("oil-in", false), true);
    assert.equal(eastCoastCraftOtAfter8("pre", false), false);
    assert.equal(eastCoastCraftOtAfter8("pre", true), true);
    assert.equal(eastCoastCraftOtAfter8("post", false), false);
    assert.equal(eastCoastCraftOtAfter8(undefined, false), true);
  });
});

describe("CAT 2 Wood River hour cases", () => {
  it("A) Analyst Cost 01, Mechanical Window, 13h × all 7 days, two Sundays: 26 DT, not 38", () => {
    const result = computeRangeHours({
      ...WOOD_RIVER,
      position: "Analyst Cost 01",
      start: "2026-10-01",
      end: "2026-10-14",
      hoursPerShift: 13,
      days: [true, true, true, true, true, true, true],
      headcount: 1,
    });
    assert.equal(result.dt, 26, `DT should be 26 Sundays, got ${result.dt}`);
    assert.notEqual(result.dt, 38);
    assert.equal(result.st + result.ot + result.dt, 14 * 13);
    const weekdayDt = result.days.filter((day) => day.weekday !== 0).reduce((n, day) => n + day.dt, 0);
    assert.equal(weekdayDt, 0, "weekday 13h must not mint DT after 12 on East Coast staff");
    const weekday = result.days.find((day) => day.weekday !== 0);
    assert.equal(weekday?.st, 10);
    assert.equal(weekday?.ot, 3);
  });

  it("B) Merit Pre-TAR 8 × 9: 67 ST + 5 OT, not 64", () => {
    const result = computeRangeHours({
      ...WOOD_RIVER,
      position: "Merit welder",
      start: "2026-10-05",
      end: "2026-10-14",
      hoursPerShift: 9,
      days: [false, true, true, true, true, true, false],
      headcount: 1,
    });
    assert.equal(result.workedDays, 8);
    assert.equal(result.st, 67);
    assert.equal(result.ot, 5);
    assert.equal(result.dt, 0);
    assert.notEqual(result.st, 64);
  });

  it("C) Same 8 × 9 with OT-after-8: 64 ST + 8 OT (weekly 40 still on top)", () => {
    const result = computeRangeHours({
      ...WOOD_RIVER,
      position: "Merit welder",
      start: "2026-10-05",
      end: "2026-10-14",
      hoursPerShift: 9,
      days: [false, true, true, true, true, true, false],
      headcount: 1,
      otAfter8: true,
    });
    assert.equal(result.st, 64);
    assert.equal(result.ot, 8);
    assert.equal(result.dt, 0);
  });

  it("D) East Coast GF/craft 13h weekday = 8 ST + 5 OT, never 1 DT after 12", () => {
    const result = computeRangeHours({
      ...WOOD_RIVER,
      position: "General Foreman",
      start: "2026-10-05",
      end: "2026-10-05",
      hoursPerShift: 13,
      days: [false, true, true, true, true, true, false],
      headcount: 1,
    });
    assert.equal(result.st, 8);
    assert.equal(result.ot, 5);
    assert.equal(result.dt, 0);
    assert.deepEqual(sumSplits([result]), {
      st: 8,
      ot: 5,
      dt: 0,
      pd: 0,
      hours: 13,
      workedDays: 1,
    });
  });

  it("weekly 40 and ST-to-10 multiply by headcount — 8 journeymen at 8h for 8 weekdays are 512 ST, not 80", () => {
    const result = computeRangeHours({
      ...WOOD_RIVER,
      position: "Pipefitter Journeyman",
      start: "2026-10-05",
      end: "2026-10-14",
      hoursPerShift: 8,
      days: [false, true, true, true, true, true, false],
      headcount: 8,
    });
    assert.equal(result.workedDays, 8);
    assert.equal(result.hours, 512);
    assert.equal(result.st, 512);
    assert.equal(result.ot, 0);
    assert.equal(result.dt, 0);
    assert.notEqual(result.st, 80);
    assert.notEqual(result.ot, 432);
  });

  it("2+2 Foremen at 8h for those 8 weekdays are 256 ST, not 160 — each head on each shift gets 40", () => {
    const result = computeRangeHours({
      ...WOOD_RIVER,
      position: "Foreman",
      start: "2026-10-05",
      end: "2026-10-14",
      hoursPerShift: 8,
      days: [false, true, true, true, true, true, false],
      shift: "Days & nights",
      headcount: 2,
      nightHeadcount: 2,
      clockOverride: "auto",
    });
    assert.equal(runningClock("Foreman", WOOD_RIVER.site, WOOD_RIVER.client, "auto"), "east-coast");
    assert.equal(result.hours, 256);
    assert.equal(result.st, 256);
    assert.equal(result.ot, 0);
    assert.equal(result.dt, 0);
    assert.notEqual(result.st, 160);
    assert.notEqual(result.ot, 96);
  });

  it("Sunday DT still multiplies headcount — 8 people × 10h × 2 Sundays = 160 DT", () => {
    const result = computeRangeHours({
      ...WOOD_RIVER,
      position: "Pipefitter Journeyman",
      start: "2026-08-23",
      end: "2026-08-30",
      hoursPerShift: 10,
      days: [true, false, false, false, false, false, false],
      headcount: 8,
    });
    assert.equal(result.workedDays, 2);
    assert.equal(result.dt, 160);
    assert.equal(result.st, 0);
    assert.equal(result.ot, 0);
    assert.equal(result.hours, 160);
  });

  it("Days & nights 1+1 at 8h Mo–Fr is two people, not one 40 ST / 40 OT line", () => {
    const result = computeRangeHours({
      ...WOOD_RIVER,
      position: "Cost Analyst",
      start: "2027-01-04",
      end: "2027-01-08",
      hoursPerShift: 8,
      days: [false, true, true, true, true, true, false],
      shift: "Days & nights",
      headcount: 1,
      nightHeadcount: 1,
      perDiemPeople: 1,
      nightPerDiemPeople: 1,
    });
    assert.equal(result.st, 80);
    assert.equal(result.ot, 0);
    assert.equal(result.dt, 0);
    assert.equal(result.pd, 10);
    assert.equal(result.hours, 80);
    assert.notEqual(result.st, 40);
    assert.notEqual(result.ot, 40);
  });

  it("Days & nights keeps East Coast clocks per crew — 13h weekday is 16 ST + 10 OT, never DT after 12", () => {
    const result = computeRangeHours({
      ...WOOD_RIVER,
      position: "General Foreman",
      start: "2026-10-05",
      end: "2026-10-05",
      hoursPerShift: 13,
      days: [false, true, true, true, true, true, false],
      shift: "Days & nights",
      headcount: 1,
      nightHeadcount: 1,
    });
    assert.equal(result.st, 16);
    assert.equal(result.ot, 10);
    assert.equal(result.dt, 0);
  });
});

describe("East Coast CBA craft OT after 8", () => {
  const weekday = {
    start: "2027-03-15",
    end: "2027-03-15",
    hoursPerShift: 10,
    days: [false, true, true, true, true, true, false] as boolean[],
    headcount: 1,
  };

  it("Boilermaker Journeyman Mechanical 10h weekday is 8 ST + 2 OT, not 10 ST", () => {
    const result = computeRangeHours({
      ...WOOD_RIVER,
      ...weekday,
      position: "Boilermaker Journeyman",
      phaseId: "mech",
      otAfter8: false,
    });
    assert.equal(result.st, 8);
    assert.equal(result.ot, 2);
    assert.equal(result.dt, 0);
    assert.notEqual(result.st, 10);
    assert.notEqual(result.ot, 0);
  });

  it("same person Pre Job setup all-ST 8h Mon–Fri is all ST (1920 / 0 on the Wood River card)", () => {
    const result = computeRangeHours({
      ...WOOD_RIVER,
      position: "Boilermaker Journeyman",
      phaseId: "pre",
      otAfter8: false,
      start: "2027-01-18",
      end: "2027-02-28",
      hoursPerShift: 8,
      days: [false, true, true, true, true, true, false],
      headcount: 8,
      perDiemPeople: 6,
    });
    assert.equal(result.workedDays, 30);
    assert.equal(result.st, 1920);
    assert.equal(result.ot, 0);
    assert.equal(result.dt, 0);
    assert.equal(result.pd, 180);
    assert.equal(result.hours, 1920);
  });

  it("same person Pre Job setup OT-after-8 10h is 8 ST + 2 OT", () => {
    const result = computeRangeHours({
      ...WOOD_RIVER,
      ...weekday,
      position: "Boilermaker Journeyman",
      phaseId: "pre",
      otAfter8: true,
    });
    assert.equal(result.st, 8);
    assert.equal(result.ot, 2);
    assert.equal(result.dt, 0);
  });

  it("Pre / Post all-ST 10h stays 10 ST; 12h stays ST except Sunday / weekly 40", () => {
    const ten = computeRangeHours({
      ...WOOD_RIVER,
      ...weekday,
      position: "Boilermaker Journeyman",
      phaseId: "pre",
      otAfter8: false,
    });
    assert.equal(ten.st, 10);
    assert.equal(ten.ot, 0);
    const twelve = computeRangeHours({
      ...WOOD_RIVER,
      position: "Boilermaker Journeyman",
      phaseId: "post",
      otAfter8: false,
      start: "2027-03-15",
      end: "2027-03-15",
      hoursPerShift: 12,
      days: [false, true, true, true, true, true, false],
    });
    assert.equal(twelve.st, 12);
    assert.equal(twelve.ot, 0);
    assert.equal(twelve.dt, 0);
  });

  it("Pipefitter Journeyman and Support billed as Boilermaker Journeyman use the same CBA split", () => {
    const pipe = computeRangeHours({
      ...WOOD_RIVER,
      ...weekday,
      position: "Pipefitter Journeyman",
      phaseId: "oil-out",
    });
    const support = computeRowHours(
      {
        position: "Fire Watch",
        billedAs: "Boilermaker Journeyman",
        ranges: [
          {
            start: weekday.start,
            end: weekday.end,
            hoursPerShift: 10,
            headcount: 1,
            nightHeadcount: 1,
            perDiemPeople: 0,
            days: [...weekday.days],
            phaseId: "oil-in",
            otAfter8: false,
          },
        ],
      },
      WOOD_RIVER.site,
      WOOD_RIVER.client,
    );
    assert.equal(pipe.st, 8);
    assert.equal(pipe.ot, 2);
    assert.equal(support.st, 8);
    assert.equal(support.ot, 2);
  });

  it("Superintendent / Analyst Cost keep ST to 10 unless Use COMP clock", () => {
    const superStaff = computeRangeHours({
      ...WOOD_RIVER,
      ...weekday,
      position: "Superintendent",
      phaseId: "mech",
    });
    const analyst = computeRangeHours({
      ...WOOD_RIVER,
      ...weekday,
      position: "Analyst Cost 01",
      phaseId: "oil-out",
    });
    const superComp = computeRangeHours({
      ...WOOD_RIVER,
      ...weekday,
      position: "Superintendent General PF 01",
      phaseId: "mech",
      clockOverride: "comp",
    });
    assert.equal(superStaff.st, 10);
    assert.equal(superStaff.ot, 0);
    assert.equal(analyst.st, 10);
    assert.equal(analyst.ot, 0);
    assert.equal(superComp.st, 8);
    assert.equal(superComp.ot, 2);
  });

  it("Sunday is still all DT; weekly 40 still sits on leftover ST", () => {
    const sunday = computeRangeHours({
      ...WOOD_RIVER,
      position: "Boilermaker Journeyman",
      phaseId: "mech",
      start: "2027-03-14",
      end: "2027-03-14",
      hoursPerShift: 10,
      days: [true, false, false, false, false, false, false],
    });
    assert.equal(sunday.dt, 10);
    assert.equal(sunday.st, 0);
    assert.equal(sunday.ot, 0);

    const week = computeRangeHours({
      ...WOOD_RIVER,
      position: "Boilermaker Journeyman",
      phaseId: "mech",
      start: "2027-03-15",
      end: "2027-03-20",
      hoursPerShift: 10,
      days: [false, true, true, true, true, true, true],
    });
    assert.equal(week.st, 40);
    assert.equal(week.ot, 20);
    assert.equal(week.dt, 0);
    assert.equal(week.hours, 60);
  });

  it("description still does not change math; Days & nights dual count is unchanged", () => {
    const oilIn = {
      ...WOOD_RIVER,
      position: "Boilermaker Journeyman",
      phaseId: "oil-in",
      start: "2027-04-18",
      end: "2027-04-19",
      hoursPerShift: 10,
      days: [true, true, true, true, true, true, true],
      shift: "Days & nights" as const,
      headcount: 6,
      nightHeadcount: 4,
      perDiemPeople: 6,
      nightPerDiemPeople: 4,
      skipDates: ["2027-04-18"],
    };
    const result = computeRangeHours(oilIn);
    assert.equal(result.st, 80);
    assert.equal(result.ot, 20);
    assert.equal(result.dt, 0);
    assert.equal(result.pd, 10);
    assert.equal(result.hours, 100);
    const labeled = computeRowHours(
      {
        position: "Boilermaker Journeyman",
        ranges: [
          {
            start: oilIn.start,
            end: oilIn.end,
            hoursPerShift: 10,
            headcount: 6,
            nightHeadcount: 4,
            perDiemPeople: 6,
            nightPerDiemPeople: 4,
            days: [...oilIn.days],
            phaseId: "oil-in",
            shift: "Days & nights",
            skipDates: ["2027-04-18"],
            description: "Hiring progression",
          },
        ],
      },
      WOOD_RIVER.site,
      WOOD_RIVER.client,
    );
    assert.equal(labeled.st, result.st);
    assert.equal(labeled.ot, result.ot);
    assert.equal(labeled.dt, result.dt);
    assert.equal(labeled.pd, result.pd);
    assert.equal(labeled.hours, result.hours);
  });
});
