import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  addPurchaseLine,
  applyPurchaseTie,
  blankPurchaseLine,
  hydratePurchasing,
  miscBudgetFromSheet,
  patchPurchaseLine,
  purchaseTieOptions,
  purchasingCostSlice,
  purchasingHasWork,
  purchasingTotals,
  purchasingVsBudget,
  PURCHASING_PARKED,
  PURCHASING_STORE_PREFIX,
  readPurchasing,
  removePurchaseLine,
  savePurchasingSnapshot,
  writePurchasing,
} from "./purchasing.ts";

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

describe("Purchasing Day-1 ledger", () => {
  it("rolls category totals and compares Small tools / Consumables to live Misc", () => {
    const book = addPurchaseLine(
      addPurchaseLine(hydratePurchasing({}), {
        vendor: "Airgas",
        description: "Grinding wheels",
        category: "consumables",
        amount: 240,
        status: "invoiced",
      }),
      {
        vendor: "Grainger",
        description: "4-1/2 grinders",
        category: "small-tools",
        amount: 180,
        status: "received",
      },
    );
    const next = addPurchaseLine(book, {
      vendor: "Sunbelt",
      description: "Scissor lift week",
      category: "rental",
      amount: 900,
      status: "open",
    });
    const totals = purchasingTotals(next.lines);
    assert.equal(totals.grand, 1320);
    assert.equal(totals.toolsConsumables, 420);
    assert.equal(totals.byCategory.consumables, 240);
    assert.equal(totals.byCategory["small-tools"], 180);
    assert.equal(totals.byCategory.rental, 900);
    assert.equal(totals.byStatus.open, 900);
    assert.equal(totals.lineCount, 3);

    const misc = miscBudgetFromSheet({
      perDiemRate: 0,
      travel: [],
      misc: [
        { id: "mc-1", item: "Grinding wheels", description: "4-1/2 flap", qty: 10, each: 30 },
        { id: "mc-2", item: "Steel", description: "", qty: 1, each: 0 },
      ],
    });
    assert.equal(misc.amount, 300);
    assert.equal(misc.hasBudget, true);
    const vs = purchasingVsBudget(totals, misc);
    assert.equal(vs.toolsConsumables, 420);
    assert.equal(vs.miscBudget, 300);
    assert.equal(vs.variance, -120);
    assert.equal(vs.hasMiscBudget, true);

    const emptyMisc = miscBudgetFromSheet({
      perDiemRate: 0,
      travel: [],
      misc: [{ id: "mc-seed", item: "Alloy rod", description: "", qty: 1, each: 0 }],
    });
    assert.equal(emptyMisc.hasBudget, false);
    assert.equal(purchasingVsBudget(totals, emptyMisc).hasMiscBudget, false);
  });

  it("does not invent a Misc compare when the estimate catalog has no dollars", () => {
    const slice = purchasingCostSlice(hydratePurchasing({ lines: [] }), {
      amount: 0,
      hasBudget: false,
    });
    assert.equal(slice.grandTotal, 0);
    assert.equal(slice.vsBudget.hasMiscBudget, false);
    assert.equal(slice.vsBudget.miscBudget, 0);
  });

  it("persists lines + dated totals snapshots on the pack store prefix", () => {
    const store = memoryStore();
    const key = "new:new-cat2pit";
    let book = addPurchaseLine(hydratePurchasing({ statusDate: "2026-09-06", notes: "Saturday buys" }), {
      id: "po-1",
      date: "2026-09-06",
      vendor: "Airgas",
      poNumber: "PO-441",
      description: "C-25 bottles",
      category: "consumables",
      amount: 75,
      status: "charged",
      estimateTieLabel: "Weld / cut gas",
      attachmentName: "airgas-ticket.pdf",
    });
    book = savePurchasingSnapshot(book, { amount: 150, hasBudget: true }, 9);
    writePurchasing(key, book, store);
    const read = readPurchasing(key, store);
    assert.equal(read.lines.length, 1);
    assert.equal(read.lines[0]?.vendor, "Airgas");
    assert.equal(read.lines[0]?.poNumber, "PO-441");
    assert.equal(read.lines[0]?.attachmentName, "airgas-ticket.pdf");
    assert.equal(read.snapshots.length, 1);
    assert.equal(read.snapshots[0]?.statusDate, "2026-09-06");
    assert.equal(read.snapshots[0]?.totals.grand, 75);
    assert.equal(read.snapshots[0]?.vsBudget.miscBudget, 150);
    assert.equal(read.snapshots[0]?.vsBudget.variance, 75);
    assert.ok(store.getItem(`${PURCHASING_STORE_PREFIX}${key}`));
    assert.equal(purchasingHasWork(read), true);
    assert.equal(purchasingHasWork({ lines: [] }), false);
    const cleared = removePurchaseLine(patchPurchaseLine(read, "po-1", { amount: 80 }), "missing");
    assert.equal(cleared.lines[0]?.amount, 80);
    assert.equal(removePurchaseLine(cleared, "po-1").lines.length, 0);
  });

  it("links a buy to a live Misc / Equipment line when the pack has one", () => {
    const options = purchaseTieOptions(
      {
        perDiemRate: 0,
        travel: [],
        misc: [{ id: "mc-1", item: "Grinding wheels", description: "4-1/2 flap", qty: 10, each: 30 }],
      },
      {
        largeTools: [],
        thirdParty: [{ id: "tp-1", item: "Scissor lift", period: "weekly", rate: 400, freight: 0, qty: 1, start: "", end: "" }],
      },
    );
    assert.equal(options.some((row) => row.kind === "misc" && row.id === "mc-1"), true);
    assert.equal(options.some((row) => row.kind === "equipment-3p" && row.id === "tp-1"), true);
    const tied = applyPurchaseTie(blankPurchaseLine(), options[0]!);
    assert.equal(tied.estimateTieKind, "misc");
    assert.equal(tied.estimateTieId, "mc-1");
    assert.match(tied.estimateTieLabel, /Misc/);
  });

  it("Purchasing is an on-job estimate tab next to Cost report", () => {
    const workspace = readFileSync(fileURLToPath(new URL("../components/EstimateWorkspace.tsx", import.meta.url)), "utf8");
    const detail = readFileSync(fileURLToPath(new URL("../components/EstimateDetail.tsx", import.meta.url)), "utf8");
    const fresh = readFileSync(fileURLToPath(new URL("../components/NewEstimateForm.tsx", import.meta.url)), "utf8");
    const desk = readFileSync(fileURLToPath(new URL("../components/PurchasingDesk.tsx", import.meta.url)), "utf8");
    const cost = readFileSync(fileURLToPath(new URL("../components/CostReportDesk.tsx", import.meta.url)), "utf8");
    const pack = readFileSync(fileURLToPath(new URL("./estimate-pack.ts", import.meta.url)), "utf8");
    const purchasingSrc = readFileSync(fileURLToPath(new URL("./purchasing.ts", import.meta.url)), "utf8");
    const prefix = readFileSync(fileURLToPath(new URL("./purchasing-prefix.ts", import.meta.url)), "utf8");
    const costXlsx = readFileSync(fileURLToPath(new URL("./cost-report-xlsx.ts", import.meta.url)), "utf8");
    const estimateXlsx = readFileSync(fileURLToPath(new URL("./estimate-xlsx.ts", import.meta.url)), "utf8");
    assert.match(workspace, /id: "purchasing"/);
    assert.match(workspace, /label: "Purchasing"/);
    assert.match(workspace, /item.id === "purchasing" \? " print-hide"/);
    assert.doesNotMatch(workspace, /readPurchasing|purchasingCostSlice/);
    assert.match(detail, /tab === "purchasing"/);
    assert.match(fresh, /tab === "purchasing"/);
    assert.match(desk, /purchasingCostSlice|purchasingTotals/);
    assert.match(desk, /Save dated totals/);
    assert.match(cost, /purchasingCostSlice/);
    assert.match(cost, /Purchases \/ consumables/);
    assert.match(pack, /purchasing\?:/);
    assert.match(pack, /PURCHASING_STORE_PREFIX/);
    assert.match(purchasingSrc, /PURCHASING_STORE_PREFIX/);
    assert.match(purchasingSrc, /from "\.\/purchasing-prefix.ts"/);
    assert.match(prefix, /hs_purchasing_v1:/);
    assert.deepEqual([...PURCHASING_PARKED], [
      "AP / three-way match",
      "Invoice PDF vault upload",
      "Barcode inventory",
      "Auto-email vendor",
      "PPR chart purchases slice",
    ]);
    assert.equal(/three-way match automation|barcode scanner|auto-email/i.test(desk), false);
    assert.equal(/P66 client|PCA000110/.test(purchasingSrc), false);
    assert.match(purchasingSrc, /PURCHASING_INTERNAL_NOTE/);
    assert.match(desk, /PURCHASING_INTERNAL_NOTE/);
    assert.match(cost, /not written into client Cost \/ PPR Excel/);
    assert.match(cost, /print-hide/);
    assert.equal(/purchas|consumable|small.?tool/i.test(costXlsx), false);
    assert.equal(/purchas/i.test(estimateXlsx), false);
  });
});
