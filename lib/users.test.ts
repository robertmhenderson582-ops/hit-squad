import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, test } from "node:test";
import { readSeatClaim, signSeatClaim } from "./auth.ts";
import { NOVUS_EMAIL } from "./desk-role.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { hasForbiddenSeed } from "./tester-seats.ts";
import { JOSEPH_EMAIL, SHANE_EMAIL, TESTER_SEATS } from "./tester-seats.ts";
import { assignedCompany, resetCompanyAssignmentsForTests } from "./companies-store.ts";
import { canUseRateBuilder, canUseViewAs } from "./desk-role.ts";
import { memoryDrive } from "./drive-estimates.ts";
import {
  claimFirstPassword,
  createSeat,
  findUserByEmail,
  flushSeatVault,
  forgetSeatCacheForTests,
  GENERIC_SIGNIN_ERROR,
  hydrateSeatStore,
  issueSeatPassword,
  loginOutcome,
  listSeatRows,
  parseExtraSeats,
  resetUsersForTests,
  restoreSeatHash,
  seatHashClaimFor,
  seatNeedsPasswordCreate,
  setOwnPassword,
  useSeatVaultForTests,
  verifyPassword,
} from "./users.ts";

const OWNER_SECRET = "owner-seat-secret-xx";
const CHOSEN = "chosen-seat-secret";
const ISSUED = "issued-seat-secret";
const OTHER = "other-seat-secret";
const SHORT = "short7";
const TESTER = "nathanboyte@gmail.com";
const UNKNOWN = "not-on-this-desk@example.com";

const dir = mkdtempSync(join(tmpdir(), "hs-seats-"));
const seatFile = join(dir, "seats.json");
const companyFile = join(dir, "companies.json");

process.env.OWNER_PASSWORD = OWNER_SECRET;
process.env.OWNER_EMAIL = OWNER_LOGIN_EMAIL;
process.env.SEAT_PASSWORD_PATH = seatFile;
process.env.COMPANY_ASSIGNMENT_PATH = companyFile;
process.env.AUTH_SECRET = "test-auth-secret-16chars";

function wipePersisted() {
  if (existsSync(seatFile)) unlinkSync(seatFile);
  resetUsersForTests();
  resetCompanyAssignmentsForTests();
}

