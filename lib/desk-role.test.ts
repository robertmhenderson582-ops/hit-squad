import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDeskChrome,
  canArchiveDeleteJobs,
  canUseFollow,
  canLookupRates,
  canOpenRates,
  canUseRateBuilder,
  canUseViewAs,
  isProjectManagerOrAbove,
  hasBuildDesk,
  hasWorkingDesk,
  isPresident,
  canSeeHitSquadSeats,
  canAddUsers,
  canManagePositions,
  canManageUsers,
  canSeeOwnerLog,
  isOwnerLoginEmail,
  deskLensKey,
  lensUser,
  NOVUS_EMAIL,
  NOVUS_ID,
  OWNER_LOGIN_EMAIL,
  pageAllowedForSeat,
} from "./desk-role.ts";
import { isFollowSeat, isViewAsSeat, preferredViewAs, VISUAL_ROSTER } from "./owner-desk.ts";
import { JOSEPH_EMAIL, testerByEmail } from "./tester-seats.ts";

test("owner login email never matches a first-login create seat", () => {
  assert.equal(OWNER_LOGIN_EMAIL, "robertmhenderson582@gmail.com");
  assert.equal(isOwnerLoginEmail("robertmhenderson582@gmail.com"), true);
  assert.equal(isOwnerLoginEmail("  RobertMHenderson582@gmail.com  "), true);
  assert.equal(isOwnerLoginEmail(NOVUS_EMAIL), false);
  assert.equal(isOwnerLoginEmail("nathanboyte@gmail.com"), false);
});

test("Novus is never a visual tester peer", () => {
  assert.equal(
    VISUAL_ROSTER.some((row) => row.email.toLowerCase() === NOVUS_EMAIL),
    false,
  );
  assert.equal(
    VISUAL_ROSTER.some((row) => String(row.id) === NOVUS_ID),
    false,
  );
  assert.equal(isViewAsSeat("custom-added-tester"), true);
  assert.equal(isFollowSeat("tester-shane"), true);
  assert.equal(isViewAsSeat("operator-novus"), false);
  assert.equal(isViewAsSeat("novus"), false);
  assert.equal(isFollowSeat("owner"), true);
});

test("Archive / Delete / Restore stay on the owner desk and hide from testers and View as", () => {
  const owner = {
    id: "owner-robert-henderson",
    email: "robertmhenderson582@gmail.com",
    name: "Robert Henderson",
    role: "owner" as const,
  };
  const nathan = { role: "tester" as const, email: "nathanboyte@gmail.com" };
  const chance = { role: "tester" as const, email: "chancec318@yahoo.com" };
  const joseph = { role: "tester" as const, email: JOSEPH_EMAIL };
  assert.equal(canArchiveDeleteJobs(owner), true);
  assert.equal(canArchiveDeleteJobs(nathan), false);
  assert.equal(canArchiveDeleteJobs(chance), false);
  assert.equal(canArchiveDeleteJobs(joseph), false);
  assert.equal(canArchiveDeleteJobs({ role: "operator" }), false);
  assert.equal(canArchiveDeleteJobs(null), false);
  assert.equal(canArchiveDeleteJobs(lensUser(owner, "nathan")), false);
  assert.equal(canArchiveDeleteJobs(lensUser(owner, "chance")), false);
  assert.equal(canArchiveDeleteJobs(lensUser(owner, "joseph")), false);
  assert.equal(canArchiveDeleteJobs(lensUser(owner, "owner")), true);
  assert.equal(pageAllowedForSeat(owner, { ownerOnly: true }), canArchiveDeleteJobs(owner));
  assert.equal(pageAllowedForSeat(nathan, { ownerOnly: true }), canArchiveDeleteJobs(nathan));
});

