import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SUB_BOOK_KEY,
  SUB_STORE_PREFIX,
  applyBookRate,
  applyTypedAmount,
  blankSubLine,
  emptySubBook,
  lineAmount,
  lineQty,
  normalizeSubBook,
  readSubBook,
  readSubSheet,
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
