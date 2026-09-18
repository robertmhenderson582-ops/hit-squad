import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { scopedDeskUser } from "@/lib/desk-scope-server";
import { cookieValue } from "@/lib/http";
import {
  canAdvanceOnboard,
  canRegisterOnboard,
  canSeeOnboardBoard,
  changeOnboardStage,
  createOnboardPerson,
  isOnboardLocalId,
  isOnboardStageId,
  nextOnboardStage,
  visibleOnboardPeople,
  type OnboardLocalId,
  type OnboardStageId,
} from "@/lib/onboard-pipeline";
import {
  getOnboardPerson,
  listOnboardPeople,
  onboardStoreStatus,
  upsertOnboardPerson,
} from "@/lib/onboard-vault";

export const dynamic = "force-dynamic";

function payload(body: Record<string, unknown>, status = 200) {
  return NextResponse.json({ ...onboardStoreStatus(), ...body }, { status });
}

async function boardFor(user: Parameters<typeof visibleOnboardPeople>[1]) {
  return visibleOnboardPeople(await listOnboardPeople(), user);
}

export async function GET(request: Request) {
  const session = await readSession(cookieValue(request));
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const user = await scopedDeskUser(session, request);
  if (!canSeeOnboardBoard(user)) {
    return NextResponse.json({ error: "Onboarding is not on this desk." }, { status: 403 });
  }
  try {
    return payload({
      people: await boardFor(user),
      canRegister: canRegisterOnboard(user),
      canAdvance: canAdvanceOnboard(user),
    });
  } catch {
    return payload({ error: "Could not load the onboarding board.", people: [] }, 503);
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
    client?: string;
    toStage?: string;
    note?: string;
  };
  const action = (body.action || "").trim();

  try {
    if (action === "register") {
      if (!canRegisterOnboard(user)) {
        return NextResponse.json({ error: "This seat cannot register people." }, { status: 403 });
      }
      if (!isOnboardLocalId(body.localId)) {
        return NextResponse.json({ error: "Pick Local 553." }, { status: 400 });
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
        actor: user,
      });
      if ("error" in created) return NextResponse.json({ error: created.error }, { status: 400 });
      await upsertOnboardPerson(created);
      return payload({
        person: created,
        people: await boardFor(user),
        canRegister: canRegisterOnboard(user),
        canAdvance: canAdvanceOnboard(user),
      });
    }

    if (action === "advance" || action === "block" || action === "reopen") {
      if (!canAdvanceOnboard(user)) {
        return NextResponse.json({ error: "Stage changes on this board go through Tom / HSE." }, { status: 403 });
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
        people: await boardFor(user),
        canRegister: canRegisterOnboard(user),
        canAdvance: canAdvanceOnboard(user),
      });
    }

    return NextResponse.json({ error: "Pick an action." }, { status: 400 });
  } catch {
    return payload({ error: "Could not save the onboarding board.", people: await boardFor(user).catch(() => []) }, 503);
  }
}