test("operator has build desk; testers do not", () => {
  assert.equal(hasBuildDesk({ role: "owner" }), true);
  assert.equal(hasBuildDesk({ role: "operator" }), true);
  assert.equal(hasBuildDesk({ role: "tester" }), false);
  assert.equal(hasBuildDesk({ role: "president" }), false);
  assert.equal(hasBuildDesk(null), false);
  assert.equal(canUseFollow({ role: "owner" }), true);
  assert.equal(canUseFollow({ role: "operator" }), true);
  assert.equal(canUseFollow({ role: "tester" }), false);
  assert.equal(canUseFollow({ role: "president" }), false);
  assert.equal(canUseFollow(null), false);
});

test("Joseph has the full desk and still cannot take the build", () => {
  const joseph = { role: "tester", email: JOSEPH_EMAIL };
  const nathan = { role: "tester", email: "nathanboyte@gmail.com" };
  assert.equal(canUseViewAs(joseph), true);
  assert.equal(canUseRateBuilder(joseph), true);
  assert.equal(canLookupRates(joseph), true);
  assert.equal(canOpenRates(joseph), true);
  assert.equal(isProjectManagerOrAbove(joseph), true);
  assert.equal(hasBuildDesk(joseph), false);
  assert.equal(canUseFollow(joseph), false);
  assert.equal(pageAllowedForSeat(joseph, { buildDesk: true }), false);
  assert.equal(pageAllowedForSeat(joseph, { ownerOnly: true }), false);
  assert.equal(canUseViewAs(nathan), false);
  assert.equal(canUseRateBuilder(nathan), false);
  assert.equal(canLookupRates(nathan), true);
  assert.equal(canOpenRates(nathan), true);
  assert.equal(isProjectManagerOrAbove(nathan), true);
  assert.equal(canAddUsers(nathan), true);
  assert.equal(canManagePositions(nathan), true);
  assert.equal(canAddUsers(joseph), true);
  assert.equal(pageAllowedForSeat(nathan, { addUsers: true }), true);
});

test("View as lens matches the selected seat, not the signed-in owner", () => {
  const owner = { id: "owner-robert-henderson", email: "robertmhenderson582@gmail.com", name: "Robert Henderson", role: "owner" as const };
  const mark = lensUser(owner, "mark");
  assert.equal(mark?.email, "marks544@yahoo.com");
  assert.equal(mark?.role, "tester");
  assert.equal(canUseViewAs(mark), false);
  assert.equal(canUseRateBuilder(mark), false);
  assert.equal(canLookupRates(mark), false);
  assert.equal(pageAllowedForSeat(mark, { buildDesk: true }), false);
  assert.equal(pageAllowedForSeat(owner, { buildDesk: true }), true);

  const joseph = lensUser(owner, "joseph");
  assert.equal(joseph?.email, JOSEPH_EMAIL);
  assert.equal(canUseViewAs(joseph), true);
  assert.equal(canUseRateBuilder(joseph), true);
  assert.equal(pageAllowedForSeat(joseph, { viewAs: true }), true);
  assert.equal(pageAllowedForSeat(joseph, { buildDesk: true }), false);
  assert.equal(pageAllowedForSeat(mark, { viewAs: true }), false);

  const nathan = lensUser(owner, "owner", "nathan");
  const nathanAgain = lensUser(owner, "owner", "nathan");
  assert.equal(nathan?.email, "nathanboyte@gmail.com");
  assert.equal(nathan?.name, "Nathan Boyte");
  assert.notEqual(nathan, nathanAgain);
  assert.equal(deskLensKey(nathan), deskLensKey(nathanAgain));
  assert.equal(deskLensKey(nathan), deskLensKey(lensUser(owner, "nathan", "nathan")));
  assert.notEqual(deskLensKey(nathan), deskLensKey(owner));
  const realMark = { id: "tester-mark", email: "marks544@yahoo.com", name: "Mark Schneider", role: "tester" as const };
  assert.equal(lensUser(realMark, "joseph")?.email, realMark.email);
  assert.equal(pageAllowedForSeat(realMark, { buildDesk: true }), false);
  assert.equal(pageAllowedForSeat(realMark, { viewAs: true }), false);
});

