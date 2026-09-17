import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NOVUS_EMAIL } from "./desk-role.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import {
  FIELD_ACCESS_AFTER_POST_DAYS,
  SITE_ACCESS_DURATION_COPY,
  SITE_ACCESS_EXPIRED_COPY,
  SITE_ACCESS_FAILED_COPY,
  SITE_ACCESS_LIVE_COPY,
  SITE_ACCESS_OWNER_PM_COPY,
  applySiteAccessGrant,
  canSilentApproveSiteAccess,
  canWriteSiteAccess,
  createSiteAccessGrant,
  defaultFieldAccessWindow,
  extendSiteAccessGrant,
  failSiteAccessGrant,
  fieldAccessTimeboxedFor,
  fieldSeatHasLiveSiteAccess,
  grantMatchesPack,
  isFieldAccessTimeboxedTitle,
  publicSiteAccessGrant,
  siteAccessIsLive,
  siteAccessMaskCopy,
} from "./site-access.ts";
import { CHANGE_ORDERS_PRIVILEGE } from "./module-access.ts";
import { memoryDrive } from "./drive-estimates.ts";
import { upsertVisiblePack } from "./estimate-vault.ts";
import {
  listPendingSiteAccessGrants,
  listSiteAccessGrants,
  listToolRoomDuties,
  removeSiteAccessGrant,
  upsertSiteAccessGrant,
  upsertToolRoomDuty,
  useMemorySiteAccess,
} from "./site-access-store.ts";
import {
  TOOL_ROOM_AFTER_POST_DAYS,
  TOOL_ROOM_OWNER_PM_COPY,
  createToolRoomDuty,
  defaultToolRoomWindow,
  latestJobSetupPostEnd,
  latestJobSetupPostEndFromStore,
  toolRoomDutyIsActive,
  toolRoomTimeboxedFor,
} from "./tool-room-duty.ts";

