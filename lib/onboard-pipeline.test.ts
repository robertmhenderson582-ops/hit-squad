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
  BATTUELLO_LAST_NAME,
  BENNY_CAMP_EMAIL,
  BENNY_CAMP_NAME,
  JOHN_BATTUELLO_EMAIL,
  JOHN_BATTUELLO_NAME,
  JOHNNY_BATTUELLO_NAME,
  ONBOARD_LOCALS,
  ONBOARD_SEED_SEATS,
  ONBOARD_STAGES,
  TOM_FRIED_EMAIL,
  canAdvanceOnboard,
  canCreateManpowerRequest,
  canRegisterOnboard,
  canRespondManpowerRequest,
  canSeeOnboardBoard,
  canSeeOnboardDoor,
  changeOnboardStage,
  createManpowerRequest,
  createOnboardPerson,
  hallContactForLocal,
  hallLocalForSeat,
  isBennyCampSeat,
  isHallSeat,
  isOnboardPhase1Local,
  isTomFriedSeat,
  nextOnboardStage,
  onboardStageOwner,
  parseOnboardFile,
  parseOnboardPerson,
  respondManpowerRequest,
  peopleByStage,
  selectableOnboardLocals,
  visibleOnboardPeople,
} from "./onboard-pipeline.ts";
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
const tom = { email: TOM_FRIED_EMAIL, role: "tester" as const, name: "Tom Fried", jobTitle: "HSE Dispatcher" };
const johnny = { email: JOHN_BATTUELLO_EMAIL, role: "tester" as const, name: JOHNNY_BATTUELLO_NAME, jobTitle: "Hall Local 553" };
const chance = { email: "chancec318@yahoo.com", role: "tester" as const, name: "Chance", jobTitle: "Quality Manager" };

