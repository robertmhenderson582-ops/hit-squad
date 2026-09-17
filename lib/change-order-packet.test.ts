import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  APPROVAL_STATUSES,
  addClaimLine,
  addCraftLine,
  addLogRow,
  CLAIMABLE_COST_PRESETS,
  CLAIMABLE_COST_TYPES,
  claimTypeNeedsHours,
  CONTRACTOR_LOG_COLUMNS,
  blankClaimLine,
  blankCraftLine,
  blankLogRow,
  changeOrderNoun,
  changeOrderTabLabel,
  craftLineHours,
  craftLineLabor,
  DEFAULT_CHANGE_ORDER_SHELL,
  emptyFcrHeader,
  emptyFcrPacket,
  emptyScr,
  emptyWeek,
  fcrBlockFor,
  fcrPacketHasWork,
  fcrSummary,
  FCR_BLOCKS,
  FCR_STORE_PREFIX,
  IMPACT_LEVELS,
  LOG_STATUSES,
  logRowScope,
  mileageDollars,
  MILEAGE_YES_FLAT,
  parseFcrPacket,
  peopleFromJob,
  peopleHours,
  readFcrPacket,
  usesEcrCopy,
  writeFcrPacket,
} from "./change-order-packet.ts";
import { scrCompositeRates } from "./scr-rates.ts";

const WOOD = "Wood River — Roxana, IL";
const P66 = "Phillips 66";

function range(partial: {
  start: string;
  end: string;
  hoursPerShift: number;
  days?: boolean[];
  headcount?: number;
  nightHeadcount?: number;
  perDiemPeople?: number;
  nightPerDiemPeople?: number;
}) {
  return {
    start: partial.start,
    end: partial.end,
    hoursPerShift: partial.hoursPerShift,
    headcount: partial.headcount ?? 1,
    nightHeadcount: partial.nightHeadcount ?? 0,
    perDiemPeople: partial.perDiemPeople ?? 1,
    nightPerDiemPeople: partial.nightPerDiemPeople ?? 0,
    days: partial.days ?? [false, true, true, true, true, true, false],
  };
}

test("V1 on-job packet shape stays locked to the Drive books", () => {
  assert.deepEqual([...LOG_STATUSES], ["Open", "Pending", "Cancelled"]);
  assert.deepEqual([...IMPACT_LEVELS], ["Low", "High", "Critical"]);
  assert.deepEqual([...APPROVAL_STATUSES], ["Approved", "Pending"]);
  assert.deepEqual([...FCR_BLOCKS], ["Staff Day", "Staff Night", "Craft Day", "Craft Night"]);
  assert.deepEqual(Object.keys(emptyFcrHeader()), [
    "pm",
    "costTracker",
    "publishDate",
    "nte",
    "projectScope",
  ]);
  assert.deepEqual(Object.keys(blankLogRow()).filter((key) => key !== "id"), [
    "scr",
    "requestDate",
    "requestedBy",
    "reviewedBy",
    "status",
    "scope",
    "impact",
    "impactLevel",
    "approvedBy",
    "approvalStatus",
    "approvalDate",
    "approvedMh",
    "approvedCost",
    "planChanges",
    "revisedComp",
    "notes",
    "loggedBy",
    "scopeHours",
    "scopeCost",
    "craftLines",
    "claimLines",
  ]);
  assert.deepEqual(Object.keys(emptyScr()), [
    "taRm",
    "categories",
    "moc",
    "sap",
    "costNote",
    "scheduleNote",
    "signOff",
  ]);
});

test("mileage Yes is a flat $2500, never times headcount", () => {
  assert.equal(MILEAGE_YES_FLAT, 2500);
  assert.equal(mileageDollars(true), 2500);
  assert.equal(mileageDollars(false), 0);
  const packet = {
    header: { pm: "", costTracker: "", publishDate: "", nte: "", projectScope: "" },
    log: [],
    people: [
      {
        id: "a",
        block: "Craft Day" as const,
        position: "Boilermaker Journeyman",
        weeks: 1,
        mileage: true,
        daysPd: 0,
        headcount: 2,
        week: emptyWeek(),
        st: 0,
        ot: 0,
        dt: 0,
      },
      {
        id: "b",
        block: "Craft Day" as const,
        position: "Pipefitter Journeyman",
        weeks: 1,
        mileage: true,
        daysPd: 0,
        headcount: 2,
        week: emptyWeek(),
        st: 0,
        ot: 0,
        dt: 0,
      },
    ],
    sub: 0,
    equipment: 0,
    misc: 0,
    scr: { taRm: "", categories: "", moc: "", sap: "", costNote: "", scheduleNote: "", signOff: "" },
  };
  assert.equal(fcrSummary(packet).mileage, 5000);
});