const owner = { email: OWNER_LOGIN_EMAIL, role: "owner" as const, jobTitle: "Owner", name: "Robert" };
const novus = { email: NOVUS_EMAIL, role: "operator" as const, name: "Novus" };
const nathan = { email: "nathanboyte@gmail.com", role: "tester" as const, jobTitle: "Project Manager", name: "Nathan" };
const chance = { email: "chancec318@yahoo.com", role: "tester" as const, jobTitle: "Quality Manager" };
const mark = { email: "marks544@yahoo.com", role: "tester" as const, jobTitle: "Foreman" };
const gf = { email: "gf@example.com", role: "tester" as const, jobTitle: "General Foreman" };
const tra = { email: "tra@example.com", role: "tester" as const, jobTitle: "Tool Room attendant" };

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("PM site access grants", () => {
  it("lets Owner and PM grant; PM stays pending until Owner/Novus apply", () => {
    assert.equal(canWriteSiteAccess(owner), true);
    assert.equal(canWriteSiteAccess(nathan), true);
    assert.equal(canWriteSiteAccess(chance), false);
    assert.equal(canWriteSiteAccess(mark), false);
    assert.equal(canSilentApproveSiteAccess(owner), true);
    assert.equal(canSilentApproveSiteAccess(novus), true);
    assert.equal(canSilentApproveSiteAccess(nathan), false);

    const now = 1_700_000_000_000;
    const pending = createSiteAccessGrant({
      siteId: "wood-river",
      siteName: "Wood River",
      email: mark.email,
      name: "Mark Schneider",
      grantedByEmail: nathan.email,
      grantedByName: nathan.name,
      actor: nathan,
      now,
    });
    assert.equal(pending.state, "pending");
    assert.equal(pending.approvedByOwner, false);
    assert.equal(siteAccessIsLive(pending), false);
    assert.equal(siteAccessMaskCopy(pending), SITE_ACCESS_DURATION_COPY);
    assert.match(SITE_ACCESS_DURATION_COPY, /usually finishes within a few hours/);
    assert.equal(siteAccessMaskCopy(pending).toLowerCase().includes("pending"), false);
    assert.equal(siteAccessMaskCopy(pending).toLowerCase().includes("approval"), false);
    assert.equal(siteAccessMaskCopy(pending).toLowerCase().includes("owner"), false);
    assert.equal(publicSiteAccessGrant(pending).status, "working");
    assert.equal("approvedByOwner" in publicSiteAccessGrant(pending), false);
    assert.equal(siteAccessIsLive({ ...pending }), false);
    assert.equal(siteAccessMaskCopy(pending), SITE_ACCESS_DURATION_COPY);

    const applied = applySiteAccessGrant(pending, owner, now + 10);
    if ("error" in applied) throw new Error(applied.error);
    assert.equal(applied.state, "live");
    assert.equal(applied.approvedByOwner, true);
    assert.equal(siteAccessIsLive(applied), true);
    assert.equal(siteAccessMaskCopy(applied), SITE_ACCESS_LIVE_COPY);

    const denied = failSiteAccessGrant(pending, novus, now + 11);
    if ("error" in denied) throw new Error(denied.error);
    assert.equal(denied.state, "failed");
    assert.equal(denied.approvedByOwner, false);
    assert.equal(siteAccessIsLive(denied), false);
    assert.equal(siteAccessMaskCopy(denied), SITE_ACCESS_FAILED_COPY);
    assert.equal(SITE_ACCESS_FAILED_COPY.toLowerCase().includes("denied"), false);
    assert.equal(SITE_ACCESS_FAILED_COPY.toLowerCase().includes("owner"), false);

    assert.equal("error" in applySiteAccessGrant(pending, nathan), true);
    const ownerGrant = createSiteAccessGrant({
      siteId: "wood-river",
      email: mark.email,
      grantedByEmail: owner.email,
      actor: owner,
      now,
    });
    assert.equal(ownerGrant.state, "live");
    assert.equal(siteAccessIsLive(ownerGrant), true);
  });

  it("persists pending grants until Owner applies them", async () => {
    useMemorySiteAccess();
    const grant = createSiteAccessGrant({
      siteId: "Wood-River",
      email: mark.email,
      name: "Mark",
      grantedByEmail: nathan.email,
      actor: nathan,
      now: 10,
    });
    await upsertSiteAccessGrant(grant);
    const listed = await listSiteAccessGrants("wood-river");
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.state, "pending");
    assert.equal((await listPendingSiteAccessGrants())[0]?.email, mark.email);
    const applied = applySiteAccessGrant(listed[0]!, owner, 20);
    if ("error" in applied) throw new Error(applied.error);
    await upsertSiteAccessGrant(applied);
    assert.equal((await listPendingSiteAccessGrants()).length, 0);
    assert.equal((await listSiteAccessGrants("wood-river"))[0]?.state, "live");
    await removeSiteAccessGrant(grant.id);
    assert.deepEqual(await listSiteAccessGrants("wood-river"), []);
  });
});

