/**
 * Synthetic Look QA fixture for the client PPR package.
 * Dollars / hours are invented SAMPLE values — not Mike’s P66 books.
 */
import { blankCraftRow, blankRange } from "./craft-labor.ts";
import {
  applyTurnipPaste,
  deskBudgetFromPack,
  emptyCostReportBook,
  estimateCurveFromCrew,
  saveCostSnapshot,
  type CostReportBook,
  type ScheduleKpi,
} from "./cost-report.ts";
import { TURNIP15_HEADERS, TURNIP16_HEADERS } from "./cost-report-ppr.ts";
import type { CostReportXlsxInput } from "./cost-report-xlsx.ts";
import type { SubSheet } from "./subcontractor.ts";

const SITE = "Wood River — Roxana, IL";
const CLIENT = "Sample Refinery";
const TITLE = "SAMPLE Boiler Outage PPR";

function craft(position: string, start: string, end: string, headcount: number, hps = 10) {
  const row = blankCraftRow();
  row.position = position;
  row.ranges = [
    {
      ...blankRange(),
      start,
      end,
      hoursPerShift: hps,
      headcount,
      days: [false, true, true, true, true, true, false],
    },
  ];
  return row;
}

function tsv(headers: readonly string[], rows: Array<Array<string | number>>) {
  return [headers.join("\t"), ...rows.map((row) => row.map((cell) => String(cell)).join("\t"))].join("\n");
}

