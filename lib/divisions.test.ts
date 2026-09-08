import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import {
  addCompany,
  addDivision,
  listDivisions,
  listDivisionsForScope,
  parseAssignmentFile,
  removeDivision,
  renameDivision,
  resetCompanyAssignmentsForTests,
  useMemoryCompanyAssignments,
} from "./companies-store.ts";
import {
  inferDivisionId,
  MADISON_SEED_DIVISIONS,
  MECHANICAL_DIVISION_ID,
  mergeDivisions,
  POWER_DIVISION_ID,
  PULP_AND_PAPER_DIVISION_ID,
  seedDivisions,
  WOOD_RIVER_MOLD,
  WOOD_RIVER_MOLD_ID,
} from "./divisions.ts";

const dir = mkdtempSync(join(tmpdir(), "hs-divisions-"));
process.env.COMPANY_ASSIGNMENT_PATH = join(dir, "companies.json");

const owner = { isOwner: true, email: OWNER_LOGIN_EMAIL, companyId: "hitsquad" as const };
const president = { isOwner: false, email: "president.example@example.com", companyId: "madison" as const };

beforeEach(() => {
  resetCompanyAssignmentsForTests();
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("division catalog", () => {
  it("seeds Madison Mechanical / Power / Pulp and Paper on the Wood River mold", () => {
    assert.deepEqual(
      seedDivisions().map((row) => `${row.id}:${row.code}:${row.mold}`),
      ["mechanical:307000:wood-river", "power:303000:wood-river", "pulp-and-paper:305000:wood-river"],
    );
    assert.equal(MADISON_SEED_DIVISIONS.every((row) => row.companyId === "madison"), true);
    assert.equal(WOOD_RIVER_MOLD.crew, "five-card");
    assert.match(WOOD_RIVER_MOLD.note, /additive/);
    assert.equal(inferDivisionId("madison", "Phillips 66", "Wood River"), MECHANICAL_DIVISION_ID);
    assert.equal(inferDivisionId("madison", "Monroe Energy", "Trainer"), MECHANICAL_DIVISION_ID);
    assert.equal(inferDivisionId("madison", "Georgia Power", "Yates"), POWER_DIVISION_ID);
    assert.equal(inferDivisionId("madison", "Pulp and Paper mill"), PULP_AND_PAPER_DIVISION_ID);
    assert.equal(inferDivisionId("hitsquad", "Phillips 66"), "");
    assert.equal(mergeDivisions([], ["madison:pulp-and-paper"]).some((row) => row.id === PULP_AND_PAPER_DIVISION_ID), false);
    assert.equal(mergeDivisions([], ["madison:pulp-and-paper"]).some((row) => row.id === MECHANICAL_DIVISION_ID), true);
  });

  it("lets each company add, rename, and remove its own divisions without inventing plants", async () => {
    useMemoryCompanyAssignments();
    const listed = await listDivisions();
    assert.deepEqual(
      listed.map((row) => row.id),
      [MECHANICAL_DIVISION_ID, POWER_DIVISION_ID, PULP_AND_PAPER_DIVISION_ID],
    );
    assert.equal(
      (await listDivisionsForScope(president)).every((row) => row.companyId === "madison"),
      true,
    );
    assert.equal((await listDivisionsForScope(owner)).some((row) => row.companyId === "madison"), true);

    const added = await addDivision("hitsquad", "Field Services", "401000");
    assert.equal("ok" in added, true);
    if (!("ok" in added)) return;
    assert.equal(added.division.mold, WOOD_RIVER_MOLD_ID);
    assert.equal(added.division.companyId, "hitsquad");
    assert.equal((await listDivisions()).some((row) => row.id === added.division.id && row.code === "401000"), true);

    const renamed = await renameDivision("hitsquad", added.division.id, "Field Ops", "401100");
    assert.equal("ok" in renamed, true);
    if (!("ok" in renamed)) return;
    assert.equal(renamed.division.name, "Field Ops");
    assert.equal(renamed.division.mold, WOOD_RIVER_MOLD_ID);

    const removed = await removeDivision("hitsquad", added.division.id);
    assert.equal("ok" in removed, true);
    assert.equal((await listDivisions()).some((row) => row.id === added.division.id), false);

    const pulp = await removeDivision("madison", PULP_AND_PAPER_DIVISION_ID);
    assert.equal("ok" in pulp, true);
    assert.equal((await listDivisions()).some((row) => row.id === PULP_AND_PAPER_DIVISION_ID), false);
    assert.equal((await listDivisions()).some((row) => row.id === MECHANICAL_DIVISION_ID), true);

    const company = await addCompany("Acme Field Services");
    assert.equal("ok" in company, true);
    if (!("ok" in company)) return;
    const custom = await addDivision(company.company.id, "Shop", "");
    assert.equal("ok" in custom, true);
    if (!("ok" in custom)) return;
    assert.equal(custom.division.mold, WOOD_RIVER_MOLD_ID);
    assert.equal((await listDivisions()).filter((row) => row.companyId === company.company.id).length, 1);
  });

  it("keeps CBI / Lucky 13 divisions off the vault parse", () => {
    const parsed = parseAssignmentFile({
      assignments: {},
      companies: [],
      divisions: [
        { id: "shop", companyId: "cbi", name: "Shop", code: "1", mold: "wood-river" },
        { id: "mechanical", companyId: "madison", name: "Mechanical", code: "307000", mold: "other" },
      ],
    });
    assert.equal(parsed.divisions?.some((row) => row.companyId === "cbi"), false);
    assert.equal(parsed.divisions?.find((row) => row.id === "mechanical")?.mold, WOOD_RIVER_MOLD_ID);
  });

  it("wires Settings Divisions and the Jobs tree copy", () => {
    const desk = readFileSync(fileURLToPath(new URL("../components/DivisionsDesk.tsx", import.meta.url)), "utf8");
    const shell = readFileSync(fileURLToPath(new URL("../components/SettingsShell.tsx", import.meta.url)), "utf8");
    const api = readFileSync(fileURLToPath(new URL("../app/api/desk/divisions/route.ts", import.meta.url)), "utf8");
    const jobs = readFileSync(fileURLToPath(new URL("../components/JobsDesk.tsx", import.meta.url)), "utf8");
    assert.match(shell, /href: "\/settings\/divisions"/);
    assert.match(desk, /Create division/);
    assert.match(desk, /WOOD_RIVER_MOLD/);
    assert.match(desk, /Rename/);
    assert.match(desk, /Remove/);
    assert.match(api, /addDivision/);
    assert.match(api, /hasWorkingDesk/);
    assert.match(jobs, /Division, then client, then site, then the job/);
  });
});