describe("GF Tool Room attendant window", () => {
  it("defaults to Job Setup Post end plus two weeks; Owner/PM are not time-boxed", () => {
    const window = defaultToolRoomWindow("2026-10-01", "2026-09-17");
    assert.equal(window.start, "2026-10-01");
    assert.equal(window.end, "2026-10-15");
    assert.equal(TOOL_ROOM_AFTER_POST_DAYS, 14);
    assert.equal(latestJobSetupPostEnd([
      {
        schedule: {
          phases: [{ id: "post", on: true, start: "2026-09-20", stop: "2026-10-01" }],
        },
      },
    ]), "2026-10-01");
    assert.equal(
      latestJobSetupPostEndFromStore(
        [{ key: "new:wr" }],
        { getItem: (key) => (key.includes("new:wr") ? JSON.stringify({ phases: [{ id: "post", on: true, start: "2026-09-20", stop: "2026-10-01" }] }) : null) },
      ),
      "2026-10-01",
    );

    assert.equal(toolRoomTimeboxedFor(owner), false);
    assert.equal(toolRoomTimeboxedFor(nathan), false);
    assert.equal(toolRoomTimeboxedFor(mark), true);
    assert.equal(toolRoomTimeboxedFor(gf), true);
    assert.equal(toolRoomTimeboxedFor(tra), true);
    assert.equal(toolRoomTimeboxedFor(chance), false);

    const gfDuty = createToolRoomDuty({
      siteId: "wood-river",
      email: mark.email,
      name: "Mark",
      assignedByEmail: nathan.email,
      assignee: mark,
      postEndYmd: "2026-10-01",
      todayYmd: "2026-09-17",
    });
    assert.equal(gfDuty.fromGf, true);
    assert.equal(gfDuty.timeboxed, true);
    assert.equal(gfDuty.startYmd, "2026-10-01");
    assert.equal(gfDuty.endYmd, "2026-10-15");
    assert.equal(toolRoomDutyIsActive(gfDuty, "2026-09-30"), false);
    assert.equal(toolRoomDutyIsActive(gfDuty, "2026-10-01"), true);
    assert.equal(toolRoomDutyIsActive(gfDuty, "2026-10-15"), true);
    assert.equal(toolRoomDutyIsActive(gfDuty, "2026-10-16"), false);

    const pmDuty = createToolRoomDuty({
      siteId: "wood-river",
      email: nathan.email,
      name: "Nathan",
      assignedByEmail: owner.email,
      assignee: nathan,
      postEndYmd: "2026-10-01",
    });
    assert.equal(pmDuty.timeboxed, false);
    assert.equal(pmDuty.startYmd, null);
    assert.equal(pmDuty.endYmd, null);
    assert.equal(toolRoomDutyIsActive(pmDuty, "2026-01-01"), true);
    assert.match(TOOL_ROOM_OWNER_PM_COPY, /not time-boxed/);
  });

  it("persists Tool Room duty", async () => {
    useMemorySiteAccess();
    const duty = createToolRoomDuty({
      siteId: "wood-river",
      email: mark.email,
      assignedByEmail: nathan.email,
      assignee: mark,
      postEndYmd: "2026-10-01",
    });
    await upsertToolRoomDuty(duty);
    const listed = await listToolRoomDuties("wood-river");
    assert.equal(listed[0]?.email, mark.email);
    assert.equal(listed[0]?.endYmd, "2026-10-15");
  });
});

