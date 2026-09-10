import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { recognizeRateVaultSource } from "./rate-vault-recognize.ts";
import { buildRateVaultWorkshop, findSeedRateVaultSource, seedRateVaultLibrary } from "./rate-vault-library.ts";
import {
  WOOD_RIVER_B1_EXHIBIT_DRIVE_ID,
  WOOD_RIVER_B1_EXHIBIT_TITLE,
  WOOD_RIVER_B1_PREVIEW_FIXTURE_PATH,
  enrichReviewWithPreview,
  isWoodRiverB1Source,
  loadWoodRiverB1PreviewFixture,
  parseRateVaultPreviewPackage,
  previewRowAddsUp,
  resolveRateVaultPreview,
} from "./rate-vault-preview.ts";

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("Rate Vault Wood River B-1 preview", () => {
  it("loads the checked-in fixture with Wood River rate rows", () => {
    const raw = JSON.parse(source("./rate-vault/wood-river-b1-preview-fixture.json"));
    const parsed = parseRateVaultPreviewPackage(raw);
    assert.equal("error" in parsed, false);
    if ("error" in parsed) return;
    const fixture = loadWoodRiverB1PreviewFixture();
    assert.equal(fixture.siteId, "wood-river");
    assert.equal(fixture.title, WOOD_RIVER_B1_EXHIBIT_TITLE);
    assert.equal(fixture.sourceId, WOOD_RIVER_B1_EXHIBIT_DRIVE_ID);
    assert.equal(fixture.writesRateBook, false);
    assert.equal(fixture.fixture, true);
    assert.equal(fixture.id, parsed.id);
    assert.ok(fixture.rows.length >= 8);
    assert.ok(fixture.burden.length >= 4);
    assert.ok(fixture.sheets.some((sheet) => sheet.name === "Rate Summary"));
    assert.ok(fixture.sheets.some((sheet) => sheet.name === "Burden Summary"));
    assert.equal(
      fixture.rows.some((row) => /boilermaker journeyman/i.test(row.position) && row.local === "363"),
      true,
    );
    assert.equal(
      fixture.rows.some((row) => /pipefitter journeyman/i.test(row.position) && row.local === "553"),
      true,
    );
    assert.equal(
      fixture.rows.some((row) => /laborer journeyman/i.test(row.position)),
      true,
    );
    assert.equal(
      fixture.rows.every((row) => previewRowAddsUp(row)),
      true,
    );
    assert.match(WOOD_RIVER_B1_PREVIEW_FIXTURE_PATH, /wood-river-b1-preview-fixture\.json/);
    assert.doesNotMatch(JSON.stringify(fixture), /PK.*word\/document|monroe|yates/i);
  });

  it("resolves the Wood River catalog card onto the visual package", async () => {
    const seed = seedRateVaultLibrary();
    const entry = seed.find((row) => row.driveId === WOOD_RIVER_B1_EXHIBIT_DRIVE_ID);
    assert.ok(entry);
    assert.equal(entry?.kind, "b1-exhibit");
    assert.equal(entry?.siteId, "wood-river");
    assert.equal(entry?.primary, true);
    assert.equal(entry?.title, WOOD_RIVER_B1_EXHIBIT_TITLE);
    assert.equal(isWoodRiverB1Source(entry), true);
    assert.equal(findSeedRateVaultSource(WOOD_RIVER_B1_EXHIBIT_DRIVE_ID)?.id, WOOD_RIVER_B1_EXHIBIT_DRIVE_ID);

    const preview = resolveRateVaultPreview({ source: entry });
    assert.ok(preview);
    assert.equal(preview?.rows.some((row) => row.position === "Boilermaker Journeyman"), true);

    const recognized = await recognizeRateVaultSource({
      fileName: WOOD_RIVER_B1_EXHIBIT_TITLE,
      driveId: WOOD_RIVER_B1_EXHIBIT_DRIVE_ID,
      sourceId: WOOD_RIVER_B1_EXHIBIT_DRIVE_ID,
    });
    assert.equal("error" in recognized, false);
    if ("error" in recognized) return;
    assert.equal(recognized.guessedKind, "b1-exhibit");
    assert.equal(recognized.guessedSiteId, "wood-river");
    assert.equal(recognized.writesRateBook, false);
    const review = enrichReviewWithPreview(recognized, preview);
    assert.ok(review.sheets.length >= 2);
    assert.equal(
      review.sheets.some((sheet) => sheet.name === "Rate Summary" && sheet.columns.some((column) => column.role === "wage")),
      true,
    );
    assert.match(review.extractNote, /preview fixture/i);

    const workshop = buildRateVaultWorkshop();
    assert.equal(workshop.preview?.siteId, "wood-river");
    assert.ok((workshop.preview?.rows.length ?? 0) >= 8);
    assert.equal(workshop.publish.published, false);
  });
});
