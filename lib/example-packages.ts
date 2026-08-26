import type { SupportLine } from "@/components/SupportCrewCard";
import { emptyWeek, fcrSummary, type FcrPacket } from "./change-order-packet.ts";
import type { CraftRow, CalendarRange } from "./craft-labor.ts";
import {
  emptyEquipmentSheet,
  equipmentTotals,
  thirdPartyCost,
  thirdPartyMarkedUp,
  type EquipmentSheet,
} from "./equipment-sheet.ts";
import { estimateTotalBreakdown, parseDeskDollars } from "./estimate-total.ts";
import { otherCostTotals, type OtherCostSheet } from "./other-cost.ts";
import { defaultPhaseSchedule, type PhaseScheduleState } from "./phase-schedule.ts";
import type { JobMeta } from "./staffing-plan.ts";
import { generateStaffingPlan, visibleStaffingRows } from "./staffing-plan.ts";
import type { WorkActivity } from "./work-activities.ts";

export const EXAMPLE_TEMPLATE_IDS = ["est-u3", "est-coker", "est-tower"] as const;
export type ExampleTemplateId = (typeof EXAMPLE_TEMPLATE_IDS)[number];

export type ExampleCrew = {
  staff: CraftRow[];
  generalForeman: CraftRow[];
  foreman: CraftRow[];
  direct: CraftRow[];
  support: SupportLine[];
  otAfter8: boolean;
};

export type ExamplePackage = {
  id: ExampleTemplateId;
  code: string;
  title: string;
  client: string;
  siteId: string;
  siteName: string;
  unit: string;
  type: "T&M" | "Hybrid" | "Lump sum";
  window: string;
  revision: string;
  totalLabel: string;
  schedule: PhaseScheduleState;
  jobMeta: JobMeta;
  crew: ExampleCrew;
  activities: WorkActivity[];
  equipment: EquipmentSheet;
  otherCost: OtherCostSheet;
  fcr: FcrPacket;
};

const DAYS_6 = [false, true, true, true, true, true, true];
const DAYS_5 = [false, true, true, true, true, true, false];
const DAYS_7 = [true, true, true, true, true, true, true];

function range(
  id: string,
  phaseId: string,
  start: string,
  end: string,
  hoursPerShift: number,
  headcount: number,
  days: boolean[],
  shift: CalendarRange["shift"] = "Days",
): CalendarRange {
  return {
    id,
    phaseId,
    start,
    end,
    headcount,
    nightHeadcount: shift === "Nights" ? headcount : 1,
    hoursPerShift,
    perDiemPeople: headcount,
    nightPerDiemPeople: shift === "Nights" ? headcount : 1,
    days,
    otAfter8: false,
    shift,
    skipDates: [],
  };
}

function craft(
  id: string,
  position: string,
  shift: CraftRow["shift"],
  cost: string,
  ranges: CalendarRange[],
): CraftRow {
  return {
    id,
    position,
    shift,
    st: 0,
    ot: 0,
    dt: 0,
    pd: 0,
    hours: 0,
    cost,
    clockOverride: "auto",
    laborClassOverride: null,
    ranges,
  };
}

const U3_SCHEDULE = defaultPhaseSchedule();

const u3Mech = (id: string, headcount: number, shift: CalendarRange["shift"] = "Days") =>
  range(id, "mech", "2026-09-07", "2026-09-20", 10, headcount, DAYS_6, shift);
const u3Pre = (id: string, headcount: number) =>
  range(id, "pre", "2026-08-21", "2026-09-03", 10, headcount, [false, true, true, true, true, false, false]);
const u3OilIn = (id: string, headcount: number) =>
  range(id, "oil-in", "2026-09-21", "2026-09-27", 12, headcount, DAYS_7);

