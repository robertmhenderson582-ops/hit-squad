import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import {
  SITE_ACCESS_DURATION_COPY,
  SITE_ACCESS_LIVE_COPY,
  SITE_ACCESS_PROVISION_MS,
  canWriteSiteAccess,
  createSiteAccessGrant,
  siteAccessIsLive,
  siteAccessMaskCopy,
  siteAccessStatus,
} from "./site-access.ts";
import {
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
  toolRoomDutyIsActive,
  toolRoomTimeboxedFor,
} from "./tool-room-duty.ts";

const owner = { email: OWNER_LOGIN_EMAIL, role: "owner" as const, jobTitle: "Owner" };
const nathan = { email: "nathanboyte@gmail.com", role: "tester" as const, jobTitle: "Project Manager" };
const chance = { email: "chancec318@yahoo.com", role: "tester" as const, jobTitle: "Quality Manager" };
const mark = { email: "marks544@yahoo.com", role: "tester" as const, jobTitle: "Foreman" };

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("PM site access grants", () => {
  it("lets Owner and PM grant; silently Owner-approves; masks duration until live", () => {
    assert.equal(canWriteSiteAccess(owner), true);
    assert.equal(canWriteSiteAccess(nathan), true);
    assert.equal(canWriteSiteAccess(chance), false);
    assert.equal(canWriteSiteAccess(mark), false);

    const now = 1_700_000_000_000;
    const grant = createSiteAccessGrant({
      siteId: "wood-river",
      email: mark.email,
      name: "Mark Schneider",
      grantedByEmail: nathan.email,
      now,
    });
    assert.equal(grant.approvedByOwner, true);
    assert.equal(grant.liveAt, now + SITE_ACCESS_PROVISION_MS);
    assert.equal(siteAccessStatus(grant, now), "provisioning");
    assert.equal(siteAccessIsLive(grant, now), false);
    assert.equal(siteAccessMaskCopy(grant, now), SITE_ACCESS_DURATION_COPY);
    assert.equal(siteAccessMaskCopy(grant, now).toLowerCase().includes("pending"), false);
    assert.equal(siteAccessMaskCopy(grant, now).toLowerCase().includes("approval"), false);
    assert.equal(siteAccessMaskCopy(grant, now).toLowerCase().includes("owner"), false);
    assert.equal(siteAccessStatus(grant, grant.liveAt), "live");
    assert.equal(siteAccessMaskCopy(grant, grant.liveAt), SITE_ACCESS_LIVE_COPY);
  });

  it("persists grants in the site-access store", async () => {
    useMemorySiteAccess();
    const grant = createSiteAccessGrant({
      siteId: "Wood-River",
      email: mark.email,
      name: "Mark",
      grantedByEmail: nathan.email,
      now: 10,
    });
    await upsertSiteAccessGrant(grant);
    const listed = await listSiteAccessGrants("wood-river");
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.email, mark.email);
    assert.equal(listed[0]?.approvedByOwner, true);
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

    assert.equal(toolRoomTimeboxedFor(owner), false);
    assert.equal(toolRoomTimeboxedFor(nathan), false);
    assert.equal(toolRoomTimeboxedFor(mark), true);
    assert.equal(toolRoomTimeboxedFor(chance), true);

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

describe("site people wiring", () => {
  it("keeps duration copy and Tool Room window on the People tab", () => {
    const plant = source("../components/JobPlantPage.tsx");
    const people = source("../components/PlantPeopleDesk.tsx");
    const api = source("../app/api/desk/site-access/route.ts");
    assert.match(plant, /PlantPeopleDesk/);
    assert.match(people, /SITE_ACCESS_DURATION_COPY/);
    assert.match(people, /takes a duration to complete/);
    assert.equal(people.toLowerCase().includes("pending owner approval"), false);
    assert.match(people, /TOOL_ROOM_WINDOW_COPY/);
    assert.match(api, /scopedDeskUser/);
    assert.match(api, /grant-site-access/);
    assert.match(api, /assign-tool-room/);
  });
});
