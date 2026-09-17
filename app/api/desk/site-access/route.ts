import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { scopedDeskUser } from "@/lib/desk-scope-server";
import { cookieValue } from "@/lib/http";
import { defaultJobRoleForSeat } from "@/lib/job-roles";
import { canWriteSiteAccess, createSiteAccessGrant, siteAccessGrantId, siteAccessMaskCopy, siteAccessStatus } from "@/lib/site-access";
import {
  listSiteAccessGrants,
  listToolRoomDuties,
  removeSiteAccessGrant,
  removeToolRoomDuty,
  upsertSiteAccessGrant,
  upsertToolRoomDuty,
} from "@/lib/site-access-store";
import { canWriteToolRoomDuty, createToolRoomDuty, toolRoomDutyId } from "@/lib/tool-room-duty";
import { hydrateSeatStore, listSeatRows } from "@/lib/users";

export const dynamic = "force-dynamic";

function siteIdOf(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function assigneeFor(email: string) {
  await hydrateSeatStore();
  const seats = await listSeatRows({ hydrate: false });
  const seat = seats.find((row) => row.email.trim().toLowerCase() === email);
  if (!seat) return { email, jobTitle: defaultJobRoleForSeat({ email }) };
  return {
    email: seat.email,
    role: seat.role,
    name: seat.name,
    jobTitle: seat.jobTitle || defaultJobRoleForSeat(seat),
  };
}

function publicGrants(grants: Awaited<ReturnType<typeof listSiteAccessGrants>>, now: number) {
  return grants.map((grant) => ({
    ...grant,
    status: siteAccessStatus(grant, now),
    copy: siteAccessMaskCopy(grant, now),
  }));
}

export async function GET(request: Request) {
  const session = await readSession(cookieValue(request));
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const user = await scopedDeskUser(session, request);
  const url = new URL(request.url);
  const siteId = siteIdOf(url.searchParams.get("siteId"));
  if (!siteId) return NextResponse.json({ error: "Pick a site." }, { status: 400 });
  const now = Date.now();
  return NextResponse.json({
    siteId,
    canAssign: canWriteSiteAccess(user),
    grants: publicGrants(await listSiteAccessGrants(siteId), now),
    toolRoom: await listToolRoomDuties(siteId),
  });
}

export async function POST(request: Request) {
  const session = await readSession(cookieValue(request));
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const user = await scopedDeskUser(session, request);
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    siteId?: string;
    email?: string;
    name?: string;
    startYmd?: string;
    endYmd?: string;
    postEndYmd?: string;
  };
  const siteId = siteIdOf(body.siteId);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!siteId) return NextResponse.json({ error: "Pick a site." }, { status: 400 });
  if (!email.includes("@")) return NextResponse.json({ error: "Pick a person." }, { status: 400 });

  const action = body.action;
  const now = Date.now();

  if (action === "grant-site-access") {
    if (!canWriteSiteAccess(user)) {
      return NextResponse.json({ error: "Owner and Project Managers grant site access." }, { status: 403 });
    }
    const grant = await upsertSiteAccessGrant(
      createSiteAccessGrant({
        siteId,
        email,
        name: body.name,
        grantedByEmail: user.email,
        now,
      }),
    );
    return NextResponse.json({
      ok: true,
      grant: { ...grant, status: siteAccessStatus(grant, now), copy: siteAccessMaskCopy(grant, now) },
      grants: publicGrants(await listSiteAccessGrants(siteId), now),
      toolRoom: await listToolRoomDuties(siteId),
    });
  }

  if (action === "revoke-site-access") {
    if (!canWriteSiteAccess(user)) {
      return NextResponse.json({ error: "Owner and Project Managers grant site access." }, { status: 403 });
    }
    await removeSiteAccessGrant(siteAccessGrantId(siteId, email));
    return NextResponse.json({
      ok: true,
      grants: publicGrants(await listSiteAccessGrants(siteId), now),
      toolRoom: await listToolRoomDuties(siteId),
    });
  }

  if (action === "assign-tool-room") {
    if (!canWriteToolRoomDuty(user)) {
      return NextResponse.json({ error: "Owner and Project Managers assign Tool Room duty." }, { status: 403 });
    }
    const assignee = await assigneeFor(email);
    const duty = await upsertToolRoomDuty(
      createToolRoomDuty({
        siteId,
        email,
        name: body.name || assignee.name,
        assignedByEmail: user.email,
        assignee,
        startYmd: body.startYmd,
        endYmd: body.endYmd,
        postEndYmd: body.postEndYmd,
        now,
      }),
    );
    return NextResponse.json({
      ok: true,
      duty,
      grants: publicGrants(await listSiteAccessGrants(siteId), now),
      toolRoom: await listToolRoomDuties(siteId),
    });
  }

  if (action === "clear-tool-room") {
    if (!canWriteToolRoomDuty(user)) {
      return NextResponse.json({ error: "Owner and Project Managers assign Tool Room duty." }, { status: 403 });
    }
    await removeToolRoomDuty(toolRoomDutyId(siteId, email));
    return NextResponse.json({
      ok: true,
      grants: publicGrants(await listSiteAccessGrants(siteId), now),
      toolRoom: await listToolRoomDuties(siteId),
    });
  }

  return NextResponse.json({ error: "Pick an action." }, { status: 400 });
}
