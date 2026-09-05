import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CREW_STORE_PREFIX, PHASE_STORE_PREFIX } from "./phase-schedule.ts";
import { ORG_CHART_STORE_PREFIX } from "./org-chart.ts";
import { EQUIPMENT_STORE_PREFIX } from "./equipment-sheet.ts";
import { OTHER_COST_STORE_PREFIX } from "./other-cost.ts";
import { newEstimateKey } from "./estimate-open.ts";
import { SUB_STORE_PREFIX } from "./subcontractor.ts";
import { FCR_STORE_PREFIX } from "./change-order-packet.ts";
import {
  applyPackToStore,
  collectPack,
  crewHasRows,
  estimateFileName,
  equipmentHasWork,
  mergeVaultIntoLocal,
  otherCostHasWork,
  packHasWork,
  parseIncomingPack,
  collapsePacksById,
  pickPack,
  preferCanonicalPack,
  publicPack,
  responseLeaksDrive,
  scheduleOnce,
  slugify,
  subcontractorHasWork,
  type EstimatePackSnapshot,
} from "./estimate-pack.ts";
import { estimateMarkupDollars, estimateTotalBreakdown } from "./estimate-total.ts";
import { rememberLocalPack, renameLocalPackTitle, type StorageLike } from "./local-estimates.ts";

function memoryStore(seed: Record<string, string> = {}): StorageLike {
  const data = { ...seed };
  return {
    getItem(key) {
      return key in data ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = value;
    },
    removeItem(key) {
      delete data[key];
    },
    get length() {
      return Object.keys(data).length;
    },
    key(index) {
      return Object.keys(data)[index] ?? null;
    },
  };
}

const AROMATICS_ID = "new-mtj7bvtk-akmei";

