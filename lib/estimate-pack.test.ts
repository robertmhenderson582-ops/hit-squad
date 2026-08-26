import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CREW_STORE_PREFIX, PHASE_STORE_PREFIX } from "./phase-schedule.ts";
import { newEstimateKey } from "./estimate-open.ts";
import {
  applyPackToStore,
  collectPack,
  crewHasRows,
  estimateFileName,
  mergeVaultIntoLocal,
  packHasWork,
  parseIncomingPack,
  pickPack,
  publicPack,
  responseLeaksDrive,
  scheduleOnce,
  slugify,
  type EstimatePackSnapshot,
} from "./estimate-pack.ts";
import { rememberLocalPack, type StorageLike } from "./local-estimates.ts";

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
    const titleOnly = cat2({ updatedAt: 900, crew: undefined, schedule: undefined });
    const merged = pickPack(titleOnly, cat2({ updatedAt: 200 }));
    assert.equal(crewHasRows(merged?.crew), true);
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
  });

  it("strips Drive ids from a public pack payload", () => {
    const pack = publicPack(cat2());
    assert.equal(responseLeaksDrive(pack), false);
    assert.equal(responseLeaksDrive({ folder: "1y6Q3TOnpXzV-Y1oeqjjrHfSXt9hcIrgW" }), true);
    const parsed = parseIncomingPack({ packId: "new-cat2pit", title: "Cat 2 Pit Stop" });
    assert.equal(parsed.ok, true);
    assert.equal(parseIncomingPack({ packId: "est-u3" }).ok, false);
  });

  it("debounces repeat upserts onto one later call", async () => {
    const hits: string[] = [];
    const schedule = scheduleOnce(15);
    schedule("new-cat2pit", () => hits.push("a"));
    schedule("new-cat2pit", () => hits.push("b"));
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.deepEqual(hits, ["b"]);
  });
});
