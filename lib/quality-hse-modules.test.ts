import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { qualityNotify } from "./quality-day1.ts";
import { hseNotify } from "./hse-day1.ts";
import {
  CLIENT_FOLDERS,
  QUALITY_HSE_INTERACTION_ACTIVE,
  QUALITY_TAB_ID,
  HSE_TAB_ID,
  clientFolderId,
  qualityHseAwardedHinge,
  qualityHseQuietDoorsOn,
  qualityHseTabIds,
  showsQualityHseModules,
} from "./quality-hse-modules.ts";
import { awardedLocalJobs, mergeAwardedJobs } from "./quality-hse-modules.ts";
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
  /QualityDay1Card|HseDay1Card|QUALITY_PACKAGE_FORMS|HSE_PACKAGE_SLOTS|QUALITY_DAY1_LABEL|HSE_DAY1_LABEL|inspectionPlan|travelerCount|RollingChartMap|2\.7\.1 Madison|Site orientation|Weld map|Madison QC manuals|onOpenQuality|onOpenHse/;

const DEAD_NAME_LIST =
  /QualityFormRoster|QUALITY_PACKAGE_FORMS\.map|<ul[\s\S]{0,80}HSE_PACKAGE_SLOTS|HSE_PACKAGE_SLOTS\.map/;

