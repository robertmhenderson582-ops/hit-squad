import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  HSE_TAB_ID,
  OPEN_JOB_EMPTY_COPY,
  QUALITY_TAB_ID,
  awardedLocalJobs,
  dropClosedJobs,
  mergeOpenJobs,
  openLocalJobs,
  pickOpenJob,
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

const DEAD_NAME_LIST =
  /QualityFormRoster|QUALITY_PACKAGE_FORMS\.map|HSE_PACKAGE_SLOTS\.map|<ul[\s\S]{0,80}HSE_PACKAGE_SLOTS/;

describe("Quality and HSE leave Job setup", () => {
  it("fails if Job setup still renders the Quality/HSE checklist body", () => {
    const setup = source("../components/JobSetupCard.tsx");
    assert.doesNotMatch(setup, JOB_SETUP_BODY);
    assert.doesNotMatch(setup, /QualityDay1Card|HseDay1Card|RollingChartMap/);
    assert.match(setup, /showsQualityHseModules/);
    assert.match(setup, /onOpenQuality/);
    assert.match(setup, /onOpenHse/);
  });

  it("fails if QualityDesk or HseDesk still render the form/slot name list as the main body", () => {
    const quality = source("../components/QualityDesk.tsx");
    const hse = source("../components/HseDesk.tsx");
    const qualityCard = source("../components/QualityDay1Card.tsx");
    const hseCard = source("../components/HseDay1Card.tsx");
    assert.doesNotMatch(quality, DEAD_NAME_LIST);
    assert.doesNotMatch(hse, DEAD_NAME_LIST);
    assert.doesNotMatch(quality, /QualityFormRoster/);
    assert.doesNotMatch(qualityCard, /QualityFormRoster/);
    assert.doesNotMatch(quality, /QUALITY_PACKAGE_FORMS/);
    assert.doesNotMatch(hse, /HSE_PACKAGE_SLOTS/);
    assert.match(quality, /OPEN_JOB_EMPTY_COPY/);
    assert.match(hse, /OPEN_JOB_EMPTY_COPY/);
    assert.equal(OPEN_JOB_EMPTY_COPY, "Open or pick a job.");
    assert.match(qualityCard, /checkbox/);
    assert.match(qualityCard, /FILL/);
    assert.match(qualityCard, /COUNT/);
    assert.match(hseCard, /paper-field/);
    assert.match(hseCard, /HSE_PACKAGE_SLOTS/);
  });

  it("fails if Quality/HSE modules are missing that body", () => {
    const quality = source("../components/QualityDesk.tsx");
    const qualityCard = source("../components/QualityDay1Card.tsx");
    const qualityLib = source("./quality-day1.ts");
    const rolling = source("../components/RollingChartMap.tsx");
    const hse = source("../components/HseDesk.tsx");
    const hseCard = source("../components/HseDay1Card.tsx");
    const detail = source("../components/EstimateDetail.tsx");
    assert.match(quality, /QualityDay1Card/);
    assert.match(quality, /RollingChartMap/);
    assert.match(qualityLib, /2\.7\.1 Madison Pressure Test Record Rev 2/);
    assert.match(qualityLib, /NDE req spreadsheet/);
    assert.match(qualityCard, /QUALITY_PACKAGE_FORMS/);
    const rollingLib = source("./rolling-chart.ts");
    assert.match(rollingLib, /Steam Drum Rolling Chart/);
    assert.match(rollingLib, /Generating Bank Retube Progression Chart/);
    assert.match(rollingLib, /Tube Final Roll/);
    assert.match(rolling, /ROLLING_SHEETS/);
    assert.match(rolling, /Tube Final Roll/);
    assert.doesNotMatch(rolling, /elevation/i);
    const hseLib = source("./hse-day1.ts");
    assert.match(hse, /HseDay1Card/);
    assert.match(hseCard, /HSE_PACKAGE_SLOTS/);
    assert.match(hseLib, /Site orientation/);
    assert.match(hseLib, /HSE_PACKAGE_SLOTS/);
    assert.match(detail, /QualityDay1Card/);
    assert.match(detail, /RollingChartMap/);
    assert.match(detail, /HseDay1Card/);
    const fresh = source("../components/NewEstimateForm.tsx");
    assert.match(fresh, /QualityDay1Card/);
    assert.match(fresh, /RollingChartMap/);
    assert.match(fresh, /HseDay1Card/);
    assert.match(fresh, /onOpenQuality/);
    assert.match(fresh, /onOpenHse/);
    assert.doesNotMatch(quality, /1k4xceUc5ihDuzSf7opdjEzwnt2ODJomC|quality-briefs\.json|owner vault/i);
    assert.doesNotMatch(qualityCard, /1k4xceUc5ihDuzSf7opdjEzwnt2ODJomC|1y6Q3TOnpXzV/);
    assert.doesNotMatch(hse, /1zYl2dEvW21|hse-briefs\.json|29\.1|sling form/i);
  });

  it("fails if fillable cards and the rolling chart require Awarded", () => {
    assert.equal(showsQualityHseModules("Estimate"), true);
    assert.equal(showsQualityHseModules("Submitted"), true);
    assert.equal(showsQualityHseModules("Awarded"), true);
    assert.equal(showsQualityHseModules(""), false);
    assert.deepEqual(qualityHseTabIds("Awarded"), [QUALITY_TAB_ID, HSE_TAB_ID]);
    assert.deepEqual(qualityHseTabIds("Estimate"), [QUALITY_TAB_ID, HSE_TAB_ID]);
    assert.deepEqual(qualityHseTabIds("Submitted"), [QUALITY_TAB_ID, HSE_TAB_ID]);
    const workspace = source("../components/EstimateWorkspace.tsx");
    assert.match(workspace, /showsQualityHseModules/);
    assert.match(workspace, /QUALITY_TAB_ID/);
    assert.match(workspace, /HSE_TAB_ID/);
    assert.match(workspace, /showsRodeoTab|estimateTabsForSite/);
    const rodeo = source("./rodeo-form.ts");
    assert.match(rodeo, /HIDDEN_RODEO_SITES/);
    const quality = source("../components/QualityDesk.tsx");
    const hse = source("../components/HseDesk.tsx");
    const frame = source("../components/AwardedJobFrame.tsx");
    assert.match(quality, /OpenJobFrame/);
    assert.match(hse, /OpenJobFrame/);
    assert.doesNotMatch(quality, /status="Awarded"/);
    assert.doesNotMatch(hse, /status="Awarded"/);
    assert.match(frame, /openLocalJobs/);
    assert.match(frame, /openBoardJobs/);
    assert.match(frame, /pickOpenJob/);
    assert.doesNotMatch(frame, /awardedLocalJobs\(/);
    assert.doesNotMatch(frame, /awardedBoardJobs\(/);
    const modules = source("../components/FutureModulesDesk.tsx");
    assert.doesNotMatch(modules, /Opens when a job is awarded/);
    assert.match(modules, /Fillable on the selected job/);
  });

  it("does not put generating-bank or QC/HSE books in git", () => {
    const listed = execSync('git ls-files "*.xlsx" "*.xlsm" "*.xls" "*.xlsb" "*.pdf"', { encoding: "utf8" }).trim();
    assert.equal(listed, "");
    assert.equal(/generating-bank/i.test(listed), false);
  });

  it("lists open estimates, not only Awarded, and auto-picks a real job", () => {
    const store = memoryStorage();
    rememberLocalPack({ packId: "new-awarded", title: "Awarded bank", client: "Phillips 66", site: "Wood River" }, store);
    rememberLocalPack({ packId: "new-est", title: "Still estimate", client: "Phillips 66", site: "Wood River" }, store);
    writeEstimateStatus("new-awarded", "Awarded", store);
    const awarded = awardedLocalJobs(store);
    assert.deepEqual(awarded.map((row) => row.id), ["new-awarded"]);
    const open = openLocalJobs(store);
    assert.equal(open.some((row) => row.id === "new-est" && row.status === "Estimate"), true);
    assert.equal(open.some((row) => row.id === "new-awarded" && row.status === "Awarded"), true);
    assert.deepEqual(mergeOpenJobs(open, open).map((row) => row.id).sort(), ["new-awarded", "new-est"]);
    assert.equal(pickOpenJob(open)?.id, open[0].id);
    assert.equal(pickOpenJob(open, "new-est")?.id, "new-est");
    assert.equal(pickOpenJob([], ""), null);
    assert.deepEqual(
      dropClosedJobs(open, (id) => id === "new-awarded").map((row) => row.id),
      open.filter((row) => row.id !== "new-awarded").map((row) => row.id),
    );
  });
});
