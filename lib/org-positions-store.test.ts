import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, test } from "node:test";
import { MADISON_SEED_DIVISIONS, MECHANICAL_DIVISION_ID } from "./divisions.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { divisionHeadPositionId, PRESIDENT_POSITION_ID } from "./org-positions.ts";
import {
  assignPosition,
  createCustomPosition,
  listHolds,
  listPositionCatalog,
  removeStoredPosition,
  renameStoredPosition,
  resetPositionsForTests,
  revokePositionHold,
} from "./org-positions-store.ts";

const dir = mkdtempSync(join(tmpdir(), "hs-positions-"));
process.env.POSITION_STORE_PATH = join(dir, "positions.json");

beforeEach(() => {
  resetPositionsForTests();
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("assign, revoke, and rename persist; Owner + Division Head stack", async () => {
  const mechanical = divisionHeadPositionId("madison", MECHANICAL_DIVISION_ID);
  const assigned = await assignPosition(mechanical, OWNER_LOGIN_EMAIL, MADISON_SEED_DIVISIONS);
  assert.equal("ok" in assigned, true);
  if (!("ok" in assigned)) return;
  const holds = await listHolds();
  assert.equal(holds.some((row) => row.positionId === mechanical && row.email === OWNER_LOGIN_EMAIL), true);

  const renamed = await renameStoredPosition(PRESIDENT_POSITION_ID, "President / COO", MADISON_SEED_DIVISIONS);
  assert.equal("ok" in renamed, true);
  if (!("ok" in renamed)) return;
  const catalog = await listPositionCatalog(MADISON_SEED_DIVISIONS);
  assert.equal(catalog.find((row) => row.id === PRESIDENT_POSITION_ID)?.label, "President / COO");
  assert.equal(catalog.find((row) => row.id === mechanical)?.kind, "division-head");

  const revoked = await revokePositionHold({ holdId: assigned.hold.id });
  assert.equal("ok" in revoked, true);
  assert.equal((await listHolds()).some((row) => row.email === OWNER_LOGIN_EMAIL), false);
});

test("custom positions use the same store and can be removed", async () => {
  const created = await createCustomPosition("Estimator", { companyId: "madison" }, MADISON_SEED_DIVISIONS);
  assert.equal("ok" in created, true);
  if (!("ok" in created)) return;
  assert.equal(created.position.kind, "custom");
  assert.equal(created.position.desk, "field");
  await assignPosition(created.position.id, "nathanboyte@gmail.com", MADISON_SEED_DIVISIONS);
  const catalog = await listPositionCatalog(MADISON_SEED_DIVISIONS);
  assert.equal(catalog.some((row) => row.id === created.position.id && row.label === "Estimator"), true);
  const removed = await removeStoredPosition(created.position.id);
  assert.equal("ok" in removed, true);
  assert.equal((await listPositionCatalog(MADISON_SEED_DIVISIONS)).some((row) => row.id === created.position.id), false);
  assert.equal((await listHolds()).some((row) => row.positionId === created.position.id), false);
});

test("refuses a second assign of the same seat and a missing revoke", async () => {
  const mechanical = divisionHeadPositionId("madison", MECHANICAL_DIVISION_ID);
  const first = await assignPosition(mechanical, OWNER_LOGIN_EMAIL, MADISON_SEED_DIVISIONS);
  assert.equal("ok" in first, true);
  const again = await assignPosition(mechanical, OWNER_LOGIN_EMAIL, MADISON_SEED_DIVISIONS);
  assert.equal("error" in again, true);
  const missing = await revokePositionHold({ positionId: PRESIDENT_POSITION_ID, email: "nobody@example.com" });
  assert.equal("error" in missing, true);
});
