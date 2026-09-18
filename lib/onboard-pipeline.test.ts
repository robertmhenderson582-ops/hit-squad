import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { NOVUS_EMAIL } from "./desk-role.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import {
  CONTROL_CENTER_CHROME,
  CONTROL_CENTER_TITLE,
  DEFAULT_ONBOARD_PLANT,
  DEFAULT_ONBOARD_SETTINGS,
  BATTUELLO_LAST_NAME,
  BENNY_CAMP_EMAIL,
  BENNY_CAMP_NAME,
  DEBBIE_TRACKER_NAME,
  HIRE_IN_VERIFIED_FIELD_LABEL,
  JOHN_BATTUELLO_EMAIL,
  JOHN_BATTUELLO_NAME,
  JOHNNY_BATTUELLO_NAME,
  ONBOARD_LOCALS,
  ONBOARD_SEED_SEATS,
  ONBOARD_STAGES,
  TEXOLVE_NAME,
  TEXOLVE_SPELLING_NOTE,
  TOM_FRIED_EMAIL,
  TOM_FRIED_NAME,
  TOM_FRIED_TITLE,
  canAdvanceOnboard,
  canCreateManpowerRequest,
  canRegisterOnboard,
  canRespondManpowerRequest,
  canSeeOnboardBoard,
  canSeeOnboardDoor,
  canSeeRestrictedPii,
  canUpdateOutreach,
  changeOnboardStage,
  createManpowerRequest,
  createOnboardPerson,
  hallContactForLocal,
  hallLocalForSeat,
  isBennyCampSeat,
  isHallSeat,
  isOnboardPhase1Local,
  isTomFriedSeat,
  maskSsnLast4,
  nextOnboardStage,
  normalizeOnboardStageId,
  onboardStageOwner,
  parseOnboardFile,
  parseOnboardPerson,
  parseOnboardSettings,
  parseSsnLast4,
  redactOnboardPerson,
  respondManpowerRequest,
  peopleByStage,
  selectableOnboardLocals,
  updateOnboardPerson,
  visibleOnboardPeople,
} from "./onboard-pipeline.ts";
import { buildStepCompleteMail } from "./onboard-notify.ts";
import { listOnboardPeople, resetOnboardForTests, upsertOnboardPerson, useMemoryOnboard } from "./onboard-vault.ts";

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const owner = { email: OWNER_LOGIN_EMAIL, role: "owner" as const, name: "Robert Henderson" };
const novus = { email: NOVUS_EMAIL, role: "operator" as const, name: "Novus" };
const wendell = { email: "wlanderno@yahoo.com", role: "tester" as const, name: "Wendell Landerno", jobTitle: "HSE Manager" };
const nathan = { email: "nathanboyte@gmail.com", role: "tester" as const, name: "Nathan Boyte", jobTitle: "Project Manager" };
const hall553 = { email: JOHN_BATTUELLO_EMAIL, role: "tester" as const, name: JOHN_BATTUELLO_NAME, jobTitle: "Hall Local 553" };
const hall363 = { email: "hall363@example.com", role: "tester" as const, name: "BM 363 BA", jobTitle: "Hall Local 363" };
const benny = { email: BENNY_CAMP_EMAIL, role: "tester" as const, name: BENNY_CAMP_NAME, jobTitle: "Site Safety Manager" };
const tom = { email: TOM_FRIED_EMAIL, role: "tester" as const, name: TOM_FRIED_NAME, jobTitle: TOM_FRIED_TITLE };
const johnny = { email: JOHN_BATTUELLO_EMAIL, role: "tester" as const, name: JOHNNY_BATTUELLO_NAME, jobTitle: "Hall Local 553" };
const chance = { email: "chancec318@yahoo.com", role: "tester" as const, name: "Chance", jobTitle: "Quality Manager" };
const debbie = { name: "Debbie", role: "tester" as const, jobTitle: "Tracker" };
const hallSettings = { ...DEFAULT_ONBOARD_SETTINGS, step1Submitter: "hall" as const };

