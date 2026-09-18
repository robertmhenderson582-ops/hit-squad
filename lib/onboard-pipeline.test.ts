import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { NOVUS_EMAIL } from "./desk-role.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import {
  DEFAULT_ONBOARD_PLANT,
  ONBOARD_LOCALS,
  ONBOARD_STAGES,
  TOM_FRIED_NAME,
  TOM_FRIED_TITLE,
  canAdvanceOnboard,
  canRegisterOnboard,
  canSeeOnboardBoard,
  canSeeOnboardDoor,
  changeOnboardStage,
  createOnboardPerson,
  hallLocalForSeat,
  isHallSeat,
  isTomFriedSeat,
  nextOnboardStage,
  onboardStageOwner,
  parseOnboardFile,
  peopleByStage,
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
const hall553 = { email: "hall553@example.com", role: "tester" as const, name: "UA 553 BA", jobTitle: "Hall Local 553" };
const hall363 = { email: "hall363@example.com", role: "tester" as const, name: "BM 363 BA", jobTitle: "Hall Local 363" };
const tom = { email: "", role: "tester" as const, name: TOM_FRIED_NAME, jobTitle: TOM_FRIED_TITLE };
const chance = { email: "chancec318@yahoo.com", role: "tester" as const, name: "Chance", jobTitle: "Quality Manager" };

describe("Hall ↔ HSE onboarding pipeline", () => {
  it("locks day-one locals, Tom-owned HSE stages, and P66 notify (not badge issued)", () => {
    assert.deepEqual(
      ONBOARD_LOCALS.map((row) => `${row.id}:${row.short}`),
      ["553:PF553", "363:BM363"],
    );
    assert.deepEqual(
      ONBOARD_STAGES.map((row) => row.id),
      ["registered", "waiting-drug", "waiting-background", "techsolve", "notify-badge", "ready", "blocked"],
    );
    assert.equal(onboardStageOwner("waiting-drug"), TOM_FRIED_NAME);
    assert.equal(onboardStageOwner("waiting-background"), TOM_FRIED_NAME);
    assert.equal(onboardStageOwner("techsolve"), TOM_FRIED_NAME);
    assert.equal(onboardStageOwner("notify-badge"), TOM_FRIED_NAME);
    assert.match(ONBOARD_STAGES.find((row) => row.id === "notify-badge")?.label ?? "", /P66 badge notify/);
    assert.equal(/badge issued/i.test(ONBOARD_STAGES.find((row) => row.id === "notify-badge")?.label ?? ""), false);
    assert.equal(DEFAULT_ONBOARD_PLANT.site, "Wood River");
    assert.equal(DEFAULT_ONBOARD_PLANT.client, "Phillips 66");
    assert.equal(nextOnboardStage("registered"), "waiting-drug");
    assert.equal(nextOnboardStage("notify-badge"), "ready");
    assert.equal(nextOnboardStage("ready"), null);
  });

  it("gates hall register to one local and keeps Tom/HSE/Owner on the full board", () => {
    assert.equal(hallLocalForSeat(hall553), "553");
    assert.equal(hallLocalForSeat(hall363), "363");
    assert.equal(isHallSeat(hall553), true);
    assert.equal(isHallSeat(wendell), false);
    assert.equal(isTomFriedSeat(tom), true);
    assert.equal(canSeeOnboardBoard(owner), true);
    assert.equal(canSeeOnboardBoard(wendell), true);
    assert.equal(canSeeOnboardBoard(nathan), true);
    assert.equal(canSeeOnboardBoard(hall553), true);
    assert.equal(canSeeOnboardBoard(chance), false);
    assert.equal(canRegisterOnboard(hall553), true);
    assert.equal(canAdvanceOnboard(owner), true);
    assert.equal(canAdvanceOnboard(novus), true);
    assert.equal(canAdvanceOnboard(wendell), true);
    assert.equal(canAdvanceOnboard(tom), true);
    assert.equal(canAdvanceOnboard(hall553), false);
    assert.equal(canAdvanceOnboard(nathan), false);
    assert.equal(canSeeOnboardDoor(owner, owner), true);
    assert.equal(canSeeOnboardDoor(wendell), true);
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
    assert.equal(created.events[0]?.actorName, "UA 553 BA");

    const skipped = changeOnboardStage(created, { toStage: "techsolve", actor: owner });
    assert.equal("error" in skipped, true);

    const advanced = changeOnboardStage(created, {
      toStage: "waiting-drug",
      note: "Sent to clinic",
      actor: { ...owner, name: TOM_FRIED_NAME },
      at: "2026-09-18T16:00:00.000Z",
    });
    if ("error" in advanced) throw new Error(advanced.error);
    assert.equal(advanced.stage, "waiting-drug");
    assert.equal(advanced.events.length, 2);
    assert.equal(advanced.events[1]?.fromStage, "registered");
    assert.equal(advanced.events[1]?.toStage, "waiting-drug");
    assert.equal(advanced.events[1]?.actorName, TOM_FRIED_NAME);
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
    assert.deepEqual(hallOther, { error: "Hall seats can only register Local 553." });
  });

  it("hides the other local from a hall seat and groups the kanban by stage", () => {
    const fitter = createOnboardPerson({ name: "Pat Fitter", localId: "553", actor: hall553, id: "ob-553" });
    const boiler = createOnboardPerson({ name: "Boiler Hand", localId: "363", actor: hall363, id: "ob-363" });
    if ("error" in fitter || "error" in boiler) throw new Error("seed");
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
    assert.match(desk, /Hall register/);
    assert.match(desk, /P66 badge notify/);
    assert.match(desk, /Tom Fried/);
    assert.match(desk, /Audit trail/);
    assert.doesNotMatch(desk, /\bSMS\b|Twilio|Zoom|Teams/i);
    assert.doesNotMatch(api, /\bSMS\b|Twilio|Zoom|Teams/i);
    assert.match(home, /ONBOARD_DOOR/);
    assert.match(home, /\/onboard/);
    assert.match(hse, /href="\/onboard"/);
    assert.match(drive, /onboard-people\.json/);
    assert.doesNotMatch(drive, /DRIVE_ONBOARD_PEOPLE_FILE_ID = "1/);
  });
});
