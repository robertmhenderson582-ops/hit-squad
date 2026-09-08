import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { canUseInbox } from "./inbox-circle.ts";
import {
  canArchiveDeleteJobs,
  canSeeHitSquadSeats,
  canUseViewAs,
  hasBuildDesk,
  hasWorkingDesk,
  isPresident,
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
  });
});