describe("GF through Tool Room attendant site-access window", () => {
  it("defaults to Job Setup start through Post end plus 14 days; Owner/PM are not time-boxed", () => {
    const window = defaultFieldAccessWindow("2026-09-01", "2026-10-01", "2026-09-17");
    assert.equal(window.start, "2026-09-01");
    assert.equal(window.end, "2026-10-15");
    assert.equal(FIELD_ACCESS_AFTER_POST_DAYS, 14);
    assert.equal(defaultFieldAccessWindow(null, "2026-10-01", "2026-09-17").start, "2026-09-17");
    assert.equal(defaultFieldAccessWindow(null, "2026-10-01", "2026-09-17").end, "2026-10-15");

    assert.equal(isFieldAccessTimeboxedTitle("General Foreman"), true);
    assert.equal(isFieldAccessTimeboxedTitle("Boilermaker General Foreman"), true);
    assert.equal(isFieldAccessTimeboxedTitle("Foreman"), true);
    assert.equal(isFieldAccessTimeboxedTitle("Tool Room attendant"), true);
    assert.equal(isFieldAccessTimeboxedTitle("Quality Manager"), false);
    assert.equal(isFieldAccessTimeboxedTitle("Superintendent"), false);
    assert.equal(fieldAccessTimeboxedFor(owner), false);
    assert.equal(fieldAccessTimeboxedFor(nathan), false);
    assert.equal(fieldAccessTimeboxedFor(chance), false);
    assert.equal(fieldAccessTimeboxedFor(mark), true);
    assert.equal(fieldAccessTimeboxedFor(gf), true);
    assert.equal(fieldAccessTimeboxedFor(tra), true);

    const pending = createSiteAccessGrant({
      siteId: "wood-river",
      siteName: "Wood River",
      email: mark.email,
      name: "Mark",
      grantedByEmail: nathan.email,
      actor: nathan,
      assignee: mark,
      jobStartYmd: "2026-09-01",
      postEndYmd: "2026-10-01",
      todayYmd: "2026-09-17",
      now: 10,
    });
    assert.equal(pending.state, "pending");
    assert.equal(pending.timeboxed, true);
    assert.equal(pending.startYmd, "2026-09-01");
    assert.equal(pending.endYmd, "2026-10-15");
    assert.equal(siteAccessIsLive(pending, "2026-09-17"), false);
    assert.equal(siteAccessMaskCopy(pending).toLowerCase().includes("pending"), false);

    const applied = applySiteAccessGrant(pending, owner, 20);
    if ("error" in applied) throw new Error(applied.error);
    assert.equal(applied.timeboxed, true);
    assert.equal(applied.startYmd, "2026-09-01");
    assert.equal(siteAccessIsLive(applied, "2026-10-15"), true);
    assert.equal(siteAccessIsLive(applied, "2026-10-16"), false);
    assert.equal(siteAccessMaskCopy(applied, "2026-10-16"), SITE_ACCESS_EXPIRED_COPY);
    assert.equal(publicSiteAccessGrant(applied, "2026-10-16").status, "expired");
    assert.equal("approvedByOwner" in publicSiteAccessGrant(applied), false);

    const pmSeat = createSiteAccessGrant({
      siteId: "wood-river",
      email: nathan.email,
      grantedByEmail: owner.email,
      actor: owner,
      assignee: nathan,
      postEndYmd: "2026-10-01",
      todayYmd: "2026-09-17",
    });
    assert.equal(pmSeat.timeboxed, false);
    assert.equal(pmSeat.startYmd, null);
    assert.equal(siteAccessIsLive(pmSeat, "2099-01-01"), true);
    assert.match(SITE_ACCESS_OWNER_PM_COPY, /not time-boxed/);

    const ownerGrantToForeman = createSiteAccessGrant({
      siteId: "wood-river",
      email: mark.email,
      grantedByEmail: owner.email,
      actor: owner,
      assignee: mark,
      startYmd: "2026-09-01",
      endYmd: "2026-09-30",
      todayYmd: "2026-09-17",
    });
    assert.equal(ownerGrantToForeman.state, "live");
    assert.equal(ownerGrantToForeman.timeboxed, true);
    assert.equal(ownerGrantToForeman.endYmd, "2026-09-30");
    assert.equal(siteAccessIsLive(ownerGrantToForeman, "2026-10-01"), false);
  });

  it("lets PM override and extend the window without re-queuing Owner", () => {
    const live = createSiteAccessGrant({
      siteId: "wood-river",
      email: mark.email,
      grantedByEmail: owner.email,
      actor: owner,
      assignee: mark,
      startYmd: "2026-09-01",
      endYmd: "2026-09-20",
      todayYmd: "2026-09-17",
    });
    assert.equal(siteAccessIsLive(live, "2026-09-21"), false);
    const extended = extendSiteAccessGrant(live, {
      actor: nathan,
      startYmd: "2026-09-01",
      endYmd: "2026-10-31",
    });
    if ("error" in extended) throw new Error(extended.error);
    assert.equal(extended.state, "live");
    assert.equal(extended.approvedByOwner, true);
    assert.equal(extended.endYmd, "2026-10-31");
    assert.equal(siteAccessIsLive(extended, "2026-09-21"), true);
    assert.equal("error" in extendSiteAccessGrant(live, { actor: mark, endYmd: "2026-11-01" }), true);
    assert.equal("error" in extendSiteAccessGrant(createSiteAccessGrant({
      siteId: "wood-river",
      email: nathan.email,
      grantedByEmail: owner.email,
      actor: owner,
      assignee: nathan,
    }), { actor: nathan, endYmd: "2026-11-01" }), true);
  });

  it("matches plant slug wood-river to pack site-madison / Wood River", () => {
    const grant = createSiteAccessGrant({
      siteId: "wood-river",
      siteName: "Wood River",
      email: mark.email,
      grantedByEmail: nathan.email,
      actor: nathan,
      assignee: mark,
      postEndYmd: "2026-10-01",
      todayYmd: "2026-09-17",
    });
    assert.equal(grantMatchesPack(grant, { siteId: "site-madison", site: "Wood River — Roxana, IL" }), true);
    assert.equal(grantMatchesPack(grant, { siteId: "site-rodeo", site: "Rodeo" }), false);
    assert.equal(
      fieldSeatHasLiveSiteAccess(mark, { siteId: "site-madison", site: "Wood River — Roxana, IL" }, [
        { ...grant, state: "live", approvedByOwner: true },
      ], "2026-09-17"),
      true,
    );
    assert.equal(
      fieldSeatHasLiveSiteAccess(mark, { siteId: "site-madison", site: "Wood River — Roxana, IL" }, [
        { ...grant, state: "live", approvedByOwner: true },
      ], "2026-10-16"),
      false,
    );
    assert.equal(fieldSeatHasLiveSiteAccess(nathan, { siteId: "site-madison" }, [], "2026-10-16"), true);
    assert.equal(fieldSeatHasLiveSiteAccess(chance, { siteId: "site-madison" }, [], "2026-10-16"), true);
  });

  it("hard-loses vault write for an expired GF→TRA grant until PM extends", async () => {
    useMemorySiteAccess();
    const drive = memoryDrive();
    const pack = {
      packId: "new-mark-wr",
      key: "new:new-mark-wr",
      title: "Wood River — Mark CO",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 100,
      updatedAt: 200,
      ownerEmail: owner.email,
      sharedWith: [mark.email],
      crew: { staff: [{ id: "st-keep" }] },
      fcr: { header: { pm: "Prior" } },
    };
    const seeded = await upsertVisiblePack(owner, pack, drive);
    assert.equal(seeded.ok, true);

    const expired = createSiteAccessGrant({
      siteId: "wood-river",
      siteName: "Wood River",
      email: mark.email,
      grantedByEmail: owner.email,
      actor: owner,
      assignee: mark,
      startYmd: "2026-01-01",
      endYmd: "2026-01-15",
      todayYmd: "2026-01-10",
    });
    await upsertSiteAccessGrant(expired);

    const markCo = { ...mark, privileges: [CHANGE_ORDERS_PRIVILEGE] };
    const denied = await upsertVisiblePack(
      markCo,
      { ...pack, updatedAt: 400, fcr: { header: { pm: "Expired write" } } },
      drive,
    );
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.equal(denied.status, 403);
      assert.equal(denied.error, SITE_ACCESS_EXPIRED_COPY);
    }

    const extended = extendSiteAccessGrant(expired, {
      actor: nathan,
      startYmd: "2026-01-01",
      endYmd: "2099-12-31",
    });
    if ("error" in extended) throw new Error(extended.error);
    await upsertSiteAccessGrant(extended);

    const allowed = await upsertVisiblePack(
      markCo,
      { ...pack, updatedAt: 500, fcr: { header: { pm: "Extended write" } } },
      drive,
    );
    assert.equal(allowed.ok, true);
    if (allowed.ok) {
      assert.equal((allowed.pack.fcr as { header?: { pm?: string } } | undefined)?.header?.pm, "Extended write");
    }
  });
});

