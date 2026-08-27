import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NOVUS_EMAIL } from "./desk-role.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import {
  canTransferPack,
  canWritePack,
  isOwnerVaultEmail,
  packOwnerEmailForWrite,
  packVisibleTo,
  visiblePacks,
} from "./estimate-scope.ts";

const owner = { email: OWNER_LOGIN_EMAIL, role: "owner" as const };
const novus = { email: NOVUS_EMAIL, role: "operator" as const };
const tester = { email: "nathanboyte@gmail.com", role: "tester" as const };
const otherTester = { email: "marks544@yahoo.com", role: "tester" as const };

const ownerPack = { ownerEmail: OWNER_LOGIN_EMAIL, packId: "new-cat2pit" };
const testerPack = { ownerEmail: tester.email, packId: "new-tester1" };
const markPack = { ownerEmail: otherTester.email, packId: "new-mark1" };

describe("estimate vault scope", () => {
  it("lets owner and Novus read owner packs; testers only their own", () => {
    assert.equal(isOwnerVaultEmail(OWNER_LOGIN_EMAIL), true);
    assert.equal(isOwnerVaultEmail(NOVUS_EMAIL), false);
    assert.equal(packVisibleTo(owner, ownerPack), true);
    assert.equal(packVisibleTo(novus, ownerPack), true);
    assert.equal(packVisibleTo(tester, ownerPack), false);
    assert.equal(packVisibleTo(tester, testerPack), true);
    assert.equal(packVisibleTo(tester, markPack), false);
    assert.equal(packVisibleTo(otherTester, testerPack), false);
    assert.deepEqual(
      visiblePacks(tester, [ownerPack, testerPack, markPack]).map((row) => row.packId),
      ["new-tester1"],
    );
    assert.deepEqual(
      visiblePacks(novus, [ownerPack, testerPack, markPack]).map((row) => row.packId),
      ["new-cat2pit"],
    );
  });

  it("stamps writes so testers cannot take the owner vault", () => {
    assert.equal(packOwnerEmailForWrite(owner), OWNER_LOGIN_EMAIL);
    assert.equal(packOwnerEmailForWrite(novus, OWNER_LOGIN_EMAIL), OWNER_LOGIN_EMAIL);
    assert.equal(packOwnerEmailForWrite(tester, OWNER_LOGIN_EMAIL), tester.email);
    assert.equal(canWritePack(tester, ownerPack), false);
    assert.equal(canWritePack(tester, testerPack), true);
    assert.equal(canWritePack(novus, ownerPack), true);
    assert.equal(canWritePack(owner, testerPack), false);
    assert.equal(canWritePack(novus, testerPack), false);
  });

  it("lets the current owner turn a pack over; Joseph and Shane cannot take it", () => {
    assert.equal(canTransferPack(owner, ownerPack), true);
    assert.equal(canTransferPack(novus, ownerPack), false);
    assert.equal(canTransferPack(tester, ownerPack), false);
    assert.equal(canTransferPack(tester, testerPack), true);
    assert.equal(canTransferPack(otherTester, testerPack), false);
    assert.equal(packVisibleTo({ email: "josephmhenderson2002@gmail.com", role: "tester" }, ownerPack), false);
    assert.equal(packVisibleTo({ email: "shane@apcontrolsllc.com", role: "tester" }, testerPack), false);
  });
});
