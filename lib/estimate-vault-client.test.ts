import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyReturnLocally,
  applyTransferLocally,
  flushLocalPacksToVault,
  flushVaultUpsert,
  hydrateFromVault,
  hydrateOpenPack,
  isLeftoverOwnerCopy,
  resetVaultHydrateForTests,
  setVaultViewAs,
  shareVaultPack,
  transferVaultPack,
} from "./estimate-vault-client.ts";
import { VIEW_AS_HEADER } from "./desk-scope.ts";
import { visibleDeskPacks } from "./estimate-scope.ts";
import { jobsOnDesk } from "./jobs.ts";
import { packsMissingFromVault, writeVaultSeen } from "./job-menu.ts";
import { handoffMarkText, TRANSFER_WRITE_ERROR } from "./handoff.ts";
import { packsForViewedDesk, readLensPacks, snapshotLensPack, writeLensPacks } from "./lens-packs.ts";
import { deleteLocalPack, findLocalPack, rememberLocalPack, storageKeyForPack, type StorageLike } from "./local-estimates.ts";
import { isActiveMenuItem, readJobMenu, recordTransferredMenuItem } from "./job-menu.ts";
import { applyPackToStore, collectPack } from "./estimate-pack.ts";
import { CREW_STORE_PREFIX, defaultPhaseSchedule, PHASE_STORE_PREFIX } from "./phase-schedule.ts";
import { addLogRow, emptyFcrPacket, readFcrPacket, writeFcrPacket } from "./change-order-packet.ts";
import { emptyCostReportBook, readCostReport, saveCostSnapshot, writeCostReport } from "./cost-report.ts";
import {
  addPurchaseLine,
  emptyPurchasingBook,
  readPurchasing,
  savePurchasingSnapshot,
  writePurchasing,
} from "./purchasing.ts";
import { EQUIPMENT_STORE_PREFIX } from "./equipment-sheet.ts";
import { OTHER_COST_STORE_PREFIX } from "./other-cost.ts";
import { SUB_STORE_PREFIX } from "./subcontractor.ts";
import { newEstimateKey } from "./estimate-open.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { companyScopeFor } from "./companies.ts";
import { jobTree } from "./job-tree.ts";
import { JAMES_EMAIL } from "./tester-seats.ts";
import { HIS_LEFTOVER_GEN, NATHAN_DESK_EMAIL } from "./his-wood-river.ts";

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