test("every View-as seat matches that tester, including Settings flags", () => {
  const owner = {
    id: "owner-robert-henderson",
    email: "robertmhenderson582@gmail.com",
    name: "Robert Henderson",
    role: "owner" as const,
  };
  assert.deepEqual(
    VISUAL_ROSTER.map((row) => row.id),
    ["wendell", "benny", "chance", "nathan", "john", "joseph", "mark", "cody", "bill", "james"],
  );
  for (const row of VISUAL_ROSTER) {
    const def = testerByEmail(row.email);
    assert.ok(def, row.id);
    const lens = lensUser(owner, row.id);
    assert.equal(lens?.email, row.email, row.id);
    assert.equal(lens?.name, def.name, row.id);
    assert.equal(lens?.role, "tester", row.id);
    assert.equal(canUseRateBuilder(lens), row.id === "joseph", row.id);
    assert.equal(canLookupRates(lens), /PM/.test(row.permission), row.id);
    assert.equal(canOpenRates(lens), /PM/.test(row.permission) || row.id === "joseph", row.id);
    assert.equal(canUseViewAs(lens), def.viewAs, row.id);
    assert.equal(pageAllowedForSeat(lens, { buildDesk: true }), false, row.id);
    assert.equal(pageAllowedForSeat(lens, { ownerOnly: true }), false, row.id);
    assert.equal(pageAllowedForSeat(lens, { viewAs: true }), def.viewAs, row.id);
    assert.equal(pageAllowedForSeat(owner, { buildDesk: true }), true, row.id);
    assert.equal(pageAllowedForSeat(lens, { buildDesk: true }), false, row.id);

    const realLogin = { id: def.id, email: def.email, name: def.name, role: "tester" as const };
    assert.equal(lensUser(realLogin, "mark")?.email, realLogin.email, row.id);
    assert.equal(pageAllowedForSeat(realLogin, { buildDesk: true }), false, row.id);
    assert.equal(pageAllowedForSeat(realLogin, { ownerOnly: true }), false, row.id);
    assert.equal(pageAllowedForSeat(realLogin, { viewAs: true }), def.viewAs, row.id);
  }
  assert.equal(preferredViewAs("nathan", "owner"), "nathan");
  assert.equal(preferredViewAs("owner", "mark"), "owner");
  assert.equal(preferredViewAs(undefined, "cody"), "cody");
  assert.equal(preferredViewAs(undefined, undefined), "owner");
});

test("View as a vault extra uses that person, not the owner", () => {
  const owner = {
    id: "owner-robert-henderson",
    email: "robertmhenderson582@gmail.com",
    name: "Robert Henderson",
    role: "owner" as const,
  };
  const extra = { id: "custom-added-tester", email: "added.tester@example.com", name: "Added Tester" };
  const lens = lensUser(owner, extra.id, null, [extra]);
  assert.equal(lens?.email, extra.email);
  assert.equal(lens?.name, extra.name);
  assert.equal(lens?.role, "tester");
  assert.equal(canUseRateBuilder(lens), false);
  assert.equal(canLookupRates(lens), false);
  assert.equal(canUseViewAs(lens), false);
  assert.equal(pageAllowedForSeat(lens, { buildDesk: true }), false);
  assert.equal(lensUser(owner, "operator-novus", null, [extra])?.email, owner.email);
});

test("Follow applies the desk lens and wins over View as", () => {
  const owner = {
    id: "owner-robert-henderson",
    email: "robertmhenderson582@gmail.com",
    name: "Robert Henderson",
    role: "owner" as const,
  };
  const operator = {
    id: NOVUS_ID,
    email: NOVUS_EMAIL,
    name: "Novus",
    role: "operator" as const,
  };
  const followed = lensUser(owner, "mark", "cody");
  assert.equal(followed?.email, "puma.cody@gmail.com");
  assert.equal(followed?.role, "tester");
  assert.equal(buildDeskChrome(owner, "mark", "cody"), false);
  assert.equal(buildDeskChrome(owner, "owner", "owner"), true);
  assert.equal(lensUser(owner, "mark", "owner")?.email, "marks544@yahoo.com");
  assert.equal(canUseFollow(followed), false);
  assert.equal(pageAllowedForSeat(followed, { buildDesk: true }), false);

  const fromOperator = lensUser(operator, "owner", "nathan");
  assert.equal(fromOperator?.email, "nathanboyte@gmail.com");
  assert.equal(buildDeskChrome(operator, "owner", "nathan"), false);
  assert.equal(canUseFollow(operator), true);

  const realMark = { id: "tester-mark", email: "marks544@yahoo.com", name: "Mark Schneider", role: "tester" as const };
  assert.equal(lensUser(realMark, "cody", "nathan")?.email, realMark.email);
  assert.equal(canUseFollow(realMark), false);
});

