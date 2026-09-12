import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  QUALITY_DESK_RADIOS,
  QUALITY_MODULE_CATALOG,
  isQualityDeskRadio,
  qualityDeskVaultCompanyId,
  showsQualityFolderDesk,
} from "./quality-folders.ts";
import { QUALITY_DESK_TABS } from "./quality-module.ts";

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("Quality desk radios", () => {
  it("promotes the full catalog to radios and drops Board / NCR / Day-1 register nav", () => {
    assert.deepEqual(
      QUALITY_DESK_RADIOS.map((row) => row.label),
      [
        "Packages",
        "Package Tracker",
        "Welds / NDE",
        "Welders",
        "NDE Request",
        "WPS",
        "Gauges",
        "Weld Log",
        "Flange Log",
        "Travelers",
        "Job Completion",
        "Rolling Chart",
      ],
    );
    assert.deepEqual(
      QUALITY_DESK_RADIOS.map((row) => row.id),
      QUALITY_MODULE_CATALOG.map((row) => row.id),
    );
    assert.equal(isQualityDeskRadio("packages"), true);
    assert.equal(isQualityDeskRadio("rolling-chart"), true);
    assert.equal(isQualityDeskRadio("board"), false);
    assert.equal(isQualityDeskRadio("ncrs"), false);
    assert.equal(QUALITY_DESK_TABS.some((tab) => tab.id === "board"), true);

    const desk = source("../components/QualityDesk.tsx");
    const drop = source("../components/QualityFolderDrop.tsx");
    assert.match(desk, /role="radiogroup"/);
    assert.match(desk, /QUALITY_DESK_RADIOS/);
    assert.match(desk, /Open form/);
    assert.match(desk, /QualityTemplateForm/);
    assert.match(desk, /folderId=\{radio\}/);
    assert.match(desk, /QualityPackageShelf/);
    assert.match(desk, /QualityCompanyDocRail/);
    assert.doesNotMatch(desk, /QUALITY_DESK_TABS/);
    assert.doesNotMatch(desk, /ModuleRegister/);
    assert.doesNotMatch(desk, /QualityDay1Card/);
    assert.doesNotMatch(desk, /RollingChartMap/);
    assert.doesNotMatch(desk, /id="quality-tab-board"/);
    assert.doesNotMatch(drop, /<select/);
    assert.doesNotMatch(drop, /quality-folder-pick/);
    assert.match(drop, /id="quality-folder-drop"/);
    assert.match(desk, /qualityDeskVaultCompanyId/);
    assert.doesNotMatch(desk, /radio === "packages"/);
    assert.equal(qualityDeskVaultCompanyId(undefined, { qualitySeat: true }), "madison");
    assert.equal(showsQualityFolderDesk(qualityDeskVaultCompanyId(undefined, { qualitySeat: true })), true);
    assert.equal(qualityDeskVaultCompanyId(undefined, { qualitySeat: false }), undefined);
  });
});
