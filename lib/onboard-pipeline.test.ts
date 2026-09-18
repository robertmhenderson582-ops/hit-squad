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
  TEKSOLV_LOCATION,
  TEKSOLV_NAME,
  TOM_FRIED_EMAIL,
  TOM_FRIED_NAME,
  TOM_FRIED_TITLE,
  canAdvanceOnboard,
  canCreateManpowerRequest,
  canManageOnboardHalls,
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
  isCompanyOnboardWriter,
  isHallSeat,
  isOnboardPhase1Local,
  isTomFriedSeat,
  formatSsnInput,
  maskSsnLast4,
  nextOnboardStage,
  normalizeOnboardStageId,
  onboardStageOwner,
  parseOnboardFile,
  parseOnboardHallInput,
  parseOnboardPerson,
  parseOnboardSettings,
  seedOnboardHalls,
  parseSsn,
  parseSsnLast4,
  parseStoredOnboardSsn,
  redactOnboardPerson,
  respondManpowerRequest,
  peopleByStage,
  selectableOnboardLocals,
  updateOnboardPerson,
  visibleOnboardPeople,
} from "./onboard-pipeline.ts";
import { buildStepCompleteMail } from "./onboard-notify.ts";
import { listOnboardHalls, listOnboardPeople, resetOnboardForTests, saveOnboardHall, upsertOnboardPerson, useMemoryOnboard } from "./onboard-vault.ts";

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
  it("locks day-one locals, Benny dictation stages, TekSolv, and DISA DER Tom", () => {
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
    assert.equal(TEKSOLV_NAME, "TekSolv");
    assert.equal(TEKSOLV_LOCATION, "Collinsville, Illinois");
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
    assert.match(ONBOARD_STAGES.find((row) => row.id === "step-3")?.label ?? "", /TekSolv/);
    assert.match(ONBOARD_STAGES.find((row) => row.id === "step-5")?.label ?? "", /TekSolv/);
    assert.match(ONBOARD_STAGES.find((row) => row.id === "step-4")?.label ?? "", /Hire-end outreach/);
    assert.match(ONBOARD_STAGES.find((row) => row.id === "step-5")?.label ?? "", /Badged/);
    assert.equal(onboardStageOwner("step-5"), `${TEKSOLV_NAME} / P66`);
    assert.match(
      source("./onboard-pipeline.ts"),
      /Training vendor spelling lock: TekSolv \(official teksolv\.com brand\)\. Prior lock used Tecsolv; do not use Texolve \/ TechSolve\./,
    );
    assert.doesNotMatch(source("./onboard-pipeline.ts"), /TECSOLV_|export const TECSOLV|alternate spelling pending confirm/);
    assert.doesNotMatch(source("./onboard-notify.ts"), /Tecsolv|TECSOLV|Texolve|TechSolve|TEXOLVE|TECHSOLV/);
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
    assert.equal(parseSsn("123-45-6789"), "123456789");
    assert.equal(parseSsn("6789"), "");
    assert.equal(parseSsnLast4("123-45-6789"), "6789");
    assert.equal(maskSsnLast4("6789"), "•••-••-6789");
    assert.equal(maskSsnLast4("123456789"), "•••-••-6789");
    assert.equal(formatSsnInput("123456789"), "123-45-6789");
    assert.equal(formatSsnInput("6789"), "6789");
    assert.equal(formatSsnInput("12345"), "123-45");
    assert.deepEqual(parseStoredOnboardSsn({ ssnLast4: "6789" }), { ssn: "", ssnLast4: "6789" });
    assert.deepEqual(parseStoredOnboardSsn({ ssn: "123-45-6789" }), { ssn: "123456789", ssnLast4: "6789" });
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
    assert.equal(canRegisterOnboard(owner), true);
    assert.equal(canRegisterOnboard(nathan), true);
    assert.equal(canRegisterOnboard(wendell), true);
    assert.equal(canRegisterOnboard(chance), false);
    assert.equal(canRegisterOnboard(debbie), false);
    assert.equal(isCompanyOnboardWriter(nathan), true);
    assert.equal(isCompanyOnboardWriter(wendell), true);
    assert.equal(isCompanyOnboardWriter(hall553), false);
    assert.equal(canManageOnboardHalls(owner), true);
    assert.equal(canManageOnboardHalls(nathan), true);
    assert.equal(canManageOnboardHalls(wendell), true);
    assert.equal(canManageOnboardHalls(benny), true);
    assert.equal(canManageOnboardHalls(tom), true);
    assert.equal(canManageOnboardHalls(hall553), false);
    assert.equal(canManageOnboardHalls(chance), false);
    assert.equal(canManageOnboardHalls(debbie), false);
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
      { legalName: "Patricia Fitter", dateOfBirth: "1990-01-02", ssn: "123-45-6789", identityVerified: true },
      tom,
      "2026-09-18T16:05:00.000Z",
    );
    if ("error" in verified) throw new Error(verified.error);
    assert.equal(verified.legalName, "Patricia Fitter");
    assert.equal(verified.ssn, "123456789");
    assert.equal(verified.ssnLast4, "6789");
    assert.equal(verified.identityVerifiedBy, TOM_FRIED_NAME);
    assert.match(verified.events.at(-1)?.note ?? "", /Legal name \/ DOB \/ SSN verified/);
    assert.doesNotMatch(verified.events.at(-1)?.note ?? "", /123456789|123-45-6789|SSN last 4/);
    const hallView = redactOnboardPerson(verified, hall553);
    assert.equal(hallView.ssn, "");
    assert.equal(hallView.ssnLast4, "");
    assert.equal(hallView.legalName, "");
    const nathanPii = updateOnboardPerson(advanced, { ssn: "123-45-6789" }, nathan);
    assert.deepEqual(nathanPii, { error: "Restricted PII and training statuses are least-privilege." });
    const hallPii = updateOnboardPerson(advanced, { ssn: "123-45-6789" }, hall553);
    assert.deepEqual(hallPii, { error: "Tracker fields are updated by Tom Fried, Debbie, or the outreach team." });

    const last4Only = parseOnboardPerson({
      id: "ob-legacy-ssn",
      name: "Legacy Hand",
      localId: "553",
      ssnLast4: "4321",
    });
    if (!last4Only) throw new Error("legacy ssn");
    assert.equal(last4Only.ssn, "");
    assert.equal(last4Only.ssnLast4, "4321");
    const upgraded = updateOnboardPerson(last4Only, { ssn: "987-65-4321" }, tom);
    if ("error" in upgraded) throw new Error(upgraded.error);
    assert.equal(upgraded.ssn, "987654321");
    assert.equal(upgraded.ssnLast4, "4321");
    assert.match(upgraded.events.at(-1)?.note ?? "", /SSN updated/);
    assert.doesNotMatch(upgraded.events.at(-1)?.note ?? "", /987654321|987-65-4321/);
    const keepFull = updateOnboardPerson(upgraded, { ssnLast4: "4321", identityVerified: true }, tom);
    if ("error" in keepFull) throw new Error(keepFull.error);
    assert.equal(keepFull.ssn, "987654321");
    assert.equal(keepFull.ssnLast4, "4321");
    const incomplete = updateOnboardPerson(upgraded, { ssn: "98765" }, tom);
    assert.deepEqual(incomplete, { error: "Enter a full 9-digit Social Security number." });

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
    assert.deepEqual(hallOther, { error: "That local is not phase-one yet." });

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
    const finished = buildStepCompleteMail(person, "step-5", settings, benny, "2026-09-18T15:00:00.000Z");
    if ("skipped" in finished) throw new Error(finished.skipped);
    assert.match(finished.text, /Onboarding pipeline complete at TekSolv, Collinsville, Illinois/);
    assert.doesNotMatch(finished.text, /Tecsolv|Texolve|TechSolve/);
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
    assert.match(page, /titleBrand/);
    assert.match(page, /controlCenterBrandForUser/);
    assert.match(api, /controlCenterBrandForUser/);
    assert.match(api, /listCompanies/);
    assert.match(desk, /Hall ↔ HSE/);
    assert.doesNotMatch(desk, /CONTROL_CENTER_TITLE/);
    assert.match(home, /label: "Dispatch"/);
    assert.match(home, /key: "dispatch"/);
    assert.match(home, /Hiring \+ HSE onboarding board/);
    assert.match(hse, /Hit Squad Control Center/);
    assert.match(source("../app/onboard/layout.tsx"), /CONTROL_CENTER_TITLE/);
    const users = source("./users.ts");
    const roles = source("./job-roles.ts");
    assert.match(desk, /Hall register/);
    assert.match(desk, /Submitted to DISA DER/);
    assert.match(desk, /TEKSOLV_NAME/);
    assert.match(desk, /TEKSOLV_LOCATION/);
    assert.doesNotMatch(desk, /Tecsolv|TECSOLV|Texolve|TechSolve|TEXOLVE|TECHSOLV|alternate spelling pending confirm/);
    assert.match(hse, /Training is \{TEKSOLV_NAME\}, \{TEKSOLV_LOCATION\}/);
    assert.doesNotMatch(hse, /Tecsolv|TECSOLV|Texolve|TechSolve/);
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
    assert.match(desk, /placeholder="XXX-XX-XXXX"/);
    assert.match(desk, /maxLength=\{11\}/);
    assert.match(desk, /Restricted PII/);
    assert.match(desk, /full SSN/);
    assert.doesNotMatch(desk, /placeholder="SSN last 4"|maxLength=\{4\}/);
    assert.doesNotMatch(desk, /console\.(log|debug|info|warn)/);
    assert.match(api, /ssn: body\.ssn \?\? body\.ssnLast4/);
    assert.match(source("./onboard-pipeline.ts"), /RESTRICTED PII\. Digits-only 9-digit/);
    assert.match(desk, /Debbie/);
    assert.match(desk, /Ben Peffley/);
    assert.doesNotMatch(desk, /Local 363|BM363/);
    assert.doesNotMatch(desk, /\bSMS\b|Twilio|Zoom|Teams/i);
    assert.doesNotMatch(api, /\bSMS\b|Twilio|Zoom|Teams|nodemailer|sendMail|mailto:/i);
    assert.match(api, /create-request/);
    assert.match(api, /respond-request/);
    assert.match(api, /update-tracker/);
    assert.match(api, /save-settings/);
    assert.match(api, /save-hall/);
    assert.match(api, /canManageHalls/);
    assert.match(desk, />Halls</);
    assert.match(desk, /Add hall/);
    assert.match(desk, /Phase-one on/);
    assert.match(desk, /Company working-desk, PM, HSE/);
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
    assert.deepEqual(blockedLocal, { error: "That local is not phase-one yet." });

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

  it("migrates 553 + 363 into the vault and lets company users add a Teamsters hall", async () => {
    const seeded = seedOnboardHalls();
    assert.deepEqual(
      seeded.map((row) => `${row.id}:${row.phase1}:${row.contactEmail}`),
      ["553:true:jbattuello@ualocal553.org", "363:false:"],
    );
    const empty = parseOnboardFile({});
    assert.deepEqual(
      empty.halls.map((row) => row.id),
      ["363", "553"],
    );
    assert.equal(empty.halls.find((row) => row.id === "553")?.contactEmail, JOHN_BATTUELLO_EMAIL);
    assert.equal(empty.halls.find((row) => row.id === "363")?.phase1, false);

    const added = parseOnboardHallInput({
      localNumber: "682",
      label: "Teamsters Local 682",
      craft: "Teamster",
      union: "IBT",
      contactName: "Jane Hall",
      contactEmail: "jane@teamsters682.org",
      jobTitle: "Hall Local 682",
      phase1: true,
    });
    if ("error" in added) throw new Error(added.error);
    const file = parseOnboardFile({ halls: [added] });
    assert.deepEqual(
      file.halls.map((row) => row.id),
      ["363", "553", "682"],
    );
    assert.deepEqual(
      selectableOnboardLocals(file.halls).map((row) => row.id),
      ["553", "682"],
    );
    assert.equal(hallLocalForSeat({ email: "jane@teamsters682.org", name: "Jane Hall" }, file.halls), "682");
    assert.equal(isHallSeat({ email: "jane@teamsters682.org" }, file.halls), true);
    assert.equal(isHallSeat({ jobTitle: "Hall Local 682", name: "Jane Hall" }, file.halls), true);
    assert.equal(hallContactForLocal("682", file.halls)?.email, "jane@teamsters682.org");
    assert.equal(hallLocalForSeat(hall553, file.halls), "553");
    assert.equal(hallContactForLocal("553", file.halls)?.email, JOHN_BATTUELLO_EMAIL);

    const parked = createOnboardPerson({
      name: "Boiler Hand",
      localId: "363",
      phone: "618-555-0101",
      actor: nathan,
      halls: file.halls,
    });
    assert.deepEqual(parked, { error: "That local is not phase-one yet." });

    const teamster = createOnboardPerson({
      name: "Pat Teamster",
      localId: "682",
      phone: "618-555-0182",
      actor: nathan,
      halls: file.halls,
      id: "ob-682",
    });
    if ("error" in teamster) throw new Error(teamster.error);
    assert.equal(teamster.craft, "Teamster");
    assert.equal(teamster.localId, "682");

    resetOnboardForTests();
    useMemoryOnboard();
    const listed = await listOnboardHalls();
    assert.deepEqual(
      listed.map((row) => `${row.id}:${row.phase1}`),
      ["363:false", "553:true"],
    );
    await saveOnboardHall(added);
    const next = await listOnboardHalls();
    assert.equal(next.find((row) => row.id === "682")?.contactEmail, "jane@teamsters682.org");
    assert.equal(next.find((row) => row.id === "553")?.contactEmail, JOHN_BATTUELLO_EMAIL);
    assert.equal(next.find((row) => row.id === "363")?.phase1, false);
    resetOnboardForTests();
  });
});
