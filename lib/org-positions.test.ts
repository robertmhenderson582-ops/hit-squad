import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { MADISON_SEED_DIVISIONS, MECHANICAL_DIVISION_ID } from "./divisions.ts";
import { canAddUsers, canManagePositions, pageAllowedForSeat } from "./desk-role.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import {
  PRESIDENT_POSITION_ID,
  PROJECT_MANAGER_POSITION_ID,
  SEAT_RANKS,
  actorRank,
  alreadyHolds,
  canCreateSeatAs,
  canGrantPosition,
  canRemovePosition,
  canRenamePosition,
  canRevokeHold,
  defaultPositionLabel,
  divisionHeadPositionId,
  holdId,
  mergePositions,
  parsePositionFile,
  positionViews,
  seedPositions,
  stackedRoles,
  withPresidentSeatHolds,
} from "./org-positions.ts";

const owner = {
  id: "owner-robert-henderson",
  email: OWNER_LOGIN_EMAIL,
  name: "Robert Henderson",
  role: "owner" as const,
};
const nathan = { id: "tester-nathan", email: "nathanboyte@gmail.com", name: "Nathan Boyte", role: "tester" as const };
const president = {
  id: "custom-freddy",
  email: "president.example@example.com",
  name: "Freddy Grimland",
  role: "president" as const,
};
const shane = { id: "tester-shane", email: "shane@apcontrolsllc.com", name: "Shane Smith", role: "tester" as const };

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("org positions", () => {
  it("seeds President, Project Manager, and a Division Head per Madison division", () => {
    const catalog = seedPositions(MADISON_SEED_DIVISIONS);
    assert.equal(catalog.some((row) => row.id === PRESIDENT_POSITION_ID && row.companyId === "madison"), true);
    assert.equal(catalog.some((row) => row.id === PROJECT_MANAGER_POSITION_ID), true);
    assert.equal(
      catalog.some((row) => row.id === "corporate-qc-manager" && row.desk === "corporate" && row.seed === true),
      true,
    );
    assert.equal(
      catalog.some((row) => row.id === "site-qc-manager" && row.desk === "field" && row.seed === true),
      true,
    );
    assert.equal(
      catalog.some((row) => row.id === divisionHeadPositionId("madison", MECHANICAL_DIVISION_ID) && row.kind === "division-head"),
      true,
    );
    assert.equal(catalog.filter((row) => row.kind === "division-head").length, MADISON_SEED_DIVISIONS.length);
    assert.equal(
      defaultPositionLabel(
        { kind: "division-head", label: "Division Head", divisionId: MECHANICAL_DIVISION_ID },
        MADISON_SEED_DIVISIONS,
      ),
      "Division Head · Mechanical",
    );
  });

  it("keeps Owner when Division Head is assigned — seats stack", () => {
    const catalog = mergePositions([], [], MADISON_SEED_DIVISIONS);
    const mechanical = divisionHeadPositionId("madison", MECHANICAL_DIVISION_ID);
    const holds = [{ id: holdId(mechanical, owner.email), positionId: mechanical, email: owner.email }];
    assert.deepEqual(stackedRoles("owner", holds, catalog), [
      "Owner",
      catalog.find((row) => row.id === mechanical)?.label,
    ]);
    assert.equal(actorRank(owner, holds, catalog), SEAT_RANKS.owner);
    assert.equal(actorRank(owner, holds, catalog) > SEAT_RANKS["division-head"], true);
  });

  it("lets Nathan add testers on Madison and refuses President / Hit Squad", () => {
    const catalog = seedPositions(MADISON_SEED_DIVISIONS);
    assert.equal(canAddUsers(nathan), true);
    assert.equal(canManagePositions(nathan), true);
    assert.equal(actorRank(nathan, [], catalog), SEAT_RANKS["project-manager"]);
    assert.equal("ok" in canCreateSeatAs(nathan, { role: "tester", companyId: "madison" }, [], catalog, ["madison"]), true);
    assert.equal("error" in canCreateSeatAs(nathan, { role: "president", companyId: "madison" }, [], catalog, ["madison"]), true);
    assert.equal("error" in canCreateSeatAs(nathan, { role: "tester", companyId: "hitsquad" }, [], catalog, ["madison"]), true);
    const corporateQc = catalog.find((row) => row.id === "corporate-qc-manager");
    assert.equal(
      "error" in
        canGrantPosition(nathan, corporateQc, { ...nathan, companyId: "madison" }, [], catalog, {
          canSeeTarget: true,
          canSeeCompany: true,
        }),
      true,
    );
    const presidentSeat = catalog.find((row) => row.id === PRESIDENT_POSITION_ID);
    assert.equal(
      "error" in
        canGrantPosition(nathan, presidentSeat, { ...president, companyId: "madison" }, [], catalog, { canSeeTarget: true, canSeeCompany: true }),
      true,
    );
  });

  it("lets Owner assign Robert as Mechanical Division Head and revoke / rename any seat", () => {
    const catalog = mergePositions([], [], MADISON_SEED_DIVISIONS);
    const mechanical = catalog.find((row) => row.id === divisionHeadPositionId("madison", MECHANICAL_DIVISION_ID));
    const presidentSeat = catalog.find((row) => row.id === PRESIDENT_POSITION_ID);
    const granted = canGrantPosition(
      owner,
      mechanical,
      { ...owner, companyId: "hitsquad" },
      [],
      catalog,
      { canSeeTarget: true, canSeeCompany: true },
    );
    assert.equal("ok" in granted, true);
    const holds = [{ id: holdId(mechanical!.id, owner.email), positionId: mechanical!.id, email: owner.email }];
    assert.equal(alreadyHolds(holds, mechanical!.id, owner.email), true);
    assert.equal("ok" in canRevokeHold(owner, mechanical, holds, catalog), true);
    assert.equal("ok" in canRenamePosition(owner, presidentSeat, holds, catalog, "President / COO"), true);
    const corporateQc = catalog.find((row) => row.id === "corporate-qc-manager");
    assert.equal(
      "ok" in
        canGrantPosition(owner, corporateQc, { ...owner, companyId: "hitsquad" }, [], catalog, {
          canSeeTarget: true,
          canSeeCompany: true,
        }),
      true,
    );
    assert.equal("error" in canRemovePosition(corporateQc), true);
    assert.equal("error" in canRemovePosition(presidentSeat), true);
    assert.equal("ok" in canRemovePosition({ id: "estimator", kind: "custom", label: "Estimator", desk: "field" }), true);
  });

  it("auto-holds a President login and hides Hit Squad from President people", () => {
    const holds = withPresidentSeatHolds([], [president, nathan, shane]);
    assert.equal(alreadyHolds(holds, PRESIDENT_POSITION_ID, president.email), true);
    assert.equal(pageAllowedForSeat(president, { workingDesk: true, addUsers: true }), true);
    assert.equal(pageAllowedForSeat(nathan, { addUsers: true }), true);
    assert.equal(pageAllowedForSeat(shane, { addUsers: true, workingDesk: true }), false);
  });

  it("merges renames without dropping seed Division Head rows", () => {
    const mechanical = divisionHeadPositionId("madison", MECHANICAL_DIVISION_ID);
    const merged = mergePositions(
      [{ id: mechanical, kind: "division-head", label: "Mech lead", desk: "field" }],
      [],
      MADISON_SEED_DIVISIONS,
    );
    const row = merged.find((item) => item.id === mechanical);
    assert.equal(row?.seed, true);
    assert.equal(row?.label, "Mech lead");
    const parsed = parsePositionFile({
      positions: [{ id: "estimator", kind: "custom", label: "Estimator" }],
      holds: [{ positionId: "estimator", email: "nathanboyte@gmail.com" }],
      removedIds: ["bogus"],
    });
    assert.equal(parsed.positions[0]?.desk, "field");
    assert.equal(parsed.holds[0]?.id, "estimator:nathanboyte@gmail.com");
    const views = positionViews(merged, [], [owner]);
    assert.equal(views.some((item) => item.id === PRESIDENT_POSITION_ID), true);
  });

  it("wires Settings → Positions and Division Head on Divisions", () => {
    const shell = source("../components/SettingsShell.tsx");
    const divisions = source("../components/DivisionsDesk.tsx");
    const seats = source("../app/api/desk/seats/route.ts");
    const users = source("../components/ManageUsersDesk.tsx");
    assert.match(shell, /href: "\/settings\/positions"/);
    assert.match(shell, /label: "Positions"/);
    assert.match(divisions, /DIVISION HEAD/);
    assert.match(divisions, /action: "assign"/);
    assert.match(divisions, /Assign head/);
    assert.match(seats, /canAddUsers/);
    assert.match(seats, /canCreateSeatAs/);
    assert.match(users, /addableRoles/);
    assert.match(users, /That permission is above your seat/);
  });
});