describe("local transfer commit", () => {
  it("keeps the local pack when Drive write fails and only deletes after success", () => {
    const store = memoryStore();
    rememberLocalPack(
      {
        packId: "new-cat2pit",
        title: "Cat 2 Pit Stop",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        ownerEmail: "robertmhenderson582@gmail.com",
      },
      store,
    );
    const item = { id: "new-cat2pit", title: "Cat 2 Pit Stop", packId: "new-cat2pit", toName: "Nathan Boyte" };
    const failed = applyTransferLocally(false, "new-cat2pit", item, store);
    assert.equal(failed.keptLocal, true);
    assert.equal(findLocalPack("new-cat2pit", store)?.title, "Cat 2 Pit Stop");
    assert.equal(isActiveMenuItem(item, readJobMenu(store)), true);
    const collected = collectPack(store, "new-cat2pit");
    assert.equal(collected?.ownerEmail, "robertmhenderson582@gmail.com");

    const ok = applyTransferLocally(true, "new-cat2pit", item, store);
    assert.equal(ok.keptLocal, false);
    assert.equal(findLocalPack("new-cat2pit", store), null);
    assert.equal(readJobMenu(store).transferred[0]?.toName, "Nathan Boyte");
  });

  it("refuses a broken Family A U110 flush with the locked-total reason and does not PUT", async () => {
    resetVaultHydrateForTests();
    const { rodeoU110FilledSnapshot } = await import("./madison-u110.ts");
    const store = memoryStore();
    const filled = rodeoU110FilledSnapshot({ createdAt: 9_000, updatedAt: 9_001 });
    const dropRate = (rows: unknown[] | undefined) =>
      (rows ?? []).map((row) => {
        if (!row || typeof row !== "object") return row;
        const next = { ...(row as Record<string, unknown>) };
        delete next.bookRate;
        return next;
      });
    const crew = filled.crew as {
      staff?: unknown[];
      generalForeman?: unknown[];
      foreman?: unknown[];
      direct?: unknown[];
      support?: unknown[];
    };
    const other = filled.otherCost as { misc?: Array<Record<string, unknown>> };
    applyPackToStore(store, {
      ...filled,
      crew: {
        ...crew,
        staff: dropRate(crew.staff),
        generalForeman: dropRate(crew.generalForeman),
        foreman: dropRate(crew.foreman),
        direct: dropRate(crew.direct),
        support: dropRate(crew.support),
      },
      otherCost: {
        ...other,
        misc: (other.misc ?? []).map((row) => {
          const next = { ...row };
          delete next.bookPriced;
          return next;
        }),
      },
    });
    let hits = 0;
    const previous = globalThis.fetch;
    globalThis.fetch = (async () => {
      hits += 1;
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
      const result = await flushVaultUpsert(filled.packId, store);
      assert.equal(result.ok, false);
      assert.equal("skipped" in result && result.skipped, "integrity");
      assert.match("error" in result ? result.error || "" : "", /Rodeo U110 desk \$815,?419(?:\.38)? ≠ locked \$5,?247,?587/);
      assert.equal(hits, 0);
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("flushes a good Family A U110 seed to Drive", async () => {
    resetVaultHydrateForTests();
    const { rodeoU110FilledSnapshot } = await import("./madison-u110.ts");
    const store = memoryStore();
    applyPackToStore(store, rodeoU110FilledSnapshot({ createdAt: 9_000, updatedAt: 9_001 }));
    let hits = 0;
    const previous = globalThis.fetch;
    globalThis.fetch = (async () => {
      hits += 1;
      return new Response(JSON.stringify({ ok: true, stored: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    try {
      const result = await flushVaultUpsert("new-u11026-rodeo", store);
      assert.equal(result.ok, true);
      assert.equal("skipped" in result && result.skipped, false);
      assert.equal(hits, 1);
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("does not flush a leftover local pack after Turn over", async () => {
    resetVaultHydrateForTests();
    const store = memoryStore();
    rememberLocalPack(
      {
        packId: "new-cat2pit",
        title: "Cat 2 Pit Stop",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        ownerEmail: "robertmhenderson582@gmail.com",
      },
      store,
    );
    applyTransferLocally(true, "new-cat2pit", {
      id: "new-cat2pit",
      title: "Cat 2 Pit Stop",
      packId: "new-cat2pit",
      toName: "Nathan Boyte",
    }, store);
    rememberLocalPack(
      {
        packId: "new-cat2pit",
        title: "Cat 2 Pit Stop",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        ownerEmail: "robertmhenderson582@gmail.com",
      },
      store,
    );
    const calls: string[] = [];
    const previous = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
      const result = await flushVaultUpsert("new-cat2pit", store);
      assert.equal(result.ok, true);
      assert.equal("skipped" in result && result.skipped, true);
      assert.equal(calls.length, 0);
      assert.equal(findLocalPack("new-cat2pit", store), null);
      assert.equal(readJobMenu(store).transferred[0]?.toName, "Nathan Boyte");
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("drops the recipient local copy after a successful return", () => {
    const store = memoryStore();
    rememberLocalPack(
      {
        packId: "new-cat2pit",
        title: "Cat 2 Pit Stop",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        ownerEmail: "nathanboyte@gmail.com",
        transferredFrom: "robertmhenderson582@gmail.com",
        transferredFromName: "Robert Henderson",
      },
      store,
    );
    const kept = applyReturnLocally(false, "new-cat2pit", store);
    assert.equal(kept.keptLocal, true);
    assert.equal(findLocalPack("new-cat2pit", store)?.title, "Cat 2 Pit Stop");
    recordTransferredMenuItem({ id: "new-cat2pit", title: "Cat 2 Pit Stop", toName: "Nathan Boyte" }, store);
    const ok = applyReturnLocally(true, "new-cat2pit", store);
    assert.equal(ok.keptLocal, false);
    assert.equal(findLocalPack("new-cat2pit", store), null);
    assert.equal(readJobMenu(store).transferred.length, 0);
  });

  it("posts the local pack on transfer so an empty Drive can still take it", async () => {
    resetVaultHydrateForTests();
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
    const calls: Array<{ url: string; body: string }> = [];
    const previous = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = typeof init?.body === "string" ? init.body : "";
      calls.push({ url, body });
      return new Response(JSON.stringify({ error: TRANSFER_WRITE_ERROR }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    try {
      const result = await transferVaultPack("new-cat2pit", "nathanboyte@gmail.com", store);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error, TRANSFER_WRITE_ERROR);
      assert.equal(calls.length, 1);
      assert.match(calls[0].url, /\/api\/desk\/estimates\/new-cat2pit\/transfer/);
      const sent = JSON.parse(calls[0].body) as { email?: string; pack?: { packId?: string; title?: string } };
      assert.equal(sent.email, "nathanboyte@gmail.com");
      assert.equal(sent.pack?.packId, "new-cat2pit");
      assert.equal(sent.pack?.title, "Cat 2 Pit Stop");
      assert.equal(findLocalPack("new-cat2pit", store)?.title, "Cat 2 Pit Stop");
    } finally {
      globalThis.fetch = previous;
    }
  });

  it("does not evict owner local packs while hydrating View as Nathan", async () => {
    resetVaultHydrateForTests();
    const store = memoryStore();
    rememberLocalPack(
      {
        packId: "new-robert1",
        title: "Robert working",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        ownerEmail: "robertmhenderson582@gmail.com",
      },
      store,
    );
    writeVaultSeen(["new-robert1"], store);
    const calls: string[] = [];
    const previous = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${init?.method || "GET"} ${String(input)}`);
      const headers = new Headers(init?.headers);
      assert.equal(headers.get(VIEW_AS_HEADER), "nathan");
      return new Response(
        JSON.stringify({
          persisted: true,
          packs: [
            {
              packId: "new-mtaajdwa-f7539",
              key: "new:new-mtaajdwa-f7539",
              title: "Madison CAT 2 (Pit Stop)",
              client: "Phillips 66",
              site: "Wood River — Roxana, IL",
              siteId: "site-madison",
              createdAt: 1,
              updatedAt: 2,
              ownerEmail: "nathanboyte@gmail.com",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    try {
      setVaultViewAs("nathan");
      const packs = await hydrateFromVault(store, { viewAs: "nathan" });
      assert.equal(packs[0]?.title, "Madison CAT 2 (Pit Stop)");
      assert.equal(findLocalPack("new-robert1", store)?.title, "Robert working");
      assert.equal(findLocalPack("new-mtaajdwa-f7539", store)?.ownerEmail, "nathanboyte@gmail.com");
      assert.equal(readLensPacks("nathan", store)[0]?.title, "Madison CAT 2 (Pit Stop)");
      assert.deepEqual(packsMissingFromVault(["new-robert1"], store), []);
      assert.equal(calls.some((row) => row.includes("/api/desk/estimates")), true);
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("keeps a pack shared with the owner when leftover flush would treat View-as bleed as Turn over", async () => {
    resetVaultHydrateForTests();
    const store = memoryStore();
    rememberLocalPack(
      {
        packId: "new-mtaajdwa-f7539",
        title: "Madison CAT 2 (Pit Stop)",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        ownerEmail: "nathanboyte@gmail.com",
        sharedWith: [OWNER_LOGIN_EMAIL],
      },
      store,
    );
    writeVaultSeen(["new-mtaajdwa-f7539"], store);
    assert.equal(
      isLeftoverOwnerCopy({
        ownerEmail: "nathanboyte@gmail.com",
        sharedWith: [OWNER_LOGIN_EMAIL],
      }),
      false,
    );
    const previous = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ persisted: true, packs: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    try {
      await hydrateFromVault(store);
      assert.equal(findLocalPack("new-mtaajdwa-f7539", store)?.ownerEmail, "nathanboyte@gmail.com");
      assert.deepEqual(findLocalPack("new-mtaajdwa-f7539", store)?.sharedWith, [OWNER_LOGIN_EMAIL]);
      assert.equal(readJobMenu(store).transferred.length, 0);
      assert.equal(
        visibleDeskPacks({ email: OWNER_LOGIN_EMAIL, role: "owner" }, false, store).some(
          (row) => row.packId === "new-mtaajdwa-f7539",
        ),
        true,
      );
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("hydrates a shared-with-me pack onto the owner desk from the vault list", async () => {
    resetVaultHydrateForTests();
    const store = memoryStore();
    const previous = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          persisted: true,
          packs: [
            {
              packId: "new-mtaajdwa-f7539",
              key: "new:new-mtaajdwa-f7539",
              title: "Madison CAT 2 (Pit Stop)",
              client: "Phillips 66",
              site: "Wood River — Roxana, IL",
              siteId: "site-madison",
              createdAt: 1,
              updatedAt: 2,
              ownerEmail: "nathanboyte@gmail.com",
              sharedWith: [OWNER_LOGIN_EMAIL],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    try {
      const packs = await hydrateFromVault(store);
      assert.equal(packs[0]?.ownerEmail, "nathanboyte@gmail.com");
      assert.deepEqual(packs[0]?.sharedWith, [OWNER_LOGIN_EMAIL]);
      assert.equal(findLocalPack("new-mtaajdwa-f7539", store)?.ownerEmail, "nathanboyte@gmail.com");
      assert.equal(
        visibleDeskPacks({ email: OWNER_LOGIN_EMAIL, role: "owner" }, false, store).some(
          (row) => row.packId === "new-mtaajdwa-f7539",
        ),
        true,
      );
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("share to the owner keeps Nathan as owner; unshare drops the share mark but owner still sees it", async () => {
    resetVaultHydrateForTests();
    const store = memoryStore();
    rememberLocalPack(
      {
        packId: "new-nathan1",
        title: "Nathan trial",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        ownerEmail: "nathanboyte@gmail.com",
      },
      store,
    );
    const previous = globalThis.fetch;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as { action?: string } : {};
      const shared = body.action === "unshare" ? [] : [OWNER_LOGIN_EMAIL];
      return new Response(
        JSON.stringify({
          pack: {
            packId: "new-nathan1",
            key: "new:new-nathan1",
            title: "Nathan trial",
            client: "Phillips 66",
            site: "Wood River — Roxana, IL",
            siteId: "site-madison",
            createdAt: 1,
            updatedAt: 2,
            ownerEmail: "nathanboyte@gmail.com",
            sharedWith: shared,
          },
          to: { name: "Robert Henderson", email: OWNER_LOGIN_EMAIL },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    try {
      const shared = await shareVaultPack("new-nathan1", OWNER_LOGIN_EMAIL, "share", store);
      assert.equal(shared.ok, true);
      if (shared.ok) assert.equal(shared.pack?.ownerEmail, "nathanboyte@gmail.com");
      assert.deepEqual(findLocalPack("new-nathan1", store)?.sharedWith, [OWNER_LOGIN_EMAIL]);
      assert.equal(
        visibleDeskPacks({ email: OWNER_LOGIN_EMAIL, role: "owner" }, false, store).some(
          (row) => row.packId === "new-nathan1",
        ),
        true,
      );
      const unshared = await shareVaultPack("new-nathan1", OWNER_LOGIN_EMAIL, "unshare", store);
      assert.equal(unshared.ok, true);
      if (unshared.ok) assert.equal(unshared.pack?.ownerEmail, "nathanboyte@gmail.com");
      assert.deepEqual(findLocalPack("new-nathan1", store)?.sharedWith, []);
      assert.equal(findLocalPack("new-nathan1", store)?.ownerEmail, "nathanboyte@gmail.com");
      assert.equal(
        visibleDeskPacks({ email: OWNER_LOGIN_EMAIL, role: "owner" }, false, store).some(
          (row) => row.packId === "new-nathan1",
        ),
        true,
      );
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("Share onto a leftover empty equipment sheet keeps Nathan's worksheets", async () => {
    resetVaultHydrateForTests();
    const store = memoryStore();
    applyPackToStore(store, {
      packId: "new-mtaajdwa-f7539",
      key: "new:new-mtaajdwa-f7539",
      title: "Madison CAT 2 (Pit Stop)",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 1,
      updatedAt: 9000,
      ownerEmail: "nathanboyte@gmail.com",
      equipment: { largeTools: [{ id: "lt-1", itemId: "air-mover", qty: 2 }], thirdParty: [{ id: "tp-1", item: "Crane", rate: 400 }] },
      otherCost: { perDiemRate: 140, travel: [{ id: "travel-staff", travelers: 1 }], misc: [{ id: "m1", item: "Steel", qty: 2, each: 40 }] },
      subcontractor: { lines: [{ id: "sb-1", vendor: "Apex NDE", qty: 2, rate: 85 }], cards: [] },
      fcr: { log: [{ id: "fcr-1", scr: "SCR-1" }], people: [] },
    });
    const previous = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          pack: {
            packId: "new-mtaajdwa-f7539",
            key: "new:new-mtaajdwa-f7539",
            title: "Madison CAT 2 (Pit Stop)",
            client: "Phillips 66",
            site: "Wood River — Roxana, IL",
            siteId: "site-madison",
            createdAt: 1,
            updatedAt: Date.now(),
            ownerEmail: "nathanboyte@gmail.com",
            sharedWith: [OWNER_LOGIN_EMAIL],
            equipment: { largeTools: [], thirdParty: [] },
            otherCost: { perDiemRate: 140, travel: [{ id: "travel-staff", travelers: 1 }], misc: [] },
            subcontractor: { lines: [], cards: [] },
            fcr: { log: [], people: [] },
          },
          to: { name: "Robert Henderson", email: OWNER_LOGIN_EMAIL },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    try {
      const shared = await shareVaultPack("new-mtaajdwa-f7539", OWNER_LOGIN_EMAIL, "share", store);
      assert.equal(shared.ok, true);
      const local = collectPack(store, "new-mtaajdwa-f7539");
      assert.equal(((local?.equipment as { largeTools: unknown[] }).largeTools || []).length, 1);
      assert.equal(((local?.subcontractor as { lines: unknown[] }).lines || []).length, 1);
      assert.equal(((local?.otherCost as { misc: unknown[] }).misc || []).length, 1);
      assert.equal(((local?.fcr as { log: unknown[] }).log || []).length, 1);
      assert.equal(local?.ownerEmail, "nathanboyte@gmail.com");
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("empty vault leftover cannot drop existing owner packs", async () => {
    resetVaultHydrateForTests();
    const store = memoryStore();
    rememberLocalPack(
      {
        packId: "new-mtaajdwa-f7539",
        title: "Madison CAT 2 (Pit Stop)",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        ownerEmail: "robertmhenderson582@gmail.com",
      },
      store,
    );
    rememberLocalPack(
      {
        packId: "new-aromatics-2027",
        title: "2027 Aromatics Turnaround",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        ownerEmail: "robertmhenderson582@gmail.com",
      },
      store,
    );
    writeVaultSeen(["new-mtaajdwa-f7539", "new-aromatics-2027"], store);
    const previous = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ persisted: true, packs: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    try {
      const packs = await hydrateFromVault(store);
      assert.deepEqual(packs, []);
      assert.equal(findLocalPack("new-mtaajdwa-f7539", store)?.title, "Madison CAT 2 (Pit Stop)");
      assert.equal(findLocalPack("new-aromatics-2027", store)?.title, "2027 Aromatics Turnaround");
      assert.equal(readJobMenu(store).transferred.length, 0);
      const owner = { email: OWNER_LOGIN_EMAIL, role: "owner" as const };
      const desk = packsForViewedDesk(owner, false, null, store);
      const jobs = jobsOnDesk(undefined, desk, false);
      assert.equal(jobs.some((job) => job.title === "Madison CAT 2 (Pit Stop)"), true);
      assert.equal(jobs.some((job) => job.title === "2027 Aromatics Turnaround"), true);
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("re-applies a cached Follow hydrate so Cat 2 comes back without a reload", async () => {
    resetVaultHydrateForTests();
    const store = memoryStore();
    const previous = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls += 1;
      const headers = new Headers(init?.headers);
      assert.equal(headers.get(VIEW_AS_HEADER), "nathan");
      return new Response(
        JSON.stringify({
          persisted: true,
          packs: [
            {
              packId: "new-mtaajdwa-f7539",
              key: "new:new-mtaajdwa-f7539",
              title: "Madison CAT 2 (Pit Stop)",
              client: "Phillips 66",
              site: "Wood River — Roxana, IL",
              siteId: "site-madison",
              createdAt: 1,
              updatedAt: 2,
              ownerEmail: "nathanboyte@gmail.com",
              transferredFrom: "robertmhenderson582@gmail.com",
              transferredFromName: "Robert Henderson",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    try {
      setVaultViewAs("nathan");
      await hydrateFromVault(store, { viewAs: "nathan" });
      assert.equal(findLocalPack("new-mtaajdwa-f7539", store)?.ownerEmail, "nathanboyte@gmail.com");
      deleteLocalPack("new-mtaajdwa-f7539", store);
      assert.equal(findLocalPack("new-mtaajdwa-f7539", store), null);
      await hydrateFromVault(store, { viewAs: "nathan" });
      assert.equal(calls, 1);
      assert.equal(findLocalPack("new-mtaajdwa-f7539", store)?.title, "Madison CAT 2 (Pit Stop)");
      assert.equal(findLocalPack("new-mtaajdwa-f7539", store)?.ownerEmail, "nathanboyte@gmail.com");
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("merges a leftover owner copy with Nathan's shared vault pack before leftover flush", async () => {
    resetVaultHydrateForTests();
    const store = memoryStore();
    rememberLocalPack(
      {
        packId: "new-mtaajdwa-f7539",
        title: "Madison CAT 2 (Pit Stop)",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        ownerEmail: OWNER_LOGIN_EMAIL,
      },
      store,
    );
    writeVaultSeen(["new-mtaajdwa-f7539"], store);
    const previous = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          persisted: true,
          packs: [
            {
              packId: "new-mtaajdwa-f7539",
              key: "new:new-mtaajdwa-f7539",
              title: "Working estimate",
              client: "Phillips 66",
              site: "Wood River — Roxana, IL",
              siteId: "site-madison",
              createdAt: 1,
              updatedAt: 2,
              ownerEmail: "nathanboyte@gmail.com",
              sharedWith: [OWNER_LOGIN_EMAIL],
              transferredFrom: OWNER_LOGIN_EMAIL,
              transferredFromName: "Robert Henderson",
              transferredTo: "nathanboyte@gmail.com",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    try {
      await hydrateFromVault(store);
      const local = findLocalPack("new-mtaajdwa-f7539", store);
      assert.equal(local?.ownerEmail, "nathanboyte@gmail.com");
      assert.deepEqual(local?.sharedWith, [OWNER_LOGIN_EMAIL]);
      const ownerDesk = visibleDeskPacks({ email: OWNER_LOGIN_EMAIL, role: "owner" }, false, store);
      assert.equal(ownerDesk.some((row) => row.packId === "new-mtaajdwa-f7539"), true);
      assert.equal(jobsOnDesk([], ownerDesk, false).some((job) => job.title === "Madison CAT 2 (Pit Stop)"), true);
      assert.equal(handoffMarkText(local!, "nathanboyte@gmail.com"), "Shared with Robert Henderson.");
      assert.equal(handoffMarkText(local!, OWNER_LOGIN_EMAIL), "Shared / from Nathan Boyte.");
      assert.equal(readJobMenu(store).transferred.length, 0);
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("does not flush a tester-owned share as the owner vault", async () => {
    resetVaultHydrateForTests();
    const store = memoryStore();
    rememberLocalPack(
      {
        packId: "new-mtaajdwa-f7539",
        title: "Madison CAT 2 (Pit Stop)",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        ownerEmail: "nathanboyte@gmail.com",
        sharedWith: [OWNER_LOGIN_EMAIL],
      },
      store,
    );
    rememberLocalPack(
      {
        packId: "new-robert1",
        title: "Robert working",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        ownerEmail: OWNER_LOGIN_EMAIL,
      },
      store,
    );
    const bodies: Array<{ pack?: { packId?: string; ownerEmail?: string } }> = [];
    const previous = globalThis.fetch;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof init?.body === "string" ? init.body : "";
      bodies.push(raw ? (JSON.parse(raw) as { pack?: { packId?: string; ownerEmail?: string } }) : {});
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
      await flushLocalPacksToVault(store);
      assert.equal(bodies.some((row) => row.pack?.packId === "new-mtaajdwa-f7539"), false);
      assert.equal(bodies.some((row) => row.pack?.packId === "new-robert1"), true);
      assert.equal(findLocalPack("new-mtaajdwa-f7539", store)?.ownerEmail, "nathanboyte@gmail.com");
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("View as share stamps the lens snapshot so Nathan's card reads Shared", async () => {
    resetVaultHydrateForTests();
    const store = memoryStore();
    writeLensPacks(
      "nathan",
      [
        snapshotLensPack({
          packId: "new-mtaajdwa-f7539",
          key: "new:new-mtaajdwa-f7539",
          title: "Madison CAT 2 (Pit Stop)",
          client: "Phillips 66",
          site: "Wood River — Roxana, IL",
          siteId: "site-madison",
          createdAt: 1,
          updatedAt: 2,
          ownerEmail: "nathanboyte@gmail.com",
          transferredFrom: OWNER_LOGIN_EMAIL,
          transferredFromName: "Robert Henderson",
        }),
      ],
      store,
    );
    const previous = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          pack: {
            packId: "new-mtaajdwa-f7539",
            key: "new:new-mtaajdwa-f7539",
            title: "Madison CAT 2 (Pit Stop)",
            client: "Phillips 66",
            site: "Wood River — Roxana, IL",
            siteId: "site-madison",
            createdAt: 1,
            updatedAt: 2,
            ownerEmail: "nathanboyte@gmail.com",
            sharedWith: [OWNER_LOGIN_EMAIL],
            transferredFrom: OWNER_LOGIN_EMAIL,
            transferredFromName: "Robert Henderson",
          },
          to: { name: "Robert Henderson", email: OWNER_LOGIN_EMAIL },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    try {
      setVaultViewAs("nathan");
      const shared = await shareVaultPack("new-mtaajdwa-f7539", OWNER_LOGIN_EMAIL, "share", store);
      assert.equal(shared.ok, true);
      assert.equal(readLensPacks("nathan", store)[0]?.ownerEmail, "nathanboyte@gmail.com");
      assert.deepEqual(readLensPacks("nathan", store)[0]?.sharedWith, [OWNER_LOGIN_EMAIL]);
      assert.deepEqual(findLocalPack("new-mtaajdwa-f7539", store)?.sharedWith, [OWNER_LOGIN_EMAIL]);
      assert.equal(
        handoffMarkText(readLensPacks("nathan", store)[0]!, "nathanboyte@gmail.com"),
        "Shared with Robert Henderson.",
      );
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("hydrates 2027 Aromatics equipment, sub, and otherCost from the richer vault onto empty local defaults", async () => {
    resetVaultHydrateForTests();
    const store = memoryStore();
    const packId = "new-mtj7bvtk-akmei";
    const key = newEstimateKey(packId);
    rememberLocalPack(
      {
        packId,
        title: "2027 Aromatics Turnaround",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        ownerEmail: OWNER_LOGIN_EMAIL,
      },
      store,
    );
    store.setItem(`${EQUIPMENT_STORE_PREFIX}${key}`, JSON.stringify({ largeTools: [], thirdParty: [] }));
    store.setItem(
      `${OTHER_COST_STORE_PREFIX}${key}`,
      JSON.stringify({
        travel: [
          { id: "travel-staff", travelers: 0, miles: 0, perMile: 0 },
          { id: "travel-craft", travelers: 0, miles: 0, perMile: 0 },
        ],
        misc: [{ id: "mc-seed", item: "Alloy rod", qty: 1, each: 0 }],
      }),
    );
    store.setItem(`${SUB_STORE_PREFIX}${key}`, JSON.stringify({ lines: [], cards: [] }));
    const previous = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          persisted: true,
          packs: [
            {
              packId,
              key,
              title: "2027 Aromatics Turnaround",
              client: "Phillips 66",
              site: "Wood River — Roxana, IL",
              siteId: "site-madison",
              createdAt: 1,
              updatedAt: 400,
              ownerEmail: "nathanboyte@gmail.com",
              sharedWith: [OWNER_LOGIN_EMAIL],
              transferredFrom: OWNER_LOGIN_EMAIL,
              transferredTo: "nathanboyte@gmail.com",
              equipment: {
                largeTools: [{ id: "lt-1", itemId: "wet:8:truck-crew", qty: 1 }],
                thirdParty: [{ id: "tp-1", item: "6 pack Stick/Tig / Mig pulse", rate: 1225, qty: 12, freight: 50 }],
              },
              otherCost: {
                travel: [
                  { id: "travel-staff", travelers: 39, miles: 1700, perMile: 0.76 },
                  { id: "travel-craft", travelers: 100, miles: 800, perMile: 0.76 },
                ],
                misc: [{ id: "mc-1", item: "Alloy rod", qty: 65, each: 1000 }],
              },
              subcontractor: {
                cards: [{ id: "sc-1", vendor: "JVIC Tensioning/Torquing/Machining/Bundle Equipment and Labor" }],
              },
              crew: { staff: Array.from({ length: 15 }, (_, index) => ({ id: `st-${index + 1}` })) },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    try {
      const packs = await hydrateFromVault(store);
      assert.equal(packs[0]?.packId, packId);
      const local = collectPack(store, packId);
      assert.equal(((local?.equipment as { largeTools: unknown[] }).largeTools || []).length, 1);
      assert.equal(((local?.equipment as { thirdParty: unknown[] }).thirdParty || []).length, 1);
      assert.equal(((local?.subcontractor as { cards: unknown[] }).cards || []).length, 1);
      assert.equal(((local?.otherCost as { misc: Array<{ qty: number }> }).misc || [])[0]?.qty, 65);
      assert.equal((local?.crew as { staff: unknown[] }).staff.length, 15);
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("hydrates smashed local Aromatics from the 2027 vault including otherCost", async () => {
    resetVaultHydrateForTests();
    const store = memoryStore();
    const packId = "new-mtj7bvtk-akmei";
    const seed = defaultPhaseSchedule();
    const job2027 = {
      projectStart: "2027-01-11",
      phases: seed.phases.map((row) => {
        if (row.id === "pre") return { ...row, start: "2027-01-11", stop: "2027-02-28" };
        return row;
      }),
    };
    applyPackToStore(store, {
      packId,
      key: `new:${packId}`,
      title: "2027 Aromatics Turnaround",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 1,
      updatedAt: 99_000,
      ownerEmail: OWNER_LOGIN_EMAIL,
      schedule: seed,
      crew: { staff: [{ id: "st-1", ranges: [{ phaseId: "pre", start: "2026-09-03", end: "2026-09-03" }] }] },
      otherCost: {
        travel: [{ id: "travel-staff", travelers: 2, miles: 80, perMile: 0.76 }],
        misc: [{ id: "mc-thin", item: "Seed leftover", qty: 1, each: 50 }],
      },
    });
    const previous = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          persisted: true,
          packs: [
            {
              packId,
              key: `new:${packId}`,
              title: "2027 Aromatics Turnaround",
              client: "Phillips 66",
              site: "Wood River — Roxana, IL",
              siteId: "site-madison",
              createdAt: 1,
              updatedAt: 400,
              ownerEmail: "nathanboyte@gmail.com",
              schedule: job2027,
              crew: { staff: [{ id: "st-1", ranges: [{ phaseId: "pre", start: "2027-01-11", end: "2027-02-28" }] }] },
              otherCost: {
                travel: [{ id: "travel-staff", travelers: 39, miles: 1700, perMile: 0.76 }],
                misc: [{ id: "mc-1", item: "Alloy rod", qty: 65, each: 1000 }],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    try {
      await hydrateFromVault(store);
      const local = collectPack(store, packId);
      assert.equal((local?.schedule as { projectStart?: string }).projectStart, "2027-01-11");
      assert.equal(((local?.otherCost as { misc: Array<{ qty: number }> }).misc || [])[0]?.qty, 65);
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("opens Aromatics from the pack GET even while list hydrate is in flight", async () => {
    resetVaultHydrateForTests();
    const store = memoryStore();
    const packId = "new-mtj7bvtk-akmei";
    const job2027 = {
      projectStart: "2027-01-11",
      phases: defaultPhaseSchedule().phases.map((row) =>
        row.id === "pre" ? { ...row, start: "2027-01-11", stop: "2027-02-28" } : row,
      ),
    };
    applyPackToStore(store, {
      packId,
      key: `new:${packId}`,
      title: "2027 Aromatics Turnaround",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 1,
      updatedAt: 99_000,
      ownerEmail: OWNER_LOGIN_EMAIL,
      schedule: job2027,
      crew: { staff: [{ id: "st-1", ranges: [{ phaseId: "pre", start: "2027-01-11", end: "2027-01-11" }] }] },
      otherCost: { misc: [{ id: "mc-thin", item: "Seed leftover", qty: 1, each: 50 }] },
    });
    const urls: string[] = [];
    let releaseList: ((value: Response) => void) | undefined;
    const listGate = new Promise<Response>((resolve) => {
      releaseList = resolve;
    });
    const previous = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.includes(`/api/desk/estimates/${packId}`)) {
        return new Response(
          JSON.stringify({
            pack: {
              packId,
              key: `new:${packId}`,
              title: "2027 Aromatics Turnaround",
              client: "Phillips 66",
              site: "Wood River — Roxana, IL",
              siteId: "site-madison",
              createdAt: 1,
              updatedAt: 400,
              ownerEmail: "nathanboyte@gmail.com",
              schedule: job2027,
              crew: { staff: [{ id: "st-1", ranges: [{ phaseId: "pre", start: "2027-01-11", end: "2027-02-28" }] }] },
              otherCost: { misc: [{ id: "mc-1", item: "Alloy rod", qty: 65, each: 1000 }] },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return listGate;
    }) as typeof fetch;
    try {
      const listPromise = hydrateFromVault(store);
      const opened = await hydrateOpenPack(packId, store);
      assert.equal(urls.some((url) => url.includes(`/api/desk/estimates/${packId}`)), true);
      assert.equal(
        ((opened[0]?.crew as { staff: Array<{ ranges: Array<{ end: string }> }> }).staff[0]?.ranges[0]?.end),
        "2027-02-28",
      );
      const local = collectPack(store, packId);
      assert.equal(
        ((local?.crew as { staff: Array<{ ranges: Array<{ end: string }> }> }).staff[0]?.ranges[0]?.end),
        "2027-02-28",
      );
      assert.equal(((local?.otherCost as { misc: Array<{ qty: number }> }).misc || [])[0]?.qty, 65);
      releaseList?.(
        new Response(JSON.stringify({ persisted: true, packs: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      await listPromise;
      const afterList = collectPack(store, packId);
      assert.equal(
        ((afterList?.crew as { staff: Array<{ ranges: Array<{ end: string }> }> }).staff[0]?.ranges[0]?.end),
        "2027-02-28",
      );
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("does not flush a 2027 stub-smashed Aromatics pack to Drive", async () => {
    resetVaultHydrateForTests();
    const store = memoryStore();
    const packId = "new-mtj7bvtk-akmei";
    applyPackToStore(store, {
      packId,
      key: `new:${packId}`,
      title: "2027 Aromatics Turnaround",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 1,
      updatedAt: 99_000,
      ownerEmail: OWNER_LOGIN_EMAIL,
      schedule: {
        projectStart: "2027-01-11",
        phases: defaultPhaseSchedule().phases.map((row) =>
          row.id === "pre" ? { ...row, start: "2027-01-11", stop: "2027-02-28" } : row,
        ),
      },
      crew: { staff: [{ id: "st-1", ranges: [{ phaseId: "pre", start: "2027-01-11", end: "2027-01-11" }] }] },
    });
    const bodies: unknown[] = [];
    const previous = globalThis.fetch;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof init?.body === "string" ? init.body : "";
      if (raw) bodies.push(JSON.parse(raw));
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
      const result = await flushVaultUpsert(packId, store);
      assert.equal(result.ok, true);
      assert.equal("skipped" in result && result.skipped, true);
      assert.equal(bodies.length, 0);
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("does not flush a seed-smashed Aromatics pack to Drive", async () => {
    resetVaultHydrateForTests();
    const store = memoryStore();
    const packId = "new-mtj7bvtk-akmei";
    applyPackToStore(store, {
      packId,
      key: `new:${packId}`,
      title: "2027 Aromatics Turnaround",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 1,
      updatedAt: 99_000,
      ownerEmail: OWNER_LOGIN_EMAIL,
      schedule: defaultPhaseSchedule(),
      crew: { staff: [{ id: "st-1", ranges: [{ phaseId: "pre", start: "2026-09-03", end: "2026-09-03" }] }] },
      otherCost: { misc: [{ id: "mc-thin", item: "Seed leftover", qty: 1, each: 50 }] },
    });
    const bodies: unknown[] = [];
    const previous = globalThis.fetch;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof init?.body === "string" ? init.body : "";
      if (raw) bodies.push(JSON.parse(raw));
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
      const result = await flushVaultUpsert(packId, store);
      assert.equal(result.ok, true);
      assert.equal("skipped" in result && result.skipped, true);
      assert.equal(bodies.length, 0);
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("does not flush empty Boiler 17 or identity-only Cat 2 back to Drive", async () => {
    resetVaultHydrateForTests();
    const store = memoryStore();
    rememberLocalPack(
      {
        packId: "new-b1726",
        title: "Boiler 17 2026",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        ownerEmail: OWNER_LOGIN_EMAIL,
        status: "Locked",
      },
      store,
    );
    store.setItem(`${CREW_STORE_PREFIX}${storageKeyForPack("new-b1726")}`, JSON.stringify({ staff: [], direct: [] }));
    store.setItem(`${PHASE_STORE_PREFIX}${storageKeyForPack("new-b1726")}`, JSON.stringify(defaultPhaseSchedule()));
    rememberLocalPack(
      {
        packId: "new-mtaajdwa-f7539",
        title: "Madison CAT 2 (Pit Stop)",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        ownerEmail: OWNER_LOGIN_EMAIL,
      },
      store,
    );
    const bodies: unknown[] = [];
    const previous = globalThis.fetch;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof init?.body === "string" ? init.body : "";
      if (raw) bodies.push(JSON.parse(raw));
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
      const boiler = await flushVaultUpsert("new-b1726", store);
      assert.equal(boiler.ok, true);
      assert.equal("skipped" in boiler && boiler.skipped, true);
      const cat = await flushVaultUpsert("new-mtaajdwa-f7539", store);
      assert.equal(cat.ok, true);
      assert.equal("skipped" in cat && cat.skipped, true);
      assert.equal(bodies.length, 0);
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("post-restore local smash cannot re-upload and poison other seats", async () => {
    resetVaultHydrateForTests();
    const packId = "new-mtaajdwa-f7539";
    const store = memoryStore();
    applyPackToStore(store, {
      packId,
      key: `new:${packId}`,
      title: "Madison CAT 2 (Pit Stop)",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 50,
      updatedAt: 800,
      ownerEmail: OWNER_LOGIN_EMAIL,
      schedule: { projectStart: "2026-09-01", phases: [{ id: "pre", on: true, start: "2026-09-01", stop: "2026-09-03" }] },
      crew: { direct: [{ id: "bm-1", ranges: [{ start: "2026-09-01", end: "2026-09-03" }] }] },
    });
    const key = storageKeyForPack(packId);
    store.setItem(
      `${PHASE_STORE_PREFIX}${key}`,
      JSON.stringify({
        projectStart: "2027-01-11",
        phases: defaultPhaseSchedule().phases.map((row) =>
          row.id === "pre" ? { ...row, start: "2027-01-11", stop: "2027-02-28" } : { ...row, start: "2027-03-01", stop: "2027-05-21" },
        ),
      }),
    );
    store.setItem(
      `${CREW_STORE_PREFIX}${key}`,
      JSON.stringify({
        staff: [{ id: "st-1", ranges: [{ phaseId: "pre", start: "2027-01-11", end: "2027-05-21" }] }],
        direct: [],
      }),
    );
    const smashed = collectPack(store, packId);
    assert.equal((smashed?.schedule as { projectStart?: string }).projectStart, "2027-01-11");
    const bodies: unknown[] = [];
    const previous = globalThis.fetch;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof init?.body === "string" ? init.body : "";
      if (raw) bodies.push(JSON.parse(raw));
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
      const result = await flushVaultUpsert(packId, store);
      assert.equal(result.ok, true);
      assert.equal("skipped" in result && result.skipped, true);
      assert.equal(bodies.length, 0);
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("collects equipment, sub, and otherCost on upsert and a failed Drive write errors", async () => {
    resetVaultHydrateForTests();
    const store = memoryStore();
    const packId = "new-cat2pit";
    applyPackToStore(store, {
      packId,
      key: `new:${packId}`,
      title: "Cat 2 Pit Stop",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 1,
      updatedAt: 2,
      ownerEmail: OWNER_LOGIN_EMAIL,
      schedule: { projectStart: "2026-09-01", phases: [{ id: "pre", on: true, start: "2026-09-01", stop: "2026-09-03" }] },
      equipment: { largeTools: [{ id: "lt-1", itemId: "wet:8:truck-crew", qty: 1 }], thirdParty: [] },
      otherCost: { travel: [{ id: "travel-staff", travelers: 39, miles: 1700, perMile: 0.76 }], misc: [{ id: "mc-1", item: "Alloy rod", qty: 65, each: 1000 }] },
      subcontractor: { cards: [{ id: "sc-1", vendor: "Hartford" }] },
      crew: { staff: [{ id: "st-1" }] },
    });
    const bodies: Array<{ pack?: { equipment?: { largeTools?: unknown[] }; otherCost?: { misc?: unknown[] }; subcontractor?: { cards?: unknown[] } } }> = [];
    const previous = globalThis.fetch;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof init?.body === "string" ? init.body : "";
      if (raw) bodies.push(JSON.parse(raw) as (typeof bodies)[number]);
      return new Response(JSON.stringify({ error: "Could not store that package." }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    try {
      const result = await flushVaultUpsert(packId, store);
      assert.equal(result.ok, false);
      assert.equal("error" in result && result.error, "Could not store that package.");
      assert.equal(bodies.length, 2);
      assert.equal((bodies[0]?.pack?.equipment?.largeTools || []).length, 1);
      assert.equal((bodies[0]?.pack?.otherCost?.misc || []).length, 1);
      assert.equal((bodies[0]?.pack?.subcontractor?.cards || []).length, 1);
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("flushVaultUpsert sends the ECR log with the live pack", async () => {
    resetVaultHydrateForTests();
    const store = memoryStore();
    const packId = "new-cat2pit";
    rememberLocalPack(
      {
        packId,
        title: "Cat 2 Pit Stop",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        ownerEmail: OWNER_LOGIN_EMAIL,
      },
      store,
    );
    writeFcrPacket(
      newEstimateKey(packId),
      addLogRow(emptyFcrPacket(), { id: "ecr-flush-1", scope: "Night extra", requestedBy: "Ben Peffley" }),
      store,
    );
    const bodies: Array<{ pack?: { fcr?: { log?: Array<{ scope?: string }> } } }> = [];
    const previous = globalThis.fetch;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof init?.body === "string" ? init.body : "";
      if (raw) bodies.push(JSON.parse(raw) as (typeof bodies)[number]);
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
      const result = await flushVaultUpsert(packId, store);
      assert.equal(result.ok, true);
      assert.equal((bodies[0]?.pack?.fcr?.log || [])[0]?.scope, "Night extra");
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("hydrates an ECR log from the vault onto an empty browser", async () => {
    resetVaultHydrateForTests();
    const empty = memoryStore();
    const previous = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          persisted: true,
          packs: [
            {
              packId: "new-cat2pit",
              key: "new:new-cat2pit",
              title: "Cat 2 Pit Stop",
              client: "Phillips 66",
              site: "Wood River — Roxana, IL",
              siteId: "site-madison",
              createdAt: 1,
              updatedAt: 2,
              ownerEmail: OWNER_LOGIN_EMAIL,
              fcr: {
                header: { pm: "Ben Peffley", costTracker: "", publishDate: "", nte: "", projectScope: "" },
                log: [{ id: "ecr-hydrate-1", scr: "ECR-12", scope: "Extra weld", status: "Open" }],
                people: [],
                sub: 0,
                equipment: 0,
                misc: 0,
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    try {
      const packs = await hydrateFromVault(empty);
      assert.equal(((packs[0]?.fcr as { log: Array<{ scope: string }> }).log || [])[0]?.scope, "Extra weld");
      const read = readFcrPacket(newEstimateKey("new-cat2pit"), empty);
      assert.equal(read.log.length, 1);
      assert.equal(read.log[0]?.id, "ecr-hydrate-1");
      assert.equal(read.log[0]?.scope, "Extra weld");
      assert.equal(read.header.pm, "Ben Peffley");
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("flushVaultUpsert sends the cost report snapshot with the live pack", async () => {
    resetVaultHydrateForTests();
    const store = memoryStore();
    const packId = "new-cat2pit";
    rememberLocalPack(
      {
        packId,
        title: "Cat 2 Pit Stop",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        ownerEmail: OWNER_LOGIN_EMAIL,
      },
      store,
    );
    writeCostReport(
      newEstimateKey(packId),
      saveCostSnapshot(
        { ...emptyCostReportBook(), statusDate: "2026-09-05", notes: "Friday PPR" },
        { total: 88000, hours: 240, lines: [] },
        9,
      ),
      store,
    );
    const bodies: Array<{ pack?: { costReport?: { snapshots?: Array<{ notes?: string }> } } }> = [];
    const previous = globalThis.fetch;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof init?.body === "string" ? init.body : "";
      if (raw) bodies.push(JSON.parse(raw) as (typeof bodies)[number]);
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
      const result = await flushVaultUpsert(packId, store);
      assert.equal(result.ok, true);
      assert.equal((bodies[0]?.pack?.costReport?.snapshots || [])[0]?.notes, "Friday PPR");
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("hydrates a cost report snapshot from the vault onto an empty browser", async () => {
    resetVaultHydrateForTests();
    const empty = memoryStore();
    const previous = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          persisted: true,
          packs: [
            {
              packId: "new-cat2pit",
              key: "new:new-cat2pit",
              title: "Cat 2 Pit Stop",
              client: "Phillips 66",
              site: "Wood River — Roxana, IL",
              siteId: "site-madison",
              createdAt: 1,
              updatedAt: 2,
              ownerEmail: OWNER_LOGIN_EMAIL,
              costReport: {
                statusDate: "2026-09-05",
                notes: "Friday PPR",
                export15: { raw: "Date\tHours\n09/05/2026\t20", rows: [{ date: "2026-09-05", hours: 20 }] },
                export16: { raw: "", rows: [] },
                snapshots: [
                  {
                    id: "ppr-hydrate-1",
                    statusDate: "2026-09-05",
                    savedAt: 9,
                    notes: "Friday PPR",
                    budget: { total: 88000, hours: 240, lines: [] },
                    actuals: { hours: 20, dollars: 0, headcount: 2, byDate: {} },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    try {
      const packs = await hydrateFromVault(empty);
      assert.equal(((packs[0]?.costReport as { notes: string }).notes), "Friday PPR");
      const read = readCostReport(newEstimateKey("new-cat2pit"), empty);
      assert.equal(read.snapshots.length, 1);
      assert.equal(read.snapshots[0]?.id, "ppr-hydrate-1");
      assert.equal(read.snapshots[0]?.notes, "Friday PPR");
      assert.equal(read.snapshots[0]?.budget.total, 88000);
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("flushVaultUpsert sends purchasing lines with the live pack", async () => {
    resetVaultHydrateForTests();
    const store = memoryStore();
    const packId = "new-cat2pit";
    rememberLocalPack(
      {
        packId,
        title: "Cat 2 Pit Stop",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        ownerEmail: OWNER_LOGIN_EMAIL,
      },
      store,
    );
    writePurchasing(
      newEstimateKey(packId),
      savePurchasingSnapshot(
        addPurchaseLine(
          { ...emptyPurchasingBook(), statusDate: "2026-09-06", notes: "Saturday buys" },
          {
            id: "po-vault-1",
            vendor: "Airgas",
            description: "C-25 bottles",
            category: "consumables",
            amount: 75,
            status: "charged",
          },
        ),
        { amount: 150, hasBudget: true },
        9,
      ),
      store,
    );
    const bodies: Array<{ pack?: { purchasing?: { notes?: string; lines?: Array<{ vendor?: string }> } } }> = [];
    const previous = globalThis.fetch;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof init?.body === "string" ? init.body : "";
      if (raw) bodies.push(JSON.parse(raw) as (typeof bodies)[number]);
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
      const result = await flushVaultUpsert(packId, store);
      assert.equal(result.ok, true);
      assert.equal(bodies[0]?.pack?.purchasing?.notes, "Saturday buys");
      assert.equal(bodies[0]?.pack?.purchasing?.lines?.[0]?.vendor, "Airgas");
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("hydrates purchasing lines from the vault onto an empty browser", async () => {
    resetVaultHydrateForTests();
    const empty = memoryStore();
    const previous = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          persisted: true,
          packs: [
            {
              packId: "new-cat2pit",
              key: "new:new-cat2pit",
              title: "Cat 2 Pit Stop",
              client: "Phillips 66",
              site: "Wood River — Roxana, IL",
              siteId: "site-madison",
              createdAt: 1,
              updatedAt: 2,
              ownerEmail: OWNER_LOGIN_EMAIL,
              purchasing: {
                statusDate: "2026-09-06",
                notes: "Saturday buys",
                lines: [
                  {
                    id: "po-hydrate-1",
                    date: "2026-09-06",
                    vendor: "Airgas",
                    description: "C-25 bottles",
                    category: "consumables",
                    amount: 75,
                    status: "charged",
                  },
                ],
                snapshots: [
                  {
                    id: "buy-hydrate-1",
                    statusDate: "2026-09-06",
                    savedAt: 9,
                    notes: "Saturday buys",
                    totals: { grand: 75, toolsConsumables: 75, lineCount: 1 },
                    vsBudget: { toolsConsumables: 75, miscBudget: 150, variance: 75, hasMiscBudget: true },
                    lineCount: 1,
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    try {
      const packs = await hydrateFromVault(empty);
      assert.equal(((packs[0]?.purchasing as { notes: string }).notes), "Saturday buys");
      const read = readPurchasing(newEstimateKey("new-cat2pit"), empty);
      assert.equal(read.lines.length, 1);
      assert.equal(read.lines[0]?.id, "po-hydrate-1");
      assert.equal(read.lines[0]?.vendor, "Airgas");
      assert.equal(read.snapshots[0]?.totals.grand, 75);
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("keeps a first-pass boot flush off the banner unless integrity or the retry still fails", () => {
    const src = readFileSync(fileURLToPath(new URL("../components/EstimatePackage.tsx", import.meta.url)), "utf8");
    assert.match(src, /isVaultIntegrityError/);
    assert.match(src, /skipped === "integrity"/);
    assert.match(src, /isVaultIntegrityError\(first\.error/);
    assert.match(src, /applyVaultFlushResult\(retry, \{ force: true \}\)/);
    assert.match(src, /reportVaultErrors/);
    assert.match(src, /shouldHydrateOpenPack\(packId\) \|\| !\(hasLocal \|\| vaultListHydratePending\(\)\)/);
    assert.match(src, /hydrateOpenPack\(packId\)/);
    assert.match(src, /packStateLooksSmashed/);
    assert.match(src, /skipSmashedPackWrite/);
    assert.equal(/if \(!result\.ok && "error" in result && result\.error\) setVaultSaveError/.test(src), false);
  });

  it("retries a 5xx vault PUT once and succeeds on the second try", async () => {
    resetVaultHydrateForTests();
    const store = memoryStore();
    const packId = "new-mtj7bvtk-retry";
    applyPackToStore(store, {
      packId,
      key: `new:${packId}`,
      title: "2027 Aromatics Turnaround",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 1,
      updatedAt: 2,
      ownerEmail: OWNER_LOGIN_EMAIL,
      equipment: { largeTools: [], thirdParty: [] },
    });
    let hits = 0;
    const previous = globalThis.fetch;
    globalThis.fetch = (async () => {
      hits += 1;
      if (hits === 1) {
        return new Response(JSON.stringify({ error: "Could not store that package." }), {
          status: 502,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
      const result = await flushVaultUpsert(packId, store);
      assert.equal(result.ok, true);
      assert.equal(hits, 2);
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("hydrates the owner desk when viewAs is explicitly cleared even if Follow is still cached", async () => {
    resetVaultHydrateForTests();
    const store = memoryStore();
    const seats: string[] = [];
    const previous = globalThis.fetch;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seats.push(new Headers(init?.headers).get(VIEW_AS_HEADER) || "owner");
      return new Response(JSON.stringify({ persisted: true, packs: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    try {
      setVaultViewAs("nathan");
      await hydrateFromVault(store, { viewAs: null });
      assert.deepEqual(seats, ["owner"]);
      await flushLocalPacksToVault(store, { viewAs: "nathan" });
      assert.deepEqual(seats, ["owner"]);
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("leftover T&M hydrate drops purged T&M and keeps Aromatics and CAT", async () => {
    resetVaultHydrateForTests();
    const store = memoryStore();
    const previous = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          persisted: true,
          packs: [
            {
              packId: "new-MTJ5D6-live",
              key: "new:new-MTJ5D6-live",
              title: "Wood River / T&M 2027-01 to 06",
              client: "",
              site: "",
              siteId: "",
              createdAt: 4,
              updatedAt: 5,
              ownerEmail: JAMES_EMAIL,
              transferredToName: "James Cain",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    try {
      await hydrateFromVault(store);
      const owner = { email: OWNER_LOGIN_EMAIL, role: "owner" as const };
      const desk = packsForViewedDesk(owner, false, null, store);
      const tm = desk.find((row) => row.title === "Wood River / T&M 2027-01 to 06");
      assert.equal(tm, undefined);
      assert.equal(desk.filter((row) => row.title === "Wood River / T&M 2027-01 to 06").length, 0);
      const jobs = jobsOnDesk(undefined, desk, false, companyScopeFor(owner), undefined, { includeSeeds: false });
      const tree = jobTree({ scope: { isOwner: true, email: owner.email, companyId: "hitsquad" }, jobs, packs: desk });
      const wood = tree.find((row) => row.id === "madison")?.sites.find((site) => site.id === "site-madison");
      assert.equal(wood?.jobs.some((job) => job.title === "2027 Aromatics Turnaround"), true);
      assert.equal(wood?.jobs.some((job) => job.title === "Madison CAT 2 (Pit Stop)"), true);
      assert.equal(wood?.jobs.some((job) => job.code === "EST-MTJ5D6"), false);
      assert.equal(store.getItem("hs_his_leftover_gen"), HIS_LEFTOVER_GEN);
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("opens a cold pack from the single-pack GET and still starts the list hydrate", async () => {
    resetVaultHydrateForTests();
    const store = memoryStore();
    const urls: string[] = [];
    const previous = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/api/desk/estimates/new-cat2pit")) {
        return new Response(
          JSON.stringify({
            pack: {
              packId: "new-cat2pit",
              key: "new:new-cat2pit",
              title: "Cat 2 Pit Stop",
              client: "Phillips 66",
              site: "Wood River — Roxana, IL",
              siteId: "site-madison",
              createdAt: 1,
              updatedAt: 2,
              ownerEmail: OWNER_LOGIN_EMAIL,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ persisted: true, packs: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    try {
      const packs = await hydrateOpenPack("new-cat2pit", store);
      assert.equal(packs[0]?.title, "Cat 2 Pit Stop");
      assert.equal(findLocalPack("new-cat2pit", store)?.title, "Cat 2 Pit Stop");
      assert.equal(urls.some((url) => url.includes("/api/desk/estimates/new-cat2pit")), true);
      assert.equal(urls.some((url) => /\/api\/desk\/estimates\/?$/.test(url) || url.endsWith("/api/desk/estimates")), true);
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });
});
