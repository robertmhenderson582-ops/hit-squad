import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { deskPackageBreakdown } from "./estimate-desk-total.ts";
import { estimateMarkupDollars, impliedMarkupBase, markupBase } from "./estimate-total.ts";
import { normalizeSubSheet } from "./subcontractor.ts";

function read(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

test("Purchasing ledger is not an Estimate Total input", () => {
  const desk = read("./estimate-desk-total.ts");
  const rail = read("../components/EstimateTotalRail.tsx");
  const total = read("./estimate-total.ts");
  assert.doesNotMatch(desk, /purchasing/i);
  assert.doesNotMatch(rail, /purchasing/i);
  assert.doesNotMatch(total, /purchasing/i);
  assert.match(desk, /markupBase/);
  assert.match(rail, /markable/);
  assert.match(rail, /ESTIMATE_MARKUP_BASE_NOTE/);
});

test("affiliate-heavy Subcontractor stays on the rail; 6.5% only hits markable", () => {
  const sheet = normalizeSubSheet({
    lines: [
      { id: "a", vendor: "Affiliate Co", scope: "LS", qty: 1, unit: "LS", rate: 3_722_511, affiliate: true },
      { id: "b", vendor: "Field Co", scope: "LS", qty: 1, unit: "LS", rate: 100_000, affiliate: false },
    ],
    cards: [],
  });
  const next = deskPackageBreakdown({
    subcontractor: sheet,
    equipment: {
      largeTools: [],
      thirdParty: [
        {
          id: "tp-1",
          item: "Crane",
          period: "weekly",
          rate: 200_000,
          freight: 0,
          qty: 1,
          start: "",
          end: "",
        },
      ],
    },
    otherCost: {
      perDiemRate: 0,
      travel: [],
      misc: [{ id: "m", item: "Steel", description: "Channel", qty: 1, each: 50_000 }],
    },
    client: "Phillips 66",
    site: "Wood River",
    hours: 4339,
  });
  const markable = markupBase({ subcontractor: 100_000, thirdParty: 200_000, misc: 50_000 });
  const markup = estimateMarkupDollars({
    subcontractor: 100_000,
    thirdParty: 200_000,
    misc: 50_000,
    client: "Phillips 66",
    site: "Wood River",
  });
  assert.equal(markable, 350_000);
  assert.equal(markup, 22_750);
  assert.equal(next.lines.find((line) => line.id === "subcontractor")?.amount, 3_822_511);
  assert.equal(next.lines.find((line) => line.id === "equipment")?.amount, 200_000);
  assert.equal(next.lines.find((line) => line.id === "other")?.amount, 50_000);
  assert.equal(next.lines.find((line) => line.id === "markup")?.amount, 22_750);
  assert.equal(next.markupBase, 350_000);
  assert.equal(next.hours, 4339);
  assert.notEqual(next.lines.find((line) => line.id === "markup")?.amount, Math.round(3_822_511 * 0.065 * 100) / 100);
});

test("shown 6.5% dollars invert to the markable base the rail prints", () => {
  const shown = 56_547.95;
  const markable = impliedMarkupBase(shown);
  assert.equal(markable, 869_968.46);
  assert.equal(estimateMarkupDollars({ subcontractor: markable }), shown);
  const next = deskPackageBreakdown({
    subcontractor: normalizeSubSheet({
      lines: [
        { id: "a", vendor: "Affiliate Co", scope: "LS", qty: 1, unit: "LS", rate: 3_722_511, affiliate: true },
        { id: "b", vendor: "Field Co", scope: "LS", qty: 1, unit: "LS", rate: markable, affiliate: false },
      ],
      cards: [],
    }),
    client: "Phillips 66",
    site: "Wood River",
  });
  assert.equal(next.lines.find((line) => line.id === "subcontractor")?.amount, 3_722_511 + markable);
  assert.equal(next.lines.find((line) => line.id === "markup")?.amount, shown);
  assert.equal(next.markupBase, markable);
});