function nRows(count: number, prefix: string) {
  return Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index + 1}` }));
}

function defaultOtherCost() {
  return {
    perDiemRate: 0,
    travel: [
      { id: "travel-staff", kind: "staff", travelers: 0, miles: 0, perMile: 0 },
      { id: "travel-craft", kind: "craft", travelers: 0, miles: 0, perMile: 0 },
    ],
    misc: [
      { id: "mc-seed-1", item: "Alloy rod", qty: 1, each: 0 },
      { id: "mc-seed-2", item: "Steel", qty: 1, each: 0 },
    ],
  };
}

function aromaticsSheets() {
  const thirdParty = [
    {
      id: "tp-1",
      item: "6 pack Stick/Tig / Mig pulse",
      period: "monthly",
      rate: 1225,
      qty: 12,
      freight: 50,
    },
    ...Array.from({ length: 27 }, (_, index) => ({
      id: `tp-${index + 2}`,
      item: `Third-party ${index + 2}`,
      period: "monthly",
      rate: 1,
      qty: 1,
      freight: 0,
    })),
    { id: "tp-29", item: "", period: "monthly", rate: 0, qty: 0, freight: 0 },
    { id: "tp-30", item: "", period: "monthly", rate: 0, qty: 0, freight: 0 },
  ];
  return {
    equipment: {
      largeTools: [
        { id: "lt-1", itemId: "wet:8:truck-crew", qty: 1 },
        { id: "lt-2", itemId: "dry:36:trailer-trailer-40ft", qty: 4 },
        { id: "lt-3", itemId: "dry:37:trailer-tower-tray-hardware-consignment-cost-plus-6", qty: 1 },
      ],
      thirdParty,
    },
    otherCost: {
      perDiemRate: 0,
      travel: [
        { id: "travel-staff", kind: "staff", travelers: 39, miles: 1700, perMile: 0.76 },
        { id: "travel-craft", kind: "craft", travelers: 100, miles: 800, perMile: 0.76 },
      ],
      misc: [
        { id: "mc-1", item: "Alloy rod", qty: 65, each: 1000 },
        { id: "mc-2", item: "Steel", qty: 25, each: 1000 },
        { id: "mc-3", item: "Grinding wheels", qty: 1000, each: 75 },
        { id: "mc-4", item: "Weld/cut gas", qty: 1000, each: 75 },
        { id: "mc-5", item: "Fire blanket", qty: 150, each: 250 },
        { id: "mc-6", item: "Anti-seize", qty: 1000, each: 72 },
      ],
    },
    subcontractor: {
      lines: [],
      cards: [
        { id: "sc-1", vendor: "JVIC Tensioning/Torquing/Machining/Bundle Equipment and Labor" },
        { id: "sc-2", vendor: "Hartford" },
        { id: "sc-3", vendor: "JVIC Engineering" },
        { id: "sc-4", vendor: "Logistics Trucking INplant" },
      ],
    },
    crew: {
      staff: nRows(15, "st"),
      generalForeman: nRows(1, "gf"),
      foreman: nRows(2, "fm"),
      direct: nRows(2, "dr"),
      support: nRows(7, "su"),
    },
  };
}

function aromatics(over: Partial<EstimatePackSnapshot> = {}): EstimatePackSnapshot {
  const sheets = aromaticsSheets();
  return {
    packId: AROMATICS_ID,
    key: `new:${AROMATICS_ID}`,
    title: "2027 Aromatics Turnaround",
    client: "Phillips 66",
    site: "Wood River — Roxana, IL",
    siteId: "site-madison",
    createdAt: 100,
    updatedAt: 400,
    ownerEmail: "nathanboyte@gmail.com",
    sharedWith: ["robertmhenderson582@gmail.com"],
    transferredFrom: "robertmhenderson582@gmail.com",
    transferredTo: "nathanboyte@gmail.com",
    ...sheets,
    ...over,
  };
}

function thinAromaticsStub(over: Partial<EstimatePackSnapshot> = {}): EstimatePackSnapshot {
  return {
    packId: AROMATICS_ID,
    key: `new:${AROMATICS_ID}`,
    title: "2027 Aromatics Turnaround",
    client: "Phillips 66",
    site: "Wood River — Roxana, IL",
    siteId: "site-madison",
    createdAt: 50,
    updatedAt: 9000,
    ownerEmail: "robertmhenderson582@gmail.com",
    crew: { staff: [], generalForeman: [], foreman: [], direct: [], support: [] },
    ...over,
  };
}

function cat2(over: Partial<EstimatePackSnapshot> = {}): EstimatePackSnapshot {
  return {
    packId: "new-cat2pit",
    key: "new:new-cat2pit",
    title: "Cat 2 Pit Stop",
    client: "Phillips 66",
    site: "Wood River — Roxana, IL",
    siteId: "site-madison",
    createdAt: 100,
    updatedAt: 200,
    ownerEmail: "robertmhenderson582@gmail.com",
    schedule: { phases: [{ id: "pre", on: true, start: "2026-09-01" }] },
    crew: {
      staff: [],
      generalForeman: [],
      foreman: [],
      direct: [{ id: "bm-1", craft: "Boilermaker", hours: 10 }],
      support: [{ id: "sup-1", position: "Tool Room Attendant" }],
    },
    ...over,
  };
}

describe("estimate pack snapshot", () => {
  it("names the Wood River Cat 2 file in place", () => {
    assert.equal(slugify("Cat 2 Pit Stop"), "cat-2-pit-stop");
    assert.equal(
      estimateFileName({ site: "Wood River — Roxana, IL", title: "Cat 2 Pit Stop" }),
      "wood-river-cat-2-pit-stop.json",
    );
    assert.equal(
      estimateFileName({ site: "Wood River — Roxana, IL", title: "Cat 2 Pit Stop", packId: "new-other" }, [
        "wood-river-cat-2-pit-stop.json",
      ]),
      "wood-river-cat-2-pit-stop-other.json",
    );
  });

  it("collects crew and phases from the same new: key", () => {
    const store = memoryStore();
    rememberLocalPack(
      {
        packId: "new-cat2pit",
        title: "Cat 2 Pit Stop",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
      },
      store,
    );
    const key = newEstimateKey("new-cat2pit");
    store.setItem(`${CREW_STORE_PREFIX}${key}`, JSON.stringify({ support: [{ id: "sup-1" }] }));
    store.setItem(`${PHASE_STORE_PREFIX}${key}`, JSON.stringify({ phases: [{ id: "pre", on: true }] }));
    const pack = collectPack(store, "new-cat2pit", "robertmhenderson582@gmail.com");
    assert.ok(pack);
    assert.equal(crewHasRows(pack.crew), true);
    assert.equal(packHasWork(pack), true);
    assert.equal(pack.ownerEmail, "robertmhenderson582@gmail.com");
  });

  it("renames pack title from Job setup and keeps it on a pack round-trip", () => {
    const store = memoryStore();
    rememberLocalPack(
      {
        packId: "new-nathan-tm",
        title: "Working estimate",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
      },
      store,
    );
    const renamed = renameLocalPackTitle("new-nathan-tm", "Nathan T&M book", store);
    assert.equal(renamed?.title, "Nathan T&M book");
    const collected = collectPack(store, "new-nathan-tm", "nathanboyte@gmail.com");
    assert.equal(collected?.title, "Nathan T&M book");

    const other = memoryStore();
    applyPackToStore(other, collected!);
    const again = collectPack(other, "new-nathan-tm");
    assert.equal(again?.title, "Nathan T&M book");
    assert.equal(again?.client, "Phillips 66");
    assert.equal(again?.site, "Wood River — Roxana, IL");
  });

  it("keeps a newer local pack and never replaces it with an empty vault", () => {
    const local = cat2({ updatedAt: 500 });
    const emptyVault = cat2({
      updatedAt: 900,
      title: "Working estimate",
      crew: { staff: [], support: [] },
      schedule: { phases: [] },
    });
    assert.equal(pickPack(local, emptyVault)?.crew, local.crew);
    assert.equal(pickPack(local, cat2({ updatedAt: 100 }))?.updatedAt, 500);
    assert.equal(pickPack(cat2({ updatedAt: 100 }), cat2({ updatedAt: 400 }))?.updatedAt, 400);
    assert.equal(pickPack(null, emptyVault), null);
    assert.equal(pickPack(null, cat2())?.packId, "new-cat2pit");
    const leftover = cat2({
      updatedAt: 9000,
      ownerEmail: "robertmhenderson582@gmail.com",
      transferredFrom: undefined,
    });
    const handed = cat2({
      updatedAt: 400,
      ownerEmail: "nathanboyte@gmail.com",
      transferredFrom: "robertmhenderson582@gmail.com",
      transferredFromName: "Robert Henderson",
      transferredTo: "nathanboyte@gmail.com",
    });
    assert.equal(preferCanonicalPack(leftover, handed).ownerEmail, "nathanboyte@gmail.com");
    assert.equal(collapsePacksById([leftover, handed]).length, 1);
    assert.equal(collapsePacksById([leftover, handed])[0]?.ownerEmail, "nathanboyte@gmail.com");
    const picked = pickPack(leftover, handed);
    assert.equal(picked?.ownerEmail, "nathanboyte@gmail.com");
    assert.equal(picked?.transferredFrom, "robertmhenderson582@gmail.com");
    const titleOnly = cat2({ updatedAt: 900, crew: undefined, schedule: undefined });
    const merged = pickPack(titleOnly, cat2({ updatedAt: 200 }));
    assert.equal(crewHasRows(merged?.crew), true);
    const emptyShare = cat2({
      updatedAt: 900,
      title: "Working estimate",
      crew: { staff: [], support: [] },
      schedule: { phases: [] },
      ownerEmail: "nathanboyte@gmail.com",
      sharedWith: ["robertmhenderson582@gmail.com"],
    });
    const localWork = cat2({
      updatedAt: 500,
      ownerEmail: "nathanboyte@gmail.com",
    });
    const stamped = pickPack(localWork, emptyShare);
    assert.equal(stamped?.crew, localWork.crew);
    assert.equal(stamped?.ownerEmail, "nathanboyte@gmail.com");
    assert.deepEqual(stamped?.sharedWith, ["robertmhenderson582@gmail.com"]);

    const leftoverEmptySheets = cat2({
      updatedAt: 9000,
      ownerEmail: "robertmhenderson582@gmail.com",
      equipment: { largeTools: [], thirdParty: [] },
      otherCost: { perDiemRate: 140, travel: [{ id: "travel-staff", travelers: 1 }], misc: [] },
      subcontractor: { lines: [], cards: [] },
      fcr: { log: [], people: [], sub: 0, equipment: 0, misc: 0 },
    });
    const nathanFull = cat2({
      updatedAt: 400,
      ownerEmail: "nathanboyte@gmail.com",
      sharedWith: ["robertmhenderson582@gmail.com"],
      transferredFrom: "robertmhenderson582@gmail.com",
      equipment: { largeTools: [{ id: "lt-1", itemId: "air-mover", qty: 2 }], thirdParty: [{ id: "tp-1", item: "Crane", rate: 400 }] },
      otherCost: { perDiemRate: 140, travel: [{ id: "travel-staff", travelers: 1 }], misc: [{ id: "m1", item: "Steel", qty: 2, each: 40 }] },
      subcontractor: { lines: [{ id: "sb-1", vendor: "Apex NDE", qty: 2, rate: 85 }], cards: [] },
      fcr: { log: [{ id: "fcr-1", scr: "SCR-1" }], people: [], sub: 0, equipment: 0, misc: 0 },
    });
    const keptSheets = pickPack(leftoverEmptySheets, nathanFull);
    assert.deepEqual((keptSheets?.equipment as { largeTools: Array<{ id: string }> }).largeTools, [
      { id: "lt-1", itemId: "air-mover", qty: 2 },
    ]);
    assert.deepEqual((keptSheets?.subcontractor as { lines: Array<{ vendor: string }> }).lines, [
      { id: "sb-1", vendor: "Apex NDE", qty: 2, rate: 85 },
    ]);
    assert.equal(((keptSheets?.otherCost as { misc: unknown[] }).misc || []).length, 1);
    assert.equal(((keptSheets?.fcr as { log: unknown[] }).log || []).length, 1);
    assert.equal(keptSheets?.ownerEmail, "nathanboyte@gmail.com");
    const markup = estimateMarkupDollars({
      subcontractor: 170,
      thirdParty: 400,
      misc: 80,
    });
    const rail = estimateTotalBreakdown({
      labor: 1_157_983.04,
      equipment: 400,
      subcontractor: 170,
      otherCost: 71_440,
      markup,
    });
    assert.equal(rail.lines.some((line) => line.id === "equipment"), true);
    assert.equal(rail.lines.some((line) => line.id === "subcontractor"), true);
    assert.equal(rail.lines.some((line) => line.id === "markup"), true);
    assert.notEqual(rail.total, 1_229_423.04);
  });

  it("hydrates vault onto an empty browser and leaves a newer local pack alone", () => {
    const empty = memoryStore();
    assert.equal(mergeVaultIntoLocal(empty, cat2()), "vault");
    const stored = collectPack(empty, "new-cat2pit");
    assert.equal(stored?.title, "Cat 2 Pit Stop");
    assert.equal(crewHasRows(stored?.crew), true);

    const localNewer = memoryStore();
    applyPackToStore(localNewer, cat2({ updatedAt: 800, crew: { support: [{ id: "local-1" }] } }));
    assert.equal(mergeVaultIntoLocal(localNewer, cat2({ updatedAt: 200, crew: { support: [{ id: "vault-1" }] } })), "local");
    const kept = collectPack(localNewer, "new-cat2pit");
    assert.deepEqual((kept?.crew as { support: Array<{ id: string }> }).support, [{ id: "local-1" }]);

    const titleFirst = memoryStore();
    rememberLocalPack(
      {
        packId: "new-cat2pit",
        title: "Cat 2 Pit Stop",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
      },
      titleFirst,
    );
    assert.equal(mergeVaultIntoLocal(titleFirst, cat2({ updatedAt: 50 })), "local");
    assert.equal(crewHasRows(collectPack(titleFirst, "new-cat2pit")?.crew), true);

    const leftoverDesk = memoryStore();
    applyPackToStore(
      leftoverDesk,
      cat2({
        updatedAt: 9000,
        ownerEmail: "robertmhenderson582@gmail.com",
        equipment: { largeTools: [], thirdParty: [] },
        otherCost: { perDiemRate: 140, travel: [{ id: "travel-staff", travelers: 1 }], misc: [] },
        subcontractor: { lines: [], cards: [] },
      }),
    );
    mergeVaultIntoLocal(
      leftoverDesk,
      cat2({
        updatedAt: 400,
        ownerEmail: "nathanboyte@gmail.com",
        sharedWith: ["robertmhenderson582@gmail.com"],
        equipment: { largeTools: [{ id: "lt-1", itemId: "air-mover", qty: 1 }], thirdParty: [] },
        otherCost: { perDiemRate: 140, travel: [{ id: "travel-staff", travelers: 1 }], misc: [{ id: "m1", item: "Steel", qty: 2, each: 40 }] },
        subcontractor: { lines: [{ id: "sb-1", vendor: "Apex NDE", qty: 2, rate: 85 }], cards: [] },
        fcr: { log: [{ id: "fcr-1" }], people: [] },
      }),
    );
    const afterShare = collectPack(leftoverDesk, "new-cat2pit");
    assert.equal(((afterShare?.equipment as { largeTools: unknown[] }).largeTools || []).length, 1);
    assert.equal(((afterShare?.subcontractor as { lines: unknown[] }).lines || []).length, 1);
    assert.equal(((afterShare?.otherCost as { misc: unknown[] }).misc || []).length, 1);
    assert.equal(((afterShare?.fcr as { log: unknown[] }).log || []).length, 1);
    assert.ok(leftoverDesk.getItem(`${FCR_STORE_PREFIX}${newEstimateKey("new-cat2pit")}`));

    applyPackToStore(
      leftoverDesk,
      cat2({
        updatedAt: 12_000,
        otherCost: { perDiemRate: 140, travel: [{ id: "travel-staff", travelers: 1 }], misc: [] },
        equipment: { largeTools: [], thirdParty: [] },
        subcontractor: { lines: [], cards: [] },
      }),
    );
    const afterThinWrite = collectPack(leftoverDesk, "new-cat2pit");
    assert.equal(((afterThinWrite?.equipment as { largeTools: unknown[] }).largeTools || []).length, 1);
    assert.equal(((afterThinWrite?.subcontractor as { lines: unknown[] }).lines || []).length, 1);
    assert.equal(((afterThinWrite?.otherCost as { misc: unknown[] }).misc || []).length, 1);
  });

  it("strips Drive ids from a public pack payload", () => {
    const pack = publicPack(cat2());
    assert.equal(responseLeaksDrive(pack), false);
    assert.equal(responseLeaksDrive({ folder: "1y6Q3TOnpXzV-Y1oeqjjrHfSXt9hcIrgW" }), true);
    const parsed = parseIncomingPack({ packId: "new-cat2pit", title: "Cat 2 Pit Stop" });
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal(parsed.pack.status, undefined);
    const migrated = parseIncomingPack({ packId: "new-cat2pit", title: "Cat 2 Pit Stop", status: "Estimate" });
    assert.equal(migrated.ok, true);
    if (migrated.ok) assert.equal(migrated.pack.status, "Draft");
    const locked = parseIncomingPack({ packId: "new-cat2pit", title: "Cat 2 Pit Stop", status: "Locked" });
    assert.equal(locked.ok, true);
    if (locked.ok) {
      assert.equal(locked.pack.status, "Locked");
      assert.equal(publicPack(locked.pack).status, "Locked");
    }
    const budgetAward = parseIncomingPack({
      packId: "new-cat2pit",
      title: "Cat 2 Pit Stop",
      site: "Wood River — Roxana, IL",
      status: "Awarded",
    });
    assert.equal(budgetAward.ok, true);
    if (budgetAward.ok) assert.equal(budgetAward.pack.status, "Locked");
    const bidAward = parseIncomingPack({
      packId: "new-yates-bid",
      title: "Yates bid",
      client: "Georgia Power",
      site: "Plant Yates",
      status: "Awarded",
    });
    assert.equal(bidAward.ok, true);
    if (bidAward.ok) assert.equal(bidAward.pack.status, "Awarded");
    assert.equal(parseIncomingPack({ packId: "est-u3" }).ok, false);
  });

  it("collects pack status from identity or localStorage and keeps it on apply", () => {
    const store = memoryStore();
    rememberLocalPack(
      {
        packId: "new-cat2pit",
        title: "Cat 2 Pit Stop",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        status: "Review",
      },
      store,
    );
    const collected = collectPack(store, "new-cat2pit");
    assert.equal(collected?.status, "Review");
    applyPackToStore(store, { ...collected!, status: "Budgetary" });
    assert.equal(collectPack(store, "new-cat2pit")?.status, "Budgetary");
    const fromMirror = memoryStore();
    rememberLocalPack(
      {
        packId: "new-legacy-status",
        title: "Old sheet",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
      },
      fromMirror,
    );
    fromMirror.setItem("hs_estimate_status_v1:new-legacy-status", "Estimate");
    assert.equal(collectPack(fromMirror, "new-legacy-status")?.status, "Draft");
    rememberLocalPack(
      {
        packId: "new-wr-award",
        title: "Aromatics",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        status: "Awarded",
      },
      store,
    );
    assert.equal(collectPack(store, "new-wr-award")?.status, "Locked");
    const yates = rememberLocalPack(
      {
        packId: "new-yates-award",
        title: "Yates bid",
        client: "Georgia Power",
        site: "Plant Yates",
        status: "Awarded",
      },
      store,
    );
    assert.equal(yates?.status, "Awarded");
  });

  it("persists subcontractors on the pack without wiping crew, equipment, or Other Cost", () => {
    const store = memoryStore();
    const key = newEstimateKey("new-cat2pit");
    rememberLocalPack(
      {
        packId: "new-cat2pit",
        title: "Cat 2 Pit Stop",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
      },
      store,
    );
    store.setItem(`${CREW_STORE_PREFIX}${key}`, JSON.stringify({
      direct: [{ id: "bm-1", position: "Boilermaker", hours: 40 }],
      support: [{ id: "sup-1", position: "Tool Room Attendant" }],
    }));
    store.setItem(`${EQUIPMENT_STORE_PREFIX}${key}`, JSON.stringify({
      largeTools: [{ id: "lt-1", itemId: "air-mover", qty: 1 }],
      thirdParty: [],
    }));
    store.setItem(`${OTHER_COST_STORE_PREFIX}${key}`, JSON.stringify({
      perDiemRate: 140,
      travel: [{ id: "travel-staff", travelers: 1 }],
      misc: [{ id: "m1", item: "Steel", qty: 2, each: 40 }],
    }));
    applyPackToStore(store, {
      packId: "new-cat2pit",
      key,
      title: "Cat 2 Pit Stop",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 100,
      updatedAt: 200,
      ownerEmail: "",
      subcontractor: {
        lines: [{ id: "sb-1", vendor: "Apex NDE", scope: "RT", qty: 2, unit: "each", rate: 85 }],
        cards: [
          {
            id: "sc-1",
            vendor: "Field Co",
            kind: "both",
            labor: [
              {
                id: "sl-1",
                position: "Welder",
                stRate: 85,
                ranges: [{ id: "rg-1", start: "2026-09-14", end: "2026-09-18", hoursPerShift: 10, headcount: 2 }],
              },
            ],
            equipment: [{ id: "se-1", description: "Scaffold", period: "daily", rate: 400, qty: 3, freight: 50 }],
          },
        ],
      },
    });
    const pack = collectPack(store, "new-cat2pit");
    assert.deepEqual((pack?.crew as { direct: Array<{ hours: number }> }).direct, [
      { id: "bm-1", position: "Boilermaker", hours: 40 },
    ]);
    assert.equal(((pack?.equipment as { largeTools: unknown[] }).largeTools || []).length, 1);
    assert.equal((pack?.otherCost as { perDiemRate: number }).perDiemRate, 140);
    assert.equal(((pack?.otherCost as { misc: unknown[] }).misc || []).length, 1);
    assert.equal(((pack?.subcontractor as { lines: Array<{ rate: number }> }).lines || [])[0]?.rate, 85);
    const cards = (pack?.subcontractor as { cards: Array<{ labor: Array<{ stRate: number; ranges: Array<{ start: string }> }>; equipment: Array<{ qty: number }> }> }).cards;
    assert.equal(cards[0]?.labor[0]?.stRate, 85);
    assert.equal(cards[0]?.labor[0]?.ranges[0]?.start, "2026-09-14");
    assert.equal(cards[0]?.equipment[0]?.qty, 3);
    assert.ok(store.getItem(`${SUB_STORE_PREFIX}${key}`));
  });

  it("round-trips Org chart names without rewriting Crew", () => {
    const store = memoryStore();
    rememberLocalPack(
      {
        packId: "new-orgchart",
        title: "Org chart pack",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
      },
      store,
    );
    const key = newEstimateKey("new-orgchart");
    store.setItem(`${CREW_STORE_PREFIX}${key}`, JSON.stringify({
      staff: [{ id: "st-1", position: "Superintendent", ranges: [{ headcount: 1 }] }],
      generalForeman: [{ id: "gf-1", position: "General Foreman BM", ranges: [{ headcount: 1 }] }],
      foreman: [{ id: "fm-1", position: "Foreman PF", ranges: [{ headcount: 3 }] }],
      direct: [{ id: "bm-1", position: "Boilermaker", ranges: [{ headcount: 8 }] }],
    }));
    store.setItem(`${ORG_CHART_STORE_PREFIX}${key}`, JSON.stringify({
      names: { "st-1": { days: "Lee" } },
      parents: { "fm-1:days": "st-1:days" },
    }));
    const pack = collectPack(store, "new-orgchart");
    assert.equal((pack?.orgChart as { names: { "st-1": { days: string } } }).names["st-1"].days, "Lee");
    assert.equal((pack?.crew as { direct: Array<{ position: string }> }).direct[0]?.position, "Boilermaker");
    assert.equal((pack?.crew as { foreman: Array<{ ranges: Array<{ headcount: number }> }> }).foreman[0]?.ranges[0]?.headcount, 3);

    const other = memoryStore();
    applyPackToStore(other, pack!);
    const again = collectPack(other, "new-orgchart");
    assert.equal((again?.orgChart as { names: { "st-1": { days: string } } }).names["st-1"].days, "Lee");
    assert.equal((again?.crew as { direct: Array<{ position: string }> }).direct[0]?.position, "Boilermaker");
    assert.equal((again?.crew as { foreman: Array<{ ranges: Array<{ headcount: number }> }> }).foreman[0]?.ranges[0]?.headcount, 3);
  });

  it("debounces repeat upserts onto one later call", async () => {
    const hits: string[] = [];
    const schedule = scheduleOnce(15);
    schedule("new-cat2pit", () => hits.push("a"));
    schedule("new-cat2pit", () => hits.push("b"));
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.deepEqual(hits, ["b"]);
  });

  it("default Other Cost travel and catalog seeds do not count as work", () => {
    assert.equal(otherCostHasWork(defaultOtherCost()), false);
    assert.equal(otherCostHasWork(aromaticsSheets().otherCost), true);
    assert.equal(equipmentHasWork({ largeTools: [], thirdParty: [] }), false);
    assert.equal(equipmentHasWork(aromaticsSheets().equipment), true);
    assert.equal(subcontractorHasWork({ lines: [], cards: [] }), false);
    assert.equal(subcontractorHasWork(aromaticsSheets().subcontractor), true);
  });

  it("a thin title-only vault stub cannot wipe local Aromatics sheets", () => {
    const local = aromatics();
    const stub = thinAromaticsStub({ updatedAt: 99_000 });
    const picked = pickPack(local, stub);
    assert.equal(((picked?.equipment as { largeTools: unknown[] }).largeTools || []).length, 3);
    assert.equal((picked?.crew as { staff: unknown[] }).staff.length, 15);
    assert.equal(picked?.title, "2027 Aromatics Turnaround");
  });

  it("a thin same-packId leftover and empty local defaults cannot wipe 2027 Aromatics vault sheets", () => {
    const leftover = thinAromaticsStub();
    const vault = aromatics();
    assert.equal(preferCanonicalPack(leftover, vault).ownerEmail, "nathanboyte@gmail.com");
    assert.equal(collapsePacksById([leftover, vault]).length, 1);
    const collapsed = collapsePacksById([leftover, vault])[0];
    assert.equal(((collapsed?.equipment as { largeTools: unknown[] }).largeTools || []).length, 3);
    assert.equal(((collapsed?.equipment as { thirdParty: unknown[] }).thirdParty || []).length, 30);
    assert.equal(((collapsed?.subcontractor as { cards: unknown[] }).cards || []).length, 4);
    assert.equal(((collapsed?.otherCost as { misc: unknown[] }).misc || []).length, 6);

    const localNewer = aromatics({
      updatedAt: 12_000,
      ownerEmail: "robertmhenderson582@gmail.com",
      transferredFrom: undefined,
      equipment: { largeTools: [], thirdParty: [] },
      otherCost: defaultOtherCost(),
      subcontractor: { lines: [], cards: [] },
    });
    const picked = pickPack(localNewer, vault);
    assert.equal(((picked?.equipment as { largeTools: unknown[] }).largeTools || []).length, 3);
    assert.equal(((picked?.equipment as { thirdParty: unknown[] }).thirdParty || []).length, 30);
    assert.equal(((picked?.subcontractor as { cards: unknown[] }).cards || []).length, 4);
    const travel = (picked?.otherCost as { travel: Array<{ travelers: number; miles: number }> }).travel;
    assert.equal(travel.some((row) => row.travelers === 39 && row.miles === 1700), true);
    assert.equal(travel.some((row) => row.travelers === 100 && row.miles === 800), true);
    assert.equal(((picked?.otherCost as { misc: unknown[] }).misc || []).length, 6);
    assert.equal((picked?.crew as { staff: unknown[] }).staff.length, 15);

    const empty = memoryStore();
    assert.equal(mergeVaultIntoLocal(empty, vault), "vault");
    const fromEmpty = collectPack(empty, AROMATICS_ID);
    assert.equal(((fromEmpty?.equipment as { largeTools: unknown[] }).largeTools || []).length, 3);
    assert.equal(((fromEmpty?.subcontractor as { cards: unknown[] }).cards || []).length, 4);
    assert.equal(((fromEmpty?.otherCost as { misc: unknown[] }).misc || []).length, 6);

    const seeded = memoryStore();
    rememberLocalPack(
      {
        packId: AROMATICS_ID,
        title: "2027 Aromatics Turnaround",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        ownerEmail: "robertmhenderson582@gmail.com",
      },
      seeded,
    );
    const key = newEstimateKey(AROMATICS_ID);
    seeded.setItem(`${EQUIPMENT_STORE_PREFIX}${key}`, JSON.stringify({ largeTools: [], thirdParty: [] }));
    seeded.setItem(`${OTHER_COST_STORE_PREFIX}${key}`, JSON.stringify(defaultOtherCost()));
    seeded.setItem(`${SUB_STORE_PREFIX}${key}`, JSON.stringify({ lines: [], cards: [] }));
    mergeVaultIntoLocal(seeded, vault);
    const restored = collectPack(seeded, AROMATICS_ID);
    assert.equal(((restored?.equipment as { largeTools: unknown[] }).largeTools || []).length, 3);
    assert.equal(((restored?.equipment as { thirdParty: unknown[] }).thirdParty || []).length, 30);
    assert.equal(((restored?.subcontractor as { cards: unknown[] }).cards || []).length, 4);
    assert.equal(((restored?.otherCost as { misc: Array<{ qty: number; each: number }> }).misc || []).some((row) => row.qty === 65 && row.each === 1000), true);
    assert.equal((restored?.crew as { support: unknown[] }).support.length, 7);
    assert.equal(restored?.ownerEmail, "nathanboyte@gmail.com");
  });
});
