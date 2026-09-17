import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { scopedDeskUser } from "@/lib/desk-scope-server";
import { cookieValue } from "@/lib/http";
import { defaultJobRoleForSeat } from "@/lib/job-roles";
import {
  applySiteAccessGrant,
  canSilentApproveSiteAccess,
  canWriteSiteAccess,
  createSiteAccessGrant,
  extendSiteAccessGrant,
  failSiteAccessGrant,
  publicSiteAccessGrant,
  siteAccessGrantId,
} from "@/lib/site-access";
import {
  getSiteAccessGrant,
  listPendingSiteAccessGrants,
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

function plantPayload(siteId: string, grants: Awaited<ReturnType<typeof listSiteAccessGrants>>) {
  return {
    siteId,
    grants: grants.map((grant) => publicSiteAccessGrant(grant)),
  };
}

export async function GET(request: Request) {
  const session = await readSession(cookieValue(request));
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const user = await scopedDeskUser(session, request);
  const url = new URL(request.url);
  if (url.searchParams.get("queue") === "1") {
    if (!canSilentApproveSiteAccess(user)) {
      return NextResponse.json({ error: "That section is not on this desk." }, { status: 403 });
    }
    return NextResponse.json({
      queue: await listPendingSiteAccessGrants(),
      grants: await listSiteAccessGrants(),
    });
  }
  const siteId = siteIdOf(url.searchParams.get("siteId"));
  if (!siteId) return NextResponse.json({ error: "Pick a site." }, { status: 400 });
  return NextResponse.json({
    ...plantPayload(siteId, await listSiteAccessGrants(siteId)),
    canAssign: canWriteSiteAccess(user),
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
    siteName?: string;
    email?: string;
    name?: string;
    grantId?: string;
    startYmd?: string;
    endYmd?: string;
    postEndYmd?: string;
    jobStartYmd?: string;
  };
  const siteId = siteIdOf(body.siteId);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const action = body.action;
  const now = Date.now();

  if (action === "grant-site-access") {
    if (!canWriteSiteAccess(user)) {
      return NextResponse.json({ error: "Owner and Project Managers grant site access." }, { status: 403 });
    }
    if (!siteId) return NextResponse.json({ error: "Pick a site." }, { status: 400 });
    if (!email.includes("@")) return NextResponse.json({ error: "Pick a person." }, { status: 400 });
    const assignee = await assigneeFor(email);
    const grant = await upsertSiteAccessGrant(
      createSiteAccessGrant({
        siteId,
        siteName: body.siteName,
        email,
        name: body.name || assignee.name,
        grantedByEmail: user.email,
        grantedByName: user.name,
        actor: user,
        assignee,
        startYmd: body.startYmd,
        endYmd: body.endYmd,
        jobStartYmd: body.jobStartYmd,
        postEndYmd: body.postEndYmd,
        now,
      }),
    );
    return NextResponse.json({
      ok: true,
      grant: publicSiteAccessGrant(grant),
      ...plantPayload(siteId, await listSiteAccessGrants(siteId)),
      toolRoom: await listToolRoomDuties(siteId),
    });
  }

  if (action === "revoke-site-access") {
    if (!canWriteSiteAccess(user)) {
      return NextResponse.json({ error: "Owner and Project Managers grant site access." }, { status: 403 });
    }
    if (!siteId || !email.includes("@")) return NextResponse.json({ error: "Pick a person." }, { status: 400 });
    await removeSiteAccessGrant(siteAccessGrantId(siteId, email));
    return NextResponse.json({
      ok: true,
      ...plantPayload(siteId, await listSiteAccessGrants(siteId)),
      toolRoom: await listToolRoomDuties(siteId),
    });
  }

  if (action === "extend-site-access") {
    if (!canWriteSiteAccess(user)) {
      return NextResponse.json({ error: "Owner and Project Managers set the access window." }, { status: 403 });
    }
    if (!siteId || !email.includes("@")) return NextResponse.json({ error: "Pick a person." }, { status: 400 });
    const current = await getSiteAccessGrant(siteAccessGrantId(siteId, email));
    if (!current) return NextResponse.json({ error: "Could not complete that grant." }, { status: 404 });
    const next = extendSiteAccessGrant(current, {
      actor: user,
      startYmd: body.startYmd,
      endYmd: body.endYmd,
      jobStartYmd: body.jobStartYmd,
      postEndYmd: body.postEndYmd,
    });
    if ("error" in next) return NextResponse.json({ error: next.error }, { status: 400 });
    await upsertSiteAccessGrant(next);
    return NextResponse.json({
      ok: true,
      grant: publicSiteAccessGrant(next),
      ...plantPayload(siteId, await listSiteAccessGrants(siteId)),
      toolRoom: await listToolRoomDuties(siteId),
    });
  }

  if (action === "apply-site-access" || action === "fail-site-access") {
    if (!canSilentApproveSiteAccess(user)) {
      return NextResponse.json({ error: "That section is not on this desk." }, { status: 403 });
    }
    const id =
      typeof body.grantId === "string" && body.grantId.trim()
        ? body.grantId.trim()
        : siteId && email.includes("@")
          ? siteAccessGrantId(siteId, email)
          : "";
    const current = id ? await getSiteAccessGrant(id) : null;
    if (!current) return NextResponse.json({ error: "Could not complete that grant." }, { status: 404 });
    const next = action === "apply-site-access" ? applySiteAccessGrant(current, user, now) : failSiteAccessGrant(current, user, now);
    if ("error" in next) return NextResponse.json({ error: next.error }, { status: 400 });
    await upsertSiteAccessGrant(next);
    return NextResponse.json({
      ok: true,
      grant: next,
      queue: await listPendingSiteAccessGrants(),
      grants: await listSiteAccessGrants(),
    });
  }

  if (action === "assign-tool-room") {
    if (!canWriteToolRoomDuty(user)) {
      return NextResponse.json({ error: "Owner and Project Managers assign Tool Room duty." }, { status: 403 });
    }
    if (!siteId || !email.includes("@")) return NextResponse.json({ error: "Pick a person." }, { status: 400 });
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
      ...plantPayload(siteId, await listSiteAccessGrants(siteId)),
      toolRoom: await listToolRoomDuties(siteId),
    });
  }

  if (action === "clear-tool-room") {
    if (!canWriteToolRoomDuty(user)) {
      return NextResponse.json({ error: "Owner and Project Managers assign Tool Room duty." }, { status: 403 });
    }
    if (!siteId || !email.includes("@")) return NextResponse.json({ error: "Pick a person." }, { status: 400 });
    await removeToolRoomDuty(toolRoomDutyId(siteId, email));
    return NextResponse.json({
      ok: true,
      ...plantPayload(siteId, await listSiteAccessGrants(siteId)),
      toolRoom: await listToolRoomDuties(siteId),
    });
  }

  return NextResponse.json({ error: "Pick an action." }, { status: 400 });
}
