import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  HSE_TAB_ID,
  QUALITY_TAB_ID,
  awardedLocalJobs,
  mergeAwardedJobs,
  qualityHseTabIds,
  showsQualityHseModules,
} from "./quality-hse-modules.ts";
import { writeEstimateStatus } from "./estimate-status.ts";
import { rememberLocalPack, type StorageLike } from "./local-estimates.ts";

function memoryStorage(): StorageLike & Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    get length() {
      return map.size;
    },
    key: (index: number) => [...map.keys()][index] ?? null,
  } as StorageLike & Storage;
}

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const JOB_SETUP_BODY =
  /QualityDay1Card|HseDay1Card|QUALITY_PACKAGE_FORMS|HSE_PACKAGE_SLOTS|QUALITY_DAY1_LABEL|HSE_DAY1_LABEL|inspectionPlan|travelerCount|RollingChartMap|2\.7\.1 Madison|Site orientation|Weld map|Madison QC manuals/;

describe("Quality and HSE leave Job setup", () => {
  it("fails if Job setup still renders the Quality/HSE checklist body", () => {
    const setup = source("../components/JobSetupCard.tsx");
    assert.doesNotMatch(setup, JOB_SETUP_BODY);
    assert.doesNotMatch(setup, /QualityDay1Card|HseDay1Card|RollingChartMap/);
    assert.match(setup, /showsQualityHseModules/);
    assert.match(setup, /onOpenQuality/);
    assert.match(setup, /onOpenHse/);
  });

  it("fails if Quality/HSE modules are missing that body", () => {
    const quality = source("../components/QualityDesk.tsx");
    const qualityCard = source("../components/QualityDay1Card.tsx");
    const rolling = source("../components/RollingChartMap.tsx");
    const hse = source("../components/HseDesk.tsx");
    const hseCard = source("../components/HseDay1Card.tsx");
    const detail = source("../components/EstimateDetail.tsx");
    assert.match(quality, /QualityDay1Card/);
    assert.match(quality, /RollingChartMap/);
    assert.match(quality, /QUALITY_PACKAGE_FORMS/);
    assert.match(qualityCard, /2\.7\.1 Madison Pressure Test Record Rev 2/);
    assert.match(qualityCard, /NDE req spreadsheet/);
    assert.match(qualityCard, /QUALITY_PACKAGE_FORMS/);
    assert.match(rolling, /Steam Drum Rolling Chart/);
    assert.match(rolling, /Generating Bank Retube Progression Chart/);
    assert.match(rolling, /Tube Final Roll/);
    assert.doesNotMatch(rolling, /elevation/i);
    assert.match(hse, /HseDay1Card/);
    assert.match(hse, /HSE_PACKAGE_SLOTS/);
    assert.match(hseCard, /HSE_PACKAGE_SLOTS/);
    assert.match(hseCard, /Site orientation/);
    assert.match(detail, /QualityDay1Card/);
    assert.match(detail, /RollingChartMap/);
    assert.match(detail, /HseDay1Card/);
    assert.doesNotMatch(quality, /1k4xceUc5ihDuzSf7opdjEzwnt2ODJomC|quality-briefs\.json|owner vault/i);
    assert.doesNotMatch(qualityCard, /1k4xceUc5ihDuzSf7opdjEzwnt2ODJomC|1y6Q3TOnpXzV/);
  });

  it("opens Quality and HSE as awarded modules, not estimate-only Job setup cards", () => {
    assert.equal(showsQualityHseModules("Estimate"), false);
    assert.equal(showsQualityHseModules("Submitted"), false);
    assert.equal(showsQualityHseModules("Awarded"), true);
    assert.deepEqual(qualityHseTabIds("Awarded"), [QUALITY_TAB_ID, HSE_TAB_ID]);
    assert.deepEqual(qualityHseTabIds("Estimate"), []);
    const workspace = source("../components/EstimateWorkspace.tsx");
    assert.match(workspace, /showsQualityHseModules/);
    assert.match(workspace, /QUALITY_TAB_ID/);
    assert.match(workspace, /HSE_TAB_ID/);
    assert.match(workspace, /showsRodeoTab|estimateTabsForSite/);
    const rodeo = source("./rodeo-form.ts");
    assert.match(rodeo, /HIDDEN_RODEO_SITES/);
  });

  it("does not put generating-bank or QC/HSE books in git", () => {
    const listed = execSync('git ls-files "*.xlsx" "*.xlsm" "*.xls" "*.xlsb" "*.pdf"', { encoding: "utf8" }).trim();
    assert.equal(listed, "");
    assert.equal(/generating-bank/i.test(listed), false);
  });

  it("lists awarded local jobs without wiping other packs", () => {
    const store = memoryStorage();
    rememberLocalPack({ packId: "new-awarded", title: "Awarded bank", client: "Phillips 66", site: "Wood River" }, store);
    rememberLocalPack({ packId: "new-est", title: "Still estimate", client: "Phillips 66", site: "Wood River" }, store);
    writeEstimateStatus("new-awarded", "Awarded", store);
    const awarded = awardedLocalJobs(store);
    assert.deepEqual(awarded.map((row) => row.id), ["new-awarded"]);
    assert.deepEqual(mergeAwardedJobs(awarded, awarded).map((row) => row.id), ["new-awarded"]);
  });
});