test("President has the working desk and locked owner-only gates", () => {
  const president = {
    id: "custom-freddy",
    email: "president.example@example.com",
    name: "Freddy Grimland",
    role: "president" as const,
  };
  assert.equal(isPresident(president), true);
  assert.equal(hasWorkingDesk(president), true);
  assert.equal(hasBuildDesk(president), false);
  assert.equal(canUseRateBuilder(president), true);
  assert.equal(canLookupRates(president), true);
  assert.equal(isProjectManagerOrAbove(president), true);
  assert.equal(canArchiveDeleteJobs(president), false);
  assert.equal(canUseViewAs(president), false);
  assert.equal(canUseFollow(president), false);
  assert.equal(canSeeHitSquadSeats(president), false);
  assert.equal(canManageUsers(president), false);
  assert.equal(canAddUsers(president), false);
  assert.equal(canManagePositions(president), true);
  assert.equal(canSeeOwnerLog(president), false);
  assert.equal(pageAllowedForSeat(president, { workingDesk: true }), true);
  assert.equal(pageAllowedForSeat(president, { buildDesk: true }), false);
  assert.equal(pageAllowedForSeat(president, { ownerOnly: true }), false);
  assert.equal(pageAllowedForSeat(president, { viewAs: true }), false);
  assert.equal(pageAllowedForSeat(president, { privilege: "manage-users" }), false);
  assert.equal(
    pageAllowedForSeat({ ...president, privileges: ["manage-users"] }, { privilege: "manage-users", buildDesk: true }),
    true,
  );
  assert.equal(canArchiveDeleteJobs({ ...president, privileges: ["archive-delete"] }), true);
  assert.equal(canSeeHitSquadSeats({ ...president, privileges: ["hitsquad-seats"] }), true);
  assert.equal(canUseViewAs({ ...president, privileges: ["view-as"] }), true);
  assert.equal(lensUser(president, "nathan")?.email, president.email);
});

test("View as a President vault seat applies the President lens", () => {
  const owner = {
    id: "owner-robert-henderson",
    email: "robertmhenderson582@gmail.com",
    name: "Robert Henderson",
    role: "owner" as const,
  };
  const freddy = {
    id: "custom-freddy",
    email: "president.example@example.com",
    name: "Freddy Grimland",
    role: "president",
  };
  const lens = lensUser(owner, freddy.id, null, [freddy]);
  assert.equal(lens?.email, freddy.email);
  assert.equal(lens?.name, freddy.name);
  assert.equal(lens?.id, freddy.id);
  assert.equal(lens?.role, "president");
  assert.equal(isPresident(lens), true);
  assert.equal(hasWorkingDesk(lens), true);
  assert.equal(hasBuildDesk(lens), false);
  assert.equal(canUseViewAs(lens), false);
  assert.equal(canUseFollow(lens), false);
  assert.equal(canSeeHitSquadSeats(lens), false);
  assert.equal(canUseRateBuilder(lens), true);
  assert.equal(canLookupRates(lens), true);
  assert.equal(canArchiveDeleteJobs(lens), false);
  assert.equal(pageAllowedForSeat(lens, { workingDesk: true }), true);
  assert.equal(pageAllowedForSeat(lens, { buildDesk: true }), false);
  assert.equal(pageAllowedForSeat(lens, { ownerOnly: true }), false);
  assert.equal(pageAllowedForSeat(lens, { viewAs: true }), false);
  assert.equal(lensUser(owner, "operator-novus", null, [freddy])?.email, owner.email);
});