export function sampleCostReportInput(): CostReportXlsxInput {
  const crew = {
    staff: [craft("Superintendent PF 01", "2026-09-01", "2026-09-04", 1, 10)],
    generalForeman: [],
    foreman: [craft("Pipefitter Foreman", "2026-09-01", "2026-09-04", 1, 10)],
    direct: [
      craft("Pipefitter Journeyman", "2026-09-01", "2026-09-04", 4, 10),
      craft("Boilermaker Journeyman", "2026-09-01", "2026-09-04", 3, 10),
    ],
    support: [craft("Firewatch", "2026-09-01", "2026-09-04", 2, 10)],
    otAfter8: true,
  };
  const subcontractor: SubSheet = {
    lines: [
      { id: "sub-nde", vendor: "SAMPLE NDE", scope: "RT / PT", qty: 1, unit: "LS", rate: 6500 },
      { id: "sub-insul", vendor: "SAMPLE Insulation", scope: "Boiler wrap", qty: 1, unit: "LS", rate: 4200 },
      { id: "sub-scaffold", vendor: "SAMPLE Scaffold", scope: "Access", qty: 1, unit: "LS", rate: 3800 },
      { id: "sub-crane", vendor: "SAMPLE Crane", scope: "Pick days", qty: 2, unit: "day", rate: 1850 },
    ],
    cards: [],
  };
  const budget = deskBudgetFromPack({
    crew,
    client: CLIENT,
    site: SITE,
    equipment: {
      largeTools: [
        {
          id: "lt-sample",
          itemId: "sample-wrench",
          period: "weekly",
          qty: 2,
          start: "2026-09-01",
          end: "2026-09-04",
          enteredCost: 1800,
          freight: 0,
        },
      ],
      thirdParty: [
        {
          id: "tp-sample",
          item: "Sample boom lift",
          period: "weekly",
          rate: 2400,
          freight: 0,
          qty: 1,
          start: "2026-09-01",
          end: "2026-09-04",
        },
      ],
    },
    otherCost: {
      perDiemRate: 0,
      travel: [
        { id: "travel-staff", kind: "staff", source: "crew", travelers: 2, perMile: 0.7, miles: 40, headcount: 2 },
        { id: "travel-craft", kind: "craft", source: "crew", travelers: 8, perMile: 0.7, miles: 40, headcount: 8 },
      ],
      misc: [{ id: "misc-rod", item: "Welding rod", description: "SAMPLE rod", qty: 12, each: 85 }],
    },
    subcontractor,
    jobMeta: { staffPerDiemRate: 140, craftPerDiemRate: 130 },
  });

  const export15 = tsv(TURNIP15_HEADERS, [
    [100, "Direct Labor", 168, 18480, 0, 0, 18480],
    [400, "Foremen", 24, 3120, 0, 0, 3120],
    [500, "Support", 48, 3840, 0, 0, 3840],
    [505, "Per Diem", 0, 0, 1820, 0, 1820],
    [702, "Staff", 24, 3600, 0, 0, 3600],
    [721, "Materials", 0, 0, 0, 12, 980],
    [725, "3rd Party General Rentals", 0, 0, 0, 1, 2100],
    [727, "Company Owned Equipment", 0, 0, 0, 2, 1600],
    [730, "Subcontractors", 0, 8200, 0, 0, 8200],
  ]);
  const export15Prior = tsv(TURNIP15_HEADERS, [
    [100, "Direct Labor", 84, 9240, 0, 0, 9240],
    [400, "Foremen", 12, 1560, 0, 0, 1560],
    [500, "Support", 24, 1920, 0, 0, 1920],
    [505, "Per Diem", 0, 0, 910, 0, 910],
    [702, "Staff", 12, 1800, 0, 0, 1800],
    [721, "Materials", 0, 0, 0, 6, 490],
    [725, "3rd Party General Rentals", 0, 0, 0, 1, 1050],
    [727, "Company Owned Equipment", 0, 0, 0, 1, 800],
    [730, "Subcontractors", 0, 4100, 0, 0, 4100],
  ]);
  const export16 = tsv(TURNIP16_HEADERS, [
    ["2026-09-01", "Pipefitter Journeyman", "SAMPLE-101", 40, 32, 8, 0, 100, 4],
    ["2026-09-01", "Boilermaker Journeyman", "SAMPLE-201", 30, 24, 6, 0, 100, 3],
    ["2026-09-01", "Firewatch", "SAMPLE-301", 20, 16, 4, 0, 500, 2],
    ["2026-09-02", "Pipefitter Journeyman", "SAMPLE-101", 40, 32, 8, 0, 100, 4],
    ["2026-09-02", "Boilermaker Journeyman", "SAMPLE-201", 30, 24, 6, 0, 100, 3],
    ["2026-09-02", "Firewatch", "SAMPLE-301", 20, 16, 4, 0, 500, 2],
    ["2026-09-03", "Pipefitter Journeyman", "SAMPLE-101", 20, 16, 4, 0, 100, 2],
    ["2026-09-03", "Boilermaker Journeyman", "SAMPLE-201", 8, 8, 0, 0, 100, 1],
    ["2026-09-03", "Firewatch", "SAMPLE-301", 8, 8, 0, 0, 500, 1],
  ]);
  const export16Prior = tsv(TURNIP16_HEADERS, [
    ["2026-09-01", "Pipefitter Journeyman", "SAMPLE-101", 40, 32, 8, 0, 100, 4],
    ["2026-09-01", "Boilermaker Journeyman", "SAMPLE-201", 30, 24, 6, 0, 100, 3],
    ["2026-09-01", "Firewatch", "SAMPLE-301", 20, 16, 4, 0, 500, 2],
  ]);

  const scheduleDay1: ScheduleKpi = {
    earnedHours: 60,
    plannedHours: 80,
    targetHours: 280,
    earnedPct: null,
    planPct: 0.29,
    incEarned: 60,
    notes: "SAMPLE 01 DailyReport_TOTAL Summary Phase Grand Total — invented earned hours",
    areas: [
      { area: "Boiler A", earnedHours: 36, planPct: null },
      { area: "Boiler B", earnedHours: 24, planPct: null },
    ],
    phases: [
      { code: "TA", earnedHours: 60, plannedHours: 80, planPct: 0.29, earnedPct: null },
    ],
  };
  const scheduleStatus: ScheduleKpi = {
    earnedHours: 126,
    plannedHours: 168,
    targetHours: 280,
    earnedPct: null,
    planPct: 0.6,
    incEarned: 42,
    notes: "SAMPLE 01 DailyReport_TOTAL Summary Phase Grand Total — invented earned hours",
    areas: [
      { area: "Boiler A", earnedHours: 80, planPct: 0.4 },
      { area: "Boiler B", earnedHours: 46, planPct: 0.35 },
    ],
    phases: [
      { code: "PRE", earnedHours: 12, plannedHours: 20, planPct: 0.2, earnedPct: null },
      { code: "TA", earnedHours: 114, plannedHours: 148, planPct: 0.55, earnedPct: null },
    ],
  };

  let book: CostReportBook = emptyCostReportBook();
  book = applyTurnipPaste(book, "15", export15Prior);
  book = applyTurnipPaste(book, "16", export16Prior);
  book = {
    ...book,
    statusDate: "2026-09-01",
    notes: "SAMPLE day 1 — synthetic Turnip paste",
    schedule: scheduleDay1,
  };
  book = saveCostSnapshot(book, budget, 1);
  book = applyTurnipPaste(book, "15", export15);
  book = applyTurnipPaste(book, "16", export16);
  book = {
    ...book,
    statusDate: "2026-09-03",
    notes: "SAMPLE status — invented hours and dollars only",
    schedule: scheduleStatus,
  };
  book = saveCostSnapshot(book, budget, 2);

  const actualsByDate = {
    "2026-09-01": { hours: 90, dollars: 0, headcount: 9 },
    "2026-09-02": { hours: 90, dollars: 0, headcount: 9 },
    "2026-09-03": { hours: 36, dollars: 0, headcount: 4 },
  };
  const curve = estimateCurveFromCrew(crew, SITE, CLIENT).map((point) => ({
    ...point,
    actHours: actualsByDate[point.date as keyof typeof actualsByDate]?.hours ?? 0,
    actHeadcount: actualsByDate[point.date as keyof typeof actualsByDate]?.headcount ?? 0,
    cumEstHours: point.estHours,
    cumActHours: 0,
  }));
  let cumEst = 0;
  let cumAct = 0;
  for (const point of curve) {
    cumEst += point.estHours;
    cumAct += point.actHours;
    point.cumEstHours = Math.round(cumEst * 100) / 100;
    point.cumActHours = Math.round(cumAct * 100) / 100;
  }

  return {
    title: TITLE,
    client: CLIENT,
    site: SITE,
    jobNumber: "SAMPLE-2026-017",
    statusDate: "2026-09-03",
    budget,
    book,
    curve,
    preparedBy: "Hit Squad Project Controls",
    status: "In progress",
    sample: true,
    subcontractor,
  };
}
