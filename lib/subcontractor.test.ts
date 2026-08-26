import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SUB_BOOK_KEY,
  SUB_STORE_PREFIX,
  applyBookRate,
  applyTypedAmount,
  blankSubCard,
  blankSubLine,
  emptySubBook,
  laborHoursCost,
  lineAmount,
  lineQty,
  normalizeSubBook,
  normalizeSubSheet,
  readSubBook,
  readSubSheet,
  subCardTotal,
  subEquipAmount,
  subLaborCost,
  subcontractorTotal,
  writeSubBook,
  writeSubSheet,
} from "./subcontractor.ts";
import { estimateTotalBreakdown } from "./estimate-total.ts";

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
  assert.equal(dollars, 10 * 85);
  assert.equal(dollars > 0, true);
});

test("equipment cost is rate times qty plus freight", () => {
  assert.equal(subEquipAmount({ rate: 400, qty: 3, freight: 0 }), 1200);
  assert.equal(subEquipAmount({ rate: 400, qty: 3, freight: 50 }), 1250);
  assert.equal(subEquipAmount({ rate: 0, qty: 5, freight: 80 }), 80);
  assert.equal(subEquipAmount({ rate: 250, qty: 0, freight: 0 }), 0);
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
  assert.equal(labor, 800);
  assert.equal(equipment, 1250);
  assert.equal(subCardTotal(card, { site: "Wood River Refinery", client: "Phillips 66" }), 2050);

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
  assert.equal(total, 170 + 2050);

  const rail = estimateTotalBreakdown({
    labor: 9000,
    equipment: 500,
    otherCost: 250,
    subcontractor: total,
    hours: 40,
  });
  assert.equal(rail.lines.find((line) => line.id === "subcontractor")?.amount, 2220);
  assert.equal(rail.lines.find((line) => line.id === "labor")?.amount, 9000);
  assert.equal(rail.lines.find((line) => line.id === "equipment")?.amount, 500);
  assert.equal(rail.total, 9000 + 500 + 250 + 2220);
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