describe("Hall ↔ HSE onboarding pipeline", () => {
  it("locks day-one locals, Benny dictation stages, Texolve, and DISA DER Tom", () => {
    assert.deepEqual(
      ONBOARD_LOCALS.map((row) => `${row.id}:${row.short}:${row.phase1}`),
      ["553:PF553:true", "363:BM363:false"],
    );
    assert.deepEqual(
      selectableOnboardLocals().map((row) => row.id),
      ["553"],
    );
    assert.equal(
      ONBOARD_SEED_SEATS.some((row) => /363|boilermaker/i.test(`${row.jobTitle} ${row.email} ${row.name}`)),
      false,
    );
    assert.equal(isOnboardPhase1Local("553"), true);
    assert.equal(isOnboardPhase1Local("363"), false);
    assert.equal(TOM_FRIED_EMAIL, "friedt@madisonltd.com");
    assert.equal(TOM_FRIED_TITLE, "DISA DER");
    assert.equal(BENNY_CAMP_NAME, "Benny Camp");
    assert.equal(BENNY_CAMP_EMAIL, "bccamp2@gmail.com");
    assert.equal(CONTROL_CENTER_TITLE, "Hit Squad Control Center");
    assert.equal(CONTROL_CENTER_CHROME, "HIT SQUAD CONTROL CENTER");
    assert.equal(BATTUELLO_LAST_NAME, "Battuello");
    assert.equal(JOHN_BATTUELLO_EMAIL, "jbattuello@ualocal553.org");
    assert.equal(JOHN_BATTUELLO_NAME, "John Battuello Jr.");
    assert.equal(JOHNNY_BATTUELLO_NAME, "Johnny Battuello Jr.");
    assert.equal(TEXOLVE_NAME, "Texolve");
    assert.match(TEXOLVE_SPELLING_NOTE, /TechSolve is an alternate spelling pending confirm/);
    assert.equal(DEBBIE_TRACKER_NAME, "Debbie");
    assert.equal(HIRE_IN_VERIFIED_FIELD_LABEL, "Verified Employee Received HireIn Link");
    assert.deepEqual(DEFAULT_ONBOARD_SETTINGS, { step1Submitter: "site", corporateEmails: [], pmEmails: [] });
    assert.deepEqual(hallContactForLocal("553"), {
      name: JOHN_BATTUELLO_NAME,
      email: JOHN_BATTUELLO_EMAIL,
      title: "Hall Local 553",
    });
    assert.equal(hallContactForLocal("363"), null);
    assert.deepEqual(
      ONBOARD_SEED_SEATS.map((row) => `${row.name}:${row.email}:${row.jobTitle}`),
      [
        `${JOHN_BATTUELLO_NAME}:${JOHN_BATTUELLO_EMAIL}:Hall Local 553`,
        `${TOM_FRIED_NAME}:${TOM_FRIED_EMAIL}:${TOM_FRIED_TITLE}`,
      ],
    );
    assert.deepEqual(
      ONBOARD_STAGES.map((row) => row.id),
      ["step-1", "step-2", "step-3", "step-4", "step-5", "blocked"],
    );
    assert.equal(onboardStageOwner("step-2"), TOM_FRIED_NAME);
    assert.match(ONBOARD_STAGES.find((row) => row.id === "step-3")?.label ?? "", /Texolve/);
    assert.match(ONBOARD_STAGES.find((row) => row.id === "step-4")?.label ?? "", /Hire-end outreach/);
    assert.match(ONBOARD_STAGES.find((row) => row.id === "step-5")?.label ?? "", /Badged/);
    assert.equal(DEFAULT_ONBOARD_PLANT.site, "Wood River");
    assert.equal(DEFAULT_ONBOARD_PLANT.client, "Phillips 66");
    assert.equal(nextOnboardStage("step-1"), "step-2");
    assert.equal(nextOnboardStage("step-4"), "step-5");
    assert.equal(nextOnboardStage("step-5"), null);
    assert.equal(normalizeOnboardStageId("registered"), "step-1");
    assert.equal(normalizeOnboardStageId("waiting-drug"), "step-2");
    assert.equal(normalizeOnboardStageId("techsolve"), "step-3");
    assert.equal(normalizeOnboardStageId("notify-badge"), "step-4");
    assert.equal(normalizeOnboardStageId("ready"), "step-5");
    assert.equal(parseSsnLast4("123-45-6789"), "6789");
    assert.equal(maskSsnLast4("6789"), "•••-••-6789");
  });

  it("gates hall register to site by default and keeps Tom on DISA + manpower", () => {
    assert.equal(hallLocalForSeat(hall553), "553");
    assert.equal(hallLocalForSeat(johnny), "553");
    assert.equal(hallLocalForSeat(hall363), "363");
    assert.equal(isHallSeat(hall553), true);
    assert.equal(isHallSeat(wendell), false);
    assert.equal(isTomFriedSeat(tom), true);
    assert.equal(isBennyCampSeat(benny), true);
    assert.equal(canSeeOnboardBoard(owner), true);
    assert.equal(canSeeOnboardBoard(wendell), true);
    assert.equal(canSeeOnboardBoard(benny), true);
    assert.equal(canSeeOnboardBoard(nathan), true);
    assert.equal(canSeeOnboardBoard(hall553), true);
    assert.equal(canSeeOnboardBoard(tom), true);
    assert.equal(canSeeOnboardBoard(debbie), true);
    assert.equal(canSeeOnboardBoard(chance), true);
    assert.equal(canRegisterOnboard(hall553), false);
    assert.equal(canRegisterOnboard(hall553, hallSettings), true);
    assert.equal(canRegisterOnboard(benny), true);
    assert.equal(canRegisterOnboard(tom), true);
    assert.equal(canAdvanceOnboard(owner), true);
    assert.equal(canAdvanceOnboard(novus), true);
    assert.equal(canAdvanceOnboard(wendell), true);
    assert.equal(canAdvanceOnboard(benny), true);
    assert.equal(canAdvanceOnboard(tom), true);
    assert.equal(canAdvanceOnboard(debbie), true);
    assert.equal(canAdvanceOnboard(hall553), false);
    assert.equal(canAdvanceOnboard(nathan), false);
    assert.equal(canUpdateOutreach(nathan), true);
    assert.equal(canSeeRestrictedPii(tom), true);
    assert.equal(canSeeRestrictedPii(hall553), false);
    assert.equal(canSeeOnboardDoor(owner, owner), true);
    assert.equal(canSeeOnboardDoor(wendell), true);
    assert.equal(canSeeOnboardDoor(benny), true);
    assert.equal(canSeeOnboardDoor(hall553), true);
    assert.equal(canSeeOnboardDoor(tom), true);
    assert.equal(canSeeOnboardDoor(nathan), true);
    assert.equal(canSeeOnboardDoor(owner, chance), true);
    assert.equal(canSeeOnboardDoor({ email: "jhut26@gmail.com", role: "tester" }), false);
  });

  it("registers a person, advances with an append-only audit, and requires a block reason", () => {
    const created = createOnboardPerson({
      name: "Pat Fitter",
      localId: "553",
      classification: "Journeyman",
      phone: "618-555-0100",
      actor: benny,
      at: "2026-09-18T15:00:00.000Z",
      id: "ob-pat",
    });
    if ("error" in created) throw new Error(created.error);
    assert.equal(created.stage, "step-1");
    assert.equal(created.craft, "Pipefitter");
    assert.equal(created.site, "Wood River");
    assert.equal(created.client, "Phillips 66");
    assert.equal(created.phone, "618-555-0100");
    assert.equal(created.events.length, 1);
    assert.equal(created.events[0]?.fromStage, null);
    assert.equal(created.events[0]?.toStage, "step-1");
    assert.equal(created.events[0]?.actorName, BENNY_CAMP_NAME);

    const skipped = changeOnboardStage(created, { toStage: "step-3", actor: owner });
    assert.equal("error" in skipped, true);

    const advanced = changeOnboardStage(created, {
      toStage: "step-2",
      note: "DISA scheduled",
      actor: tom,
      at: "2026-09-18T16:00:00.000Z",
    });
    if ("error" in advanced) throw new Error(advanced.error);
    assert.equal(advanced.stage, "step-2");
    assert.equal(advanced.events.length, 2);
    assert.equal(advanced.events[1]?.fromStage, "step-1");
    assert.equal(advanced.events[1]?.toStage, "step-2");
    assert.equal(advanced.events[1]?.actorName, TOM_FRIED_NAME);
    assert.equal(advanced.events[1]?.note, "DISA scheduled");
    assert.equal(created.events.length, 1);

    const verified = updateOnboardPerson(
      advanced,
      { legalName: "Patricia Fitter", dateOfBirth: "1990-01-02", ssnLast4: "123-45-6789", identityVerified: true },
      tom,
      "2026-09-18T16:05:00.000Z",
    );
    if ("error" in verified) throw new Error(verified.error);
    assert.equal(verified.legalName, "Patricia Fitter");
    assert.equal(verified.ssnLast4, "6789");
    assert.equal(verified.identityVerifiedBy, TOM_FRIED_NAME);
    const hallView = redactOnboardPerson(verified, hall553);
    assert.equal(hallView.ssnLast4, "");
    assert.equal(hallView.legalName, "");

    const blockedEmpty = changeOnboardStage(advanced, { toStage: "blocked", actor: owner });
    assert.deepEqual(blockedEmpty, { error: "Blocked / failed needs a reason." });

    const blocked = changeOnboardStage(advanced, {
      toStage: "blocked",
      note: "No-show at clinic",
      actor: owner,
      at: "2026-09-18T17:00:00.000Z",
    });
    if ("error" in blocked) throw new Error(blocked.error);
    assert.equal(blocked.stage, "blocked");
    assert.equal(blocked.blockedReason, "No-show at clinic");
    assert.equal(blocked.events.at(-1)?.fromStage, "step-2");

    const siteOnly = createOnboardPerson({
      name: "Pat Fitter",
      localId: "553",
      phone: "618-555-0100",
      actor: hall553,
    });
    assert.deepEqual(siteOnly, { error: "Step 1 name and phone are submitted by site (Owner-configurable)." });

    const hallOther = createOnboardPerson({
      name: "Boiler Hand",
      localId: "363",
      phone: "618-555-0101",
      actor: hall553,
      settings: hallSettings,
    });
    assert.deepEqual(hallOther, { error: "Phase 1 is Local 553 only." });

    const impostor = createOnboardPerson({
      name: "Pat Fitter",
      localId: "553",
      phone: "618-555-0100",
      actor: { email: "other@hall.org", name: "Other BA", jobTitle: "Hall Local 553" },
      settings: hallSettings,
    });
    assert.deepEqual(impostor, { error: "Local 553 register is gated to jbattuello@ualocal553.org." });
  });

  it("hides the other local from a hall seat and groups the kanban by stage", () => {
    const fitter = createOnboardPerson({
      name: "Pat Fitter",
      localId: "553",
      phone: "618-555-0100",
      actor: hall553,
      settings: hallSettings,
      id: "ob-553",
    });
    const boiler = parseOnboardPerson({ id: "ob-363", name: "Boiler Hand", localId: "363", stage: "registered" });
    if ("error" in fitter || !boiler) throw new Error("seed");
    const all = [fitter, boiler];
    assert.deepEqual(
      visibleOnboardPeople(all, hall553).map((row) => row.id),
      ["ob-553"],
    );
    assert.deepEqual(
      visibleOnboardPeople(all, wendell).map((row) => row.id),
      ["ob-553", "ob-363"],
    );
    const groups = peopleByStage(all);
    assert.equal(groups["step-1"].length, 2);
    assert.equal(groups["step-2"].length, 0);
    assert.equal(boiler.stage, "step-1");
  });

  it("persists people in the memory vault and refuses to rewrite old events", async () => {
    resetOnboardForTests();
    useMemoryOnboard();
    const created = createOnboardPerson({
      name: "Pat Fitter",
      localId: "553",
      phone: "618-555-0100",
      actor: benny,
      id: "ob-pat",
      at: "2026-09-18T15:00:00.000Z",
    });
    if ("error" in created) throw new Error(created.error);
    await upsertOnboardPerson(created);
    const listed = await listOnboardPeople();
    assert.match(listed[0]?.events[0]?.note ?? "", /Submitted name \+ phone to DISA DER/);
    const mutated = parseOnboardFile({
      people: [{ ...listed[0], events: [] }],
    });
    assert.equal(mutated.people[0]?.name, "Pat Fitter");
    assert.equal(listed[0]?.events.length, 1);
    assert.deepEqual(mutated.settings, DEFAULT_ONBOARD_SETTINGS);
    resetOnboardForTests();
  });

  it("holds step-complete mail until Owner fills corp / PM lists", () => {
    const person = createOnboardPerson({
      name: "Pat Fitter",
      localId: "553",
      phone: "618-555-0100",
      actor: benny,
      id: "ob-mail",
    });
    if ("error" in person) throw new Error(person.error);
    const held = buildStepCompleteMail(person, "step-1", DEFAULT_ONBOARD_SETTINGS, benny);
    assert.deepEqual(held, { skipped: "Owner has not configured corporate / PM recipients." });
    const settings = parseOnboardSettings({
      corporateEmails: ["corp@example.com"],
      pmEmails: ["pm@example.com", "corp@example.com"],
    });
    const mail = buildStepCompleteMail(person, "step-1", settings, benny, "2026-09-18T15:00:00.000Z");
    if ("skipped" in mail) throw new Error(mail.skipped);
    assert.deepEqual(mail.to, ["corp@example.com", "pm@example.com"]);
    assert.match(mail.subject, /Step 1 complete/);
    assert.doesNotMatch(mail.text, /6789|SSN last 4: /);
    assert.match(mail.text, /Legal name \/ DOB \/ SSN are not included/);
  });

  it("wires a Hit Squad desk page, vault file, and HSE door without SMS or meeting connectors", () => {
    const desk = source("../components/OnboardDesk.tsx");
    const page = source("../app/onboard/page.tsx");
    const api = source("../app/api/desk/onboard/route.ts");
    const home = source("./desk-home.ts");
    const hse = source("../components/HseDesk.tsx");
    const drive = source("./drive-data.ts");
    assert.match(page, /OnboardDesk/);
    assert.match(page, /DeskChrome/);
    assert.match(page, /CONTROL_CENTER_CHROME/);
    assert.match(desk, /CONTROL_CENTER_TITLE/);
    assert.match(home, /label: "Dispatch"/);
    assert.match(home, /key: "dispatch"/);
    assert.match(home, /Hiring \+ HSE onboarding board/);
    assert.match(hse, /Hit Squad Control Center/);
    assert.match(source("../app/onboard/layout.tsx"), /CONTROL_CENTER_TITLE/);
    const users = source("./users.ts");
    const roles = source("./job-roles.ts");
    assert.match(desk, /Hall register/);
    assert.match(desk, /Submitted to DISA DER/);
    assert.match(desk, /Texolve/);
    assert.match(desk, /TechSolve is an alternate spelling pending confirm/);
    assert.match(desk, /Verified Employee Received HireIn Link/);
    assert.match(desk, /Benny Camp/);
    assert.match(desk, /bccamp2@gmail.com/);
    assert.match(desk, /DISA DER/);
    assert.match(desk, /friedt@madisonltd.com/);
    assert.match(source("../components/HseDesk.tsx"), /bccamp2@gmail.com/);
    assert.match(source("../components/HseDesk.tsx"), /Tom Fried/);
    assert.match(source("../components/ManageUsersDesk.tsx"), /bccamp2@gmail.com/);
    assert.match(desk, /John Battuello Jr/);
    assert.match(desk, /jbattuello@ualocal553.org/);
    assert.doesNotMatch(desk, /Petruello|Butuello/);
    assert.doesNotMatch(source("./onboard-pipeline.ts"), /Petruello|Butuello/);
    assert.match(desk, /Local 553 hall contact/);
    assert.match(desk, /Audit trail/);
    assert.doesNotMatch(desk, /tfried@madisonltd.com/);
    assert.doesNotMatch(source("../components/HseDesk.tsx"), /friedt@madisonltd.com/);
    assert.doesNotMatch(source("../components/ManageUsersDesk.tsx"), /friedt@madisonltd.com/);
    assert.match(desk, /Manpower request/);
    assert.match(desk, /Hall manpower inbox/);
    assert.match(desk, /hiring package/);
    assert.match(desk, /No email blast/);
    assert.match(desk, /P66 corporate/);
    assert.match(desk, /Debbie/);
    assert.match(desk, /Ben Peffley/);
    assert.doesNotMatch(desk, /Local 363|BM363/);
    assert.doesNotMatch(desk, /\bSMS\b|Twilio|Zoom|Teams/i);
    assert.doesNotMatch(api, /\bSMS\b|Twilio|Zoom|Teams|nodemailer|sendMail|mailto:/i);
    assert.match(api, /create-request/);
    assert.match(api, /respond-request/);
    assert.match(api, /update-tracker/);
    assert.match(api, /save-settings/);
    assert.match(source("./onboard-notify.ts"), /notifyStepComplete/);
    assert.match(home, /ONBOARD_DOOR/);
    assert.match(home, /\/onboard/);
    assert.match(hse, /href="\/onboard"/);
    assert.match(drive, /onboard-people\.json/);
    assert.doesNotMatch(drive, /DRIVE_ONBOARD_PEOPLE_FILE_ID = "1/);
    assert.match(users, /ONBOARD_SEED_SEATS/);
    assert.doesNotMatch(users, /madisonltd\.com/);
    assert.match(roles, /PARKED_HALL_JOB_ROLES/);
    assert.match(roles, /Hall Local 363/);
    assert.match(roles, /DISA DER/);
    assert.doesNotMatch(source("./tester-seats.ts"), /friedt@|jbattuello@|tfried@/);
  });

  it("lets Tom or Benny create a Local 553 manpower request and John respond before register", () => {
    assert.equal(canCreateManpowerRequest(benny), true);
    assert.equal(canCreateManpowerRequest(tom), true);
    assert.equal(canCreateManpowerRequest(hall553), false);
    assert.equal(canRespondManpowerRequest(hall553), true);
    assert.equal(canRespondManpowerRequest(benny), false);

    const blockedLocal = createManpowerRequest({
      localId: "363",
      dateNeeded: "2026-09-22",
      headcount: 4,
      actor: benny,
    });
    assert.deepEqual(blockedLocal, { error: "Phase 1 is Local 553 only." });

    const hallCreate = createManpowerRequest({
      localId: "553",
      dateNeeded: "2026-09-22",
      headcount: 4,
      actor: hall553,
    });
    assert.deepEqual(hallCreate, { error: "Manpower requests are created by Tom / Benny / HSE." });

    const created = createManpowerRequest({
      localId: "553",
      dateNeeded: "2026-09-22",
      headcount: 4,
      trade: "Pipefitter",
      classification: "Journeyman",
      site: "Wood River",
      job: "Cat 2",
      actor: tom,
      at: "2026-09-18T14:00:00.000Z",
      id: "mr-cat2",
    });
    if ("error" in created) throw new Error(created.error);
    assert.equal(created.status, "open");
    assert.equal(created.headcount, 4);
    assert.equal(created.events[0]?.action, "created");
    assert.equal(created.events[0]?.actorEmail, TOM_FRIED_EMAIL);

    const chanceRespond = respondManpowerRequest(created, { fillCount: 3, fillDate: "2026-09-21", actor: chance });
    assert.deepEqual(chanceRespond, { error: "Hall seats respond to manpower requests." });

    const answered = respondManpowerRequest(created, {
      fillCount: 3,
      fillDate: "2026-09-21",
      actor: hall553,
      at: "2026-09-18T15:30:00.000Z",
    });
    if ("error" in answered) throw new Error(answered.error);
    assert.equal(answered.status, "responded");
    assert.equal(answered.fillCount, 3);
    assert.equal(answered.fillDate, "2026-09-21");
    assert.equal(answered.events.at(-1)?.action, "responded");
    assert.equal(answered.events.at(-1)?.actorEmail, JOHN_BATTUELLO_EMAIL);

    const person = createOnboardPerson({
      name: "Pat Fitter",
      localId: "553",
      phone: "618-555-0100",
      requestId: answered.id,
      actor: benny,
      id: "ob-pat-req",
    });
    if ("error" in person) throw new Error(person.error);
    assert.equal(person.requestId, "mr-cat2");
    assert.match(person.events[0]?.note ?? "", /request mr-cat2/);
  });
});
