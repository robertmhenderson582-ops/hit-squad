import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyTransferLocally, resetVaultHydrateForTests, transferVaultPack } from "./estimate-vault-client.ts";
import { TRANSFER_WRITE_ERROR } from "./handoff.ts";
import { findLocalPack, rememberLocalPack, type StorageLike } from "./local-estimates.ts";
import { isActiveMenuItem, readJobMenu } from "./job-menu.ts";
import { collectPack } from "./estimate-pack.ts";

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
});
