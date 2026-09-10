import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { memoryDrive } from "./drive-estimates.ts";
import { RATE_VAULT_LIBRARY_KIND, RATE_VAULT_LIBRARY_NAME } from "./rate-vault-library.ts";
import {
  addRateVaultOwnerSource,
  confirmRateVaultReview,
  getRateVaultPackage,
  listRateVaultOwnerLibrary,
  listRateVaultOverrides,
  listRateVaultPackages,
  listRateVaultReviews,
  organizeRateVaultSource,
  resetRateVaultStoreForTests,
  storePayloadLeaksBinary,
  upsertRateVaultPackage,
  useRateVaultStoreForTests,
} from "./rate-vault-store.ts";
import { loadWoodRiverB1PreviewFixture } from "./rate-vault-preview.ts";
import { readVaultJson } from "./drive-data.ts";

describe("Rate Vault owner catalog store", { concurrency: 1 }, () => {
  afterEach(() => {
    resetRateVaultStoreForTests();
  });

  it("persists Drive metadata only and never a rate book", async () => {
    const drive = memoryDrive();
    useRateVaultStoreForTests(drive);
    const saved = await addRateVaultOwnerSource({
      title: "Extra Wood River wage sheet.pdf",
      driveId: "1BBBBBBBBBBBBBBBBBBBBBBBBBB",
      kind: "local-craft-sheet",
      siteId: "wood-river",
      craft: "Pipefitter",
      local: "553",
      data: "SHOULD-NOT-PERSIST",
    });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    assert.equal(saved.entry.driveId, "1BBBBBBBBBBBBBBBBBBBBBBBBBB");
    assert.equal("data" in saved.entry, false);

    const review = await confirmRateVaultReview({
      sourceId: saved.entry.id,
      kind: "local-craft-sheet",
      siteId: "wood-river",
      craft: "Pipefitter",
      local: "553",
      confirmedAt: "2026-09-10T00:00:00.000Z",
      writesRateBook: false,
    });
    assert.equal(review.writesRateBook, false);

    const extras = await listRateVaultOwnerLibrary();
    const reviews = await listRateVaultReviews();
    assert.equal(extras[0]?.title, "Extra Wood River wage sheet.pdf");
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

  it("moves a source between site buckets without storing bytes", async () => {
    const drive = memoryDrive();
    useRateVaultStoreForTests(drive);
    await addRateVaultOwnerSource({
      title: "Hall book.pdf",
      driveId: "1CCCCCCCCCCCCCCCCCCCCCCCCCC",
      kind: "other",
      siteId: "rodeo",
    });
    const moved = await organizeRateVaultSource({
      sourceId: "1CCCCCCCCCCCCCCCCCCCCCCCCCC",
      siteId: "wood-river",
      kind: "local-craft-sheet",
    });
    assert.equal(moved.ok, true);
    const listed = await listRateVaultOverrides();
    assert.equal(listed[0]?.siteId, "wood-river");
    assert.equal(listed[0]?.kind, "local-craft-sheet");
    const extras = await listRateVaultOwnerLibrary();
    assert.equal(extras[0]?.siteId, "wood-river");
    assert.equal(storePayloadLeaksBinary(extras), false);
  });

  it("rejects a bad Drive id", async () => {
    useRateVaultStoreForTests(memoryDrive());
    const saved = await addRateVaultOwnerSource({ title: "Nope", driveId: "x" });
    assert.equal(saved.ok, false);
  });

  it("persists an imported B-1 package without workbook bytes", async () => {
    const drive = memoryDrive();
    useRateVaultStoreForTests(drive);
    const fixture = loadWoodRiverB1PreviewFixture();
    const journeyman = fixture.rows.find((row) => row.position === "Boilermaker Journeyman");
    assert.ok(journeyman);
    const saved = await upsertRateVaultPackage({
      ...fixture,
      fixture: false,
      extractedFrom: "vault-xlsx-import",
      rows: fixture.rows.map((row) =>
        row.id === journeyman?.id ? { ...row, wage: 99.99, billRate: 99.99 + row.fringe + row.burden } : row,
      ),
      data: "SHOULD-NOT-PERSIST-PACKAGE",
    } as typeof fixture & { data: string });
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    assert.equal(saved.preview.fixture, false);
    assert.equal(saved.preview.extractedFrom, "vault-xlsx-import");
    assert.equal(saved.preview.writesRateBook, false);
    assert.equal("data" in saved.preview, false);

    const listed = await listRateVaultPackages();
    const loaded = await getRateVaultPackage("wood-river");
    assert.equal(listed.length, 1);
    assert.equal(loaded?.rows.find((row) => row.id === journeyman?.id)?.wage, 99.99);

    const vault = await readVaultJson<{ packages?: Array<Record<string, unknown>> }>(
      drive,
      RATE_VAULT_LIBRARY_NAME,
      RATE_VAULT_LIBRARY_KIND,
    );
    assert.equal(storePayloadLeaksBinary(vault), false);
    assert.equal(JSON.stringify(vault).includes("SHOULD-NOT-PERSIST-PACKAGE"), false);
    assert.equal(vault?.packages?.[0]?.extractedFrom, "vault-xlsx-import");
  });
});
