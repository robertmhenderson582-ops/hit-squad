import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

function read(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

test("Excel export is download-only and does not write the live pack", () => {
  const workspace = read("../components/EstimateWorkspace.tsx");
  const xlsx = read("./estimate-xlsx.ts");
  const packXlsx = read("./estimate-pack-xlsx.ts");
  assert.match(workspace, /estimateToXlsx/);
  assert.match(workspace, /downloadXlsx/);
  assert.doesNotMatch(workspace, /writeSchedule|writeCrew|applyPackToStore|flushVaultUpsert/);
  assert.doesNotMatch(xlsx, /writeSchedule|writeCrew|applyPackToStore|flushVaultUpsert/);
  assert.doesNotMatch(packXlsx, /writeSchedule|writeCrew|applyPackToStore|flushVaultUpsert/);
});

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
