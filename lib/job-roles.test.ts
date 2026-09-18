import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JOSEPH_EMAIL, JOHN_BEECH_EMAIL } from "./tester-seats.ts";
import {
  DEFAULT_JOB_ROLE,
  defaultJobRoleForSeat,
  loginRoleForJobTitle,
  mergeJobRoleCatalog,
  parseJobRoleCatalog,
  parseJobRoleLabel,
  parseSeatJobTitles,
  resolveJobRole,
  PARKED_HALL_JOB_ROLES,
  SEED_JOB_ROLES,
  systemSeatRoleLabel,
  isProjectManagerTitle,
} from "./job-roles.ts";

describe("job roles phase 1", () => {
  it("seeds the Managed users Role list and lets Owner append titles", () => {
    assert.deepEqual(
      [...SEED_JOB_ROLES],
      [
        "President",
        "Division Manager",
        "HSE Manager",
        "HSE Dispatcher",
        "Hall Local 553",
        "Quality Manager",
        "Accounting Manager",
        "Office Manager",
        "Project Manager",
        "Site Safety Manager",
        "Quality Site Manager",
        "Superintendent",
        "General Superintendent",
        "Project Controls",
        "Document Clerk",
        "Field Clerk",
        "Time Keeper",
        "General Foreman",
        "Foreman",
        "Tool Room attendant",
      ],
    );
    assert.equal(parseJobRoleLabel("  Night Clerk  ").label, "Night Clerk");
    assert.equal("error" in parseJobRoleLabel("x"), true);
    const custom = parseJobRoleCatalog(["Night Clerk", "president", "  Quality Manager  ", ""]);
    assert.deepEqual(custom, ["Night Clerk"]);
    assert.deepEqual([...PARKED_HALL_JOB_ROLES], ["Hall Local 363"]);
    assert.equal((SEED_JOB_ROLES as readonly string[]).includes("Hall Local 363"), false);
    assert.equal(mergeJobRoleCatalog().includes("Hall Local 363"), false);
    assert.equal(mergeJobRoleCatalog(custom).includes("Night Clerk"), true);
    assert.equal(mergeJobRoleCatalog(custom)[0], "President");
    assert.equal(loginRoleForJobTitle("President"), "president");
    assert.equal(loginRoleForJobTitle("Project Manager"), "tester");
    assert.equal(isProjectManagerTitle("Project Manager"), true);
    assert.equal(isProjectManagerTitle("Foreman"), false);
    assert.equal(systemSeatRoleLabel("owner"), "Owner");
    assert.equal(systemSeatRoleLabel("operator"), "Operator");
    assert.equal(systemSeatRoleLabel("tester"), null);
  });

  it("maps seeded testers to titles without stripping Owner / Operator / President seats", () => {
    assert.equal(defaultJobRoleForSeat({ role: "owner", email: "robert@example.com" }), "Owner");
    assert.equal(defaultJobRoleForSeat({ role: "operator", email: "novus@example.com" }), "Operator");
    assert.equal(
      defaultJobRoleForSeat({ role: "president", email: "freddy@example.com", name: "Freddy Grimland" }),
      "President",
    );
    assert.equal(defaultJobRoleForSeat({ email: "chancec318@yahoo.com", role: "tester" }), "Quality Manager");
    assert.equal(defaultJobRoleForSeat({ email: "wlanderno@yahoo.com", role: "tester" }), "HSE Manager");
    assert.equal(defaultJobRoleForSeat({ email: "bccamp2@gmail.com", role: "tester" }), "Site Safety Manager");
    assert.equal(defaultJobRoleForSeat({ email: "jbattuello@ualocal553.org", role: "tester" }), "Hall Local 553");
    assert.equal(defaultJobRoleForSeat({ email: "nathanboyte@gmail.com", role: "tester" }), "Project Manager");
    assert.equal(defaultJobRoleForSeat({ email: JOHN_BEECH_EMAIL, role: "tester" }), "Project Manager");
    assert.equal(defaultJobRoleForSeat({ email: JOSEPH_EMAIL, role: "tester" }), "Project Manager");
    assert.equal(
      defaultJobRoleForSeat({ email: "lisa@example.com", name: "Lisa Accounts", role: "tester" }),
      "Accounting Manager",
    );
    assert.equal(defaultJobRoleForSeat({ email: "shane@apcontrolsllc.com", role: "tester" }), DEFAULT_JOB_ROLE);
    assert.equal(
      resolveJobRole({ email: "chancec318@yahoo.com", role: "tester" }, { "chancec318@yahoo.com": "Quality Site Manager" }),
      "Quality Site Manager",
    );
    const titles = parseSeatJobTitles({
      "ChanceC318@yahoo.com": "Quality Site Manager",
      bogus: "Foreman",
      "ok@example.com": "x",
    });
    assert.equal(titles["chancec318@yahoo.com"], "Quality Site Manager");
    assert.equal(titles.bogus, undefined);
    assert.equal(titles["ok@example.com"], undefined);
  });
});
