import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  HSE_DESK_RADIOS,
  HSE_MODULE_CATALOG,
  hseCatalogCoversShippedSafetyFiles,
  hseDeskVaultCompanyId,
  isHseDeskRadio,
  showsHseFolderDesk,
} from "./hse-folders.ts";

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("HSE desk radios", () => {
  it("promotes the shipped safety catalog to radios and drops Board / Day-1 register nav", () => {
    assert.deepEqual(
      HSE_DESK_RADIOS.map((row) => row.label),
      [
        "Packages",
        "Site orientation",
        "JSA",
        "Toolbox talk",
        "Hot work",
        "Confined space",
        "LOTO",
        "Excavation",
        "Incidents / near misses",
        "Observations",
      ],
    );
    assert.deepEqual(
      HSE_DESK_RADIOS.map((row) => row.id),
      HSE_MODULE_CATALOG.map((row) => row.id),
    );
    assert.equal(hseCatalogCoversShippedSafetyFiles(), true);
    assert.equal(isHseDeskRadio("packages"), true);
    assert.equal(isHseDeskRadio("jsa"), true);
    assert.equal(isHseDeskRadio("board"), false);
    assert.equal(isHseDeskRadio("flange-log"), false);

    const desk = source("../components/HseDesk.tsx");
    const drop = source("../components/HseFolderDrop.tsx");
    assert.match(desk, /role="radiogroup"/);
    assert.match(desk, /HSE_DESK_RADIOS/);
    assert.match(desk, /Open form/);
    assert.match(desk, /HseTemplateForm/);
    assert.match(desk, /folderId=\{radio\}/);
    assert.match(desk, /HsePackageShelf/);
    assert.match(desk, /HseCompanyDocRail/);
    assert.doesNotMatch(desk, /HseDay1Card/);
    assert.doesNotMatch(desk, /ModuleRegister/);
    assert.doesNotMatch(desk, /LeadStudio/);
    assert.doesNotMatch(desk, /HSE_EXECUTE_LANES/);
    assert.doesNotMatch(drop, /<select/);
    assert.match(drop, /id="hse-folder-drop"/);
    assert.match(desk, /hseDeskVaultCompanyId/);
    assert.doesNotMatch(desk, /inbox|suggestion box|tester email|@gmail.com/i);
    assert.equal(hseDeskVaultCompanyId(undefined, { hseSeat: true }), "madison");
    assert.equal(showsHseFolderDesk(hseDeskVaultCompanyId(undefined, { hseSeat: true })), true);
    assert.equal(hseDeskVaultCompanyId(undefined, { hseSeat: false }), undefined);
  });
});