describe("Quality and HSE have no estimate interaction", () => {
  it("keeps the Awarded notify hinge in code and does not fire it", () => {
    assert.equal(QUALITY_HSE_INTERACTION_ACTIVE, false);
    assert.equal(qualityHseAwardedHinge("Awarded"), true);
    assert.equal(qualityHseAwardedHinge("Estimate"), false);
    assert.equal(qualityHseAwardedHinge("Submitted"), false);
    assert.equal(qualityNotify("Awarded"), true);
    assert.equal(qualityNotify("Estimate"), false);
    assert.equal(qualityNotify("Submitted"), false);
    assert.equal(hseNotify("Awarded"), true);
    assert.equal(hseNotify("Estimate"), false);
    assert.equal(showsQualityHseModules("Awarded"), false);
    assert.equal(qualityHseQuietDoorsOn("Awarded"), false);
    assert.deepEqual(qualityHseTabIds("Awarded"), []);
    assert.deepEqual(qualityHseTabIds("Awarded"), QUALITY_HSE_INTERACTION_ACTIVE ? [QUALITY_TAB_ID, HSE_TAB_ID] : []);
    const workspace = source("../components/EstimateWorkspace.tsx");
    const setup = source("../components/JobSetupCard.tsx");
    const quality = source("../components/QualityDesk.tsx");
    const hse = source("../components/HseDesk.tsx");
    const doors = source("../components/QualityHseQuietDoors.tsx");
    assert.doesNotMatch(workspace, /qualityNotify|hseNotify|showsQualityHseModules|QUALITY_TAB_ID/);
    assert.doesNotMatch(setup, /qualityNotify|hseNotify|onOpenQuality|onOpenHse|QualityHseQuietDoors|showsQualityHseModules/);
    assert.doesNotMatch(quality, /qualityNotify|qualityLive|QualityHseQuietDoors/);
    assert.doesNotMatch(hse, /hseNotify|QualityHseQuietDoors/);
    assert.match(doors, /qualityHseQuietDoorsOn/);
    assert.match(doors, /onOpenQuality/);
    assert.match(doors, /onOpenHse/);
    assert.match(source("./quality-hse-modules.ts"), /QUALITY_HSE_INTERACTION_ACTIVE/);
    const modules = source("../components/FutureModulesDesk.tsx");
    assert.match(modules, /No estimate interaction unless a lead/);
    assert.match(modules, /Quality and HSE are fillable modules/);
  });

  it("fails if Job setup still renders Quality/HSE body or doors", () => {
    const setup = source("../components/JobSetupCard.tsx");
    assert.doesNotMatch(setup, JOB_SETUP_BODY);
    assert.doesNotMatch(setup, /QualityDay1Card|HseDay1Card|RollingChartMap|showsQualityHseModules|onOpenQuality|onOpenHse/);
  });

  it("fails if the estimate workspace still has Quality/HSE tabs", () => {
    assert.equal(showsQualityHseModules("Estimate"), false);
    assert.equal(showsQualityHseModules("Submitted"), false);
    assert.equal(showsQualityHseModules("Awarded"), false);
    assert.deepEqual(qualityHseTabIds("Awarded"), []);
    assert.deepEqual(qualityHseTabIds("Estimate"), []);
    const workspace = source("../components/EstimateWorkspace.tsx");
    const detail = source("../components/EstimateDetail.tsx");
    const fresh = source("../components/NewEstimateForm.tsx");
    assert.doesNotMatch(workspace, /QUALITY_TAB_ID|HSE_TAB_ID|showsQualityHseModules/);
    assert.doesNotMatch(detail, /QualityDay1Card|HseDay1Card|RollingChartMap|QUALITY_TAB_ID|onOpenQuality/);
    assert.doesNotMatch(fresh, /QualityDay1Card|HseDay1Card|RollingChartMap|QUALITY_TAB_ID|onOpenQuality/);
    assert.match(workspace, /showsRodeoTab|estimateTabsForSite/);
  });

  it("fails if QualityDesk or HseDesk still gate on an Awarded/open estimate or render a name list", () => {
    const quality = source("../components/QualityDesk.tsx");
    const hse = source("../components/HseDesk.tsx");
    const qualityCard = source("../components/QualityDay1Card.tsx");
    const hseCard = source("../components/HseDay1Card.tsx");
    const rolling = source("../components/RollingChartMap.tsx");
    assert.doesNotMatch(quality, /OpenJobFrame|AwardedJobFrame|Awarded job|OPEN_JOB_EMPTY/);
    assert.doesNotMatch(hse, /OpenJobFrame|AwardedJobFrame|Awarded job|OPEN_JOB_EMPTY/);
    assert.doesNotMatch(quality, DEAD_NAME_LIST);
    assert.doesNotMatch(hse, DEAD_NAME_LIST);
    assert.doesNotMatch(quality, /EmptyLane/);
    assert.doesNotMatch(hse, /EmptyLane/);
    assert.doesNotMatch(qualityCard, /useEstimatePackage|setJobMeta|jobMeta/);
    assert.doesNotMatch(hseCard, /useEstimatePackage|setJobMeta|jobMeta|readEquipmentSheet|readSubSheet|computeRowHours/);
    assert.doesNotMatch(rolling, /useEstimatePackage|setJobMeta|jobMeta/);
    assert.match(quality, /QualityDay1Card/);
    assert.match(quality, /RollingChartMap/);
    assert.match(quality, /QUALITY_SECTIONS/);
    assert.match(quality, /Client folder/);
    assert.match(hse, /HseDay1Card/);
    assert.match(hse, /HSE_EXECUTE_LANES/);
    assert.match(qualityCard, /QUALITY_PACKAGE_FORMS/);
    assert.match(qualityCard, /Inspection plan \/ ITP/);
    assert.match(qualityCard, /Weld map/);
    assert.match(qualityCard, /Traveler count/);
    assert.match(qualityCard, /QualityFormScreens/);
    assert.doesNotMatch(qualityCard, />FILL<|>COUNT</);
    assert.match(hseCard, /HSE_PACKAGE_SLOTS/);
    assert.match(hseCard, /paper-field/);
    assert.match(hseCard, /field-register-table/);
    assert.match(hseCard, /Status/);
    assert.match(hseCard, /Date/);
    assert.match(hseCard, /Note/);
    assert.doesNotMatch(hseCard, /type="checkbox"/);
  });

  it("fails if Chance’s Quality studio or named forms are missing", () => {
    const quality = source("../components/QualityDesk.tsx");
    const qualityCard = source("../components/QualityDay1Card.tsx");
    const qualityLib = source("./quality-day1.ts");
    const moduleLib = source("./quality-module.ts");
    const rolling = source("../components/RollingChartMap.tsx");
    const rollingLib = source("./rolling-chart.ts");
    assert.match(qualityLib, /2\.7\.1 Madison Pressure Test Record Rev 2/);
    assert.match(qualityLib, /2\.7\.11 Madison Document Transmittal Form Rev\. 2/);
    assert.match(qualityLib, /2\.7\.17 ROD Issue Form Rev\. 4/);
    assert.match(qualityLib, /2\.7\.19 Madison Flange Log Rev\.1/);
    assert.match(qualityLib, /2\.7\.22 Weld Test Instruction Form Rev\. 8/);
    assert.match(qualityLib, /2\.7\.34 Job Completion Sign-off Form Rev 2/);
    assert.match(qualityLib, /2\.7\.5 Madison Punch List Rev\. 1/);
    assert.match(qualityLib, /NDE req spreadsheet/);
    assert.doesNotMatch(qualityLib, /2\.7\.29|2\.7\.3\b|sling/i);
    assert.match(moduleLib, /Open NCRs/);
    assert.match(moduleLib, /Welds\/NDE/);
    assert.match(moduleLib, /Connections/);
    assert.match(moduleLib, /Travelers/);
    assert.match(moduleLib, /Welders/);
    assert.match(moduleLib, /Calibration/);
    assert.match(quality, /BOARD/);
    assert.match(rollingLib, /Steam Drum Rolling Chart/);
    assert.match(rollingLib, /Generating Bank Retube Progression Chart/);
    assert.match(rolling, /ROLLING_SHEETS/);
    assert.match(rolling, /Setup/);
    assert.match(rolling, /Bank name/);
    assert.match(rolling, /Circuits/);
    assert.match(rollingLib, /CIRCUIT_HINT/);
    assert.doesNotMatch(rolling, /h-3 w-3/);
    assert.doesNotMatch(rolling, /elevation/i);
    assert.doesNotMatch(quality, /1k4xceUc5ihDuzSf7opdjEzwnt2ODJomC|quality-briefs\.json|owner vault/i);
    assert.doesNotMatch(qualityCard, /1k4xceUc5ihDuzSf7opdjEzwnt2ODJomC|1y6Q3TOnpXzV/);
  });

  it("keeps HSE fillable slots and usable execute lanes without invented hours or a 29.1 sling", () => {
    const hse = source("../components/HseDesk.tsx");
    const hseCard = source("../components/HseDay1Card.tsx");
    const hseLib = source("./hse-day1.ts");
    const hseMod = source("./hse-module.ts");
    assert.match(hseLib, /Site orientation/);
    assert.match(hseLib, /HSE_PACKAGE_SLOTS/);
    assert.match(hseMod, /Incidents \/ near misses/);
    assert.match(hseMod, /Toolbox talks/);
    assert.match(hse, /ModuleRegister/);
    assert.doesNotMatch(hseCard, /Hours on this estimate|scoreboard until real hours exist/);
    assert.doesNotMatch(hse, /1zYl2dEvW21|hse-briefs\.json/);
    assert.doesNotMatch(hseCard, /29\.1|sling form/i);
    assert.equal(/29\.1|sling/i.test(hseLib.split("HSE_PACKAGE_SLOTS")[1]?.slice(0, 400) || ""), false);
  });

  it("does not put generating-bank or QC/HSE books in git", () => {
    const listed = execSync('git ls-files "*.xlsx" "*.xlsm" "*.xls" "*.xlsb" "*.pdf"', { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter((file) => file && !file.startsWith("look-samples/"))
      .join("\n");
    assert.equal(listed, "");
    assert.equal(/generating-bank/i.test(listed), false);
  });

  it("locks Ironwood and Phillips 66 to the same client folder", () => {
    assert.equal(clientFolderId("Phillips 66"), "phillips-66");
    assert.equal(clientFolderId("Ironwood Refining"), "phillips-66");
    assert.equal(clientFolderId("P66"), "phillips-66");
    assert.equal(clientFolderId("Georgia Power"), "georgia-power");
    assert.deepEqual(
      CLIENT_FOLDERS.map((row) => row.id),
      ["phillips-66", "georgia-power", "other"],
    );
  });

  it("lists awarded local jobs without wiping other packs", () => {
    const store = memoryStorage();
    rememberLocalPack({ packId: "new-awarded", title: "Awarded bank", client: "Georgia Power", site: "Plant Yates" }, store);
    rememberLocalPack({ packId: "new-est", title: "Still estimate", client: "Phillips 66", site: "Wood River" }, store);
    writeEstimateStatus("new-awarded", "Awarded", store);
    const awarded = awardedLocalJobs(store);
    assert.deepEqual(awarded.map((row) => row.id), ["new-awarded"]);
    assert.deepEqual(mergeAwardedJobs(awarded, awarded).map((row) => row.id), ["new-awarded"]);
  });
});
