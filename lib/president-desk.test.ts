import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { canUseInbox } from "./inbox-circle.ts";
import { lensPeopleFromSeats, peopleByLane, peopleVisibleTo } from "./desk-people.ts";
import {
  canArchiveDeleteJobs,
  canSeeHitSquadSeats,
  canUseViewAs,
  hasBuildDesk,
  hasWorkingDesk,
  isPresident,
  lensUser,
  pageAllowedForSeat,
} from "./desk-role.ts";
import { OWNER_ONLY_PRIVILEGES } from "./privileges.ts";
import { TESTER_SEATS } from "./tester-seats.ts";

const president = {
  id: "custom-president",
  email: "president.example@example.com",
  name: "Freddy Grimland",
  role: "president" as const,
};

describe("Freddy President seat", () => {
  it("is a real-data working desk with locked owner-only gates", () => {
    assert.equal(isPresident(president), true);
    assert.equal(hasWorkingDesk(president), true);
    assert.equal(hasBuildDesk(president), false);
    assert.equal(canUseInbox(president), true);
    assert.equal(canUseViewAs(president), false);
    assert.equal(canArchiveDeleteJobs(president), false);
    assert.equal(canSeeHitSquadSeats(president), false);
    assert.equal(pageAllowedForSeat(president, { workingDesk: true }), true);
    assert.equal(pageAllowedForSeat(president, { ownerOnly: true }), false);
    assert.equal(OWNER_ONLY_PRIVILEGES.includes("hitsquad-seats"), true);
    assert.equal(OWNER_ONLY_PRIVILEGES.includes("inbox-expand"), true);
    assert.equal(
      TESTER_SEATS.some((row) => /madisonltd\.com/i.test(row.email) || /freddy/i.test(row.email)),
      false,
    );
  });

  it("wires Settings Privileges and Manage users without a seeded email", () => {
    const shell = readFileSync(fileURLToPath(new URL("../components/SettingsShell.tsx", import.meta.url)), "utf8");
    const users = readFileSync(fileURLToPath(new URL("../components/ManageUsersDesk.tsx", import.meta.url)), "utf8");
    const privileges = readFileSync(fileURLToPath(new URL("../components/PrivilegesDesk.tsx", import.meta.url)), "utf8");
    const page = readFileSync(fileURLToPath(new URL("../app/settings/privileges/page.tsx", import.meta.url)), "utf8");
    const api = readFileSync(fileURLToPath(new URL("../app/api/desk/privileges/route.ts", import.meta.url)), "utf8");
    const create = readFileSync(fileURLToPath(new URL("./users.ts", import.meta.url)), "utf8");
    const lensPeople = readFileSync(fileURLToPath(new URL("./desk-people.ts", import.meta.url)), "utf8");
    const scope = readFileSync(fileURLToPath(new URL("./desk-scope-server.ts", import.meta.url)), "utf8");
    const viewAs = readFileSync(fileURLToPath(new URL("../components/ViewAsDesk.tsx", import.meta.url)), "utf8");
    assert.match(shell, /href: "\/settings\/privileges"/);
    assert.match(shell, /ownerOnly: true/);
    assert.match(page, /SettingsGate ownerOnly/);
    assert.match(privileges, /Grant or revoke owner-only items/);
    assert.match(privileges, /Do not invent a login email/);
    assert.doesNotMatch(privileges, /madisonltd\.com/);
    assert.match(users, /President/);
    assert.match(users, /Do not invent an email/);
    assert.match(users, /role: addRole/);
    assert.match(api, /isOwner\(user\)/);
    assert.match(api, /grantPrivilege/);
    assert.match(create, /role === "president"/);
    assert.match(create, /"madison"/);
    assert.doesNotMatch(create, /madisonltd\.com/);
    assert.doesNotMatch(create, /freddy@/i);
    assert.match(lensPeople, /role === "president"/);
    assert.match(scope, /role === "president"/);
    assert.match(viewAs, /peopleByLane\(desk\.people\)/);
    assert.doesNotMatch(lensPeople, /Freddy\.Grimland@outlook\.com/i);
    assert.doesNotMatch(scope, /Freddy\.Grimland@outlook\.com/i);
  });

  it("is a View as person on the company lane without a seeded email", () => {
    const owner = {
      id: "owner-robert-henderson",
      email: "robertmhenderson582@gmail.com",
      name: "Robert Henderson",
      role: "owner" as const,
    };
    const people = lensPeopleFromSeats([
      { ...president, companyId: "madison" },
      { id: "tester-nathan", email: "nathanboyte@gmail.com", name: "Nathan Boyte", role: "tester", companyId: "madison" },
    ]);
    assert.equal(people.some((row) => row.email === president.email && row.role === "president"), true);
    assert.equal(peopleByLane(people).company.some((row) => row.email === president.email), true);
    assert.equal(peopleVisibleTo(owner, people).some((row) => row.id === president.id), true);
    const lens = lensUser(owner, president.id, null, people);
    assert.equal(lens?.role, "president");
    assert.equal(hasWorkingDesk(lens), true);
    assert.equal(hasBuildDesk(lens), false);
    assert.equal(canUseViewAs(lens), false);
    assert.equal(canSeeHitSquadSeats(lens), false);
  });
});
