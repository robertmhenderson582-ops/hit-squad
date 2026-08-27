import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NOVUS_EMAIL } from "./desk-role.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import {
  canReturnPack,
  canSharePack,
  canTransferPack,
  canWritePack,
  isOwnerVaultEmail,
  packOwnerEmailForWrite,
  localPacksForUser,
  localPackVisibleTo,
  packVisibleTo,
  visibleDeskPacks,
  visiblePacks,
} from "./estimate-scope.ts";
import { rememberLocalPack, type StorageLike } from "./local-estimates.ts";

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
    assert.equal(packOwnerEmailForWrite(owner, tester.email), tester.email);
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

  it("lets a shared person open and work without becoming owner", () => {
    const shared = { ...ownerPack, sharedWith: [tester.email] };
    assert.equal(packVisibleTo(tester, shared), true);
    assert.equal(canWritePack(tester, shared), true);
    assert.equal(canSharePack(tester, shared), false);
    assert.equal(canTransferPack(tester, shared), false);
    assert.equal(packVisibleTo(otherTester, shared), false);
    assert.equal(packVisibleTo({ email: "josephmhenderson2002@gmail.com", role: "tester" }, shared), false);
    assert.equal(canReturnPack(tester, { ...testerPack, transferredFrom: OWNER_LOGIN_EMAIL }), true);
    assert.equal(canReturnPack(owner, ownerPack), false);
  });

  it("shows a tester-owned pack on the owner desk after it is shared with the owner", () => {
    const shared = { ...testerPack, sharedWith: [OWNER_LOGIN_EMAIL] };
    assert.equal(localPackVisibleTo(owner, testerPack), false);
    assert.equal(localPackVisibleTo(owner, shared), true);
    assert.equal(packVisibleTo(owner, shared), true);
    assert.equal(canWritePack(owner, shared), true);
    assert.equal(canTransferPack(owner, shared), false);
    assert.equal(canSharePack(owner, shared), false);
    assert.equal(canWritePack(tester, shared), true);
    assert.equal(canTransferPack(tester, shared), true);

    const data: Record<string, string> = {};
    const store: StorageLike = {
      getItem(key) {
        return key in data ? data[key] : null;
      },
      setItem(key, value) {
        data[key] = value;
      },
      removeItem(key) {
        delete data[key];
      },
    };
    rememberLocalPack(
      {
        packId: "new-tester1",
        title: "Nathan trial",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        ownerEmail: tester.email,
        sharedWith: [OWNER_LOGIN_EMAIL],
      },
      store,
    );
    assert.deepEqual(
      visibleDeskPacks(owner, false, store).map((row) => row.packId),
      ["new-tester1"],
    );
    assert.equal(visibleDeskPacks(owner, false, store)[0]?.ownerEmail, tester.email);
    rememberLocalPack(
      {
        packId: "new-tester1",
        title: "Nathan trial",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        ownerEmail: tester.email,
        sharedWith: [],
        replaceHandoff: true,
      },
      store,
    );
    assert.deepEqual(
      visibleDeskPacks(owner, false, store).map((row) => row.packId),
      [],
    );
  });

  it("keeps unstamped local work on the owner desk and hides it from testers", () => {
    const unstamped = { ownerEmail: "", packId: "new-local1" };
    assert.equal(localPackVisibleTo(owner, unstamped), true);
    assert.equal(localPackVisibleTo(tester, unstamped), false);
    assert.equal(localPackVisibleTo(tester, testerPack), true);
    assert.deepEqual(
      localPacksForUser(tester, [ownerPack, testerPack, unstamped]).map((row) => row.packId),
      ["new-tester1"],
    );
  });

  it("reads owner local packs on first paint and hides archived ones while following", () => {
    const data: Record<string, string> = {};
    const store: StorageLike = {
      getItem(key) {
        return key in data ? data[key] : null;
      },
      setItem(key, value) {
        data[key] = value;
      },
      removeItem(key) {
        delete data[key];
      },
    };
    rememberLocalPack(
      {
        packId: "new-owner1",
        title: "Owner working",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        ownerEmail: OWNER_LOGIN_EMAIL,
      },
      store,
    );
    rememberLocalPack(
      {
        packId: "new-archived1",
        title: "Archived",
        client: "Phillips 66",
        site: "Wood River — Roxana, IL",
        ownerEmail: tester.email,
        archived: true,
      },
      store,
    );
    assert.deepEqual(
      visibleDeskPacks(owner, false, store).map((row) => row.packId),
      ["new-owner1"],
    );
    assert.deepEqual(
      visibleDeskPacks(tester, true, store).map((row) => row.packId),
      [],
    );
    assert.deepEqual(
      visibleDeskPacks(tester, false, store).map((row) => row.packId),
      ["new-archived1"],
    );
  });
});
