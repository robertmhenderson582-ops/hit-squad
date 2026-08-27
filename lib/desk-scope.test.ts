import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NOVUS_EMAIL } from "./desk-role.ts";
import {
  VIEW_AS_HEADER,
  deskScopeUser,
  deskUserFromRequest,
  viewAsInit,
  viewAsSeatFromRequest,
  viewAsSeatFromValue,
  viewingOtherDesk,
} from "./desk-scope.ts";
import { canReturnPack, canWritePack, localPacksForUser } from "./estimate-scope.ts";
import { listVisiblePacks, shareVisiblePack, transferVisiblePack, unshareVisiblePack, upsertVisiblePack } from "./estimate-vault.ts";
import { handoffMarkText } from "./handoff.ts";
import { memoryDrive } from "./drive-estimates.ts";
import type { EstimatePackSnapshot } from "./estimate-pack.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { JOSEPH_EMAIL } from "./tester-seats.ts";

const owner = {
  id: "owner-robert-henderson",
  email: OWNER_LOGIN_EMAIL,
  name: "Robert Henderson",
  role: "owner" as const,
};
const novus = {
  id: "operator-novus",
  email: NOVUS_EMAIL,
  name: "Novus",
  role: "operator" as const,
};
const nathan = {
  id: "tester-nathan",
  email: "nathanboyte@gmail.com",
  name: "Nathan Boyte",
  role: "tester" as const,
};
const joseph = {
  id: "tester-joseph",
  email: JOSEPH_EMAIL,
  name: "Joseph Henderson",
  role: "tester" as const,
};

function cat2(over: Partial<EstimatePackSnapshot> = {}): EstimatePackSnapshot {
  return {
    packId: "new-mtaajdwa-f7539",
    key: "new:new-mtaajdwa-f7539",
    title: "Madison CAT 2 (Pit Stop)",
    client: "Phillips 66",
    site: "Wood River — Roxana, IL",
    siteId: "site-madison",
    createdAt: 100,
    updatedAt: 200,
    ownerEmail: OWNER_LOGIN_EMAIL,
    ...over,
  };
}

function requestAs(seat: string) {
  return new Request("https://hitsquad.local/api/desk/estimates", {
    headers: { [VIEW_AS_HEADER]: seat },
  });
}