const U3: ExamplePackage = {
  id: "est-u3",
  code: "EST-2609-U3",
  title: "Unit 3 turnaround — mechanical package",
  client: "Madison / P66",
  siteId: "site-madison",
  siteName: "Wood River",
  unit: "Unit 3",
  type: "Hybrid",
  window: "12 Sep → 04 Oct 2026",
  revision: "C",
  totalLabel: "$2,410,000",
  schedule: U3_SCHEDULE,
  jobMeta: { afeName: "TA-8841 Unit 3 mechanical", area: "Unit 3 crude / vacuum", perDiemRate: 185, mileageRate: 0.7 },
  crew: {
    otAfter8: false,
    staff: [
      craft("u3-staff-pm", "Project Manager", "Days", "$186,000", [u3Pre("u3-pm-pre", 1), u3Mech("u3-pm-mech", 1), u3OilIn("u3-pm-in", 1)]),
      craft("u3-staff-sup", "Superintendent", "Days", "$164,000", [u3Mech("u3-sup-mech", 1), u3OilIn("u3-sup-in", 1)]),
    ],
    generalForeman: [
      craft("u3-gf", "General Foreman", "Days", "$96,000", [u3Mech("u3-gf-mech", 1)]),
    ],
    foreman: [
      craft("u3-fm-bm", "Foreman", "Days", "$88,000", [u3Mech("u3-fm-mech", 2)]),
    ],
    direct: [
      craft("u3-bm", "Boilermaker Journeyman", "Days", "$412,000", [u3Mech("u3-bm-mech", 12)]),
      craft("u3-pf", "Pipefitter Journeyman", "Days", "$468,000", [u3Mech("u3-pf-mech", 16), u3OilIn("u3-pf-in", 8)]),
      craft("u3-iw", "Ironworker Journeyman", "Days", "$226,000", [u3Mech("u3-iw-mech", 8)]),
    ],
    support: [
      { id: "u3-sup-fw", position: "Fire Watch", billedAs: "Laborer" },
      { id: "u3-sup-sa", position: "Safety Attendant", billedAs: "Safety Attendant" },
    ],
  },
  activities: [
    { id: "u3-wa-1", activityNo: "01", wbs: "01", unit: "Unit 3", name: "Mobilize / badge / orientation", resource: "Laborer", phaseId: "pre", hours: 320 },
    { id: "u3-wa-2", activityNo: "02", wbs: "02", unit: "Unit 3", name: "Scaffold & access — Unit 3 piperack", resource: "Ironworker", phaseId: "pre", hours: 1840 },
    { id: "u3-wa-3", activityNo: "03", wbs: "03", unit: "Unit 3", name: "Blind list / isolation package", resource: "Pipefitter", phaseId: "oil-out", hours: 960 },
    { id: "u3-wa-4", activityNo: "04", wbs: "04", unit: "Unit 3", name: "Exchanger bundle pull — E-310 / E-314", resource: "Boilermaker", phaseId: "mech", hours: 2200 },
    { id: "u3-wa-5", activityNo: "05", wbs: "05", unit: "Unit 3", name: "Valve change-out 6\"–18\"", resource: "Pipefitter", phaseId: "mech", hours: 3100 },
    { id: "u3-wa-6", activityNo: "06", wbs: "06", unit: "Unit 3", name: "Hydro / reinstatement", resource: "Pipefitter", phaseId: "oil-in", hours: 740 },
  ],
  equipment: {
    largeTools: [
      { id: "u3-eq-1", itemId: "extractor-bundle-aerial-21ft", period: "daily", qty: 1, start: "2026-09-07", end: "2026-09-20", enteredCost: 0 },
      { id: "u3-eq-2", itemId: "welder-arc-100-300-amp-electric", period: "daily", qty: 6, start: "2026-09-07", end: "2026-09-20", enteredCost: 0 },
      { id: "u3-eq-3", itemId: "air-mover", period: "daily", qty: 4, start: "2026-09-07", end: "2026-09-20", enteredCost: 0 },
    ],
    thirdParty: [
      { id: "u3-tp-1", item: "160T crane", period: "daily", rate: 4200, freight: 1800, qty: 18, start: "2026-09-07", end: "2026-09-27" },
      { id: "u3-tp-2", item: "Manlift 60'", period: "daily", rate: 285, freight: 0, qty: 4, start: "2026-09-07", end: "2026-09-20" },
    ],
  },
  otherCost: {
    perDiemRate: 185,
    travel: [
      { id: "u3-tr-1", kind: "staff", name: "Night captain", traveler: true, mileageRate: 0.7, travelDollars: 2400 },
      { id: "u3-tr-2", kind: "craft", name: "Boilermaker crew", traveler: true, mileageRate: 0.7, travelDollars: 8600 },
    ],
    misc: [
      { id: "u3-mc-1", item: "Alloy rod", qty: 40, each: 85 },
      { id: "u3-mc-2", item: "Weld / cut gas", qty: 12, each: 420 },
      { id: "u3-mc-3", item: "Fire blanket", qty: 8, each: 95 },
    ],
  },
  fcr: {
    header: {
      pm: "Robert Henderson",
      costTracker: "TA-8841",
      publishDate: "2026-08-18",
      nte: "75000",
      projectScope: "Unit 3 mechanical extras found on walkdown",
    },
    log: [
      {
        id: "u3-fcr-014",
        scr: "CO-014",
        requestDate: "2026-08-18",
        requestedBy: "Ops",
        reviewedBy: "PM",
        status: "Open",
        scope: "Added hydro on 12\" transfer line after ops discovery",
        impact: "+1 night",
        impactLevel: "High",
        approvedBy: "Owner",
        approvalStatus: "Approved",
        approvalDate: "2026-08-19",
        approvedMh: 420,
        approvedCost: 44600,
        planChanges: "Add hydro window",
        revisedComp: "2026-09-28",
        notes: "Ops discovery after isolation list rev D",
        loggedBy: "Desk",
      },
      {
        id: "u3-fcr-011",
        scr: "CO-011",
        requestDate: "2026-08-09",
        requestedBy: "Engineering",
        reviewedBy: "PM",
        status: "Open",
        scope: "Additional blinds from isolation list rev D",
        impact: "Absorbed",
        impactLevel: "Low",
        approvedBy: "Owner",
        approvalStatus: "Approved",
        approvalDate: "2026-08-10",
        approvedMh: 210,
        approvedCost: 25750,
        planChanges: "Blind count up",
        revisedComp: "",
        notes: "",
        loggedBy: "Desk",
      },
    ],
    people: [
      {
        id: "u3-fcr-p1",
        block: "Craft Day",
        position: "Pipefitter Journeyman",
        weeks: 1,
        mileage: false,
        daysPd: 2,
        headcount: 4,
        week: { ...emptyWeek(), mo: { st: 10, ot: 0, dt: 0 }, tu: { st: 10, ot: 0, dt: 0 } },
        st: 20,
        ot: 0,
        dt: 0,
      },
    ],
    sub: 44600,
    equipment: 6200,
    misc: 21000,
    scr: {
      taRm: "TA-8841",
      categories: "Hydro / blinds",
      moc: "No",
      sap: "",
      costNote: "Hydro plus blinds from rev D",
      scheduleNote: "+1 night",
      signOff: "Ops / PM",
    },
  },
};

