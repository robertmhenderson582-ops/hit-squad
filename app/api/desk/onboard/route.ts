import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { scopedDeskUser } from "@/lib/desk-scope-server";
import { cookieValue } from "@/lib/http";
import {
  canAdvanceOnboard,
  canCreateManpowerRequest,
  canRegisterOnboard,
  canRespondManpowerRequest,
  canSeeOnboardBoard,
  changeOnboardStage,
  createManpowerRequest,
  createOnboardPerson,
  isOnboardLocalId,
  isOnboardPhase1Local,
  isOnboardStageId,
  nextOnboardStage,
  respondManpowerRequest,
  visibleManpowerRequests,
  visibleOnboardPeople,
  type OnboardLocalId,
  type OnboardStageId,
} from "@/lib/onboard-pipeline";
import {
  getOnboardPerson,
  getOnboardRequest,
  listOnboardPeople,
  listOnboardRequests,
  onboardStoreStatus,
  upsertOnboardPerson,
  upsertOnboardRequest,
} from "@/lib/onboard-vault";

export const dynamic = "force-dynamic";

function payload(body: Record<string, unknown>, status = 200) {
  return NextResponse.json({ ...onboardStoreStatus(), ...body }, { status });
}

async function boardFor(user: Parameters<typeof visibleOnboardPeople>[1]) {
  return {
    people: visibleOnboardPeople(await listOnboardPeople(), user),
    requests: visibleManpowerRequests(await listOnboardRequests(), user),
    canRegister: canRegisterOnboard(user),
    canAdvance: canAdvanceOnboard(user),
    canCreateRequest: canCreateManpowerRequest(user),
    canRespondRequest: canRespondManpowerRequest(user),
  };
}

export async function GET(request: Request) {
  const session = await readSession(cookieValue(request));
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const user = await scopedDeskUser(session, request);
  if (!canSeeOnboardBoard(user)) {
    return NextResponse.json({ error: "Onboarding is not on this desk." }, { status: 403 });
  }
  try {
    return payload(await boardFor(user));
  } catch {
    return payload({ error: "Could not load the onboarding board.", people: [], requests: [] }, 503);
  }
}

