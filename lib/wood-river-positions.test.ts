import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { CRAFT_POSITIONS, STAFF_POSITIONS, SUPPORT_DUTIES } from "./craft-labor.ts";
import { CREW_LANES } from "./crew-lanes.ts";
import {
  SHAHAN_CRAFT_TITLES,
  SHAHAN_FOREMAN_TITLES,
  SHAHAN_GENERAL_FOREMAN_TITLES,
  SHAHAN_STAFF_TITLES,
  SHAHAN_SUPPORT_TITLES,
  isNathanEstimateTitle,
  uniqueSortedTitles,
} from "./shahan-wood-river.ts";

const CATALOG_PATH = new URL("./shahan-wood-river.ts", import.meta.url);

function lane(id: string) {
  const found = CREW_LANES.find((item) => item.id === id);
  assert.ok(found, `missing crew lane ${id}`);
  return found;
}

describe("Shahan Crew pickers", () => {
  it("lists Shahan staff titles and keeps working Foreman / journeyman off Staff", () => {
    assert.equal(SHAHAN_STAFF_TITLES.includes("Lead Site Boilermaker 01"), true);
    assert.equal(SHAHAN_STAFF_TITLES.includes("Manager, Project 01"), true);
    assert.equal(SHAHAN_STAFF_TITLES.includes("Manager Project 01"), true);
    assert.equal(SHAHAN_STAFF_TITLES.includes("COORDINATOR QA-QC 1"), true);
    assert.equal(SHAHAN_STAFF_TITLES.includes("Clerk Field 01"), true);
    assert.equal(SHAHAN_STAFF_TITLES.includes("Lead Safety 01"), true);
    assert.equal(SHAHAN_STAFF_TITLES.includes("Boilermaker General Foreman"), false);
    assert.equal(SHAHAN_STAFF_TITLES.includes("Boilermaker Foreman"), false);
    assert.equal(SHAHAN_STAFF_TITLES.includes("Boilermaker Journeyman"), false);
    assert.equal(SHAHAN_STAFF_TITLES.some((title) => isNathanEstimateTitle(title)), false);
    assert.deepEqual(SHAHAN_STAFF_TITLES, uniqueSortedTitles(SHAHAN_STAFF_TITLES));
  });

  it("groups GF / Foreman / Direct Craft from Shahan craftName values", () => {
    for (const title of [
      "Boilermaker General Foreman",
      "Pipefitter General Foreman",
      "Laborer General Foreman GRP1",
      "Laborer General Foreman GRP 2",
    ]) {
      assert.equal(SHAHAN_GENERAL_FOREMAN_TITLES.includes(title), true);
    }
    for (const title of [
      "Boilermaker Foreman",
      "Boilermaker ASST Foreman",
      "PIPEFITTER FORMAN",
      "Laborer Foreman 10-20 GRP 1",
      "Laborer Foreman 03-09 GRP 1",
    ]) {
      assert.equal(SHAHAN_FOREMAN_TITLES.includes(title), true);
    }
    assert.equal(SHAHAN_GENERAL_FOREMAN_TITLES.includes("Boilermaker Foreman"), false);
    assert.equal(SHAHAN_FOREMAN_TITLES.includes("Boilermaker General Foreman"), false);
    assert.equal(SHAHAN_CRAFT_TITLES.includes("Boilermaker Journeyman"), true);
    assert.equal(SHAHAN_CRAFT_TITLES.includes("PIPEFITTER JOURNEYMAN"), true);
    assert.equal(SHAHAN_CRAFT_TITLES.includes("PIPEFITTER APPR 70%"), true);
    assert.equal(SHAHAN_CRAFT_TITLES.includes("Operating Eng Grp 01"), true);
    assert.equal(SHAHAN_CRAFT_TITLES.includes("TEAMSTERS GRP 01"), true);
    assert.equal(SHAHAN_CRAFT_TITLES.includes("Laborer Journeyman GRP1"), true);
    assert.equal(SHAHAN_CRAFT_TITLES.includes("Boilermaker Foreman"), false);
    assert.equal(SHAHAN_CRAFT_TITLES.includes("Boilermaker General Foreman"), false);
    assert.equal(SHAHAN_CRAFT_TITLES.some((title) => isNathanEstimateTitle(title)), false);
  });

  it("wires Crew lane pickers and the craft-labor aliases to the Shahan book", () => {
    assert.deepEqual([...lane("staff").positions], SHAHAN_STAFF_TITLES);
    assert.deepEqual([...lane("general-foreman").positions], SHAHAN_GENERAL_FOREMAN_TITLES);
    assert.deepEqual([...lane("foreman").positions], SHAHAN_FOREMAN_TITLES);
    assert.deepEqual([...lane("direct").positions], SHAHAN_CRAFT_TITLES);
    assert.deepEqual([...lane("support").positions], SHAHAN_SUPPORT_TITLES);
    assert.deepEqual([...STAFF_POSITIONS], SHAHAN_STAFF_TITLES);
    assert.deepEqual([...CRAFT_POSITIONS], SHAHAN_CRAFT_TITLES);
    assert.deepEqual([...SUPPORT_DUTIES], SHAHAN_SUPPORT_TITLES);
  });

  it("does not keep Nathan Merit 01 names as first-class picker options", () => {
    const source = readFileSync(CATALOG_PATH, "utf8");
    assert.match(source, /SHAHAN_LABOR/);
    const titles = [
      ...SHAHAN_STAFF_TITLES,
      ...SHAHAN_GENERAL_FOREMAN_TITLES,
      ...SHAHAN_FOREMAN_TITLES,
      ...SHAHAN_CRAFT_TITLES,
      ...SHAHAN_SUPPORT_TITLES,
    ];
    for (const title of titles) {
      assert.equal(isNathanEstimateTitle(title), false);
      assert.equal(/\bmerit 0?\d+\b/i.test(title), false);
    }
  });
});
