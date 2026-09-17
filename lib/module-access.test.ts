import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isProjectManager } from "./desk-role.ts";
import { canEditAssignedEstimate } from "./estimate-scope.ts";
import { ESTIMATE_WRITE_DENIED, upsertVisiblePack } from "./estimate-vault.ts";
import { memoryDrive } from "./drive-estimates.ts";
import {
  canAssignSitePeople,
  canEditChangeOrders,
  canEditEstimateWork,
  canOrderStc,
  CHANGE_ORDERS_DENIED,
  CHANGE_ORDERS_PRIVILEGE,
  STC_ORDER_DENIED,
  STC_ORDER_PRIVILEGE,
} from "./module-access.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";

const owner = {
  email: OWNER_LOGIN_EMAIL,
  role: "owner" as const,
  jobTitle: "Owner",
};
const nathan = {
  email: "nathanboyte@gmail.com",
  role: "tester" as const,
  jobTitle: "Project Manager",
};
const chance = {
  email: "chancec318@yahoo.com",
  role: "tester" as const,
  jobTitle: "Quality Manager",
};
const shane = {
  email: "shane@apcontrolsllc.com",
  role: "tester" as const,
  jobTitle: "Project Controls",
};
const president = {
  email: "president.example@example.com",
  role: "president" as const,
  jobTitle: "President",
};
const viewedAsChance = {
  email: chance.email,
  role: "tester" as const,
  jobTitle: chance.jobTitle,
};

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("Phase 2 module access", () => {
  it("lets Owner and Project Managers edit assigned estimates; non-PMs cannot", () => {
    const nathanPack = { ownerEmail: nathan.email, packId: "new-nathan-wr" };
    const chancePack = { ownerEmail: chance.email, packId: "new-chance1" };
    const ownerPack = { ownerEmail: OWNER_LOGIN_EMAIL, packId: "new-cat2pit" };

    assert.equal(isProjectManager(nathan), true);
    assert.equal(isProjectManager(chance), false);
    assert.equal(isProjectManager(shane), false);
    assert.equal(isProjectManager(president), false);
    assert.equal(isProjectManager(owner), false);

    assert.equal(canEditEstimateWork(owner), true);
    assert.equal(canEditEstimateWork(nathan), true);
    assert.equal(canEditEstimateWork(chance), false);
    assert.equal(canEditEstimateWork(shane), false);
    assert.equal(canEditEstimateWork(president), false);
    assert.equal(canEditEstimateWork(viewedAsChance), false);
    assert.equal(canAssignSitePeople(owner), true);
    assert.equal(canAssignSitePeople(nathan), true);
    assert.equal(canAssignSitePeople(chance), false);
    assert.equal(canEditEstimateWork({ ...chance, privileges: ["estimates" as never, CHANGE_ORDERS_PRIVILEGE] }), false);

    assert.equal(canEditAssignedEstimate(owner, ownerPack), true);
    assert.equal(canEditAssignedEstimate(owner, nathanPack), true);
    assert.equal(canEditAssignedEstimate(nathan, nathanPack), true);
    assert.equal(canEditAssignedEstimate(nathan, ownerPack), false);
    assert.equal(canEditAssignedEstimate(nathan, { ...ownerPack, sharedWith: [nathan.email] }), true);
    assert.equal(canEditAssignedEstimate(chance, chancePack), false);
    assert.equal(canEditAssignedEstimate(shane, { ownerEmail: shane.email, packId: "new-shane1" }), false);
    assert.equal(canEditAssignedEstimate(president, { ownerEmail: president.email, packId: "new-pres1" }), false);
    assert.equal(canEditAssignedEstimate(viewedAsChance, chancePack), false);
  });

  it("gates Change Orders and STC order by assignment; Owner always overrides", () => {
    assert.equal(canEditChangeOrders(owner), true);
    assert.equal(canOrderStc(owner), true);
    assert.equal(canEditChangeOrders(nathan), false);
    assert.equal(canOrderStc(nathan), false);
    assert.equal(canEditChangeOrders(chance), false);
    assert.equal(canOrderStc(chance), false);
    assert.equal(canEditChangeOrders({ ...nathan, privileges: [CHANGE_ORDERS_PRIVILEGE] }), true);
    assert.equal(canOrderStc({ ...shane, privileges: [STC_ORDER_PRIVILEGE] }), true);
    assert.equal(canEditChangeOrders({ ...chance, privileges: [STC_ORDER_PRIVILEGE] }), false);
    assert.equal(canOrderStc({ ...chance, privileges: [CHANGE_ORDERS_PRIVILEGE] }), false);
    assert.equal(canEditChangeOrders(viewedAsChance), false);
    assert.equal(canOrderStc(viewedAsChance), false);
  });

  it("vault: PM can write own pack, non-PM cannot, CO grant writes FCR only, Owner overrides", async () => {
    const drive = memoryDrive();
    const nathanPack = {
      packId: "new-nathan-wr",
      key: "new:new-nathan-wr",
      title: "Wood River — Nathan",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      createdAt: 100,
      updatedAt: 200,
      ownerEmail: nathan.email,
      crew: { staff: [{ id: "st-1" }] },
    };
    const chancePack = {
      ...nathanPack,
      packId: "new-chance1",
      key: "new:new-chance1",
      title: "Quality leftover",
      ownerEmail: chance.email,
    };

    const pmWrite = await upsertVisiblePack(nathan, nathanPack, drive);
    assert.equal(pmWrite.ok, true);

    const denied = await upsertVisiblePack(chance, chancePack, drive);
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.equal(denied.status, 403);
      assert.equal(denied.error, ESTIMATE_WRITE_DENIED);
    }

    const ownerWrite = await upsertVisiblePack(
      owner,
      { ...chancePack, crew: { staff: [{ id: "st-owner" }] } },
      drive,
    );
    assert.equal(ownerWrite.ok, true);

    const seeded = await upsertVisiblePack(
      owner,
      { ...nathanPack, packId: "new-co-only", key: "new:new-co-only", ownerEmail: chance.email, fcr: { header: { pm: "Old" } } },
      drive,
    );
    assert.equal(seeded.ok, true);

    const coSeat = { ...chance, privileges: [CHANGE_ORDERS_PRIVILEGE] };
    const coWrite = await upsertVisiblePack(
      coSeat,
      {
        packId: "new-co-only",
        title: "Should not rename",
        ownerEmail: chance.email,
        crew: { staff: [{ id: "st-stolen" }] },
        fcr: { header: { pm: "Assigned CO" } },
        purchasing: { notes: "should stay off" },
      },
      drive,
    );
    assert.equal(coWrite.ok, true);
    if (coWrite.ok) {
      assert.equal((coWrite.pack.fcr as { header?: { pm?: string } } | undefined)?.header?.pm, "Assigned CO");
      assert.equal(((coWrite.pack.crew as { staff?: Array<{ id: string }> })?.staff || [])[0]?.id, "st-1");
      assert.equal((coWrite.pack.purchasing as { notes?: string } | undefined)?.notes, undefined);
    }
  });

  it("vault: PM estimate write without CO/STC privilege cannot persist those slices", async () => {
    const drive = memoryDrive();
    const seed = {
      packId: "new-nathan-slice",
      key: "new:new-nathan-slice",
      title: "Wood River — slice lock",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      createdAt: 100,
      updatedAt: 200,
      ownerEmail: nathan.email,
      crew: { staff: [{ id: "st-keep" }] },
      fcr: { header: { pm: "Prior CO" }, log: [{ id: "scr-keep" }] },
      purchasing: { notes: "Prior STC", lines: [{ id: "po-keep" }] },
    };
    const seeded = await upsertVisiblePack(owner, seed, drive);
    assert.equal(seeded.ok, true);

    const pmOnly = await upsertVisiblePack(
      nathan,
      {
        ...seed,
        updatedAt: 400,
        title: "Wood River — Nathan edit",
        crew: { staff: [{ id: "st-nathan" }] },
        fcr: { header: { pm: "Stolen CO" }, log: [{ id: "scr-stolen" }] },
        purchasing: { notes: "Stolen STC", lines: [{ id: "po-stolen" }] },
      },
      drive,
    );
    assert.equal(pmOnly.ok, true);
    if (pmOnly.ok) {
      assert.equal(pmOnly.pack.title, "Wood River — Nathan edit");
      assert.equal(((pmOnly.pack.crew as { staff?: Array<{ id: string }> })?.staff || [])[0]?.id, "st-nathan");
      assert.equal((pmOnly.pack.fcr as { header?: { pm?: string } } | undefined)?.header?.pm, "Prior CO");
      assert.equal(((pmOnly.pack.fcr as { log?: Array<{ id: string }> })?.log || [])[0]?.id, "scr-keep");
      assert.equal((pmOnly.pack.purchasing as { notes?: string } | undefined)?.notes, "Prior STC");
      assert.equal(((pmOnly.pack.purchasing as { lines?: Array<{ id: string }> })?.lines || [])[0]?.id, "po-keep");
    }

    const pmWithCo = await upsertVisiblePack(
      { ...nathan, privileges: [CHANGE_ORDERS_PRIVILEGE] },
      {
        ...seed,
        updatedAt: 500,
        title: "Wood River — Nathan CO",
        crew: { staff: [{ id: "st-co" }] },
        fcr: { header: { pm: "Granted CO" }, log: [{ id: "scr-granted" }] },
        purchasing: { notes: "Still stolen STC", lines: [{ id: "po-still" }] },
      },
      drive,
    );
    assert.equal(pmWithCo.ok, true);
    if (pmWithCo.ok) {
      assert.equal((pmWithCo.pack.fcr as { header?: { pm?: string } } | undefined)?.header?.pm, "Granted CO");
      assert.equal((pmWithCo.pack.purchasing as { notes?: string } | undefined)?.notes, "Prior STC");
    }

    const ownerAll = await upsertVisiblePack(
      owner,
      {
        ...seed,
        updatedAt: 600,
        title: "Wood River — Owner all",
        fcr: { header: { pm: "Owner CO" } },
        purchasing: { notes: "Owner STC" },
      },
      drive,
    );
    assert.equal(ownerAll.ok, true);
    if (ownerAll.ok) {
      assert.equal((ownerAll.pack.fcr as { header?: { pm?: string } } | undefined)?.header?.pm, "Owner CO");
      assert.equal((ownerAll.pack.purchasing as { notes?: string } | undefined)?.notes, "Owner STC");
    }
  });

  it("wires Privileges assignment copy and estimate / CO / STC write locks", () => {
    const privileges = source("../components/PrivilegesDesk.tsx");
    const api = source("../app/api/desk/privileges/route.ts");
    const setup = source("../components/JobSetupCard.tsx");
    const changeOrders = source("../components/ChangeOrderPacket.tsx");
    const purchasing = source("../components/PurchasingDesk.tsx");
    const vault = source("./estimate-vault.ts");
    const estimates = source("../app/api/desk/estimates/route.ts");

    assert.match(privileges, /Assignable modules/);
    assert.match(privileges, /Change Orders and STC order/);
    assert.match(privileges, /not an assignable grant/);
    assert.equal(privileges.includes("Estimate write only if"), false);
    assert.match(api, /MODULE_ASSIGN_PRIVILEGES/);
    assert.match(setup, /Owner and Project Managers can edit job cards/);
    assert.match(changeOrders, /canEditChangeOrders/);
    assert.match(changeOrders, /CHANGE_ORDERS_DENIED/);
    assert.match(purchasing, /canOrderStc/);
    assert.match(purchasing, /STC_ORDER_DENIED/);
    assert.match(vault, /canEditChangeOrders/);
    assert.match(vault, /canOrderStc/);
    assert.match(estimates, /scopedDeskUser/);
    assert.equal(CHANGE_ORDERS_DENIED.includes("assigned"), true);
    assert.equal(STC_ORDER_DENIED.includes("assigned"), true);
  });
});
