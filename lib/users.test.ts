import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, test } from "node:test";
import { readSeatClaim, signSeatClaim } from "./auth.ts";
import { NOVUS_EMAIL } from "./desk-role.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import {
  claimFirstPassword,
  findUserByEmail,
  GENERIC_SIGNIN_ERROR,
  issueSeatPassword,
  loginOutcome,
  resetUsersForTests,
  restoreSeatHash,
  seatHashClaimFor,
  seatNeedsPasswordCreate,
  setOwnPassword,
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

process.env.OWNER_PASSWORD = OWNER_SECRET;
process.env.OWNER_EMAIL = OWNER_LOGIN_EMAIL;
process.env.SEAT_PASSWORD_PATH = seatFile;
process.env.AUTH_SECRET = "test-auth-secret-16chars";

function wipePersisted() {
  if (existsSync(seatFile)) unlinkSync(seatFile);
  resetUsersForTests();
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