const cokerNight = (id: string, headcount: number) =>
  range(id, "mech", "2026-09-07", "2026-09-14", 12, headcount, DAYS_7, "Nights");

const COKER: ExamplePackage = {
  id: "est-coker",
  code: "EST-2610-CKR",
  title: "Coker drum valve package — T&M",
  client: "Madison / P66",
  siteId: "site-coker-pad",
  siteName: "Coker pad / drum alley",
  unit: "Coker",
  type: "T&M",
  window: "Night shift window",
  revision: "B",
  totalLabel: "$186,000",
  schedule: defaultPhaseSchedule(),
  jobMeta: { afeName: "TM-8902 Coker valves", area: "Drum A/B switch deck", perDiemRate: 185, mileageRate: 0.7 },
  crew: {
    otAfter8: false,
    staff: [
      craft("ck-staff", "Superintendent", "Nights", "$22,000", [cokerNight("ck-sup", 1)]),
    ],
    generalForeman: [
      craft("ck-gf", "General Foreman", "Nights", "$18,000", [cokerNight("ck-gf-r", 1)]),
    ],
    foreman: [
      craft("ck-fm", "Foreman", "Nights", "$16,000", [cokerNight("ck-fm-r", 1)]),
    ],
    direct: [
      craft("ck-pf", "Pipefitter Journeyman", "Nights", "$64,000", [cokerNight("ck-pf-r", 6)]),
      craft("ck-op", "Operator", "Nights", "$22,000", [cokerNight("ck-op-r", 2)]),
    ],
    support: [{ id: "ck-sup-hw", position: "Hole Watch", billedAs: "Laborer" }],
  },
  activities: [
    { id: "ck-wa-1", activityNo: "01", wbs: "01", unit: "Coker", name: "Drum valve isolation", resource: "Pipefitter", phaseId: "oil-out", hours: 180 },
    { id: "ck-wa-2", activityNo: "02", wbs: "02", unit: "Coker", name: "Switch-deck T&M extras", resource: "Pipefitter", phaseId: "mech", hours: 96 },
  ],
  equipment: {
    largeTools: [
      { id: "ck-eq-1", itemId: "pump-torque-console-10k-psi-thru-60k-ft-lb", period: "daily", qty: 1, start: "2026-09-07", end: "2026-09-14", enteredCost: 0 },
    ],
    thirdParty: [
      { id: "ck-tp-1", item: "Night light tower", period: "daily", rate: 95, freight: 0, qty: 2, start: "2026-09-07", end: "2026-09-14" },
    ],
  },
  otherCost: {
    perDiemRate: 185,
    travel: [{ id: "ck-tr-1", kind: "craft", name: "Night pipefitters", traveler: true, mileageRate: 0.7, travelDollars: 1800 }],
    misc: [{ id: "ck-mc-1", item: "Anti-seize", qty: 6, each: 48 }],
  },
  fcr: {
    header: {
      pm: "Night captain",
      costTracker: "TM-8902",
      publishDate: "2026-08-21",
      nte: "15000",
      projectScope: "Night-shift premium on switch deck",
    },
    log: [
      {
        id: "ck-fcr-003",
        scr: "SCR-003",
        requestDate: "2026-08-21",
        requestedBy: "Contractor",
        reviewedBy: "PM",
        status: "Open",
        scope: "Night-shift premium — coker switch deck",
        impact: "None",
        impactLevel: "Low",
        approvedBy: "",
        approvalStatus: "Pending",
        approvalDate: "",
        approvedMh: 96,
        approvedCost: 12800,
        planChanges: "",
        revisedComp: "",
        notes: "T&M extras",
        loggedBy: "Desk",
      },
    ],
    people: [
      {
        id: "ck-fcr-p1",
        block: "Craft Night",
        position: "Pipefitter Journeyman",
        weeks: 1,
        mileage: false,
        daysPd: 2,
        headcount: 2,
        week: { ...emptyWeek(), mo: { st: 0, ot: 12, dt: 0 }, tu: { st: 0, ot: 12, dt: 0 } },
        st: 0,
        ot: 24,
        dt: 0,
      },
    ],
    sub: 0,
    equipment: 0,
    misc: 12800,
    scr: {
      taRm: "TM-8902",
      categories: "Night premium",
      moc: "No",
      sap: "",
      costNote: "Switch-deck T&M extras",
      scheduleNote: "None",
      signOff: "Night captain",
    },
  },
};

