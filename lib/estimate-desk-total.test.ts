import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

function read(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

test("Purchasing ledger is not an Estimate Total input", () => {
  const desk = read("./estimate-desk-total.ts");
  const rail = read("../components/EstimateTotalRail.tsx");
  const total = read("./estimate-total.ts");
  const crew = read("./shahan-wood-river.ts");
  const other = read("./other-cost.ts");
  const equip = read("./equipment-sheet.ts");
  const subs = read("./subcontractor.ts");
  assert.doesNotMatch(desk, /purchasing/i);
  assert.doesNotMatch(rail, /purchasing/i);
  assert.doesNotMatch(total, /purchasing/i);
  assert.doesNotMatch(crew, /purchasing/i);
  assert.doesNotMatch(other, /PURCHASING_STORE|readPurchasing|purchasingCostSlice/);
  assert.doesNotMatch(equip, /PURCHASING_STORE|readPurchasing|purchasingCostSlice/);
  assert.doesNotMatch(subs, /PURCHASING_STORE|readPurchasing|purchasingCostSlice/);
  assert.match(desk, /deskPackageBreakdown/);
  assert.match(rail, /deskPackageBreakdown/);
});