beforeEach(() => {
  wipePersisted();
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("owner email never enters the create-password path", () => {
  assert.equal(seatNeedsPasswordCreate(OWNER_LOGIN_EMAIL), false);
  assert.equal(seatNeedsPasswordCreate("  RobertMHenderson582@gmail.com "), false);

  const probe = loginOutcome({ email: OWNER_LOGIN_EMAIL });
  assert.equal(probe.status, "needsPassword");

  const claimed = claimFirstPassword(OWNER_LOGIN_EMAIL, CHOSEN, CHOSEN);
  assert.equal("error" in claimed, true);
  if ("error" in claimed) {
    assert.equal(claimed.status, 401);
    assert.equal(claimed.error, GENERIC_SIGNIN_ERROR);
  }

  const steal = loginOutcome({
    email: OWNER_LOGIN_EMAIL,
    newPassword: CHOSEN,
    confirmPassword: CHOSEN,
  });
  assert.equal(steal.status, "error");
  if (steal.status === "error") {
    assert.equal(steal.http, 401);
    assert.equal(steal.error, GENERIC_SIGNIN_ERROR);
  }

  const ok = loginOutcome({ email: OWNER_LOGIN_EMAIL, password: OWNER_SECRET });
  assert.equal(ok.status, "authenticated");
  if (ok.status === "authenticated") {
    assert.equal(ok.user.role, "owner");
    assert.equal(ok.user.email, OWNER_LOGIN_EMAIL);
    assert.equal(ok.user.mustChangePassword, false);
  }

  assert.equal(seatNeedsPasswordCreate(OWNER_LOGIN_EMAIL), false);
  assert.equal(verifyPassword(findUserByEmail(OWNER_LOGIN_EMAIL)!, OWNER_SECRET), true);
});

test("Shane Smith is a tester seat that must create a password on first visit", () => {
  const shane = findUserByEmail("Shane@APControlsLLC.com");
  assert.ok(shane);
  assert.equal(shane.id, "tester-shane");
  assert.equal(shane.email, SHANE_EMAIL);
  assert.equal(shane.name, "Shane Smith");
  assert.equal(shane.role, "tester");
  assert.equal(shane.mustChangePassword, true);
  assert.equal(shane.passwordHash, undefined);
  assert.equal(seatNeedsPasswordCreate(SHANE_EMAIL), true);
  assert.equal(loginOutcome({ email: SHANE_EMAIL }).status, "needsCreate");
  assert.equal(findUserByEmail("beechj@madisonltd.com"), undefined);
});

test("unissued invited email plus ack creates a password and session user", () => {
  assert.equal(seatNeedsPasswordCreate(TESTER), true);
  assert.equal(loginOutcome({ email: TESTER }).status, "needsCreate");

  const skipped = loginOutcome({ email: TESTER, password: CHOSEN });
  assert.equal(skipped.status, "error");
  assert.equal(seatNeedsPasswordCreate(TESTER), true);

  const created = loginOutcome({
    email: TESTER,
    newPassword: CHOSEN,
    confirmPassword: CHOSEN,
  });
  assert.equal(created.status, "authenticated");
  if (created.status === "authenticated") {
    assert.equal(created.user.email, TESTER);
    assert.equal(created.user.role, "tester");
    assert.equal(created.user.mustChangePassword, false);
  }

  assert.equal(seatNeedsPasswordCreate(TESTER), false);
  const stored = findUserByEmail(TESTER);
  assert.ok(stored);
  assert.equal(verifyPassword(stored, CHOSEN), true);

  const again = loginOutcome({ email: TESTER, password: CHOSEN });
  assert.equal(again.status, "authenticated");
  if (again.status === "authenticated") {
    assert.equal(again.user.mustChangePassword, false);
  }

  const persisted = readFileSync(seatFile, "utf8");
  assert.equal(persisted.includes(CHOSEN), false);
  assert.equal(persisted.includes(OWNER_SECRET), false);
  assert.match(persisted, /"passwordHash"/);

  const changed = setOwnPassword(TESTER, OTHER, CHOSEN);
  assert.equal("ok" in changed, true);
  assert.equal(verifyPassword(findUserByEmail(TESTER)!, OTHER), true);
});

test("already-issued email still needs the current password", () => {
  const issued = issueSeatPassword(TESTER, ISSUED);
  assert.equal("ok" in issued, true);
  assert.equal(seatNeedsPasswordCreate(TESTER), false);
  assert.equal(loginOutcome({ email: TESTER }).status, "needsPassword");

  const steal = loginOutcome({
    email: TESTER,
    newPassword: CHOSEN,
    confirmPassword: CHOSEN,
  });
  assert.equal(steal.status, "error");
  if (steal.status === "error") {
    assert.equal(steal.error, GENERIC_SIGNIN_ERROR);
  }

  const missing = loginOutcome({ email: TESTER, password: CHOSEN });
  assert.equal(missing.status, "error");
  if (missing.status === "error") {
    assert.equal(missing.error, GENERIC_SIGNIN_ERROR);
  }

  const ok = loginOutcome({ email: TESTER, password: ISSUED });
  assert.equal(ok.status, "authenticated");
  if (ok.status === "authenticated") {
    assert.equal(ok.user.mustChangePassword, true);
  }
  assert.equal(verifyPassword(findUserByEmail(TESTER)!, ISSUED), true);
});

test("unknown email fails generically and does not open create-password", () => {
  assert.equal(seatNeedsPasswordCreate(UNKNOWN), false);
  assert.equal(loginOutcome({ email: UNKNOWN }).status, "needsPassword");

  const probeClaim = loginOutcome({
    email: UNKNOWN,
    newPassword: CHOSEN,
    confirmPassword: CHOSEN,
  });
  assert.equal(probeClaim.status, "error");
  if (probeClaim.status === "error") {
    assert.equal(probeClaim.error, GENERIC_SIGNIN_ERROR);
    assert.equal(probeClaim.http, 401);
  }

  const login = loginOutcome({ email: UNKNOWN, password: CHOSEN });
  assert.equal(login.status, "error");
  if (login.status === "error") {
    assert.equal(login.error, GENERIC_SIGNIN_ERROR);
  }
});

test("password shorter than 8 is rejected on first-login create", () => {
  assert.equal(seatNeedsPasswordCreate(TESTER), true);
  const result = claimFirstPassword(TESTER, SHORT, SHORT);
  assert.equal("error" in result, true);
  if ("error" in result) {
    assert.equal(result.status, 400);
    assert.equal(result.error, "Password must be 8+.");
  }
  assert.equal(seatNeedsPasswordCreate(TESTER), true);
  assert.equal(loginOutcome({ email: TESTER }).status, "needsCreate");
});

test("confirm mismatch is rejected on first-login create", () => {
  assert.equal(seatNeedsPasswordCreate(TESTER), true);
  const result = claimFirstPassword(TESTER, CHOSEN, OTHER);
  assert.equal("error" in result, true);
  if ("error" in result) {
    assert.equal(result.status, 400);
    assert.equal(result.error, "New password and confirm did not match.");
  }
  assert.equal(seatNeedsPasswordCreate(TESTER), true);
});

test("claimed hash still needsPassword after the seat file is wiped when the browser claim restores", async () => {
  const created = loginOutcome({
    email: TESTER,
    newPassword: CHOSEN,
    confirmPassword: CHOSEN,
  });
  assert.equal(created.status, "authenticated");
  const claim = seatHashClaimFor(TESTER);
  assert.ok(claim);
  assert.equal(claim.email, TESTER);
  assert.equal(claim.passwordHash.includes(CHOSEN), false);
  assert.match(claim.passwordHash, /^\$2[abxy]\$/);

  const token = await signSeatClaim(claim);
  const readBack = await readSeatClaim(token);
  assert.ok(readBack);
  assert.equal(readBack.email, TESTER);
  assert.equal(readBack.passwordHash, claim.passwordHash);

  unlinkSync(seatFile);
  resetUsersForTests();
  assert.equal(existsSync(seatFile), false);
  assert.equal(loginOutcome({ email: TESTER }).status, "needsCreate");

  assert.equal(restoreSeatHash(TESTER, readBack), true);
  assert.equal(loginOutcome({ email: TESTER }).status, "needsPassword");
  const ok = loginOutcome({ email: TESTER, password: CHOSEN });
  assert.equal(ok.status, "authenticated");
  if (ok.status === "authenticated") {
    assert.equal(ok.user.role, "tester");
    assert.equal(ok.user.mustChangePassword, false);
  }
  assert.equal(verifyPassword(findUserByEmail(TESTER)!, CHOSEN), true);

  resetUsersForTests();
  assert.equal(loginOutcome({ email: TESTER }).status, "needsPassword");

  assert.equal(seatHashClaimFor(OWNER_LOGIN_EMAIL), null);
  assert.equal(
    restoreSeatHash(OWNER_LOGIN_EMAIL, {
      email: OWNER_LOGIN_EMAIL,
      passwordHash: claim.passwordHash,
    }),
    false,
  );
  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL }).status, "needsPassword");
  const owner = loginOutcome({ email: OWNER_LOGIN_EMAIL, password: OWNER_SECRET });
  assert.equal(owner.status, "authenticated");
  if (owner.status === "authenticated") {
    assert.equal(owner.user.role, "owner");
  }

  assert.equal(restoreSeatHash(UNKNOWN, { email: UNKNOWN, passwordHash: claim.passwordHash }), false);
  assert.equal(loginOutcome({ email: UNKNOWN }).status, "needsPassword");
  assert.equal(restoreSeatHash(TESTER, { email: NOVUS_EMAIL, passwordHash: claim.passwordHash }), false);
});