describe("site people wiring", () => {
  it("keeps duration copy on People and Owner/Novus queue off that tab", () => {
    const plant = source("../components/JobPlantPage.tsx");
    const people = source("../components/PlantPeopleDesk.tsx");
    const api = source("../app/api/desk/site-access/route.ts");
    const queue = source("../components/SiteAccessQueueDesk.tsx");
    const shell = source("../components/SettingsShell.tsx");
    assert.match(plant, /PlantPeopleDesk/);
    assert.match(people, /SITE_ACCESS_DURATION_COPY/);
    assert.match(source("./site-access.ts"), /usually finishes within a few hours/);
    assert.equal(people.toLowerCase().includes("pending owner approval"), false);
    assert.equal(people.toLowerCase().includes("approve"), false);
    assert.equal(source("./site-access.ts").toLowerCase().includes("pending owner approval"), false);
    assert.match(people, /TOOL_ROOM_WINDOW_COPY/);
    assert.match(people, /SITE_ACCESS_WINDOW_COPY/);
    assert.match(people, /extend-site-access/);
    assert.match(people, /jobStartYmd/);
    assert.match(people, /postEndYmd/);
    assert.match(api, /scopedDeskUser/);
    assert.match(api, /grant-site-access/);
    assert.match(api, /extend-site-access/);
    assert.match(api, /apply-site-access/);
    assert.match(api, /searchParams.get\("queue"\)/);
    assert.match(queue, /queue=1/);
    assert.equal(api.includes("nodemailer") || api.includes("invite-mail"), false);
    assert.match(queue, /Apply access/);
    assert.match(queue, /Owner desk and Novus queue/);
    assert.match(shell, /\/settings\/site-access/);
  });
});