const towerDays = (id: string, headcount: number) =>
  range(id, "mech", "2026-09-07", "2026-09-20", 10, headcount, DAYS_5);

const TOWER: ExamplePackage = {
  id: "est-tower",
  code: "EST-2608-CT",
  title: "Cooling-tower basin repair",
  client: "Confidential contractor",
  siteId: "site-madison",
  siteName: "Wood River",
  unit: "CT-2",
  type: "Lump sum",
  window: "Quote due Friday",
  revision: "A",
  totalLabel: "$410,000",
  schedule: defaultPhaseSchedule(),
  jobMeta: { afeName: "ES-8710 CT-2 basin", area: "Cooling towers", perDiemRate: 0, mileageRate: 0 },
  crew: {
    otAfter8: false,
    staff: [
      craft("ct-staff", "Project Controls", "Days", "$28,000", [towerDays("ct-pc", 1)]),
    ],
    generalForeman: [
      craft("ct-gf", "General Foreman", "Days", "$24,000", [towerDays("ct-gf-r", 1)]),
    ],
    foreman: [
      craft("ct-fm", "Foreman", "Days", "$22,000", [towerDays("ct-fm-r", 1)]),
    ],
    direct: [
      craft("ct-lb", "Laborer", "Days", "$96,000", [towerDays("ct-lb-r", 8)]),
      craft("ct-iw", "Ironworker Journeyman", "Days", "$78,000", [towerDays("ct-iw-r", 4)]),
    ],
    support: [{ id: "ct-sup-mh", position: "Material Handler", billedAs: "Laborer" }],
  },
  activities: [
    { id: "ct-wa-1", activityNo: "01", wbs: "01", unit: "CT-2", name: "Basin demo / shoring", resource: "Laborer", phaseId: "mech", hours: 640 },
    { id: "ct-wa-2", activityNo: "02", wbs: "02", unit: "CT-2", name: "Basin pour / cure watch", resource: "Laborer", phaseId: "post", hours: 220 },
  ],
  equipment: {
    ...emptyEquipmentSheet(),
    largeTools: [
      { id: "ct-eq-1", itemId: "trailer-flatbed", period: "weekly", qty: 1, start: "2026-09-07", end: "2026-09-20", enteredCost: 0 },
    ],
    thirdParty: [
      { id: "ct-tp-1", item: "Concrete pump", period: "daily", rate: 1800, freight: 400, qty: 3, start: "2026-09-14", end: "2026-09-16" },
    ],
  },
  otherCost: {
    perDiemRate: 0,
    travel: [{ id: "ct-tr-1", kind: "staff", name: "Civil lead", traveler: true, mileageRate: 0, travelDollars: 1200 }],
    misc: [
      { id: "ct-mc-1", item: "Steel", qty: 12, each: 640 },
      { id: "ct-mc-2", item: "Grinding wheels", qty: 20, each: 28 },
    ],
  },
  fcr: {
    header: {
      pm: "",
      costTracker: "ES-8710",
      publishDate: "",
      nte: "",
      projectScope: "Lump-sum basin. No extras unless released.",
    },
    log: [],
    people: [],
    sub: 0,
    equipment: 0,
    misc: 0,
    scr: {
      taRm: "ES-8710",
      categories: "",
      moc: "No",
      sap: "",
      costNote: "",
      scheduleNote: "On hold pending confined-space plan",
      signOff: "",
    },
  },
};