test("keeps a tester hash after the local cache is wiped", async () => {
  const drive = memoryDrive();
  useSeatVaultForTests(drive);
  const created = loginOutcome({
    email: TESTER,
    newPassword: CHOSEN,
    confirmPassword: CHOSEN,
  });
  assert.equal(created.status, "authenticated");
  await flushSeatVault();
  forgetSeatCacheForTests();
  useSeatVaultForTests(drive);
  await hydrateSeatStore();
  assert.equal(loginOutcome({ email: TESTER }).status, "needsPassword");
  const ok = loginOutcome({ email: TESTER, password: CHOSEN });
  assert.equal(ok.status, "authenticated");
  assert.equal(verifyPassword(findUserByEmail(TESTER)!, CHOSEN), true);
  const vaultRaw = [...drive.files.values()].map((row) => row.content).join();
  assert.equal(vaultRaw.includes(CHOSEN), false);
  assert.equal(vaultRaw.includes(OWNER_SECRET), false);
  assert.match(vaultRaw, /"passwordHash"/);
});

test("Novus can create a password only when no hash exists", () => {
  assert.equal(seatNeedsPasswordCreate(NOVUS_EMAIL), true);
  const created = loginOutcome({
    email: NOVUS_EMAIL,
    newPassword: CHOSEN,
    confirmPassword: CHOSEN,
  });
  assert.equal(created.status, "authenticated");
  if (created.status === "authenticated") {
    assert.equal(created.user.role, "operator");
    assert.equal(created.user.mustChangePassword, false);
  }
  assert.equal(seatNeedsPasswordCreate(NOVUS_EMAIL), false);
});