describe("owner View as desk scope", () => {
  it("lists Nathan-owned packs when the owner Views as Nathan, then restores the owner list on Exit", async () => {
    const drive = memoryDrive();
    await upsertVisiblePack(owner, cat2({ packId: "new-robert1", title: "Robert working" }), drive);
    const handed = await transferVisiblePack(owner, "new-mtaajdwa-f7539", nathan.email, drive, cat2());
    assert.equal(handed.ok, true);
    if (handed.ok) assert.equal(handed.pack.ownerEmail, nathan.email);

    const asNathan = deskScopeUser(owner, "nathan");
    assert.equal(asNathan.email, nathan.email);
    assert.equal(asNathan.role, "tester");
    assert.equal(viewingOtherDesk(owner, asNathan), true);

    const nathanList = await listVisiblePacks(asNathan, drive);
    const ownerList = await listVisiblePacks(deskScopeUser(owner, "owner"), drive);
    const exited = await listVisiblePacks(deskScopeUser(owner, null), drive);

    assert.deepEqual(
      nathanList.packs.map((row) => row.packId),
      ["new-mtaajdwa-f7539"],
    );
    assert.equal(nathanList.packs[0]?.title, "Madison CAT 2 (Pit Stop)");
    assert.deepEqual(
      ownerList.packs.map((row) => row.packId),
      ["new-robert1"],
    );
    assert.deepEqual(
      exited.packs.map((row) => row.packId),
      ["new-robert1"],
    );
    assert.equal(
      nathanList.packs.some((row) => row.ownerEmail === OWNER_LOGIN_EMAIL),
      false,
    );
    assert.equal(nathanList.packs[0]?.transferredFrom, OWNER_LOGIN_EMAIL);
    assert.equal(nathanList.packs[0]?.transferredFromName, "Robert Henderson");
    const signedIn = await listVisiblePacks(nathan, drive);
    assert.deepEqual(
      nathanList.packs.map((row) => row.packId),
      signedIn.packs.map((row) => row.packId),
    );
    assert.equal(handoffMarkText(nathanList.packs[0], nathan.email), "Transferred to you from Robert Henderson.");
    assert.equal(canReturnPack(asNathan, nathanList.packs[0]!), true);
    assert.equal(canReturnPack(nathan, signedIn.packs[0]!), true);
  });

  it("View as Nathan still lists Cat 2 when a leftover owner file exists", async () => {
    const drive = memoryDrive();
    const handed = await transferVisiblePack(owner, "new-mtaajdwa-f7539", nathan.email, drive, cat2());
    assert.equal(handed.ok, true);
    await drive.createJson(
      "folder",
      "leftover.json",
      JSON.stringify(
        cat2({
          updatedAt: Date.now() + 10_000,
          ownerEmail: OWNER_LOGIN_EMAIL,
          transferredFrom: undefined,
        }),
      ),
      { packId: "new-mtaajdwa-f7539", ownerEmail: OWNER_LOGIN_EMAIL },
    );

    const asNathan = deskScopeUser(owner, "nathan");
    const viewed = await listVisiblePacks(asNathan, drive);
    const signedIn = await listVisiblePacks(nathan, drive);
    const ownerDesk = await listVisiblePacks(deskScopeUser(owner, null), drive);
    assert.deepEqual(
      viewed.packs.map((row) => row.packId),
      signedIn.packs.map((row) => row.packId),
    );
    assert.equal(viewed.packs[0]?.title, "Madison CAT 2 (Pit Stop)");
    assert.equal(handoffMarkText(viewed.packs[0], nathan.email), "Transferred to you from Robert Henderson.");
    assert.equal(canReturnPack(asNathan, viewed.packs[0]!), true);
    assert.deepEqual(ownerDesk.packs.map((row) => row.packId), []);
  });

  it("lists a tester-owned pack on the owner desk after View as Nathan shares it back", async () => {
    const drive = memoryDrive();
    await upsertVisiblePack(owner, cat2({ packId: "new-robert1", title: "Robert working" }), drive);
    const nathanPack = cat2({ ownerEmail: nathan.email });
    const saved = await upsertVisiblePack(nathan, nathanPack, drive);
    assert.equal(saved.ok, true);

    const asNathan = deskScopeUser(owner, "nathan");
    const shared = await shareVisiblePack(asNathan, "new-mtaajdwa-f7539", owner.email, drive);
    assert.equal(shared.ok, true);
    if (!shared.ok) return;
    assert.equal(shared.pack.ownerEmail, nathan.email);
    assert.deepEqual(shared.pack.sharedWith, [owner.email]);

    const ownerList = await listVisiblePacks(deskScopeUser(owner, null), drive);
    const nathanList = await listVisiblePacks(asNathan, drive);
    const onOwner = ownerList.packs.find((row) => row.packId === "new-mtaajdwa-f7539");
    assert.equal(Boolean(onOwner), true);
    if (!onOwner) return;
    assert.equal(onOwner.ownerEmail, nathan.email);
    assert.equal(handoffMarkText(onOwner, owner.email), "Shared / from Nathan Boyte.");
    assert.equal(handoffMarkText(nathanList.packs[0], nathan.email), "Shared with Robert Henderson.");
    assert.equal(nathanList.packs[0]?.ownerEmail, nathan.email);
    assert.equal(canWritePack(deskScopeUser(owner, null), onOwner), true);
    assert.equal(canReturnPack(asNathan, nathanList.packs[0]!), false);

    const unshared = await unshareVisiblePack(asNathan, "new-mtaajdwa-f7539", owner.email, drive);
    assert.equal(unshared.ok, true);
    const ownerAfter = await listVisiblePacks(deskScopeUser(owner, null), drive);
    assert.equal(ownerAfter.packs.some((row) => row.packId === "new-mtaajdwa-f7539"), false);
    assert.equal((await listVisiblePacks(asNathan, drive)).packs[0]?.ownerEmail, nathan.email);
  });

  it("lists a shared pack on Nathan's desk while Robert stays owner", async () => {
    const drive = memoryDrive();
    await upsertVisiblePack(owner, cat2({ packId: "new-robert1", title: "Robert working" }), drive);
    const shared = await shareVisiblePack(owner, "new-mtaajdwa-f7539", nathan.email, drive, cat2());
    assert.equal(shared.ok, true);
    if (shared.ok) assert.equal(shared.pack.ownerEmail, OWNER_LOGIN_EMAIL);

    const asNathan = deskScopeUser(owner, "nathan");
    const nathanList = await listVisiblePacks(asNathan, drive);
    const ownerList = await listVisiblePacks(deskScopeUser(owner, null), drive);
    const josephList = await listVisiblePacks(deskUserFromRequest(joseph, requestAs("nathan")), drive);

    assert.deepEqual(
      nathanList.packs.map((row) => row.packId),
      ["new-mtaajdwa-f7539"],
    );
    assert.equal(nathanList.packs[0]?.ownerEmail, OWNER_LOGIN_EMAIL);
    assert.deepEqual(nathanList.packs[0]?.sharedWith, [nathan.email]);
    assert.deepEqual(
      ownerList.packs.map((row) => row.packId).sort(),
      ["new-mtaajdwa-f7539", "new-robert1"],
    );
    assert.deepEqual(josephList.packs.map((row) => row.packId), []);
    const signedIn = await listVisiblePacks(nathan, drive);
    assert.deepEqual(
      nathanList.packs.map((row) => row.packId),
      signedIn.packs.map((row) => row.packId),
    );
    assert.equal(handoffMarkText(nathanList.packs[0], nathan.email), "Shared / from Robert Henderson.");
    assert.equal(canWritePack(asNathan, nathanList.packs[0]!), true);
    const unshared = await unshareVisiblePack(owner, "new-mtaajdwa-f7539", nathan.email, drive);
    assert.equal(unshared.ok, true);
    assert.deepEqual((await listVisiblePacks(asNathan, drive)).packs, []);
    assert.deepEqual((await listVisiblePacks(nathan, drive)).packs, []);
    const ownerAfter = await listVisiblePacks(deskScopeUser(owner, null), drive);
    assert.equal(ownerAfter.packs.every((row) => row.ownerEmail === OWNER_LOGIN_EMAIL), true);
    assert.equal(ownerAfter.packs.some((row) => row.packId === "new-mtaajdwa-f7539"), true);
  });

  it("lets Novus View as Nathan and ignores Joseph or a tester asking for Nathan's desk", async () => {
    const drive = memoryDrive();
    await transferVisiblePack(owner, "new-mtaajdwa-f7539", nathan.email, drive, cat2());
    await upsertVisiblePack(
      joseph,
      cat2({ packId: "new-joseph1", title: "Joseph look", ownerEmail: joseph.email }),
      drive,
    );

    const novusAsNathan = deskUserFromRequest(novus, requestAs("nathan"));
    assert.equal(novusAsNathan.email, nathan.email);
    const novusList = await listVisiblePacks(novusAsNathan, drive);
    assert.deepEqual(
      novusList.packs.map((row) => row.packId),
      ["new-mtaajdwa-f7539"],
    );

    assert.equal(viewAsSeatFromRequest(requestAs("nathan")), "nathan");
    assert.equal(new Headers(viewAsInit(null).headers).get(VIEW_AS_HEADER), "owner");
    assert.equal(viewAsSeatFromValue("owner"), null);
    assert.equal(new Headers(viewAsInit("nathan").headers).get(VIEW_AS_HEADER), "nathan");
    assert.equal(deskUserFromRequest(joseph, requestAs("nathan")).email, joseph.email);
    assert.equal(deskUserFromRequest(nathan, requestAs("joseph")).email, nathan.email);

    const josephList = await listVisiblePacks(deskUserFromRequest(joseph, requestAs("nathan")), drive);
    const nathanSelf = await listVisiblePacks(deskUserFromRequest(nathan, requestAs("joseph")), drive);
    assert.deepEqual(
      josephList.packs.map((row) => row.packId),
      ["new-joseph1"],
    );
    assert.deepEqual(
      nathanSelf.packs.map((row) => row.packId),
      ["new-mtaajdwa-f7539"],
    );
  });

  it("keeps local leftover owner work off Nathan's desk and Nathan's pack off the owner list", () => {
    const packs = [
      { packId: "new-robert1", ownerEmail: OWNER_LOGIN_EMAIL },
      { packId: "new-mtaajdwa-f7539", ownerEmail: nathan.email },
      { packId: "new-unstamped", ownerEmail: "" },
    ];
    assert.deepEqual(
      localPacksForUser(deskScopeUser(owner, "nathan"), packs).map((row) => row.packId),
      ["new-mtaajdwa-f7539"],
    );
    assert.deepEqual(
      localPacksForUser(deskScopeUser(owner, "owner"), packs).map((row) => row.packId),
      ["new-robert1", "new-unstamped"],
    );
    assert.deepEqual(
      localPacksForUser(deskScopeUser(joseph, "nathan"), packs).map((row) => row.packId),
      [],
    );
  });
});
