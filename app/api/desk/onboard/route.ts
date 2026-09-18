import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { listCompanies } from "@/lib/companies-store";
import { scopedDeskUser } from "@/lib/desk-scope-server";
import { cookieValue } from "@/lib/http";
import { controlCenterBrandForUser } from "@/lib/onboard-brand";
import { notifyStepComplete } from "@/lib/onboard-notify";
import {
  canAdvanceOnboard,
  canConfigureOnboard,
  canCreateManpowerRequest,
  canManageOnboardHalls,
  canRegisterOnboard,
  canRespondManpowerRequest,
  canSeeOnboardBoard,
  canSeeRestrictedPii,
  canUpdateOutreach,
  canUpdateTracker,
  changeOnboardStage,
  createManpowerRequest,
  createOnboardPerson,
  isOnboardLocalId,
  isOnboardPhase1Local,
  isOnboardStageId,
  isTrainingStatus,
  nextOnboardStage,
  parseOnboardHallInput,
  parseOnboardSettings,
  redactOnboardPerson,
  respondManpowerRequest,
  updateOnboardPerson,
  visibleManpowerRequests,
  visibleOnboardPeople,
  type OnboardLocalId,
  type OnboardPersonPatch,
  type OnboardStageId,
} from "@/lib/onboard-pipeline";
import {
  getOnboardPerson,
  getOnboardRequest,
  getOnboardSettings,
  listOnboardHalls,
  listOnboardPeople,
  listOnboardRequests,
  onboardStoreStatus,
  saveOnboardHall,
  saveOnboardSettings,
  upsertOnboardPerson,
  upsertOnboardRequest,
} from "@/lib/onboard-vault";

export const dynamic = "force-dynamic";

function payload(body: Record<string, unknown>, status = 200) {
  return NextResponse.json({ ...onboardStoreStatus(), ...body }, { status });
}

async function controlCenterBrandPayload(user: Parameters<typeof visibleOnboardPeople>[1]) {
  try {
    return controlCenterBrandForUser(user, await listCompanies());
  } catch {
    return controlCenterBrandForUser(user, []);
  }
}