const ADDED = "added.tester@example.com";

test("owner can add a tester login that must change password on first sign-in", async () => {
  const created = await createSeat({
    name: "Added Tester",
    email: "  Added.Tester@example.com ",
    password: ISSUED,
  });
  assert.equal("ok" in created, true);
  if (!("ok" in created)) return;

  const user = findUserByEmail(ADDED);
  assert.ok(user);
  assert.equal(user.role, "tester");
  assert.equal(user.name, "Added Tester");
  assert.equal(user.mustChangePassword, true);
  assert.match(user.id, /^custom-/);
  assert.equal(TESTER_SEATS.some((row) => row.email === ADDED), false);
  assert.equal(await assignedCompany(ADDED), "hitsquad");
  assert.equal(canUseRateBuilder(user), true);
  assert.equal(canUseViewAs(user), false);
  assert.equal(canUseRateBuilder({ email: JOSEPH_EMAIL, role: "tester" }), false);

  const rows = await listSeatRows();
  assert.equal(rows.some((row) => row.email === ADDED && row.passwordIssued && row.companyId === "hitsquad"), true);

  const ok = loginOutcome({ email: ADDED, password: ISSUED });
  assert.equal(ok.status, "authenticated");
  if (ok.status === "authenticated") {
    assert.equal(ok.user.mustChangePassword, true);
    assert.equal(ok.user.role, "tester");
  }

  const changed = setOwnPassword(ADDED, CHOSEN);
  assert.equal("ok" in changed, true);
  const again = loginOutcome({ email: ADDED, password: CHOSEN });
  assert.equal(again.status, "authenticated");
  if (again.status === "authenticated") {
    assert.equal(again.user.mustChangePassword, false);
  }

  const persisted = readFileSync(seatFile, "utf8");
  assert.equal(persisted.includes(ISSUED), false);
  assert.equal(persisted.includes(CHOSEN), false);
  assert.match(persisted, /"extras"/);
  assert.match(persisted, /added\.tester@example\.com/);

  resetUsersForTests();
  const reloaded = findUserByEmail(ADDED);
  assert.ok(reloaded);
  assert.equal(reloaded.name, "Added Tester");
  assert.equal(verifyPassword(reloaded, CHOSEN), true);
});

