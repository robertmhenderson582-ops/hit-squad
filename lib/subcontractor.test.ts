import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AFFILIATE_LABEL,
  SUB_BOOK_KEY,
  SUB_STORE_PREFIX,
  affiliateAfterVendorChange,
  applyBookRate,
  applyTypedAmount,
  applyVendorName,
  blankSubCard,
  blankSubLine,
  emptySubBook,
  laborHoursCost,
  lineAmount,
  lineQty,
  looksLikeJvic,
  normalizeSubBook,
  normalizeSubSheet,
  oneOffUnitsFor,
  readSubBook,
  readSubSheet,
  subCardTotal,
  subEquipAmount,
  subLaborCost,
  subcontractorMarkupBase,
  subcontractorTotal,
  writeSubBook,
  writeSubSheet,
} from "./subcontractor.ts";
import { ESTIMATE_MARKUP_RATE, estimateMarkupDollars, estimateTotalBreakdown } from "./estimate-total.ts";

function memoryStore(seed: Record<string, string> = {}) {
  const data = { ...seed };
  return {
    getItem(key: string) {
      return key in data ? data[key] : null;
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
    removeItem(key: string) {
      delete data[key];
    },
    get length() {
      return Object.keys(data).length;
    },
    key(index: number) {
      return Object.keys(data)[index] ?? null;
    },
  };
}

test("amount is qty times rate", () => {
  assert.equal(lineAmount({ qty: 3, unit: "day", rate: 400 }), 1200);
  assert.equal(lineAmount({ qty: 8, unit: "hour", rate: 125 }), 1000);
  assert.equal(lineAmount({ qty: 0, unit: "each", rate: 50 }), 0);
});

test("one-off picker drops Hour; old hour rows still load", () => {
  assert.deepEqual(oneOffUnitsFor("LS"), ["LS", "day", "each"]);
  assert.deepEqual(oneOffUnitsFor("day"), ["LS", "day", "each"]);
  assert.deepEqual(oneOffUnitsFor("hour"), ["LS", "hour", "day", "each"]);
  const old = normalizeSubSheet({
    lines: [{ id: "a", vendor: "Trucking Company", scope: "Haul", qty: 1, unit: "hour", rate: 1000 }],
  });
  assert.equal(old.lines[0].unit, "hour");
  assert.equal(old.lines[0].qty, 1);
  assert.equal(lineAmount(old.lines[0]), 1000);
});

test("lump sum uses qty 1, or the typed amount", () => {
  assert.equal(lineQty({ qty: 0, unit: "LS" }), 1);
  assert.equal(lineAmount({ qty: 0, unit: "LS", rate: 8500 }), 8500);
  assert.equal(lineAmount({ qty: 1, unit: "LS", rate: 8500 }), 8500);
  const typed = applyTypedAmount({ ...blankSubLine(), unit: "LS", qty: 0, rate: 0 }, 12500);
  assert.equal(typed.qty, 1);
  assert.equal(typed.rate, 12500);
  assert.equal(lineAmount(typed), 12500);
});

test("empty book stays empty — no canned vendors", () => {
  assert.deepEqual(emptySubBook(), []);
  assert.deepEqual(normalizeSubBook(undefined), []);
  assert.deepEqual(normalizeSubBook([]), []);
  assert.deepEqual(readSubBook(memoryStore()), []);
  const store = memoryStore();
  writeSubBook([], store);
  assert.equal(store.getItem(SUB_BOOK_KEY), "[]");
  assert.equal(JSON.stringify(readSubBook(store)).includes("Insulation"), false);
  assert.equal(JSON.stringify(readSubBook(store)).includes("vendor"), false);
});

test("pick from the book fills vendor, scope, unit, and rate", () => {
  const line = applyBookRate(blankSubLine(), {
    id: "sr-1",
    vendor: "Apex NDE",
    scope: "RT film",
    unit: "each",
    rate: 85,
  });
  assert.equal(line.vendor, "Apex NDE");
  assert.equal(line.scope, "RT film");
  assert.equal(line.unit, "each");
  assert.equal(line.rate, 85);
  assert.equal(line.bookId, "sr-1");
  assert.equal(lineAmount(line), 85);
});

test("sheet persist keeps rows and the rail total is Subcontractor, not labor", () => {
  const store = memoryStore();
  const key = "new:new-cat2pit";
  writeSubSheet(
    key,
    {
      lines: [
        { id: "a", vendor: "Apex NDE", scope: "RT", qty: 2, unit: "each", rate: 85 },
        { id: "b", vendor: "Rig Co", scope: "Crane LS", qty: 0, unit: "LS", rate: 4000 },
      ],
    },
    store,
  );
  const saved = readSubSheet(key, store);
  assert.equal(saved.lines.length, 2);
  assert.equal(lineAmount(saved.lines[0]), 170);
  assert.equal(lineAmount(saved.lines[1]), 4000);
  assert.equal(subcontractorTotal(saved), 4170);
  assert.ok(store.getItem(`${SUB_STORE_PREFIX}${key}`));

  const rail = estimateTotalBreakdown({
    labor: 9000,
    equipment: 500,
    otherCost: 250,
    subcontractor: subcontractorTotal(saved),
    hours: 40,
  });
  assert.equal(rail.lines.find((line) => line.id === "subcontractor")?.amount, 4170);
  assert.equal(rail.lines.find((line) => line.id === "subcontractor")?.label, "Subcontractor");
  assert.equal(rail.lines.find((line) => line.id === "labor")?.amount, 9000);
  assert.equal(rail.total, 9000 + 500 + 250 + 4170);
  assert.equal(
    rail.lines.some((line) => line.id === "labor" && line.amount === 4170),
    false,
  );
});

test("labor hours times typed ST/OT/DT rates", () => {
  assert.equal(laborHoursCost({ st: 10, ot: 4, dt: 2 }, { stRate: 80, otRate: 120, dtRate: 160 }), 1600);
  assert.equal(laborHoursCost({ st: 8, ot: 0, dt: 0 }, { stRate: 95, otRate: 142.5, dtRate: 190 }), 760);
  assert.equal(laborHoursCost({ st: 0, ot: 0, dt: 0 }, { stRate: 80, otRate: 120, dtRate: 160 }), 0);

  const welder = {
    id: "sl-1",
    position: "Welder",
    stRate: 85,
    otRate: 127.5,
    dtRate: 170,
    shift: "Days" as const,
    clockOverride: "auto" as const,
    ranges: [
      {
        id: "rg-1",
        start: "2026-10-05",
        end: "2026-10-05",
        headcount: 1,
        nightHeadcount: 1,
        hoursPerShift: 10,
        perDiemPeople: 0,
        days: [false, true, true, true, true, true, false],
      },
    ],
  };
  const dollars = subLaborCost(welder, "Wood River Refinery", "Phillips 66");
  assert.equal(dollars, 8 * 85 + 2 * 127.5);
  assert.equal(dollars > 0, true);
});

test("equipment cost is rate times qty plus freight", () => {
  assert.equal(subEquipAmount({ rate: 400, qty: 3, freight: 0, period: "daily" }), 1200);
  assert.equal(subEquipAmount({ rate: 400, qty: 3, freight: 50, period: "daily" }), 1250);
  assert.equal(subEquipAmount({ rate: 0, qty: 5, freight: 80, period: "daily" }), 80);
  assert.equal(subEquipAmount({ rate: 250, qty: 0, freight: 0, period: "daily" }), 0);
});

test("equipment date span multiplies daily/weekly/monthly; each ignores dates", () => {
  assert.equal(
    subEquipAmount({ rate: 400, qty: 1, freight: 0, period: "daily", start: "2026-10-05", end: "2026-10-07" }),
    1200,
  );
  assert.equal(
    subEquipAmount({ rate: 100, qty: 2, freight: 10, period: "each", start: "2026-10-05", end: "2026-10-07" }),
    210,
  );
  const saved = normalizeSubSheet({
    cards: [
      {
        id: "sc-eq",
        vendor: "Rig Co",
        kind: "equipment",
        labor: [],
        equipment: [
          {
            id: "se-1",
            description: "Scaffold",
            period: "daily",
            rate: 400,
            qty: 1,
            freight: 50,
            start: "2026-10-05",
            end: "2026-10-07",
          },
        ],
      },
    ],
  });
  assert.equal(saved.cards[0].equipment[0].start, "2026-10-05");
  assert.equal(saved.cards[0].equipment[0].end, "2026-10-07");
  assert.equal(subEquipAmount(saved.cards[0].equipment[0]), 1250);
});

test("vendor cards roll labor and equipment into Subcontractor, not Crew or Equipment", () => {
  const card = {
    ...blankSubCard(),
    id: "sc-1",
    vendor: "Apex Insulation",
    kind: "both" as const,
    labor: [
      {
        id: "sl-1",
        position: "Insulator",
        stRate: 80,
        otRate: 120,
        dtRate: 160,
        shift: "Days" as const,
        clockOverride: "auto" as const,
        ranges: [
          {
            id: "rg-1",
            start: "2026-10-05",
            end: "2026-10-05",
            headcount: 1,
            nightHeadcount: 1,
            hoursPerShift: 10,
            perDiemPeople: 0,
            days: [false, true, true, true, true, true, false],
          },
        ],
      },
    ],
    equipment: [{ id: "se-1", description: "Scaffold tower", period: "daily" as const, rate: 400, qty: 3, freight: 50 }],
  };
  const labor = subLaborCost(card.labor[0], "Wood River Refinery", "Phillips 66");
  const equipment = subEquipAmount(card.equipment[0]);
  assert.equal(labor, 880);
  assert.equal(equipment, 1250);
  assert.equal(subCardTotal(card, { site: "Wood River Refinery", client: "Phillips 66" }), 2130);

  const store = memoryStore();
  writeSubSheet(
    "new:new-cards",
    {
      lines: [{ id: "a", vendor: "Apex NDE", scope: "RT", qty: 2, unit: "each", rate: 85 }],
      cards: [card],
    },
    store,
  );
  const saved = readSubSheet("new:new-cards", store);
  assert.equal(saved.lines.length, 1);
  assert.equal(saved.cards.length, 1);
  assert.equal(saved.cards[0].labor[0].stRate, 80);
  assert.equal(saved.cards[0].labor[0].ranges[0].hoursPerShift, 10);
  assert.equal(saved.cards[0].equipment[0].qty, 3);
  const total = subcontractorTotal(saved, { site: "Wood River Refinery", client: "Phillips 66" });
  assert.equal(total, 170 + 2130);

  const rail = estimateTotalBreakdown({
    labor: 9000,
    equipment: 500,
    otherCost: 250,
    subcontractor: total,
    hours: 40,
  });
  assert.equal(rail.lines.find((line) => line.id === "subcontractor")?.amount, 2300);
  assert.equal(rail.lines.find((line) => line.id === "labor")?.amount, 9000);
  assert.equal(rail.lines.find((line) => line.id === "equipment")?.amount, 500);
  assert.equal(rail.total, 9000 + 500 + 250 + 2300);
});

test("old sheets without cards keep their lines; normalize does not wipe qty or dates", () => {
  const old = normalizeSubSheet({
    lines: [{ id: "a", vendor: "Rig Co", scope: "Crane LS", qty: 1, unit: "LS", rate: 4000 }],
  });
  assert.equal(old.lines.length, 1);
  assert.equal(old.lines[0].qty, 1);
  assert.equal(old.lines[0].rate, 4000);
  assert.deepEqual(old.cards, []);
  assert.equal(subcontractorTotal(old), 4000);

  const withHours = normalizeSubSheet({
    lines: [{ id: "a", vendor: "Rig Co", scope: "Crane LS", qty: 2, unit: "day", rate: 1500 }],
    cards: [
      {
        id: "sc-keep",
        vendor: "Field Co",
        kind: "labor",
        equipment: [],
        labor: [
          {
            id: "sl-keep",
            position: "Fitter",
            stRate: 90,
            otRate: 135,
            dtRate: 180,
            shift: "Days" as const,
            clockOverride: "auto" as const,
            ranges: [
              {
                id: "rg-keep",
                start: "2026-09-14",
                end: "2026-09-18",
                hoursPerShift: 12,
                headcount: 2,
                nightHeadcount: 1,
                perDiemPeople: 0,
                days: [false, true, true, true, true, true, false],
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(withHours.lines[0].qty, 2);
  assert.equal(withHours.cards[0].labor[0].ranges[0].start, "2026-09-14");
  assert.equal(withHours.cards[0].labor[0].ranges[0].end, "2026-09-18");
  assert.equal(withHours.cards[0].labor[0].ranges[0].hoursPerShift, 12);
  assert.equal(withHours.cards[0].labor[0].ranges[0].headcount, 2);
});

function dayLaborCard(vendor: string, affiliate = false, stRate = 80) {
  return {
    ...blankSubCard(),
    id: `sc-${vendor.replace(/\W+/g, "").toLowerCase() || "card"}`,
    vendor,
    kind: "labor" as const,
    affiliate,
    labor: [
      {
        id: "sl-1",
        position: "Welder",
        stRate,
        otRate: 120,
        dtRate: 160,
        shift: "Days" as const,
        clockOverride: "auto" as const,
        ranges: [
          {
            id: "rg-1",
            start: "2026-10-05",
            end: "2026-10-05",
            headcount: 1,
            nightHeadcount: 1,
            hoursPerShift: 10,
            perDiemPeople: 0,
            days: [false, true, true, true, true, true, false],
          },
        ],
      },
    ],
    equipment: [],
  };
}

const WR = { site: "Wood River Refinery", client: "Phillips 66" };

test("JVIC name match is case-insensitive and ignores dots, spaces, and .com", () => {
  assert.equal(AFFILIATE_LABEL, "Affiliate — no markup");
  for (const name of ["JVIC", "jvic", "J.V.I.C.", "J V I C", "jvic.com", "JVIC Insulation", "www.jvic.com"]) {
    assert.equal(looksLikeJvic(name), true, name);
  }
  for (const name of ["", "Apex NDE", "Madison", "Shahan", "JVI", "Project"]) {
    assert.equal(looksLikeJvic(name), false, name);
  }
});

test("typing JVIC auto-checks affiliate; user can uncheck; other vendors stay unchecked", () => {
  assert.equal(affiliateAfterVendorChange("", "JVIC", false), true);
  assert.equal(affiliateAfterVendorChange("", "Apex", false), false);
  assert.equal(affiliateAfterVendorChange("Apex", "Apex NDE", true), true);
  assert.equal(affiliateAfterVendorChange("JVIC", "JVIC Insulation", false), false);
  assert.equal(affiliateAfterVendorChange("JVIC", "Apex", true), false);

  const typed = applyVendorName({ ...blankSubLine(), vendor: "" }, "jvic.com");
  assert.equal(typed.affiliate, true);
  const unchecked = { ...typed, affiliate: false };
  assert.equal(applyVendorName(unchecked, "JVIC").affiliate, false);
  const other = applyVendorName({ ...blankSubLine(), vendor: "" }, "Apex NDE");
  assert.equal(other.affiliate, false);

  const fromBook = applyBookRate(blankSubLine(), {
    id: "sr-jvic",
    vendor: "J.V.I.C.",
    scope: "NDE",
    unit: "LS",
    rate: 4000,
  });
  assert.equal(fromBook.affiliate, true);
  const apexBook = applyBookRate(blankSubLine(), {
    id: "sr-apex",
    vendor: "Apex NDE",
    scope: "RT",
    unit: "each",
    rate: 85,
  });
  assert.equal(apexBook.affiliate, false);
});

test("affiliate flag persists on vendor cards and one-off rows", () => {
  const store = memoryStore();
  writeSubSheet(
    "new:affiliate-keep",
    {
      lines: [{ id: "a", vendor: "JVIC", scope: "LS", qty: 1, unit: "LS", rate: 4000, affiliate: true }],
      cards: [dayLaborCard("JVIC", true)],
    },
    store,
  );
  const saved = readSubSheet("new:affiliate-keep", store);
  assert.equal(saved.lines[0].affiliate, true);
  assert.equal(saved.cards[0].affiliate, true);
  assert.equal(saved.cards[0].vendor, "JVIC");
  const raw = store.getItem(`${SUB_STORE_PREFIX}new:affiliate-keep`) || "";
  assert.match(raw, /"affiliate":true/);
});

test("JVIC labor card stays in Subcontractor and does not raise 6.5% markup", () => {
  const card = dayLaborCard("JVIC", true);
  assert.equal(subLaborCost(card.labor[0], WR.site, WR.client), 880);
  const sheet = normalizeSubSheet({ cards: [card] });
  assert.equal(subcontractorTotal(sheet, WR), 880);
  assert.equal(subcontractorMarkupBase(sheet, WR), 0);
  assert.equal(estimateMarkupDollars({ subcontractor: subcontractorMarkupBase(sheet, WR) }), 0);
  const rail = estimateTotalBreakdown({
    subcontractor: subcontractorTotal(sheet, WR),
    markup: estimateMarkupDollars({ subcontractor: subcontractorMarkupBase(sheet, WR) }),
  });
  assert.equal(rail.lines.find((line) => line.id === "subcontractor")?.amount, 880);
  assert.equal(rail.lines.some((line) => line.id === "markup"), false);
  assert.equal(rail.total, 880);
});

test("a normal vendor card still gets the 6.5% markup", () => {
  const card = dayLaborCard("Apex Insulation", false);
  const sheet = normalizeSubSheet({ cards: [card] });
  assert.equal(subcontractorTotal(sheet, WR), 880);
  assert.equal(subcontractorMarkupBase(sheet, WR), 880);
  assert.equal(estimateMarkupDollars({ subcontractor: subcontractorMarkupBase(sheet, WR) }), 57.2);
  assert.equal(ESTIMATE_MARKUP_RATE, 0.065);
});

test("mixed sheet marks up only the non-affiliate part; third-party and misc stay in", () => {
  const sheet = normalizeSubSheet({
    lines: [
      { id: "a", vendor: "Apex NDE", scope: "RT", qty: 1, unit: "LS", rate: 1000 },
      { id: "b", vendor: "JVIC", scope: "LS", qty: 1, unit: "LS", rate: 4000, affiliate: true },
    ],
    cards: [dayLaborCard("JVIC", true), dayLaborCard("Field Co", false, 100)],
  });
  const field = subLaborCost(sheet.cards[1].labor[0], WR.site, WR.client);
  assert.equal(field, 1040);
  assert.equal(subcontractorTotal(sheet, WR), 1000 + 4000 + 880 + 1040);
  assert.equal(subcontractorMarkupBase(sheet, WR), 1000 + 1040);
  const markup = estimateMarkupDollars({
    subcontractor: subcontractorMarkupBase(sheet, WR),
    thirdParty: 200,
    misc: 50,
  });
  assert.equal(markup, 148.85);
  assert.equal(
    estimateMarkupDollars({ subcontractor: 2000, thirdParty: 200, misc: 50 }),
    146.25,
  );
});

test("unchecking JVIC puts those dollars back in the 6.5% markup", () => {
  const checked = normalizeSubSheet({ cards: [dayLaborCard("JVIC", true)] });
  assert.equal(estimateMarkupDollars({ subcontractor: subcontractorMarkupBase(checked, WR) }), 0);
  const unchecked = normalizeSubSheet({ cards: [dayLaborCard("JVIC", false)] });
  assert.equal(subcontractorTotal(unchecked, WR), 880);
  assert.equal(subcontractorMarkupBase(unchecked, WR), 880);
  assert.equal(estimateMarkupDollars({ subcontractor: subcontractorMarkupBase(unchecked, WR) }), 57.2);
});

test("one-off affiliate stays in Subcontractor and skips 6.5% markup until unchecked", () => {
  const affiliate = normalizeSubSheet({
    lines: [{ id: "a", vendor: "JVIC", scope: "NDE LS", qty: 1, unit: "LS", rate: 4000, affiliate: true }],
  });
  assert.equal(subcontractorTotal(affiliate), 4000);
  assert.equal(subcontractorMarkupBase(affiliate), 0);
  assert.equal(estimateMarkupDollars({ subcontractor: subcontractorMarkupBase(affiliate) }), 0);

  const thirdAndMisc = estimateMarkupDollars({
    subcontractor: subcontractorMarkupBase(affiliate),
    thirdParty: 200,
    misc: 50,
  });
  assert.equal(thirdAndMisc, 16.25);

  const unchecked = normalizeSubSheet({
    lines: [{ id: "a", vendor: "JVIC", scope: "NDE LS", qty: 1, unit: "LS", rate: 4000, affiliate: false }],
  });
  assert.equal(subcontractorMarkupBase(unchecked), 4000);
  assert.equal(estimateMarkupDollars({ subcontractor: subcontractorMarkupBase(unchecked) }), 260);
});
