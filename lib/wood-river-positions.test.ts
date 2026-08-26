import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { CRAFT_POSITIONS, STAFF_POSITIONS } from "./craft-labor.ts";
import { CREW_LANES } from "./crew-lanes.ts";
import {
  WOOD_RIVER_CRAFT_TITLES,
  WOOD_RIVER_FOREMAN_TITLES,
  WOOD_RIVER_GENERAL_FOREMAN_TITLES,
  WOOD_RIVER_STAFF_TITLES,
  uniqueSortedTitles,
} from "./wood-river-positions.ts";

const CATALOG_PATH = new URL("./wood-river-positions.ts", import.meta.url);

function lane(id: string) {
  const found = CREW_LANES.find((item) => item.id === id);
  assert.ok(found, `missing crew lane ${id}`);
  return found;
}

describe("Wood River position catalog", () => {
  it("lists Exhibit B-1 staff titles and keeps saved Staff row titles selectable", () => {
    assert.equal(WOOD_RIVER_STAFF_TITLES.includes("MANAGER, PROJECT 01"), true);
    assert.equal(WOOD_RIVER_STAFF_TITLES.includes("GENERAL SUPERINTENDENT 01"), true);
    assert.equal(WOOD_RIVER_STAFF_TITLES.includes("Superintendent General PF 01"), true);
    assert.equal(WOOD_RIVER_STAFF_TITLES.includes("Analyst Cost 01"), true);
    assert.equal(WOOD_RIVER_STAFF_TITLES.includes("LEAD SITE 01"), true);
    assert.equal(WOOD_RIVER_STAFF_TITLES.includes("COORDINATOR QA-QC 1"), true);
    assert.deepEqual(WOOD_RIVER_STAFF_TITLES, uniqueSortedTitles(WOOD_RIVER_STAFF_TITLES));
  });

  it("does not put dollar strings in the catalog module", () => {
    const source = readFileSync(CATALOG_PATH, "utf8");
    assert.equal(source.includes("$"), false);
    assert.doesNotMatch(source, /\d+\.\d{2}/);
    const titles = [
      ...WOOD_RIVER_STAFF_TITLES,
      ...WOOD_RIVER_GENERAL_FOREMAN_TITLES,
      ...WOOD_RIVER_FOREMAN_TITLES,
      ...WOOD_RIVER_CRAFT_TITLES,
    ];
    for (const title of titles) {
      assert.equal(title.includes("$"), false);
      assert.doesNotMatch(title, /\d+\.\d{2}/);
    }
  });

  it("fills GF / Foreman / Direct Craft from book titles plus today's craft names", () => {
    for (const title of ["General Foreman", "GENERAL FOREMAN 01", "GENERAL FOREMAN 02"]) {
      assert.equal(WOOD_RIVER_GENERAL_FOREMAN_TITLES.includes(title), true);
    }
    for (const title of ["Foreman", "FOREMAN 01", "FOREMAN 02"]) {
      assert.equal(WOOD_RIVER_FOREMAN_TITLES.includes(title), true);
    }
    assert.deepEqual(WOOD_RIVER_GENERAL_FOREMAN_TITLES, uniqueSortedTitles(WOOD_RIVER_GENERAL_FOREMAN_TITLES));
    assert.deepEqual(WOOD_RIVER_FOREMAN_TITLES, uniqueSortedTitles(WOOD_RIVER_FOREMAN_TITLES));
    assert.equal(WOOD_RIVER_CRAFT_TITLES.includes("Boilermaker Journeyman"), true);
    assert.equal(WOOD_RIVER_CRAFT_TITLES.includes("Boilermaker Welder"), true);
    assert.equal(WOOD_RIVER_CRAFT_TITLES.includes("Pipefitter Helper"), true);
    assert.equal(WOOD_RIVER_CRAFT_TITLES.includes("Ironworker Journeyman"), true);
    assert.equal(WOOD_RIVER_CRAFT_TITLES.includes("Combo Welder"), true);
    assert.equal(WOOD_RIVER_CRAFT_TITLES.includes("Merit welder"), true);
    assert.equal(WOOD_RIVER_CRAFT_TITLES.includes("Firewatch"), true);
    assert.equal(WOOD_RIVER_CRAFT_TITLES.includes("Holewatch"), true);
    assert.equal(WOOD_RIVER_CRAFT_TITLES.includes("General Foreman"), false);
    assert.equal(WOOD_RIVER_CRAFT_TITLES.includes("Foreman"), false);
  });

  it("wires Crew lane pickers and the craft-labor aliases to the same catalog", () => {
    assert.deepEqual([...lane("staff").positions], WOOD_RIVER_STAFF_TITLES);
    assert.deepEqual([...lane("general-foreman").positions], WOOD_RIVER_GENERAL_FOREMAN_TITLES);
    assert.deepEqual([...lane("foreman").positions], WOOD_RIVER_FOREMAN_TITLES);
    assert.deepEqual([...lane("direct").positions], WOOD_RIVER_CRAFT_TITLES);
    assert.deepEqual([...STAFF_POSITIONS], WOOD_RIVER_STAFF_TITLES);
    assert.deepEqual([...CRAFT_POSITIONS], WOOD_RIVER_CRAFT_TITLES);
  });
});