test("added tester persists in the seats vault after the local cache is wiped", async () => {
  const drive = memoryDrive();
  useSeatVaultForTests(drive);
  const created = await createSeat({
    name: "Vault Tester",
    email: ADDED,
    password: ISSUED,
    companyId: "madison",
  });
  assert.equal("ok" in created, true);
  await flushSeatVault();
  assert.equal(await assignedCompany(ADDED), "madison");

  forgetSeatCacheForTests();
  useSeatVaultForTests(drive);
  await hydrateSeatStore();
  const user = findUserByEmail(ADDED);
  assert.ok(user);
  assert.equal(user.name, "Vault Tester");
  assert.equal(user.role, "tester");
  assert.equal(loginOutcome({ email: ADDED, password: ISSUED }).status, "authenticated");
  assert.equal(verifyPassword(findUserByEmail(ADDED)!, ISSUED), true);
  assert.equal(findUserByEmail(TESTER)?.email, TESTER);

  const vaultRaw = [...drive.files.values()].map((row) => row.content).join();
  assert.equal(vaultRaw.includes(ISSUED), false);
  assert.match(vaultRaw, /"extras"/);
  assert.match(vaultRaw, /vault tester/i);
  assert.equal(loginOutcome({ email: TESTER }).status, "needsCreate");
});

test("createSeat rejects owner, Novus, duplicates, and a short password", async () => {
  assert.equal("error" in (await createSeat({ name: "Robert", email: OWNER_LOGIN_EMAIL, password: ISSUED })), true);
  assert.equal("error" in (await createSeat({ name: "Novus", email: NOVUS_EMAIL, password: ISSUED })), true);
  assert.equal("error" in (await createSeat({ name: "Nathan", email: TESTER, password: ISSUED })), true);
  assert.equal("error" in (await createSeat({ name: "Short", email: ADDED, password: SHORT })), true);
  assert.equal("error" in (await createSeat({ name: "X", email: ADDED, password: ISSUED })), true);
  assert.equal(findUserByEmail(ADDED), undefined);

  const first = await createSeat({ name: "Added Tester", email: ADDED, password: ISSUED });
  assert.equal("ok" in first, true);
  const again = await createSeat({ name: "Added Tester", email: ADDED, password: OTHER });
  assert.equal("error" in again, true);
  assert.equal("error" in (await createSeat({ name: "Added Tester", email: "other.tester@example.com", password: ISSUED, companyId: "not-a-company" })), true);
  assert.equal(verifyPassword(findUserByEmail(ADDED)!, ISSUED), true);
  assert.equal(findUserByEmail("other.tester@example.com"), undefined);
});

test("owner-added vault seats can include Ben Peffley; git seed still cannot", async () => {
  const email = "bpeffley@roadrunner.com";
  assert.equal(
    TESTER_SEATS.some((row) => /peffley/i.test(row.email) || /peffley/i.test(row.name)),
    false,
  );
  assert.equal(hasForbiddenSeed(), false);

  const created = await createSeat({
    name: "Ben Peffley",
    email,
    password: ISSUED,
  });
  assert.equal("ok" in created, true);
  if (!("ok" in created)) return;

  const user = findUserByEmail(email);
  assert.ok(user);
  assert.equal(user.name, "Ben Peffley");
  assert.equal(user.role, "tester");
  assert.equal(user.mustChangePassword, true);
  assert.equal(await assignedCompany(email), "hitsquad");
  assert.equal(canUseRateBuilder(user), true);
  assert.equal(canUseViewAs(user), false);

  const ok = loginOutcome({ email, password: ISSUED });
  assert.equal(ok.status, "authenticated");
  if (ok.status === "authenticated") {
    assert.equal(ok.user.mustChangePassword, true);
  }

  assert.equal(hasForbiddenSeed(), false);
  assert.equal(TESTER_SEATS.some((row) => row.email === email), false);
  const persisted = readFileSync(seatFile, "utf8");
  assert.equal(persisted.includes(ISSUED), false);
  assert.match(persisted, /bpeffley@roadrunner\.com/);
  assert.match(persisted, /"extras"/);
});

test("parseExtraSeats skips owner, Novus, and seeded testers", () => {
  const extras = parseExtraSeats({
    extras: [
      { id: "custom-ok", email: ADDED, name: "Added Tester" },
      { id: "custom-owner", email: OWNER_LOGIN_EMAIL, name: "Nope" },
      { id: "custom-novus", email: NOVUS_EMAIL, name: "Nope" },
      { id: "custom-nathan", email: TESTER, name: "Nope" },
      { id: "", email: "bad@example.com", name: "Nope" },
    ],
  });
  assert.deepEqual(extras, [{ id: "custom-ok", email: ADDED, name: "Added Tester" }]);
});