async function boardFor(user: Parameters<typeof visibleOnboardPeople>[1]) {
  const settings = await getOnboardSettings();
  const halls = await listOnboardHalls();
  return {
    brand: await controlCenterBrandPayload(user),
    people: visibleOnboardPeople(await listOnboardPeople(), user),
    requests: visibleManpowerRequests(await listOnboardRequests(), user),
    settings,
    halls,
    canRegister: canRegisterOnboard(user, settings),
    canAdvance: canAdvanceOnboard(user),
    canCreateRequest: canCreateManpowerRequest(user),
    canRespondRequest: canRespondManpowerRequest(user),
    canUpdateTracker: canUpdateTracker(user),
    canUpdateOutreach: canUpdateOutreach(user),
    canSeeRestrictedPii: canSeeRestrictedPii(user),
    canConfigure: canConfigureOnboard(user),
    canManageHalls: canManageOnboardHalls(user),
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
    step1Submitter?: string;
    corporateEmails?: string | string[];
    pmEmails?: string | string[];
    legalName?: string;
    dateOfBirth?: string;
    ssnLast4?: string;
    identityVerified?: boolean;
    p66CorporateTraining?: string;
    p66SiteTraining?: string;
    p66PrecertTraining?: string;
    hireInLinkSent?: boolean;
    hireInDeliveryConfirmed?: boolean;
    verifiedEmployeeReceivedHireInLink?: boolean;
    tomFriedContactConfirmed?: boolean;
    problemCase?: boolean;
    problemCaseNote?: string;
    label?: string;
    union?: string;
    contactName?: string;
    contactEmail?: string;
    contactTitle?: string;
    jobTitle?: string;
    localNumber?: string;
    phase1?: boolean;
    phaseOne?: boolean;
  };
  const action = (body.action || "").trim();

  try {
    if (action === "save-hall") {
      if (!canManageOnboardHalls(user)) {
        return NextResponse.json({ error: "Company users add and edit halls on this desk." }, { status: 403 });
      }
      const parsed = parseOnboardHallInput({
        id: body.localId,
        localNumber: body.localNumber,
        label: body.label,
        craft: body.craft,
        union: body.union,
        contactName: body.contactName,
        contactEmail: body.contactEmail,
        contactTitle: body.contactTitle,
        jobTitle: body.jobTitle,
        phase1: body.phase1,
        phaseOne: body.phaseOne,
      });
      if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
      await saveOnboardHall(parsed);
      return payload(await boardFor(user));
    }

    if (action === "save-settings") {
      if (!canConfigureOnboard(user)) {
        return NextResponse.json({ error: "Owner configures corporate / PM lists and Step 1 submitter." }, { status: 403 });
      }
      await saveOnboardSettings(
        parseOnboardSettings({
          step1Submitter: body.step1Submitter,
          corporateEmails: body.corporateEmails,
          pmEmails: body.pmEmails,
        }),
      );
      return payload(await boardFor(user));
    }

    if (action === "register") {
      const settings = await getOnboardSettings();
      const halls = await listOnboardHalls();
      if (!canRegisterOnboard(user, settings)) {
        return NextResponse.json({ error: "This seat cannot register people." }, { status: 403 });
      }
      if (!isOnboardLocalId(body.localId, halls) || !isOnboardPhase1Local(body.localId, halls)) {
        return NextResponse.json({ error: "That local is not phase-one yet." }, { status: 400 });
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
        settings,
        halls,
      });
      if ("error" in created) return NextResponse.json({ error: created.error }, { status: 400 });
      await upsertOnboardPerson(created);
      const notify = await notifyStepComplete({
        person: created,
        completedStage: "step-1",
        settings,
        actor: user,
        at: created.createdAt,
      });
      return payload({
        person: redactOnboardPerson(created, user),
        notify,
        ...(await boardFor(user)),
      });
    }

    if (action === "create-request") {
      const halls = await listOnboardHalls();
      if (!canCreateManpowerRequest(user)) {
        return NextResponse.json({ error: "Manpower requests are created by Tom / Benny / HSE." }, { status: 403 });
      }
      if (!isOnboardLocalId(body.localId, halls) || !isOnboardPhase1Local(body.localId, halls)) {
        return NextResponse.json({ error: "That local is not phase-one yet." }, { status: 400 });
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
        halls,
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
        halls: await listOnboardHalls(),
      });
      if ("error" in next) return NextResponse.json({ error: next.error }, { status: 400 });
      await upsertOnboardRequest(next);
      return payload({
        request: next,
        ...(await boardFor(user)),
      });
    }

    if (action === "update-tracker") {
      if (!canUpdateOutreach(user)) {
        return NextResponse.json({ error: "Tracker fields are updated by Tom Fried, Debbie, or the outreach team." }, { status: 403 });
      }
      const id = typeof body.id === "string" ? body.id.trim() : "";
      if (!id) return NextResponse.json({ error: "Pick a person." }, { status: 400 });
      const current = await getOnboardPerson(id);
      if (!current) return NextResponse.json({ error: "That person is not on the board." }, { status: 404 });
      const patch: OnboardPersonPatch = {
        legalName: body.legalName,
        dateOfBirth: body.dateOfBirth,
        ssnLast4: body.ssnLast4,
        identityVerified: body.identityVerified,
        p66CorporateTraining: isTrainingStatus(body.p66CorporateTraining) ? body.p66CorporateTraining : undefined,
        p66SiteTraining: isTrainingStatus(body.p66SiteTraining) ? body.p66SiteTraining : undefined,
        p66PrecertTraining: isTrainingStatus(body.p66PrecertTraining) ? body.p66PrecertTraining : undefined,
        hireInLinkSent: body.hireInLinkSent,
        hireInDeliveryConfirmed: body.hireInDeliveryConfirmed,
        verifiedEmployeeReceivedHireInLink: body.verifiedEmployeeReceivedHireInLink,
        tomFriedContactConfirmed: body.tomFriedContactConfirmed,
        problemCase: body.problemCase,
        problemCaseNote: body.problemCaseNote,
        note: body.note,
      };
      const next = updateOnboardPerson(current, patch, user);
      if ("error" in next) return NextResponse.json({ error: next.error }, { status: 400 });
      await upsertOnboardPerson(next);
      return payload({
        person: redactOnboardPerson(next, user),
        ...(await boardFor(user)),
      });
    }

    if (action === "advance" || action === "block" || action === "reopen") {
      if (!canAdvanceOnboard(user)) {
        return NextResponse.json({ error: "Stage changes on this board go through Tom / Benny / HSE." }, { status: 403 });
      }
      const id = typeof body.id === "string" ? body.id.trim() : "";
      if (!id) return NextResponse.json({ error: "Pick a person." }, { status: 400 });
      const current = await getOnboardPerson(id);
      if (!current) return NextResponse.json({ error: "That person is not on the board." }, { status: 404 });

      let toStage: OnboardStageId | null = null;
      if (action === "block") toStage = "blocked";
      else if (action === "reopen") {
        toStage = isOnboardStageId(body.toStage) && (body.toStage === "step-1" || body.toStage === "step-2")
          ? body.toStage
          : "step-1";
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
      const settings = await getOnboardSettings();
      const notify =
        toStage === "blocked"
          ? { queued: false, sent: false, recipients: 0, skipped: "Blocked / failed does not send a step-complete email." }
          : await notifyStepComplete({
              person: next,
              completedStage: toStage,
              settings,
              actor: user,
              at: next.updatedAt,
            });
      return payload({
        person: redactOnboardPerson(next, user),
        notify,
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