export async function POST(request: Request) {
  const session = await readSession(cookieValue(request));
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const user = await scopedDeskUser(session, request);
  if (!canSeeOnboardBoard(user)) {
    return NextResponse.json({ error: "Onboarding is not on this desk." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    id?: string;
    name?: string;
    localId?: string;
    craft?: string;
    classification?: string;
    phone?: string;
    email?: string;
    referredFor?: string;
    site?: string;
    job?: string;
    client?: string;
    requestId?: string;
    dateNeeded?: string;
    headcount?: number | string;
    trade?: string;
    requiredCerts?: string;
    requiredScreenings?: string;
    hiringPackageNotes?: string;
    fillCount?: number | string;
    fillDate?: string;
    toStage?: string;
    note?: string;
  };
  const action = (body.action || "").trim();

  try {
    if (action === "register") {
      if (!canRegisterOnboard(user)) {
        return NextResponse.json({ error: "This seat cannot register people." }, { status: 403 });
      }
      if (!isOnboardLocalId(body.localId) || !isOnboardPhase1Local(body.localId)) {
        return NextResponse.json({ error: "Phase 1 is Local 553 only." }, { status: 400 });
      }
      const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
      if (requestId) {
        const linked = await getOnboardRequest(requestId);
        if (!linked) return NextResponse.json({ error: "That manpower request is not on this desk." }, { status: 400 });
        if (linked.localId !== body.localId) {
          return NextResponse.json({ error: "That person must match the request local." }, { status: 400 });
        }
      }
      const created = createOnboardPerson({
        name: typeof body.name === "string" ? body.name : "",
        localId: body.localId as OnboardLocalId,
        craft: body.craft,
        classification: body.classification,
        phone: body.phone,
        email: body.email,
        referredFor: body.referredFor,
        site: body.site,
        client: body.client,
        requestId,
        actor: user,
      });
      if ("error" in created) return NextResponse.json({ error: created.error }, { status: 400 });
      await upsertOnboardPerson(created);
      return payload({
        person: created,
        ...(await boardFor(user)),
      });
    }

    if (action === "create-request") {
      if (!canCreateManpowerRequest(user)) {
        return NextResponse.json({ error: "Manpower requests are created by Benny / HSE." }, { status: 403 });
      }
      if (!isOnboardLocalId(body.localId) || !isOnboardPhase1Local(body.localId)) {
        return NextResponse.json({ error: "Phase 1 is Local 553 only." }, { status: 400 });
      }
      const created = createManpowerRequest({
        localId: body.localId as OnboardLocalId,
        dateNeeded: typeof body.dateNeeded === "string" ? body.dateNeeded : "",
        headcount: body.headcount ?? "",
        trade: body.trade,
        classification: body.classification,
        site: body.site,
        job: body.job,
        requiredCerts: body.requiredCerts,
        requiredScreenings: body.requiredScreenings,
        hiringPackageNotes: body.hiringPackageNotes,
        actor: user,
      });
      if ("error" in created) return NextResponse.json({ error: created.error }, { status: 400 });
      await upsertOnboardRequest(created);
      return payload({
        request: created,
        ...(await boardFor(user)),
      });
    }

    if (action === "respond-request") {
      if (!canRespondManpowerRequest(user)) {
        return NextResponse.json({ error: "Hall seats respond to manpower requests." }, { status: 403 });
      }
      const id = typeof body.id === "string" ? body.id.trim() : "";
      if (!id) return NextResponse.json({ error: "Pick a manpower request." }, { status: 400 });
      const current = await getOnboardRequest(id);
      if (!current) return NextResponse.json({ error: "That manpower request is not on this desk." }, { status: 404 });
      const next = respondManpowerRequest(current, {
        fillCount: body.fillCount ?? "",
        fillDate: typeof body.fillDate === "string" ? body.fillDate : "",
        actor: user,
      });
      if ("error" in next) return NextResponse.json({ error: next.error }, { status: 400 });
      await upsertOnboardRequest(next);
      return payload({
        request: next,
        ...(await boardFor(user)),
      });
    }

    if (action === "advance" || action === "block" || action === "reopen") {
      if (!canAdvanceOnboard(user)) {
        return NextResponse.json({ error: "Stage changes on this board go through Benny / HSE." }, { status: 403 });
      }
      const id = typeof body.id === "string" ? body.id.trim() : "";
      if (!id) return NextResponse.json({ error: "Pick a person." }, { status: 400 });
      const current = await getOnboardPerson(id);
      if (!current) return NextResponse.json({ error: "That person is not on the board." }, { status: 404 });

      let toStage: OnboardStageId | null = null;
      if (action === "block") toStage = "blocked";
      else if (action === "reopen") {
        toStage = isOnboardStageId(body.toStage) && (body.toStage === "registered" || body.toStage === "waiting-drug")
          ? body.toStage
          : "registered";
      } else if (isOnboardStageId(body.toStage)) toStage = body.toStage;
      else toStage = nextOnboardStage(current.stage);

      if (!toStage) return NextResponse.json({ error: "That person is already cleared." }, { status: 400 });
      const next = changeOnboardStage(current, {
        toStage,
        note: body.note,
        actor: user,
      });
      if ("error" in next) return NextResponse.json({ error: next.error }, { status: 400 });
      await upsertOnboardPerson(next);
      return payload({
        person: next,
        ...(await boardFor(user)),
      });
    }

    return NextResponse.json({ error: "Pick an action." }, { status: 400 });
  } catch {
    return payload(
      { error: "Could not save the onboarding board.", ...(await boardFor(user).catch(() => ({ people: [], requests: [] }))) },
      503,
    );
  }
}
