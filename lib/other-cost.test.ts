import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MISC_CATALOG,
  MISC_HEADERS,
  capTravelers,
  crewPositionHeadcount,
  crewTravelPositions,
  hydrateMiscLine,
  hydrateTravelLine,
  miscAmount,
  miscDescriptionsFor,
  otherCostTotals,
  parseOtherCostJson,
  perDiemAmount,
  seedMiscCatalog,
  syncTravelFromCrew,
  travelAmount,
  type TravelLine,
} from "./other-cost.ts";

function row(
  id: string,
  over: {
    position?: string;
    shift?: "Days" | "Nights" | "Days & nights";
    ranges?: Array<{
      headcount?: number;
      nightHeadcount?: number;
      shift?: "Days" | "Nights" | "Days & nights";
    }>;
  } = {},
) {
  return {
    id,
    position: over.position ?? "Boilermaker",
    shift: over.shift ?? "Days",
    ranges: over.ranges ?? [{ headcount: 2, nightHeadcount: 0 }],
  };
}

test("per diem uses the job rate times Crew PD days", () => {
  assert.equal(perDiemAmount(185, 4), 740);
  assert.equal(perDiemAmount(0, 10), 0);
});

test("travel line total is travelers × miles × $/mile", () => {
  const line: TravelLine = {
    id: "cr-1",
    lane: "direct",
    name: "Boilermaker",
    headcount: 8,
    travelers: 3,
    perMile: 0.7,
    miles: 120,
  };
  assert.equal(travelAmount(line), 3 * 120 * 0.7);
  assert.equal(travelAmount({ ...line, travelers: 0 }), 0);
  assert.equal(travelAmount({ ...line, miles: 0 }), 0);
});

test("travelers cannot exceed that position's Crew headcount", () => {
  assert.equal(capTravelers(9, 4), 4);
  assert.equal(capTravelers(-2, 4), 0);
  assert.equal(travelAmount({ travelers: 99, headcount: 2, perMile: 1, miles: 10 }), 20);
});

test("Crew days plus nights is the Travel headcount; zero stays off the card", () => {
  assert.equal(
    crewPositionHeadcount(
      row("a", {
        shift: "Days & nights",
        ranges: [{ headcount: 4, nightHeadcount: 2, shift: "Days & nights" }],
      }),
    ),
    6,
  );
  assert.equal(
    crewPositionHeadcount(row("b", { shift: "Days", ranges: [{ headcount: 3, nightHeadcount: 9 }] })),
    3,
  );
  assert.equal(
    crewPositionHeadcount(
      row("c", {
        ranges: [
          { headcount: 2, nightHeadcount: 0 },
          { headcount: 8, nightHeadcount: 4, shift: "Days & nights" },
        ],
      }),
    ),
    12,
  );
  assert.equal(crewPositionHeadcount(row("d", { ranges: [{ headcount: 0, nightHeadcount: 0 }] })), 0);
  const queued = crewTravelPositions({
    staff: [row("st-1", { position: "Superintendent", ranges: [{ headcount: 1 }] })],
    generalForeman: [row("gf-1", { position: "GF BM", ranges: [{ headcount: 1 }] })],
    foreman: [row("fm-1", { position: "Foreman PF", ranges: [{ headcount: 2 }] })],
    direct: [
      row("bm-1", { position: "Boilermaker", ranges: [{ headcount: 8 }] }),
      row("zero", { position: "Helper", ranges: [{ headcount: 0, nightHeadcount: 0 }] }),
    ],
    support: [row("sup-1", { position: "Tool Room Attendant", ranges: [{ headcount: 1 }] })],
  });
  assert.deepEqual(
    queued.map((item) => item.id),
    ["st-1", "gf-1", "fm-1", "bm-1", "sup-1"],
  );
  assert.equal(
    queued.some((item) => item.id === "zero"),
    false,
  );
});

