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
  WOOD_RIVER_TM_B1_EXHIBIT_DRIVE_ID,
  WOOD_RIVER_TM_B1_EXHIBIT_TITLE,
  WOOD_RIVER_TM_B1_PREVIEW_FIXTURE_PATH,
  enrichReviewWithPreview,
  filterPreviewByFace,
  isWoodRiverB1Source,
  loadWoodRiverB1PreviewFixture,
  loadWoodRiverTmB1PreviewFixture,
  mergePreviewFace,
  parseRateVaultPreviewPackage,
  rateVaultImportMergeFace,
  previewHasLaneBlend,
  previewRowAddsUp,
  resolveRateVaultPreview,
  stampRateVaultVersion,
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
    assert.equal(fixture.bookFace, "rrff");
    assert.equal(fixture.id, parsed.id);
    assert.ok(fixture.rows.length >= 8);
    assert.ok(fixture.craftSheets.length >= 4);
    assert.ok(fixture.fringes.length >= 4);
    assert.ok(fixture.burden.some((line) => line.label === "Pay Tax FICA-MC" && line.ratePct === 7.65));
    assert.ok(fixture.burden.some((line) => line.label === "Pay Tax SUI" && line.ratePct === 8.55));
    assert.ok(fixture.burden.some((line) => line.label === "O/H"));
    assert.ok(fixture.burden.some((line) => line.label === "Profit"));
    assert.equal(
      fixture.burden.some((line) => /suta|illinois composite|overhead & fee/i.test(line.label)),
      false,
    );
    assert.ok(fixture.fringes.some((line) => line.sheet.includes("BOILERMAKER") && line.label === "H&W" && line.amountHr === 7.07));
    assert.ok(fixture.sheets.some((sheet) => sheet.name === "Rate Summary"));
    assert.ok(fixture.sheets.some((sheet) => sheet.name === "Burden Summary"));
    assert.ok(fixture.sheets.some((sheet) => sheet.name === "Fringes"));
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
    assert.doesNotMatch(JSON.stringify(fixture), /PK.*word\/document|monroe|yates|shahan/i);
    assert.doesNotMatch(JSON.stringify(raw), /shahan/i);
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
    const fixture = loadWoodRiverB1PreviewFixture();
    assert.equal(
      fixture.rows.some((row) => row.craft === "Merit Staff" && row.lane === "merit"),
      true,
    );
    assert.equal(
      fixture.rows.some((row) => /ocip/i.test(row.group) && row.ocip),
      true,
    );
    assert.equal(
      fixture.rows.some((row) => row.lane === "union" && !row.ocip),
      true,
    );
    const ocipOnly = filterPreviewByFace(fixture, "ocip");
    assert.ok(ocipOnly.rows.some((row) => row.ocip));
    assert.equal(
      ocipOnly.rows.some((row) => /BOILERMAKER RRFF/i.test(row.sheet) && /journeyman/i.test(row.position)),
      true,
    );
    assert.ok(ocipOnly.rows.length >= 8);
    const stamped = stampRateVaultVersion(fixture, "Imported B-1 Excel", "2026-09-10T12:00:00.000Z");
    assert.equal(stamped.version?.note, "Imported B-1 Excel");
    assert.match(stamped.version?.id || "", /^v-20260910/);
    const blended = {
      ...fixture,
      rows: fixture.rows.map((row) => (row.lane === "union" ? { ...row, lane: "merit" as const } : row)),
    };
    assert.equal(previewHasLaneBlend(fixture, blended), true);
    const merged = mergePreviewFace(fixture, ocipOnly, "ocip");
    assert.equal(merged.rows.some((row) => !row.ocip), true);
    assert.equal(merged.rows.some((row) => row.ocip), true);
    assert.equal(rateVaultImportMergeFace(fixture), "both");
    assert.equal(rateVaultImportMergeFace(ocipOnly), "both");
    const bothMerged = mergePreviewFace(fixture, { ...fixture, rows: fixture.rows.map((row) => ({ ...row, wage: row.wage + 1 })) }, "both");
    assert.equal(
      bothMerged.rows.find((row) => row.position === "Boilermaker Journeyman")?.wage,
      (fixture.rows.find((row) => row.position === "Boilermaker Journeyman")?.wage ?? 0) + 1,
    );
  });

  it("loads the checked-in T&M fixture without mixing RRFF hall splits", () => {
    const raw = JSON.parse(source("./rate-vault/wood-river-tm-b1-preview-fixture.json"));
    const parsed = parseRateVaultPreviewPackage(raw);
    assert.equal("error" in parsed, false);
    if ("error" in parsed) return;
    const fixture = loadWoodRiverTmB1PreviewFixture();
    const rrff = loadWoodRiverB1PreviewFixture();
    assert.equal(fixture.siteId, "wood-river");
    assert.equal(fixture.title, WOOD_RIVER_TM_B1_EXHIBIT_TITLE);
    assert.equal(fixture.sourceId, WOOD_RIVER_TM_B1_EXHIBIT_DRIVE_ID);
    assert.equal(fixture.writesRateBook, false);
    assert.equal(fixture.fixture, true);
    assert.equal(fixture.bookFace, "tm");
    assert.equal(fixture.id, parsed.id);
    assert.equal(fixture.rows.length, 183);
    assert.equal(fixture.craftSheets.length, 8);
    assert.ok(fixture.burden.some((line) => line.label === "Pay Tax FICA-MC" && line.ratePct === 7.65));
    assert.ok(fixture.burden.some((line) => line.label === "Pay Tax SUI" && line.ratePct === 8.55));
    assert.equal(
      fixture.burden.some((line) => /suta|illinois composite|overhead & fee/i.test(line.label)),
      false,
    );
    assert.equal(
      fixture.fringes.some((line) => line.sheet.includes("BOILERMAKER") && line.label === "H&W"),
      false,
    );
    assert.ok(fixture.fringes.some((line) => line.label === "Fringes Subtotal" && line.amountHr === 36.89));
    assert.ok(fixture.fringes.some((line) => line.label === "Fringes Subtotal" && line.amountHr === 21.5));
    assert.equal(fixture.rows.every((row) => previewRowAddsUp(row)), true);
    assert.equal(rrff.bookFace, "rrff");
    assert.ok(rrff.fringes.some((line) => line.label === "H&W" && line.amountHr === 7.07));
    assert.equal(
      rrff.rows.some((row) => row.position === "Boilermaker Journeyman" && row.wage === 45.6),
      true,
    );
    assert.match(WOOD_RIVER_TM_B1_PREVIEW_FIXTURE_PATH, /wood-river-tm-b1-preview-fixture\.json/);
    assert.doesNotMatch(JSON.stringify(fixture), /PK.*word\/document|monroe|yates|shahan/i);
    assert.doesNotMatch(JSON.stringify(raw), /shahan/i);
    assert.equal(resolveRateVaultPreview({ siteId: "wood-river", bookFace: "tm" })?.bookFace, "tm");
    assert.equal(resolveRateVaultPreview({ siteId: "wood-river" })?.bookFace, "rrff");
  });

  it("keeps Direct Craft BM / PF halls on a T&M OCIP face", () => {
    const fixture = loadWoodRiverTmB1PreviewFixture();
    const ocip = filterPreviewByFace(fixture, "ocip");
    assert.equal(ocip.rows.filter((row) => row.sheet === "WOODRIVER BOILERMAKER TM").length, 36);
    assert.equal(ocip.rows.filter((row) => row.sheet === "WOODRIVER PIPEFITTER TM").length, 15);
    assert.equal(ocip.rows.filter((row) => row.sheet === "WOODRIVER LABORER TM").length, 12);
    assert.equal(ocip.rows.some((row) => row.position === "BOILERMAKER GENERAL FOREMAN" && row.wage === 50.6), true);
    assert.equal(
      ocip.rows.some(
        (row) =>
          row.sheet === "WOODRIVER PIPEFITTER TM" &&
          row.position === "PIPEFITTER JOURNEYMAN" &&
          row.wage === 49.0295,
      ),
      true,
    );
    assert.equal(ocip.ocipFace, "both");
    assert.equal(ocip.rows.length, 183);
  });
});
