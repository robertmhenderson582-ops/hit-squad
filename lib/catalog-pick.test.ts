import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { CATALOG_CUSTOM, catalogPickView } from "./catalog-pick.ts";

const CRAFT = ["Boilermaker Journeyman", "Pipefitter Journeyman"];

describe("catalog pick never blanks a named position", () => {
  it("keeps a listed title selected — not Select position", () => {
    const view = catalogPickView("Boilermaker Journeyman", CRAFT, true);
    assert.equal(view.listed, true);
    assert.equal(view.named, true);
    assert.equal(view.selectValue, "Boilermaker Journeyman");
    assert.equal(view.placeholderSelected, false);
    assert.equal(view.showValueOption, false);
  });

  it("keeps an unlisted / custom title selected so Duplicate does not look unnamed", () => {
    const view = catalogPickView("Asst Superintendent 01", CRAFT, true);
    assert.equal(view.listed, false);
    assert.equal(view.named, true);
    assert.equal(view.selectValue, "Asst Superintendent 01");
    assert.equal(view.showValueOption, true);
    assert.equal(view.placeholderSelected, false);
    assert.notEqual(view.selectValue, "");
    assert.notEqual(view.selectValue, CATALOG_CUSTOM);
  });

  it("only shows the placeholder when the title is actually empty", () => {
    const view = catalogPickView("", CRAFT, true);
    assert.equal(view.named, false);
    assert.equal(view.selectValue, "");
    assert.equal(view.placeholderSelected, true);
  });

  it("CatalogPick keeps a named value and does not clear the title when opening Type a title", () => {
    const src = readFileSync(fileURLToPath(new URL("../components/CatalogPick.tsx", import.meta.url)), "utf8");
    assert.match(src, /catalogPickView/);
    assert.match(src, /showValueOption/);
    assert.equal(/onChange\(""\)/.test(src), false);
  });
});
