import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { memoryDrive } from "./drive-estimates.ts";
import { RATE_VAULT_LIBRARY_KIND, RATE_VAULT_LIBRARY_NAME } from "./rate-vault-library.ts";
import {
  addRateVaultOwnerSource,
  confirmRateVaultReview,
  listRateVaultOwnerLibrary,
  listRateVaultReviews,
  resetRateVaultStoreForTests,
  storePayloadLeaksBinary,
  useRateVaultStoreForTests,
} from "./rate-vault-store.ts";
import { readVaultJson } from "./drive-data.ts";

describe("Rate Vault owner catalog store", { concurrency: 1 }, () => {
  afterEach(() => {
    resetRateVaultStoreForTests();
  });

  it("persists Drive metadata only and never a rate book", async () => {
    const drive = memoryDrive();
    useRateVaultStoreForTests(drive);
    const saved = await addRateVaultOwnerSource({
      title: "Extra Monroe wage sheet.pdf",
      driveId: "1BBBBBBBBBBBBBBBBBBBBBBBBBB",
      kind: "local-craft-sheet",
      siteId: "monroe",
      craft: "Pipefitter",
      local: "420",
      data: "SHOULD-NOT-PERSIST",
    });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    assert.equal(saved.entry.driveId, "1BBBBBBBBBBBBBBBBBBBBBBBBBB");
    assert.equal("data" in saved.entry, false);

    const review = await confirmRateVaultReview({
      sourceId: saved.entry.id,
      kind: "local-craft-sheet",
      siteId: "monroe",
      craft: "Pipefitter",
      local: "420",
      confirmedAt: "2026-09-10T00:00:00.000Z",
      writesRateBook: false,
    });
    assert.equal(review.writesRateBook, false);

    const extras = await listRateVaultOwnerLibrary();
    const reviews = await listRateVaultReviews();
    assert.equal(extras[0]?.title, "Extra Monroe wage sheet.pdf");
    assert.equal(reviews[0]?.writesRateBook, false);

    const vault = await readVaultJson<{ extras?: Array<Record<string, unknown>>; reviews?: unknown[] }>(
      drive,
      RATE_VAULT_LIBRARY_NAME,
      RATE_VAULT_LIBRARY_KIND,
    );
    assert.equal(storePayloadLeaksBinary(vault), false);
    assert.equal(JSON.stringify(vault).includes("SHOULD-NOT-PERSIST"), false);
    assert.equal(vault?.extras?.[0]?.driveId, "1BBBBBBBBBBBBBBBBBBBBBBBBBB");
  });

  it("rejects a bad Drive id", async () => {
    useRateVaultStoreForTests(memoryDrive());
    const saved = await addRateVaultOwnerSource({ title: "Nope", driveId: "x" });
    assert.equal(saved.ok, false);
  });
});
