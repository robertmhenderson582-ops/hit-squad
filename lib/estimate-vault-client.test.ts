import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyReturnLocally,
  applyTransferLocally,
  flushLocalPacksToVault,
  flushVaultUpsert,
  hydrateFromVault,
  isLeftoverOwnerCopy,
  resetVaultHydrateForTests,
  setVaultViewAs,
  shareVaultPack,
  transferVaultPack,
} from "./estimate-vault-client.ts";
import { VIEW_AS_HEADER } from "./desk-scope.ts";
import { visibleDeskPacks } from "./estimate-scope.ts";
import { packsMissingFromVault, writeVaultSeen } from "./job-menu.ts";
import { TRANSFER_WRITE_ERROR } from "./handoff.ts";
import { readLensPacks } from "./lens-packs.ts";
import { deleteLocalPack, findLocalPack, rememberLocalPack, type StorageLike } from "./local-estimates.ts";
import { isActiveMenuItem, readJobMenu, recordTransferredMenuItem } from "./job-menu.ts";
import { collectPack } from "./estimate-pack.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";

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
        visibleDeskPacks({ email: OWNER_LOGIN_EMAIL, role: "owner" }, false, store)[0]?.packId,
        "new-mtaajdwa-f7539",
      );
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("share to the owner keeps Nathan as owner and unshare hides it from the owner desk", async () => {
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
        false,
      );
    } finally {
      globalThis.fetch = previous;
      resetVaultHydrateForTests();
    }
  });

  it("turns a leftover owner copy into a Transferred note when the vault no longer lists it", async () => {
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
    writeVaultSeen(["new-mtaajdwa-f7539"], store);
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
      assert.equal(findLocalPack("new-mtaajdwa-f7539", store), null);
      assert.equal(readJobMenu(store).transferred[0]?.title, "Madison CAT 2 (Pit Stop)");
      assert.equal(isActiveMenuItem({ id: "new-mtaajdwa-f7539", packId: "new-mtaajdwa-f7539" }, readJobMenu(store)), false);
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
});