describe("Hall ↔ HSE onboarding pipeline", () => {
  it("locks day-one locals, Benny-owned HSE stages, and P66 notify (not badge issued)", () => {
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
    assert.equal(BENNY_CAMP_NAME, "Benny Camp");
    assert.equal(BENNY_CAMP_EMAIL, "bccamp2@gmail.com");
    assert.equal(CONTROL_CENTER_TITLE, "Hit Squad Control Center");
    assert.equal(CONTROL_CENTER_CHROME, "HIT SQUAD CONTROL CENTER");
    assert.equal(BATTUELLO_LAST_NAME, "Battuello");
    assert.equal(JOHN_BATTUELLO_EMAIL, "jbattuello@ualocal553.org");
    assert.equal(JOHN_BATTUELLO_NAME, "John Battuello Jr.");
    assert.equal(JOHNNY_BATTUELLO_NAME, "Johnny Battuello Jr.");
    assert.deepEqual(hallContactForLocal("553"), {
      name: JOHN_BATTUELLO_NAME,
      email: JOHN_BATTUELLO_EMAIL,
      title: "Hall Local 553",
    });
    assert.equal(hallContactForLocal("363"), null);
    assert.deepEqual(
      ONBOARD_SEED_SEATS.map((row) => `${row.name}:${row.email}`),
      [`${JOHN_BATTUELLO_NAME}:${JOHN_BATTUELLO_EMAIL}`],
    );
    assert.deepEqual(
      ONBOARD_STAGES.map((row) => row.id),
      ["registered", "waiting-drug", "waiting-background", "techsolve", "notify-badge", "ready", "blocked"],
    );
    assert.equal(onboardStageOwner("waiting-drug"), BENNY_CAMP_NAME);
    assert.equal(onboardStageOwner("waiting-background"), BENNY_CAMP_NAME);
    assert.equal(onboardStageOwner("techsolve"), BENNY_CAMP_NAME);
    assert.equal(onboardStageOwner("notify-badge"), BENNY_CAMP_NAME);
    assert.match(ONBOARD_STAGES.find((row) => row.id === "notify-badge")?.label ?? "", /P66 badge notify/);
    assert.equal(/badge issued/i.test(ONBOARD_STAGES.find((row) => row.id === "notify-badge")?.label ?? ""), false);
    assert.equal(DEFAULT_ONBOARD_PLANT.site, "Wood River");
    assert.equal(DEFAULT_ONBOARD_PLANT.client, "Phillips 66");
    assert.equal(nextOnboardStage("registered"), "waiting-drug");
    assert.equal(nextOnboardStage("notify-badge"), "ready");
    assert.equal(nextOnboardStage("ready"), null);
  });

  it("gates hall register to one local and keeps Benny/HSE/Owner on the full board", () => {
    assert.equal(hallLocalForSeat(hall553), "553");
    assert.equal(hallLocalForSeat(johnny), "553");
    assert.equal(hallLocalForSeat(hall363), "363");
    assert.equal(isHallSeat(hall553), true);
    assert.equal(isHallSeat(wendell), false);
    assert.equal(isTomFriedSeat(tom), false);
    assert.equal(isBennyCampSeat(benny), true);
    assert.equal(canSeeOnboardBoard(owner), true);
    assert.equal(canSeeOnboardBoard(wendell), true);
    assert.equal(canSeeOnboardBoard(benny), true);
    assert.equal(canSeeOnboardBoard(nathan), true);
    assert.equal(canSeeOnboardBoard(hall553), true);
    assert.equal(canSeeOnboardBoard(chance), false);
    assert.equal(canRegisterOnboard(hall553), true);
    assert.equal(canAdvanceOnboard(owner), true);
    assert.equal(canAdvanceOnboard(novus), true);
    assert.equal(canAdvanceOnboard(wendell), true);
    assert.equal(canAdvanceOnboard(benny), true);
    assert.equal(canAdvanceOnboard(tom), false);
    assert.equal(canAdvanceOnboard(hall553), false);
    assert.equal(canAdvanceOnboard(nathan), false);
    assert.equal(canSeeOnboardDoor(owner, owner), true);
    assert.equal(canSeeOnboardDoor(wendell), true);
    assert.equal(canSeeOnboardDoor(benny), true);
    assert.equal(canSeeOnboardDoor(hall553), true);
    assert.equal(canSeeOnboardDoor(nathan), false);
    assert.equal(canSeeOnboardDoor(owner, nathan), false);
  });

  it("registers a person, advances with an append-only audit, and requires a block reason", () => {
    const created = createOnboardPerson({
      name: "Pat Fitter",
      localId: "553",
      classification: "Journeyman",
      actor: hall553,
      at: "2026-09-18T15:00:00.000Z",
      id: "ob-pat",
    });
    if ("error" in created) throw new Error(created.error);
    assert.equal(created.stage, "registered");
    assert.equal(created.craft, "Pipefitter");
    assert.equal(created.site, "Wood River");
    assert.equal(created.client, "Phillips 66");
    assert.equal(created.events.length, 1);
    assert.equal(created.events[0]?.fromStage, null);
    assert.equal(created.events[0]?.toStage, "registered");
    assert.equal(created.events[0]?.actorName, JOHN_BATTUELLO_NAME);

    const skipped = changeOnboardStage(created, { toStage: "techsolve", actor: owner });
    assert.equal("error" in skipped, true);

    const advanced = changeOnboardStage(created, {
      toStage: "waiting-drug",
      note: "Sent to clinic",
      actor: { ...benny, name: BENNY_CAMP_NAME },
      at: "2026-09-18T16:00:00.000Z",
    });
    if ("error" in advanced) throw new Error(advanced.error);
    assert.equal(advanced.stage, "waiting-drug");
    assert.equal(advanced.events.length, 2);
    assert.equal(advanced.events[1]?.fromStage, "registered");
    assert.equal(advanced.events[1]?.toStage, "waiting-drug");
    assert.equal(advanced.events[1]?.actorName, BENNY_CAMP_NAME);
    assert.equal(advanced.events[1]?.note, "Sent to clinic");
    assert.equal(created.events.length, 1);

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
    assert.equal(blocked.events.at(-1)?.fromStage, "waiting-drug");

    const hallOther = createOnboardPerson({ name: "Boiler Hand", localId: "363", actor: hall553 });
    assert.deepEqual(hallOther, { error: "Phase 1 is Local 553 only." });

    const impostor = createOnboardPerson({
      name: "Pat Fitter",
      localId: "553",
      actor: { email: "other@hall.org", name: "Other BA", jobTitle: "Hall Local 553" },
    });
    assert.deepEqual(impostor, { error: "Local 553 register is gated to jbattuello@ualocal553.org." });
  });

  it("hides the other local from a hall seat and groups the kanban by stage", () => {
    const fitter = createOnboardPerson({ name: "Pat Fitter", localId: "553", actor: hall553, id: "ob-553" });
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
    assert.equal(groups.registered.length, 2);
    assert.equal(groups["waiting-drug"].length, 0);
  });

  it("persists people in the memory vault and refuses to rewrite old events", async () => {
    resetOnboardForTests();
    useMemoryOnboard();
    const created = createOnboardPerson({
      name: "Pat Fitter",
      localId: "553",
      actor: hall553,
      id: "ob-pat",
      at: "2026-09-18T15:00:00.000Z",
    });
    if ("error" in created) throw new Error(created.error);
    await upsertOnboardPerson(created);
    const listed = await listOnboardPeople();
    assert.equal(listed[0]?.events[0]?.note, "Hall registered");
    const mutated = parseOnboardFile({
      people: [{ ...listed[0], events: [] }],
    });
    assert.equal(mutated.people[0]?.name, "Pat Fitter");
    assert.equal(listed[0]?.events.length, 1);
    resetOnboardForTests();
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
    assert.match(home, /CONTROL_CENTER_TITLE/);
    assert.match(hse, /Hit Squad Control Center/);
    assert.match(source("../app/onboard/layout.tsx"), /CONTROL_CENTER_TITLE/);
    const users = source("./users.ts");
    const roles = source("./job-roles.ts");
    assert.match(desk, /Hall register/);
    assert.match(desk, /P66 badge notify/);
    assert.match(desk, /Benny Camp/);
    assert.match(desk, /bccamp2@gmail.com/);
    assert.match(desk, /HSE dispatcher/);
    assert.match(source("../components/HseDesk.tsx"), /bccamp2@gmail.com/);
    assert.match(source("../components/ManageUsersDesk.tsx"), /bccamp2@gmail.com/);
    assert.match(desk, /John Battuello Jr/);
    assert.match(desk, /jbattuello@ualocal553.org/);
    assert.doesNotMatch(desk, /Petruello|Butuello/);
    assert.doesNotMatch(source("./onboard-pipeline.ts"), /Petruello|Butuello/);
    assert.match(desk, /Local 553 hall contact/);
    assert.match(desk, /Audit trail/);
    assert.doesNotMatch(desk, /friedt@madisonltd.com/);
    assert.doesNotMatch(desk, /tfried@madisonltd.com/);
    assert.doesNotMatch(source("../components/HseDesk.tsx"), /friedt@madisonltd.com/);
    assert.doesNotMatch(source("../components/ManageUsersDesk.tsx"), /friedt@madisonltd.com/);
    assert.match(desk, /Manpower request/);
    assert.match(desk, /Hall manpower inbox/);
    assert.match(desk, /hiring package/);
    assert.match(desk, /No email blast/);
    assert.doesNotMatch(desk, /Local 363|BM363/);
    assert.doesNotMatch(desk, /\bSMS\b|Twilio|Zoom|Teams/i);
    assert.doesNotMatch(api, /\bSMS\b|Twilio|Zoom|Teams|nodemailer|sendMail|mailto:/i);
    assert.match(api, /create-request/);
    assert.match(api, /respond-request/);
    assert.match(home, /ONBOARD_DOOR/);
    assert.match(home, /\/onboard/);
    assert.match(hse, /href="\/onboard"/);
    assert.match(drive, /onboard-people\.json/);
    assert.doesNotMatch(drive, /DRIVE_ONBOARD_PEOPLE_FILE_ID = "1/);
    assert.match(users, /ONBOARD_SEED_SEATS/);
    assert.doesNotMatch(users, /madisonltd\.com/);
    assert.match(roles, /PARKED_HALL_JOB_ROLES/);
    assert.match(roles, /Hall Local 363/);
    assert.doesNotMatch(source("./tester-seats.ts"), /friedt@|jbattuello@|tfried@/);
  });

  it("lets Benny create a Local 553 manpower request and John respond before register", () => {
    assert.equal(canCreateManpowerRequest(benny), true);
    assert.equal(canCreateManpowerRequest(tom), false);
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
    assert.deepEqual(hallCreate, { error: "Manpower requests are created by Benny / HSE." });

    const created = createManpowerRequest({
      localId: "553",
      dateNeeded: "2026-09-22",
      headcount: 4,
      trade: "Pipefitter",
      classification: "Journeyman",
      site: "Wood River",
      job: "Cat 2",
      actor: benny,
      at: "2026-09-18T14:00:00.000Z",
      id: "mr-cat2",
    });
    if ("error" in created) throw new Error(created.error);
    assert.equal(created.status, "open");
    assert.equal(created.headcount, 4);
    assert.equal(created.events[0]?.action, "created");
    assert.equal(created.events[0]?.actorEmail, BENNY_CAMP_EMAIL);

    const tomRespond = respondManpowerRequest(created, { fillCount: 3, fillDate: "2026-09-21", actor: tom });
    assert.deepEqual(tomRespond, { error: "Hall seats respond to manpower requests." });

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
      requestId: answered.id,
      actor: hall553,
      id: "ob-pat-req",
    });
    if ("error" in person) throw new Error(person.error);
    assert.equal(person.requestId, "mr-cat2");
    assert.match(person.events[0]?.note ?? "", /request mr-cat2/);
  });
});