test("Travel rows sync from Crew and keep typed fields by position id", () => {
  const crew = {
    staff: [row("st-1", { position: "Superintendent", ranges: [{ headcount: 1 }] })],
    direct: [row("bm-1", { position: "Boilermaker", ranges: [{ headcount: 8 }] })],
  };
  const first = syncTravelFromCrew([], crew, { perMile: 0.67 });
  assert.equal(first.length, 2);
  assert.equal(first[0].id, "st-1");
  assert.equal(first[0].perMile, 0.67);
  assert.equal(first[1].travelers, 0);
  const typed = first.map((line) =>
    line.id === "bm-1" ? { ...line, travelers: 5, perMile: 0.8, miles: 40 } : line,
  );
  const grown = syncTravelFromCrew(typed, {
    direct: [row("bm-1", { position: "Boilermaker", ranges: [{ headcount: 4 }] })],
    support: [row("sup-1", { position: "Hole Watch", ranges: [{ headcount: 2 }] })],
  });
  assert.equal(grown.some((line) => line.id === "st-1"), false);
  const bm = grown.find((line) => line.id === "bm-1");
  assert.ok(bm);
  assert.equal(bm.headcount, 4);
  assert.equal(bm.travelers, 4);
  assert.equal(bm.perMile, 0.8);
  assert.equal(bm.miles, 40);
  assert.equal(grown.some((line) => line.id === "sup-1"), true);
  assert.equal(grown.find((line) => line.id === "sup-1")?.perMile, 0);
});

test("persisted travel keeps travelers, $/mile, and miles; old Yes/No lines drop", () => {
  const sheet = parseOtherCostJson({
    perDiemRate: 100,
    travel: [
      { id: "bm-1", lane: "direct", name: "Boilermaker", headcount: 8, travelers: 3, perMile: 0.7, miles: 10 },
      { id: "tr-old", kind: "staff", name: "Pat", traveler: true, mileageRate: 0.67, travelDollars: 400 },
    ],
    misc: [{ id: "m", item: "Steel", description: "Channel", qty: 1, each: 50 }],
  });
  assert.equal(sheet.travel.length, 1);
  assert.equal(sheet.travel[0].id, "bm-1");
  assert.equal(sheet.travel[0].travelers, 3);
  assert.equal(sheet.travel[0].perMile, 0.7);
  assert.equal(sheet.travel[0].miles, 10);
  assert.equal(hydrateTravelLine({ id: "tr-1", kind: "craft", traveler: false, travelDollars: 10 }), null);
  const again = parseOtherCostJson(JSON.parse(JSON.stringify(sheet)));
  assert.deepEqual(again.travel, sheet.travel);
});

test("misc reimbursables are the CAT 2 list, not B-3 small tools", () => {
  assert.deepEqual([...MISC_CATALOG], [
    "Alloy rod",
    "Steel",
    "Grinding wheels",
    "Weld / cut gas",
    "Fire blanket",
    "Anti-seize",
  ]);
  const seeded = seedMiscCatalog();
  assert.equal(seeded.some((row) => /PPE|small tool|consumable/i.test(row.item)), false);
  assert.equal(miscAmount({ id: "1", item: "Alloy rod", description: "Stainless", qty: 2, each: 40 }), 80);
});

test("misc description sits between item and qty and keeps a custom type-in", () => {
  assert.deepEqual([...MISC_HEADERS], ["ITEM", "DESCRIPTION", "QTY", "EACH", "TOTAL"]);
  assert.ok(miscDescriptionsFor("Alloy rod").includes("Stainless"));
  assert.ok(miscDescriptionsFor("Alloy rod").includes("Inconel"));
  assert.ok(miscDescriptionsFor("Steel").includes("Wide flange beam"));
  assert.ok(miscDescriptionsFor("Steel").includes("2x2 angle iron"));
  assert.ok(miscDescriptionsFor("Steel").includes("Channel"));
  assert.deepEqual(miscDescriptionsFor(""), []);
  const custom = hydrateMiscLine({
    id: "1",
    item: "Steel",
    description: "odd leftover clip",
    qty: 2,
    each: 40,
  });
  assert.equal(custom.description, "odd leftover clip");
  assert.equal(miscAmount(custom), 80);
  const sheet = parseOtherCostJson({ misc: [custom] });
  assert.equal(sheet.misc[0].description, "odd leftover clip");
  assert.deepEqual(
    Object.keys(sheet.misc[0]),
    ["id", "item", "description", "qty", "each"],
  );
  const again = parseOtherCostJson(JSON.parse(JSON.stringify(sheet)));
  assert.equal(again.misc[0].description, "odd leftover clip");
});

test("other cost totals PD + travel + misc", () => {
  const totals = otherCostTotals(
    {
      perDiemRate: 100,
      travel: [
        { id: "bm-1", lane: "direct", name: "Boilermaker", headcount: 8, travelers: 2, perMile: 0.5, miles: 100 },
      ],
      misc: [{ id: "m", item: "Steel", description: "Channel", qty: 1, each: 50 }],
    },
    3,
  );
  assert.equal(totals.perDiem, 300);
  assert.equal(totals.travel, 100);
  assert.equal(totals.misc, 50);
  assert.equal(totals.total, 450);
});