export const EXAMPLE_PACKAGES: Record<ExampleTemplateId, ExamplePackage> = {
  "est-u3": U3,
  "est-coker": COKER,
  "est-tower": TOWER,
};

export function isExampleTemplateId(value: string): value is ExampleTemplateId {
  return (EXAMPLE_TEMPLATE_IDS as readonly string[]).includes(value);
}

export function examplePackage(id: ExampleTemplateId): ExamplePackage {
  return EXAMPLE_PACKAGES[id];
}

export function exampleCrewLabor(pack: ExamplePackage) {
  return [...pack.crew.staff, ...pack.crew.generalForeman, ...pack.crew.foreman, ...pack.crew.direct].reduce(
    (sum, row) => sum + parseDeskDollars(row.cost),
    0,
  );
}

export function exampleRail(pack: ExamplePackage) {
  const tools = equipmentTotals(pack.equipment).largeTools;
  const thirdCost = pack.equipment.thirdParty.reduce((sum, line) => sum + thirdPartyCost(line), 0);
  const thirdMarked = pack.equipment.thirdParty.reduce((sum, line) => sum + thirdPartyMarkedUp(line), 0);
  return estimateTotalBreakdown({
    labor: exampleCrewLabor(pack),
    equipment: tools + thirdCost,
    markup: Math.round((thirdMarked - thirdCost) * 100) / 100,
    otherCost: otherCostTotals(pack.otherCost, 0).total,
    changeOrders: fcrSummary(pack.fcr, 0, pack.jobMeta.perDiemRate).total,
    hours: pack.activities.reduce((sum, row) => sum + row.hours, 0),
    client: pack.client,
    site: pack.siteName,
  });
}

export function exampleHasFilledTabs(pack: ExamplePackage) {
  const staffing = generateStaffingPlan({
    site: pack.siteName,
    client: pack.client,
    phases: pack.schedule.phases,
    crew: pack.crew,
  });
  const staffRows = visibleStaffingRows(staffing, false);
  return {
    jobSetup: Boolean(pack.client && pack.siteName && pack.unit && pack.type && pack.schedule.phases.some((row) => row.on && row.start && row.stop)),
    activities: pack.activities.length > 0 && pack.activities.every((row) => row.name && row.wbs),
    crew:
      pack.crew.staff.length > 0 &&
      pack.crew.generalForeman.length > 0 &&
      pack.crew.foreman.length > 0 &&
      pack.crew.direct.length > 0 &&
      pack.crew.support.length > 0,
    staffing: staffRows.some((row) => row.hasAny),
    equipment: pack.equipment.largeTools.length + pack.equipment.thirdParty.length > 0,
    otherCost: pack.otherCost.travel.length + pack.otherCost.misc.length > 0,
    changeOrders: pack.id === "est-tower" ? true : pack.fcr.log.length > 0,
  };
}

export function emptyExampleCrew(): ExampleCrew {
  return { staff: [], generalForeman: [], foreman: [], direct: [], support: [], otAfter8: false };
}