test("people land on Staff/Craft Day/Night from this job", () => {
  assert.equal(fcrBlockFor("Cost Analyst", "Days"), "Staff Day");
  assert.equal(fcrBlockFor("Superintendent", "Nights"), "Staff Night");
  assert.equal(fcrBlockFor("Boilermaker Journeyman", "Days"), "Craft Day");
  assert.equal(fcrBlockFor("Boilermaker Journeyman", "Days & nights"), "Craft Day");
  const rows = peopleFromJob([
    { id: "1", position: "Project Manager", shift: "Days", hours: { st: 40, ot: 0, dt: 0, pd: 5, hours: 40, workedDays: 5 } },
  ]);
  assert.equal(rows[0]?.block, "Staff Day");
  assert.equal(rows[0]?.daysPd, 5);
});

test("10s are 8 ST + 2 OT; 12s are 8+4; East Coast never DT after 12", () => {
  const tens = peopleFromJob(
    [
      {
        id: "10s",
        position: "Boilermaker Journeyman",
        shift: "Days",
        ranges: [range({ start: "2026-09-07", end: "2026-09-11", hoursPerShift: 10 })],
      },
    ],
    WOOD,
    P66,
  );
  assert.equal(tens[0]?.week.mo.st, 8);
  assert.equal(tens[0]?.week.mo.ot, 2);
  assert.equal(tens[0]?.week.th.st, 8);
  assert.equal(tens[0]?.week.fr.st, 8);
  assert.equal(tens[0]?.week.fr.ot, 2);
  assert.equal(tens[0]?.week.sa.st + tens[0]?.week.sa.ot + tens[0]?.week.sa.dt, 0);
  assert.equal(tens[0]?.st, 40);
  assert.equal(tens[0]?.ot, 10);

  const twelves = peopleFromJob(
    [
      {
        id: "12s",
        position: "Pipefitter Journeyman",
        shift: "Days",
        ranges: [range({ start: "2026-09-07", end: "2026-09-11", hoursPerShift: 12 })],
      },
    ],
    WOOD,
    P66,
  );
  assert.equal(twelves[0]?.week.mo.st, 8);
  assert.equal(twelves[0]?.week.mo.ot, 4);
  assert.equal(twelves[0]?.week.mo.dt, 0);
  assert.equal(twelves[0]?.dt, 0);
});

test("Saturday is all OT for craft; Sunday is DT", () => {
  const rows = peopleFromJob(
    [
      {
        id: "wknd",
        position: "Welder",
        shift: "Days",
        ranges: [
          range({
            start: "2026-09-07",
            end: "2026-09-13",
            hoursPerShift: 10,
            days: [true, true, true, true, true, true, true],
          }),
        ],
      },
    ],
    WOOD,
    P66,
  );
  assert.equal(rows[0]?.week.sa.st, 0);
  assert.equal(rows[0]?.week.sa.ot, 10);
  assert.equal(rows[0]?.week.sa.dt, 0);
  assert.equal(rows[0]?.week.su.dt, 10);
  assert.equal(rows[0]?.dt, 10);
});

test("Days & nights splits into Day and Night blocks from this job", () => {
  const rows = peopleFromJob(
    [
      {
        id: "dual",
        position: "Boilermaker Journeyman",
        shift: "Days & nights",
        ranges: [
          range({
            start: "2026-09-07",
            end: "2026-09-07",
            hoursPerShift: 10,
            days: [false, true, false, false, false, false, false],
            headcount: 1,
            nightHeadcount: 1,
            perDiemPeople: 1,
            nightPerDiemPeople: 1,
          }),
        ],
      },
    ],
    WOOD,
    P66,
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.block, "Craft Day");
  assert.equal(rows[1]?.block, "Craft Night");
  assert.equal(rows[0]?.week.mo.st, 8);
  assert.equal(rows[0]?.week.mo.ot, 2);
  assert.equal(rows[1]?.week.mo.st, 8);
  assert.equal(rows[1]?.week.mo.ot, 2);
});

