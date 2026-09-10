import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRateVaultWorkshop,
  filterRateVaultLibrary,
  libraryHasSite,
  mergeRateVaultLibrary,
  ownerLibraryEntry,
  parseOwnerLibraryInput,
  seedRateVaultDriveIds,
  seedRateVaultLibrary,
  sourceMatchesCraft,
} from "./rate-vault-library.ts";

const REQUIRED_IDS = [
  "17YtnXtCcIXq68sROl3_VwkIo6PHYzTIR",
  "1NDjMfdotigHW4mY1iD3SbuoE7SQqG46L",
  "1jyg5eYsBdDe9cAt881MlOrW4g2q7QbX2",
  "1bhDSXSP1huQEOifr6f9ZeRhNje9cXZ42",
  "1nUCFfLflJDT7N5NRY2h22vRzWYxMt_mX",
  "1JzCBSqwJGU8qKTWFn2DKGrGKfOSTXan6",
  "1aP0etQYJxWo003IUa8bVWWoDpOAwk1m2",
  "1uw4jwmCB0iPmoC_HJH-xce5A308NsNe5",
  "1fHV3d7q3yUuWA6N_2VtoGhKXLh9M-SaV",
  "1cTN7RDD2RhB07SDqTSTL7_6YghVKVLrz",
  "1X1F7HnMLkAXMCq3VZESPMtSZ83eZCmu4",
  "1EpxaHxTdy6I0H4YV4scosap4PfkoWjiT",
  "1Tl__EcHbjt4Vv5849MYJk9Yc-6q4QXgl",
  "15SH7BjS8yEQRO8u34uMaF6EHBXQcgovm",
  "1S3Azwo8UcUnhE7pGaQ566x-wUyk8EMaT",
  "1hvb5i1lYsIxcCzJcyTxDjWKCvyzv338B",
  "15zFicxrF46616pD3ljvjOAduAVfi6-rH",
  "15bDYldQYfnWQSESTgxuoAvlWo55w4lrq",
  "1DR80tcSvBnP9GJU8zEs2iNhLb4V8liYP",
];

describe("Rate Vault source library", () => {
  it("indexes the seed Drive ids without embedding binaries", () => {
    const seed = seedRateVaultLibrary();
    const ids = seedRateVaultDriveIds();
    for (const id of REQUIRED_IDS) {
      assert.equal(ids.includes(id), true, id);
    }
    assert.equal(libraryHasSite(seed, "wood-river"), true);
    assert.equal(libraryHasSite(seed, "bayway"), true);
    assert.equal(libraryHasSite(seed, "rodeo"), true);
    assert.equal(libraryHasSite(seed, "monroe"), true);
    assert.equal(seed.some((row) => row.kind === "gppma" && row.siteId === "wood-river"), true);
    assert.equal(seed.some((row) => row.kind === "b1-exhibit" && row.siteId === "rodeo" && row.primary), true);
    const oldBayway = seed.find((row) => row.driveId === "15SH7BjS8yEQRO8u34uMaF6EHBXQcgovm");
    assert.equal(oldBayway?.archived, true);
    assert.equal(oldBayway?.primary, false);
    const newestBayway = seed.find((row) => row.driveId === "1Tl__EcHbjt4Vv5849MYJk9Yc-6q4QXgl");
    assert.equal(newestBayway?.primary, true);
    assert.equal(
      seed.every((row) => row.href.includes(row.driveId) && !("data" in row)),
      true,
    );
    assert.equal(
      JSON.stringify(seed).includes("PK") && JSON.stringify(seed).includes("word/document"),
      false,
    );
  });

  it("filters by site, kind, and craft aliases", () => {
    const seed = seedRateVaultLibrary();
    const wood = filterRateVaultLibrary(seed, { siteId: "wood-river" });
    assert.equal(wood.every((row) => row.siteId === "wood-river"), true);
    assert.equal(wood.some((row) => /553/.test(row.title)), true);
    const pf = filterRateVaultLibrary(seed, { craft: "PF", includeArchived: true });
    assert.equal(pf.some((row) => row.local === "553"), true);
    assert.equal(sourceMatchesCraft(seed.find((row) => row.local === "363")!, "BM"), true);
    const archived = filterRateVaultLibrary(seed, { siteId: "bayway", includeArchived: true });
    assert.equal(archived.some((row) => row.archived), true);
    assert.equal(filterRateVaultLibrary(seed, { siteId: "bayway" }).some((row) => row.archived), false);
  });

  it("merges owner links and confirmed reviews without mutating seed", () => {
    const seed = seedRateVaultLibrary();
    const extra = ownerLibraryEntry({
      id: "1AAAAAAAAAAAAAAAAAAAAAAAAAA",
      title: "Extra hall sheet.pdf",
      driveId: "1AAAAAAAAAAAAAAAAAAAAAAAAAA",
      driveKind: "file",
      kind: "local-craft-sheet",
      siteId: "wood-river",
      craft: "Insulator",
      local: "17",
      primary: true,
      archived: false,
      note: "Owner link",
    });
    const merged = mergeRateVaultLibrary(seed, [extra], [
      {
        sourceId: extra.id,
        kind: "cba",
        siteId: "monroe",
        craft: "Insulator",
        local: "17",
      },
    ]);
    const found = merged.find((row) => row.id === extra.id);
    assert.equal(found?.kind, "cba");
    assert.equal(found?.siteId, "monroe");
    assert.equal(found?.confirmed, true);
    assert.equal(seed.some((row) => row.id === extra.id), false);
    const parsed = parseOwnerLibraryInput({ title: "Nope", driveId: "short" });
    assert.equal("error" in parsed, true);
    const workshop = buildRateVaultWorkshop([extra], [], null, [
      { sourceId: extra.id, siteId: "bayway", kind: "pla" },
    ]);
    assert.equal(workshop.library.entries.some((row) => row.id === extra.id), true);
    assert.equal(workshop.library.entries.find((row) => row.id === extra.id)?.siteId, "bayway");
    assert.equal(workshop.library.entries.find((row) => row.id === extra.id)?.kind, "pla");
    assert.equal(workshop.publish.published, false);
  });
});