test("summary uses this job hours and PD, not a shipped rate tab", () => {
  const people = peopleFromJob(
    [
      {
        id: "pm",
        position: "Project Manager",
        shift: "Days",
        ranges: [range({ start: "2026-09-07", end: "2026-09-11", hoursPerShift: 10, perDiemPeople: 1 })],
      },
    ],
    WOOD,
    P66,
  );
  people[0].mileage = true;
  const summary = fcrSummary(
    {
      header: { pm: "", costTracker: "", publishDate: "", nte: "", projectScope: "" },
      log: [],
      people,
      sub: 100,
      equipment: 50,
      misc: 25,
      scr: { taRm: "", categories: "", moc: "", sap: "", costNote: "", scheduleNote: "", signOff: "" },
    },
    0,
    185,
  );
  assert.equal(summary.staffHours, 50);
  assert.equal(summary.staffLabor, 0);
  assert.equal(summary.craftLabor, 0);
  assert.equal(summary.perDiem, 5 * 185);
  assert.equal(summary.mileage, 2500);
  assert.equal(summary.sub, 100);
  assert.equal(peopleHours(people[0]), 50);
});

function memoryStore(seed: Record<string, string> = {}) {
  const data = { ...seed };
  return {
    getItem(key: string) {
      return key in data ? data[key] : null;
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
  };
}

test("P66 / Wood River and the unset default read ECR; Log is the field home", () => {
  assert.equal(DEFAULT_CHANGE_ORDER_SHELL, "Log");
  assert.equal(usesEcrCopy(), true);
  assert.equal(usesEcrCopy("Phillips 66", "Wood River — Roxana, IL"), true);
  assert.equal(usesEcrCopy("P66", "Madison"), true);
  assert.equal(changeOrderNoun("Phillips 66", WOOD), "ECR");
  assert.equal(changeOrderTabLabel("Phillips 66", WOOD), "Change Orders");
  assert.equal(changeOrderNoun("Georgia Power", "Plant Yates"), "FCR");
  assert.equal(changeOrderTabLabel("Georgia Power", "Plant Yates"), "Change Orders");
  assert.deepEqual(
    CONTRACTOR_LOG_COLUMNS.map((column) => column.key),
    ["scr", "requestDate", "requestedBy", "status", "scope"],
  );
  const contractorKeys = CONTRACTOR_LOG_COLUMNS.map((column) => column.key as string);
  assert.equal(contractorKeys.includes("reviewedBy"), false);
  assert.equal(contractorKeys.includes("approvedCost"), false);
  const packet = readFileSync(fileURLToPath(new URL("../components/ChangeOrderPacket.tsx", import.meta.url)), "utf8");
  assert.match(packet, /changeOrderNoun/);
  assert.match(packet, /DEFAULT_CHANGE_ORDER_SHELL/);
  assert.match(packet, /onEstimateSheets/);
  assert.match(packet, /addLogRow/);
  assert.match(packet, /CONTRACTOR_LOG_COLUMNS/);
  assert.match(packet, /Change Orders log/);
  assert.match(packet, /Scope change hours/);
  assert.match(packet, /Scope change money/);
  assert.match(packet, /\+ Add craft/);
  assert.match(packet, /Claimable costs/);
  assert.match(packet, /Third-party rental/);
  assert.match(packet, /Material/);
  assert.match(packet, /CLAIMABLE_COST_TYPES/);
  assert.match(packet, /from \"@\/lib\/scr-rates\"/);
  assert.match(packet, /scrToXlsx/);
  assert.match(packet, /downloadXlsx/);
  assert.match(packet, /BuildingFileModal/);
  assert.match(packet, /Export Excel/);
  assert.match(packet, /company-logo/);
  assert.match(packet, /exporterDisplayName/);
  assert.doesNotMatch(packet, /Reviewed By/);
  assert.doesNotMatch(packet, /Approved Cost/);
  assert.doesNotMatch(packet, /Logged By/);
  assert.doesNotMatch(packet, /On-job FCR packet/);
  assert.doesNotMatch(packet, /\+ Add FCR/);
  assert.doesNotMatch(packet, /Load from Crew/);
  assert.doesNotMatch(packet, /FCR_DAY_LABELS/);
  const workspace = readFileSync(fileURLToPath(new URL("../components/EstimateWorkspace.tsx", import.meta.url)), "utf8");
  const tabs = readFileSync(fileURLToPath(new URL("./estimate-tabs.ts", import.meta.url)), "utf8");
  assert.match(tabs, /changeOrderTabLabel/);
  assert.match(workspace, /estimateTabsForSite|BASE_ESTIMATE_TABS/);
});

test("adding an ECR log row persists on the store and survives a re-read", () => {
  const store = memoryStore();
  const key = "new:new-cat2pit";
  const next = addLogRow(emptyFcrPacket(), {
    id: "ecr-1",
    scr: "ECR-12",
    scope: "Extra weld on exchanger",
    requestedBy: "Ben Peffley",
    loggedBy: "Ben Peffley",
  });
  writeFcrPacket(key, next, store);
  assert.equal(store.getItem(`${FCR_STORE_PREFIX}${key}`)?.includes("Extra weld on exchanger"), true);
  const read = readFcrPacket(key, store);
  assert.equal(read.log.length, 1);
  assert.equal(read.log[0]?.id, "ecr-1");
  assert.equal(read.log[0]?.scr, "ECR-12");
  assert.equal(read.log[0]?.scope, "Extra weld on exchanger");
  assert.equal(read.log[0]?.requestedBy, "Ben Peffley");
  assert.equal(fcrPacketHasWork(read), true);
});

test("parse + store round-trip keeps Monroe header and log after a fresh device cache", () => {
  const phone = memoryStore();
  const key = "new:new-cat2pit";
  const packet = parseFcrPacket({
    header: { pm: "Ben Peffley", costTracker: "CT-4", publishDate: "2026-09-05", nte: "25000", projectScope: "Pit stop extras" },
    log: [{ id: "ecr-2", status: "Open", scope: "Night hydrotest", impactLevel: "High" }],
    people: [],
    sub: 0,
    equipment: 0,
    misc: 0,
    scr: { taRm: "TA-9" },
  });
  writeFcrPacket(key, packet, phone);
  const desktop = memoryStore();
  const raw = phone.getItem(`${FCR_STORE_PREFIX}${key}`);
  assert.ok(raw);
  desktop.setItem(`${FCR_STORE_PREFIX}${key}`, raw);
  const hydrated = readFcrPacket(key, desktop);
  assert.equal(hydrated.header.pm, "Ben Peffley");
  assert.equal(hydrated.header.nte, "25000");
  assert.equal(hydrated.log[0]?.scope, "Night hydrotest");
  assert.equal(hydrated.log[0]?.impactLevel, "High");
  assert.equal(hydrated.scr.taRm, "TA-9");
  assert.equal(fcrPacketHasWork({ header: { pm: "Ben" } }), true);
});

test("scope change holds hours and money without a workbook", () => {
  const row = { ...blankLogRow(), scope: "Night hydrotest", scopeHours: 12, scopeCost: 1800 };
  const scope = logRowScope(row);
  assert.equal(scope.hasLines, false);
  assert.equal(scope.hours, 12);
  assert.equal(scope.cost, 1800);
  const packet = addLogRow(emptyFcrPacket(), { id: "scr-typed", scopeHours: 12, scopeCost: 1800 });
  const summary = fcrSummary(packet);
  assert.equal(summary.scrHours, 12);
  assert.equal(summary.scrTyped, 1800);
  assert.equal(summary.scrCost, 1800);
  assert.equal(summary.total, 1800);
});

test("craft labor is hours × composite ST/OT and DT is optional", () => {
  const stOt = blankCraftLine({
    id: "bm",
    craft: "Boilermaker Journeyman",
    stHours: 8,
    otHours: 2,
    stRate: 100,
    otRate: 150,
  });
  assert.equal(craftLineHours(stOt), 10);
  assert.equal(craftLineLabor(stOt), 8 * 100 + 2 * 150);
  const withDt = blankCraftLine({ ...stOt, dtHours: 4, dtRate: 200 });
  assert.equal(craftLineHours(withDt), 14);
  assert.equal(craftLineLabor(withDt), 800 + 300 + 800);
  const zeroDt = blankCraftLine({ ...stOt, dtHours: 0, dtRate: 200 });
  assert.equal(craftLineLabor(zeroDt), 1100);
});

test("SCR total rolls craft labor plus claimable cost lines", () => {
  assert.deepEqual([...CLAIMABLE_COST_PRESETS], ["Subcontractor", "Third-party rental", "Material"]);
  assert.deepEqual([...CLAIMABLE_COST_TYPES], [
    "Subcontractor",
    "Third-party rental",
    "Material",
    "Equipment",
    "Travel",
    "Other",
  ]);
  assert.equal(CLAIMABLE_COST_TYPES.includes("Material"), true);
  assert.equal(claimTypeNeedsHours("Subcontractor"), true);
  assert.equal(claimTypeNeedsHours("Third-party rental"), false);
  assert.equal(claimTypeNeedsHours("Material"), false);
  assert.equal(claimTypeNeedsHours("Custom labor"), true);
  let packet = addLogRow(emptyFcrPacket(), { id: "scr-1", scr: "SCR-4", scope: "Extra weld", scopeHours: 99, scopeCost: 9 });
  packet = addCraftLine(packet, "scr-1", {
    id: "c1",
    craft: "Pipefitter Journeyman",
    stHours: 10,
    otHours: 2,
    stRate: 80,
    otRate: 120,
  });
  packet = addClaimLine(packet, "scr-1", {
    id: "cl1",
    type: "Subcontractor",
    description: "NDE truck",
    amount: 1500,
    hours: 6,
  });
  packet = addClaimLine(packet, "scr-1", {
    id: "cl2",
    type: "Third-party rental",
    description: "40-ton crane",
    amount: 2400,
  });
  packet = addClaimLine(packet, "scr-1", {
    id: "cl3",
    type: "Material",
    description: "Alloy rod",
    amount: 375,
  });
  const row = packet.log[0];
  assert.ok(row);
  const scope = logRowScope(row);
  assert.equal(scope.hasLines, true);
  assert.equal(scope.labor, 10 * 80 + 2 * 120);
  assert.equal(scope.claims, 4275);
  assert.equal(scope.hours, 12 + 6);
  assert.equal(scope.cost, 1040 + 4275);
  assert.equal(row.scopeHours, scope.hours);
  assert.equal(row.scopeCost, scope.cost);
  const summary = fcrSummary({ ...packet, sub: 100, equipment: 50, misc: 25 });
  assert.equal(summary.scrLabor, 1040);
  assert.equal(summary.scrClaims, 4275);
  assert.equal(summary.scrTyped, 0);
  assert.equal(summary.scrCost, 5315);
  assert.equal(summary.sub, 100);
  assert.equal(summary.total, 5315 + 175);
});

test("SCR estimate craft + claim lines persist on the store", () => {
  const store = memoryStore();
  const key = "new:new-scr-desk";
  const packet = parseFcrPacket({
    log: [
      {
        id: "scr-9",
        scr: "SCR-9",
        scope: "Night hydrotest",
        craftLines: [{ id: "c1", craft: "Welder", stHours: 8, otHours: 0, stRate: 90, otRate: 135 }],
        claimLines: [{ id: "cl1", type: "Third-party rental", description: "Light plant", amount: 400 }],
      },
    ],
  });
  writeFcrPacket(key, packet, store);
  const read = readFcrPacket(key, store);
  assert.equal(read.log[0]?.craftLines[0]?.craft, "Welder");
  assert.equal(read.log[0]?.craftLines[0]?.stHours, 8);
  assert.equal(read.log[0]?.craftLines[0]?.stRate, 90);
  assert.equal(read.log[0]?.claimLines[0]?.type, "Third-party rental");
  assert.equal(read.log[0]?.claimLines[0]?.amount, 400);
  assert.equal(read.log[0]?.scopeHours, 8);
  assert.equal(read.log[0]?.scopeCost, 8 * 90 + 400);
  assert.equal(fcrSummary(read).total, 1120);
});

test("composite ST/OT come from the plant book, not invented rates", () => {
  const rates = scrCompositeRates("Boilermaker Journeyman", WOOD, P66);
  assert.equal(rates.st, 108.38);
  assert.equal(rates.ot, 152.78);
  assert.equal(rates.dt, 197.19);
  const empty = scrCompositeRates("", WOOD, P66);
  assert.deepEqual(empty, { st: 0, ot: 0, dt: 0 });
});
