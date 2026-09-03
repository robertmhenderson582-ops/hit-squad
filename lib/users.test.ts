import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, beforeEach, test } from "node:test";
import bcrypt from "bcryptjs";
import { readSeatClaim, readSession, signSeatClaim, signSession } from "./auth.ts";
import { NOVUS_EMAIL } from "./desk-role.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { hasForbiddenSeed } from "./tester-seats.ts";
import { JOSEPH_EMAIL, SHANE_EMAIL, TESTER_SEATS } from "./tester-seats.ts";
import { assignedCompany, resetCompanyAssignmentsForTests } from "./companies-store.ts";
import { lensPeopleFromSeats } from "./desk-people.ts";
import { canLookupRates, canUseRateBuilder, canUseViewAs } from "./desk-role.ts";
import { SEATS_VAULT_FILE_ID, SEATS_VAULT_KIND, SEATS_VAULT_NAME, writeVaultJson } from "./drive-data.ts";
import { memoryDrive, type DriveAdapter } from "./drive-estimates.ts";
import {
  claimFirstPassword,
  createSeat,
  findSeatForSession,
  findUserByEmail,
  flushSeatVault,
  forgetSeatCacheForTests,
  GENERIC_SIGNIN_ERROR,
  hydrateSeatStore,
  issueRecoveryPassword,
  issueSeatPassword,
  loginOutcome,
  listSeatRows,
  parseExtraSeats,
  parseSeatHashes,
  resetUsersForTests,
  restoreSeatHash,
  seatHashClaimFor,
  seatNeedsPasswordCreate,
  setOwnPassword,
  toPublicUser,
  useSeatVaultForTests,
  verifyPassword,
  collapseSeatHashes,
  listBuildSeats,
  ownerSeatCount,
} from "./users.ts";
import { canonicalEmail, isOwnerIdentity } from "./identity.ts";

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

async function wipePersisted() {
  try {
    await flushSeatVault();
  } catch {
    // A prior confirm write may have rejected; drop that adapter before the next test.
  }
  if (existsSync(seatFile)) unlinkSync(seatFile);
  resetUsersForTests();
  resetCompanyAssignmentsForTests();
}

beforeEach(async () => {
  await wipePersisted();
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

test("unissued invited email plus ack creates a password and session user", async () => {
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

  const changed = await setOwnPassword(TESTER, OTHER, CHOSEN);
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

  const ownerClaim = seatHashClaimFor(OWNER_LOGIN_EMAIL);
  assert.ok(ownerClaim);
  assert.equal(ownerClaim.email, OWNER_LOGIN_EMAIL);
  assert.match(ownerClaim.passwordHash, /^\$2[abxy]\$/);
  assert.equal(ownerClaim.passwordHash.includes(OWNER_SECRET), false);
  assert.equal(ownerClaim.passwordHash.includes(CHOSEN), false);
  assert.equal(restoreSeatHash(OWNER_LOGIN_EMAIL, { email: TESTER, passwordHash: claim.passwordHash }), false);
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
  assert.equal(canUseRateBuilder(user), false);
  assert.equal(canLookupRates(user), false);
  assert.equal(canUseViewAs(user), false);
  assert.equal(canUseRateBuilder({ email: JOSEPH_EMAIL, role: "tester" }), true);

  const rows = await listSeatRows();
  assert.equal(rows.some((row) => row.email === ADDED && row.passwordIssued && row.companyId === "hitsquad"), true);
  const people = lensPeopleFromSeats(rows);
  assert.equal(people.some((row) => row.email === ADDED && row.id.startsWith("custom-")), true);
  assert.equal(people.some((row) => row.email === NOVUS_EMAIL), false);
  assert.equal(people.some((row) => row.email === TESTER), true);

  const ok = loginOutcome({ email: ADDED, password: ISSUED });
  assert.equal(ok.status, "authenticated");
  if (ok.status === "authenticated") {
    assert.equal(ok.user.mustChangePassword, true);
    assert.equal(ok.user.role, "tester");
  }

  const changed = await setOwnPassword(ADDED, CHOSEN);
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
  assert.equal(canUseRateBuilder(user), false);
  assert.equal(canLookupRates(user), false);
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

test("owner setOwnPassword then login works after persist and hydrate", async () => {
  const boot = loginOutcome({ email: OWNER_LOGIN_EMAIL, password: OWNER_SECRET });
  assert.equal(boot.status, "authenticated");
  if (boot.status === "authenticated") {
    assert.equal(boot.user.role, "owner");
    assert.equal(boot.user.mustChangePassword, false);
  }

  const missingCurrent = await setOwnPassword(OWNER_LOGIN_EMAIL, CHOSEN);
  assert.equal("error" in missingCurrent, true);
  if ("error" in missingCurrent) {
    assert.equal(missingCurrent.status, 400);
  }

  const wrongCurrent = await setOwnPassword(OWNER_LOGIN_EMAIL, CHOSEN, OTHER);
  assert.equal("error" in wrongCurrent, true);
  if ("error" in wrongCurrent) {
    assert.equal(wrongCurrent.status, 401);
  }

  const short = await setOwnPassword(OWNER_LOGIN_EMAIL, SHORT, OWNER_SECRET);
  assert.equal("error" in short, true);

  const changed = await setOwnPassword(OWNER_LOGIN_EMAIL, CHOSEN, OWNER_SECRET);
  assert.equal("ok" in changed, true);
  const now = loginOutcome({ email: OWNER_LOGIN_EMAIL, password: CHOSEN });
  assert.equal(now.status, "authenticated");
  if (now.status === "authenticated") {
    assert.equal(now.user.role, "owner");
  }
  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: OWNER_SECRET }).status, "error");

  resetUsersForTests();
  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: CHOSEN }).status, "authenticated");
  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: OWNER_SECRET }).status, "error");

  const persisted = JSON.parse(readFileSync(seatFile, "utf8")) as { hashes?: Record<string, { passwordHash?: string }> };
  const ownerRow = persisted.hashes?.[OWNER_LOGIN_EMAIL];
  assert.ok(ownerRow?.passwordHash);
  assert.match(ownerRow.passwordHash, /^\$2[abxy]\$/);
  assert.equal(JSON.stringify(persisted).includes(CHOSEN), false);
  assert.equal(JSON.stringify(persisted).includes(OWNER_SECRET), false);
  const parsed = parseSeatHashes(persisted);
  assert.equal(parsed[OWNER_LOGIN_EMAIL]?.passwordHash, ownerRow.passwordHash);

  const drive = memoryDrive();
  useSeatVaultForTests(drive);
  await hydrateSeatStore();
  const again = await setOwnPassword(OWNER_LOGIN_EMAIL, OTHER, CHOSEN);
  assert.equal("ok" in again, true);
  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: OTHER }).status, "authenticated");
  await flushSeatVault();
  forgetSeatCacheForTests();
  useSeatVaultForTests(drive);
  await hydrateSeatStore();
  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: OTHER }).status, "authenticated");
  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: OWNER_SECRET }).status, "error");
  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: CHOSEN }).status, "error");
  const vaultRaw = [...drive.files.values()].map((row) => row.content).join();
  assert.equal(vaultRaw.includes(OTHER), false);
  assert.equal(vaultRaw.includes(OWNER_SECRET), false);
  assert.match(vaultRaw, /robertmhenderson582@gmail.com/i);
});

test("OWNER_PASSWORD is the login only when no owner hash is stored", async () => {
  const drive = memoryDrive();
  useSeatVaultForTests(drive);
  await hydrateSeatStore();
  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: OWNER_SECRET }).status, "authenticated");
  await flushSeatVault();
  const vaultRaw = [...drive.files.values()].map((row) => row.content).join();
  assert.match(vaultRaw, /robertmhenderson582@gmail.com/i);
  assert.equal(vaultRaw.includes(OWNER_SECRET), false);

  const created = loginOutcome({
    email: TESTER,
    newPassword: CHOSEN,
    confirmPassword: CHOSEN,
  });
  assert.equal(created.status, "authenticated");
  const testerHash = findUserByEmail(TESTER)?.passwordHash;
  assert.ok(testerHash);
  await flushSeatVault();
  await writeVaultJson(drive, SEATS_VAULT_NAME, SEATS_VAULT_KIND, {
    hashes: { [TESTER]: { passwordHash: testerHash, mustChangePassword: false } },
    extras: [],
  });
  forgetSeatCacheForTests();
  useSeatVaultForTests(drive);
  await hydrateSeatStore();
  assert.equal(loginOutcome({ email: TESTER, password: CHOSEN }).status, "authenticated");
  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: OWNER_SECRET }).status, "authenticated");
  await flushSeatVault();
  const seats = [...drive.files.values()].find((row) => row.file.name === SEATS_VAULT_NAME);
  assert.ok(seats);
  const persisted = JSON.parse(seats.content) as { hashes?: Record<string, { passwordHash?: string }> };
  assert.ok(persisted.hashes?.[OWNER_LOGIN_EMAIL]?.passwordHash);
  assert.ok(persisted.hashes?.[TESTER]?.passwordHash);
  assert.equal(JSON.stringify(persisted).includes(OWNER_SECRET), false);
});

test("hydrate merge keeps a local owner hash when the vault is testers-only and writes it back", async () => {
  const ownerHash = bcrypt.hashSync(CHOSEN, 12);
  const testerHash = bcrypt.hashSync(ISSUED, 12);
  writeFileSync(
    seatFile,
    `${JSON.stringify({
      hashes: { [OWNER_LOGIN_EMAIL]: { passwordHash: ownerHash, mustChangePassword: false } },
      extras: [],
    })}\n`,
  );
  const drive = memoryDrive();
  await writeVaultJson(drive, SEATS_VAULT_NAME, SEATS_VAULT_KIND, {
    hashes: { [TESTER]: { passwordHash: testerHash, mustChangePassword: false } },
    extras: [],
  });
  useSeatVaultForTests(drive);
  await hydrateSeatStore();

  const local = JSON.parse(readFileSync(seatFile, "utf8")) as { hashes?: Record<string, { passwordHash?: string }> };
  assert.equal(local.hashes?.[OWNER_LOGIN_EMAIL]?.passwordHash, ownerHash);
  assert.equal(local.hashes?.[TESTER]?.passwordHash, testerHash);

  const seats = [...drive.files.values()].find((row) => row.file.name === SEATS_VAULT_NAME);
  assert.ok(seats);
  const vault = JSON.parse(seats.content) as { hashes?: Record<string, { passwordHash?: string }> };
  assert.equal(vault.hashes?.[OWNER_LOGIN_EMAIL]?.passwordHash, ownerHash);
  assert.equal(vault.hashes?.[TESTER]?.passwordHash, testerHash);
  assert.equal(JSON.stringify(vault).includes(CHOSEN), false);
  assert.equal(JSON.stringify(vault).includes(ISSUED), false);

  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: CHOSEN }).status, "authenticated");
  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: OWNER_SECRET }).status, "error");
  assert.equal(loginOutcome({ email: TESTER, password: ISSUED }).status, "authenticated");
});

test("cold start with testers-only vault signs in with OWNER_PASSWORD then a Settings change survives", async () => {
  const testerHash = bcrypt.hashSync(ISSUED, 12);
  const drive = memoryDrive();
  await writeVaultJson(drive, SEATS_VAULT_NAME, SEATS_VAULT_KIND, {
    hashes: { [TESTER]: { passwordHash: testerHash, mustChangePassword: false } },
    extras: [],
  });
  forgetSeatCacheForTests();
  useSeatVaultForTests(drive);
  await hydrateSeatStore();
  assert.equal(existsSync(seatFile), true);
  const afterHydrate = JSON.parse(readFileSync(seatFile, "utf8")) as { hashes?: Record<string, unknown> };
  assert.equal(afterHydrate.hashes?.[OWNER_LOGIN_EMAIL], undefined);
  assert.ok(afterHydrate.hashes?.[TESTER]);

  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: OWNER_SECRET }).status, "authenticated");
  assert.equal(loginOutcome({ email: TESTER, password: ISSUED }).status, "authenticated");
  await flushSeatVault();

  const afterSeed = [...drive.files.values()].find((row) => row.file.name === SEATS_VAULT_NAME);
  assert.ok(afterSeed);
  const seeded = JSON.parse(afterSeed.content) as { hashes?: Record<string, { passwordHash?: string }> };
  assert.ok(seeded.hashes?.[OWNER_LOGIN_EMAIL]?.passwordHash);
  assert.ok(seeded.hashes?.[TESTER]?.passwordHash);
  assert.equal(JSON.stringify(seeded).includes(OWNER_SECRET), false);

  const changed = await setOwnPassword(OWNER_LOGIN_EMAIL, CHOSEN, OWNER_SECRET);
  assert.equal("ok" in changed, true);
  await flushSeatVault();
  forgetSeatCacheForTests();
  useSeatVaultForTests(drive);
  await hydrateSeatStore();
  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: CHOSEN }).status, "authenticated");
  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: OWNER_SECRET }).status, "error");
  assert.equal(loginOutcome({ email: TESTER, password: ISSUED }).status, "authenticated");
});

test("parseExtraSeats skips owner, Novus, and seeded testers", () => {
  const extras = parseExtraSeats({
    extras: [
      { id: "custom-ok", email: ADDED, name: "Added Tester" },
      { id: "custom-owner", email: OWNER_LOGIN_EMAIL, name: "Nope" },
      { id: "custom-novus", email: NOVUS_EMAIL, name: "Nope" },
      { id: "custom-nathan", email: TESTER, name: "Nope" },
      { id: "owner-robert-henderson", email: "alias.owner@example.com", name: "Nope" },
      { id: "custom-local", email: "robertmhenderson582@gmail.com", name: "robertmhenderson582" },
      { id: "", email: "bad@example.com", name: "Nope" },
    ],
  });
  assert.deepEqual(extras, [{ id: "custom-ok", email: ADDED, name: "Added Tester" }]);
});

test("setOwnPassword then authenticate resolves one owner record from any alias", async () => {
  const changed = await setOwnPassword(OWNER_LOGIN_EMAIL, CHOSEN, OWNER_SECRET);
  assert.equal("ok" in changed, true);

  for (const raw of [OWNER_LOGIN_EMAIL, "  RobertMHenderson582@Gmail.com ", "robertmhenderson582", "Robert Henderson"]) {
    const outcome = loginOutcome({ email: raw, password: CHOSEN });
    assert.equal(outcome.status, "authenticated", raw);
    if (outcome.status === "authenticated") {
      assert.equal(outcome.user.email, OWNER_LOGIN_EMAIL);
      assert.equal(outcome.user.id, "owner-robert-henderson");
      assert.equal(outcome.user.role, "owner");
    }
    assert.equal(findUserByEmail(raw)?.email, OWNER_LOGIN_EMAIL, raw);
  }

  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: OWNER_SECRET }).status, "error");
  assert.equal(ownerSeatCount(), 1);
  assert.equal(listBuildSeats().filter((row) => row.role === "owner").length, 1);
  assert.equal(listBuildSeats().filter((row) => isOwnerIdentity(row.email) || isOwnerIdentity(row.id)).length, 1);
});

test("split owner hash keys collapse onto normalized email and both credentials stay valid until Settings replace", async () => {
  const settingsHash = bcrypt.hashSync(CHOSEN, 12);
  const resetHash = bcrypt.hashSync(OWNER_SECRET, 12);
  writeFileSync(
    seatFile,
    `${JSON.stringify({
      hashes: {
        robertmhenderson582: { passwordHash: settingsHash, mustChangePassword: false },
        [OWNER_LOGIN_EMAIL]: { passwordHash: resetHash, mustChangePassword: false },
      },
      extras: [{ id: "custom-robert", email: OWNER_LOGIN_EMAIL, name: "robertmhenderson582" }],
    })}\n`,
  );
  resetUsersForTests();

  const collapsed = collapseSeatHashes(
    parseSeatHashes({
      hashes: {
        robertmhenderson582: { passwordHash: settingsHash },
        [OWNER_LOGIN_EMAIL]: { passwordHash: resetHash },
      },
    }),
  );
  assert.deepEqual(Object.keys(collapsed), [OWNER_LOGIN_EMAIL]);
  assert.equal(canonicalEmail("robertmhenderson582"), OWNER_LOGIN_EMAIL);

  const viaSettings = loginOutcome({ email: "robertmhenderson582", password: CHOSEN });
  assert.equal(viaSettings.status, "authenticated");
  if (viaSettings.status === "authenticated") {
    assert.equal(viaSettings.user.email, OWNER_LOGIN_EMAIL);
    assert.equal(viaSettings.user.id, "owner-robert-henderson");
  }
  assert.equal(loginOutcome({ email: "Robert Henderson", password: OWNER_SECRET }).status, "authenticated");
  assert.equal(ownerSeatCount(), 1);
  assert.equal(parseExtraSeats(JSON.parse(readFileSync(seatFile, "utf8"))).length, 0);

  const replaced = await setOwnPassword(OWNER_LOGIN_EMAIL, OTHER, CHOSEN);
  assert.equal("ok" in replaced, true);
  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: OTHER }).status, "authenticated");
  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: CHOSEN }).status, "error");
  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: OWNER_SECRET }).status, "error");
  assert.equal(ownerSeatCount(), 1);
});

test("stale vault owner hash does not drop a local Settings password", async () => {
  const settingsHash = bcrypt.hashSync(CHOSEN, 12);
  const staleHash = bcrypt.hashSync(OWNER_SECRET, 12);
  writeFileSync(
    seatFile,
    `${JSON.stringify({
      hashes: { [OWNER_LOGIN_EMAIL]: { passwordHash: settingsHash, mustChangePassword: false } },
      extras: [],
    })}\n`,
  );
  const drive = memoryDrive();
  await writeVaultJson(drive, SEATS_VAULT_NAME, SEATS_VAULT_KIND, {
    hashes: { [OWNER_LOGIN_EMAIL]: { passwordHash: staleHash, mustChangePassword: false } },
    extras: [],
  });
  useSeatVaultForTests(drive);
  await hydrateSeatStore();

  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: CHOSEN }).status, "authenticated");
  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: OWNER_SECRET }).status, "authenticated");
  assert.equal(ownerSeatCount(), 1);
});

test("a later tester persist from a stale instance cannot clobber the Settings hash", async () => {
  const settingsHash = bcrypt.hashSync(CHOSEN, 12);
  const staleHash = bcrypt.hashSync(OWNER_SECRET, 12);
  writeFileSync(
    seatFile,
    `${JSON.stringify({
      hashes: { [OWNER_LOGIN_EMAIL]: { passwordHash: staleHash, mustChangePassword: false } },
      extras: [],
    })}\n`,
  );
  const drive = memoryDrive();
  await writeVaultJson(drive, SEATS_VAULT_NAME, SEATS_VAULT_KIND, {
    hashes: { [OWNER_LOGIN_EMAIL]: { passwordHash: settingsHash, mustChangePassword: false } },
    extras: [],
  });
  useSeatVaultForTests(drive);

  const created = loginOutcome({
    email: TESTER,
    newPassword: ISSUED,
    confirmPassword: ISSUED,
  });
  assert.equal(created.status, "authenticated");
  await flushSeatVault();
  forgetSeatCacheForTests();
  useSeatVaultForTests(drive);
  await hydrateSeatStore();

  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: CHOSEN }).status, "authenticated");
  assert.equal(ownerSeatCount(), 1);
});

test("createSeat cannot mint a second owner or a known person", async () => {
  assert.equal("error" in (await createSeat({ name: "Robert", email: "  RobertMHenderson582@Gmail.com ", password: ISSUED })), true);
  assert.equal("error" in (await createSeat({ name: "Robert Henderson", email: "other.robert@example.com", password: ISSUED })), true);
  assert.equal("error" in (await createSeat({ name: "Novus", email: NOVUS_EMAIL, password: ISSUED })), true);
  assert.equal("error" in (await createSeat({ name: "Nathan Boyte", email: TESTER, password: ISSUED })), true);
  assert.equal("error" in (await createSeat({ name: "Nathan Boyte", email: "nathan.other@example.com", password: ISSUED })), true);
  assert.equal(ownerSeatCount(), 1);
  assert.equal(findUserByEmail("other.robert@example.com"), undefined);
  assert.equal(findUserByEmail("nathan.other@example.com"), undefined);
});

test("Settings password change then cold start accepts only the new password", async () => {
  const signedIn = loginOutcome({ email: OWNER_LOGIN_EMAIL, password: OWNER_SECRET });
  assert.equal(signedIn.status, "authenticated");

  const sessionSeat = findSeatForSession({ id: "owner-robert-henderson", email: "Robert Henderson" });
  assert.ok(sessionSeat);
  assert.equal(sessionSeat.email, OWNER_LOGIN_EMAIL);

  const changed = await setOwnPassword(sessionSeat.email, CHOSEN, OWNER_SECRET);
  assert.equal("ok" in changed, true);
  if (!("ok" in changed)) return;
  assert.equal(changed.email, OWNER_LOGIN_EMAIL);

  resetUsersForTests();
  await hydrateSeatStore();

  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: CHOSEN }).status, "authenticated");
  assert.equal(loginOutcome({ email: "Robert Henderson", password: CHOSEN }).status, "authenticated");
  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: OWNER_SECRET }).status, "error");
});

test("Settings password change is confirmed on the vault before success and survives a wiped local file", async () => {
  const drive = memoryDrive();
  useSeatVaultForTests(drive);
  await hydrateSeatStore();
  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: OWNER_SECRET }).status, "authenticated");

  const changed = await setOwnPassword(OWNER_LOGIN_EMAIL, CHOSEN, OWNER_SECRET);
  assert.equal("ok" in changed, true);

  forgetSeatCacheForTests();
  resetUsersForTests();
  useSeatVaultForTests(drive);
  await hydrateSeatStore();

  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: CHOSEN }).status, "authenticated");
  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: OWNER_SECRET }).status, "error");
  const vaultRaw = [...drive.files.values()].map((row) => row.content).join();
  assert.equal(vaultRaw.includes(CHOSEN), false);
  assert.equal(vaultRaw.includes(OWNER_SECRET), false);
});

test("issued recovery survives cold start, is one-time, and then Settings replace is required", async () => {
  const created = loginOutcome({
    email: TESTER,
    newPassword: CHOSEN,
    confirmPassword: CHOSEN,
  });
  assert.equal(created.status, "authenticated");

  const issued = await issueRecoveryPassword(TESTER);
  assert.equal("ok" in issued, true);
  if (!("ok" in issued)) return;
  assert.equal(issued.email, TESTER);
  assert.ok(issued.password.length >= 16);
  assert.equal(JSON.stringify(issued).includes(CHOSEN), false);

  resetUsersForTests();
  await hydrateSeatStore();

  const recovered = loginOutcome({ email: TESTER, password: issued.password });
  assert.equal(recovered.status, "authenticated");
  if (recovered.status === "authenticated") {
    assert.equal(recovered.user.mustChangePassword, true);
  }

  resetUsersForTests();
  assert.equal(loginOutcome({ email: TESTER, password: issued.password }).status, "error");
  assert.equal(loginOutcome({ email: TESTER, password: CHOSEN }).status, "authenticated");

  const changed = await setOwnPassword(TESTER, OTHER, CHOSEN);
  assert.equal("ok" in changed, true);
  resetUsersForTests();
  await hydrateSeatStore();
  assert.equal(loginOutcome({ email: TESTER, password: OTHER }).status, "authenticated");
  assert.equal(loginOutcome({ email: TESTER, password: CHOSEN }).status, "error");
  assert.equal(loginOutcome({ email: TESTER, password: issued.password }).status, "error");
});

test("owner env recovery signs in without depending on a stored hash", async () => {
  process.env.OWNER_RECOVERY_PASSWORD = "env-recovery-secret-xx";
  try {
    const recovered = loginOutcome({ email: OWNER_LOGIN_EMAIL, password: "env-recovery-secret-xx" });
    assert.equal(recovered.status, "authenticated");
    if (recovered.status === "authenticated") {
      assert.equal(recovered.user.mustChangePassword, true);
      assert.equal(recovered.user.email, OWNER_LOGIN_EMAIL);
    }

    const changed = await setOwnPassword(OWNER_LOGIN_EMAIL, CHOSEN);
    assert.equal("ok" in changed, true);
    resetUsersForTests();
    await hydrateSeatStore();
    assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: CHOSEN }).status, "authenticated");
    assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: OWNER_SECRET }).status, "error");
  } finally {
    delete process.env.OWNER_RECOVERY_PASSWORD;
  }
});

test("owner env recovery forced change accepts next without current after hydrate", async () => {
  const recovery = "env-recovery-secret-xx";
  process.env.OWNER_RECOVERY_PASSWORD = recovery;
  try {
    const recovered = loginOutcome({ email: OWNER_LOGIN_EMAIL, password: recovery });
    assert.equal(recovered.status, "authenticated");
    if (recovered.status !== "authenticated") return;
    assert.equal(recovered.user.mustChangePassword, true);
    assert.equal(recovered.user.email, OWNER_LOGIN_EMAIL);
    assert.equal(ownerSeatCount(), 1);

    const persisted = parseSeatHashes(JSON.parse(readFileSync(seatFile, "utf8")));
    assert.equal(persisted[OWNER_LOGIN_EMAIL]?.mustChangePassword, true);

    const stillRecovery = loginOutcome({ email: OWNER_LOGIN_EMAIL, password: recovery });
    assert.equal(stillRecovery.status, "authenticated");
    if (stillRecovery.status === "authenticated") {
      assert.equal(stillRecovery.user.mustChangePassword, true);
    }

    const token = await signSession(recovered.user);
    const session = await readSession(token);
    assert.equal(session?.mustChangePassword, true);
    assert.equal(session?.email, OWNER_LOGIN_EMAIL);

    resetUsersForTests();
    await hydrateSeatStore();
    const stored = findUserByEmail(OWNER_LOGIN_EMAIL);
    assert.ok(stored);
    assert.equal(stored.mustChangePassword, true);

    stored.mustChangePassword = false;
    const missing = await setOwnPassword(OWNER_LOGIN_EMAIL, CHOSEN);
    assert.equal("error" in missing, true);
    if ("error" in missing) {
      assert.equal(missing.error, "Current and new password are required.");
      assert.equal(missing.status, 400);
    }

    const seat = findSeatForSession(session!);
    assert.ok(seat);
    assert.equal(seat.email, OWNER_LOGIN_EMAIL);
    const changed = await setOwnPassword(seat.email, CHOSEN, undefined, session?.mustChangePassword);
    assert.equal("ok" in changed, true);

    const publicUser = toPublicUser(findSeatForSession({ id: seat.id, email: changed.ok ? changed.email : seat.email })!);
    const nextToken = await signSession(publicUser);
    assert.equal((await readSession(nextToken))?.mustChangePassword, false);

    const chosenLogin = loginOutcome({ email: OWNER_LOGIN_EMAIL, password: CHOSEN });
    assert.equal(chosenLogin.status, "authenticated");
    if (chosenLogin.status === "authenticated") {
      assert.equal(chosenLogin.user.mustChangePassword, false);
    }

    const settingsStillNeedsCurrent = await setOwnPassword(OWNER_LOGIN_EMAIL, OTHER);
    assert.equal("error" in settingsStillNeedsCurrent, true);
    if ("error" in settingsStillNeedsCurrent) {
      assert.equal(settingsStillNeedsCurrent.error, "Current and new password are required.");
    }

    const envStillWorks = loginOutcome({ email: OWNER_LOGIN_EMAIL, password: recovery });
    assert.equal(envStillWorks.status, "authenticated");
    if (envStillWorks.status === "authenticated") {
      assert.equal(envStillWorks.user.mustChangePassword, true);
    }

    const route = readFileSync(fileURLToPath(new URL("../app/api/desk/password/route.ts", import.meta.url)), "utf8");
    assert.match(route, /setOwnPassword\(seat\.email, next, current \|\| undefined, Boolean\(session\.mustChangePassword\)\)/);
    assert.equal(/passwordWriteLanded/.test(route), false);
    assert.equal(JSON.stringify(recovered).includes(recovery), false);
    assert.equal(JSON.stringify(publicUser).includes(CHOSEN), false);
    assert.equal(ownerSeatCount(), 1);
  } finally {
    delete process.env.OWNER_RECOVERY_PASSWORD;
  }
});

test("owner never receives a temp-password create prompt", () => {
  assert.equal(seatNeedsPasswordCreate(OWNER_LOGIN_EMAIL), false);
  assert.equal(seatNeedsPasswordCreate("Robert Henderson"), false);
  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL }).status, "needsPassword");
  assert.equal("error" in claimFirstPassword(OWNER_LOGIN_EMAIL, CHOSEN, CHOSEN), true);
  assert.equal(
    loginOutcome({ email: OWNER_LOGIN_EMAIL, newPassword: CHOSEN, confirmPassword: CHOSEN }).status,
    "error",
  );
});

function driveWithOneStaleReadAfterWrite() {
  const inner = memoryDrive();
  const stale = new Map<string, string>();
  return {
    configured: true as const,
    files: inner.files,
    listJson: (folderId: string) => inner.listJson(folderId),
    async readJson(fileId: string) {
      const prior = stale.get(fileId);
      if (prior !== undefined) {
        stale.delete(fileId);
        return prior;
      }
      return inner.readJson(fileId);
    },
    createJson: inner.createJson.bind(inner),
    async updateJson(fileId: string, content: string, name?: string, properties?: Record<string, string>) {
      const row = inner.files.get(fileId);
      if (row) stale.set(fileId, row.content);
      return inner.updateJson(fileId, content, name, properties);
    },
    deleteJson: inner.deleteJson.bind(inner),
  };
}

test("stale Drive read after confirmOwnPasswordWrite does not 503 when the write already succeeded", async () => {
  const drive = driveWithOneStaleReadAfterWrite();
  useSeatVaultForTests(drive);
  await hydrateSeatStore();
  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: OWNER_SECRET }).status, "authenticated");
  await flushSeatVault();

  const stored = findUserByEmail(OWNER_LOGIN_EMAIL);
  assert.ok(stored);
  stored.mustChangePassword = true;
  const changed = await setOwnPassword(OWNER_LOGIN_EMAIL, CHOSEN);
  assert.equal("ok" in changed, true);
  if ("error" in changed) {
    assert.equal(changed.error, "expected ok after a successful vault write");
    return;
  }

  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: CHOSEN }).status, "authenticated");
  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: OWNER_SECRET }).status, "error");
  assert.equal(ownerSeatCount(), 1);

  const settingsStillNeedsCurrent = await setOwnPassword(OWNER_LOGIN_EMAIL, OTHER);
  assert.equal("error" in settingsStillNeedsCurrent, true);
  if ("error" in settingsStillNeedsCurrent) {
    assert.equal(settingsStillNeedsCurrent.error, "Current and new password are required.");
  }

  const vaultRaw = [...drive.files.values()].map((row) => row.content).join();
  assert.equal(vaultRaw.includes(CHOSEN), false);
  assert.equal(vaultRaw.includes(OWNER_SECRET), false);
  assert.match(vaultRaw, /robertmhenderson582@gmail.com/i);
});

test("forced setOwnPassword still ok when Drive confirm throws or Drive is unconfigured", async () => {
  const inner = memoryDrive();
  useSeatVaultForTests({
    configured: true,
    listJson: (folderId) => inner.listJson(folderId),
    readJson: (fileId) => inner.readJson(fileId),
    async createJson() {
      throw new Error("drive write failed");
    },
    async updateJson() {
      throw new Error("drive write failed");
    },
    deleteJson: (fileId) => inner.deleteJson(fileId),
  });

  const stored = findUserByEmail(OWNER_LOGIN_EMAIL);
  assert.ok(stored);
  stored.mustChangePassword = true;
  const changed = await setOwnPassword(OWNER_LOGIN_EMAIL, CHOSEN);
  assert.equal("ok" in changed, true);
  if ("error" in changed) {
    assert.equal(changed.error, "expected ok for forced first-sign-in when Drive confirm throws");
    return;
  }

  const publicUser = toPublicUser(findUserByEmail(OWNER_LOGIN_EMAIL)!);
  const nextToken = await signSession(publicUser);
  assert.equal((await readSession(nextToken))?.mustChangePassword, false);

  const persisted = parseSeatHashes(JSON.parse(readFileSync(seatFile, "utf8")));
  assert.equal(persisted[OWNER_LOGIN_EMAIL]?.mustChangePassword, false);
  assert.ok(persisted[OWNER_LOGIN_EMAIL]?.passwordHash);

  const claim = seatHashClaimFor(OWNER_LOGIN_EMAIL);
  assert.ok(claim);
  assert.equal(claim.email, OWNER_LOGIN_EMAIL);
  assert.match(claim.passwordHash, /^\$2[abxy]\$/);
  assert.equal(claim.mustChangePassword, false);
  assert.equal(claim.passwordHash.includes(CHOSEN), false);
  assert.equal(claim.passwordHash.includes(OWNER_SECRET), false);

  unlinkSync(seatFile);
  resetUsersForTests();
  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: CHOSEN }).status, "error");
  assert.equal(restoreSeatHash(OWNER_LOGIN_EMAIL, claim), true);
  const restored = loginOutcome({ email: OWNER_LOGIN_EMAIL, password: CHOSEN });
  assert.equal(restored.status, "authenticated");
  if (restored.status === "authenticated") {
    assert.equal(restored.user.mustChangePassword, false);
    assert.equal(restored.user.email, OWNER_LOGIN_EMAIL);
    assert.equal(restored.user.role, "owner");
  }
  assert.equal(ownerSeatCount(), 1);

  await wipePersisted();
  useSeatVaultForTests(null);
  const unconfiguredSeat = findUserByEmail(OWNER_LOGIN_EMAIL);
  assert.ok(unconfiguredSeat);
  unconfiguredSeat.mustChangePassword = true;
  const unconfigured = await setOwnPassword(OWNER_LOGIN_EMAIL, OTHER);
  assert.equal("ok" in unconfigured, true);
  const again = loginOutcome({ email: OWNER_LOGIN_EMAIL, password: OTHER });
  assert.equal(again.status, "authenticated");
  if (again.status === "authenticated") {
    assert.equal(again.user.mustChangePassword, false);
  }
  assert.equal(JSON.stringify(claim).includes(CHOSEN), false);
  assert.equal(JSON.stringify(claim).includes(OWNER_SECRET), false);
});

test("confirmOwnPasswordWrite still 503s when writeVaultJson throws", async () => {
  const inner = memoryDrive();
  useSeatVaultForTests({
    configured: true,
    listJson: (folderId) => inner.listJson(folderId),
    readJson: (fileId) => inner.readJson(fileId),
    async createJson() {
      throw new Error("drive write failed");
    },
    async updateJson() {
      throw new Error("drive write failed");
    },
    deleteJson: (fileId) => inner.deleteJson(fileId),
  });
  const changed = await setOwnPassword(OWNER_LOGIN_EMAIL, CHOSEN, OWNER_SECRET);
  assert.equal("error" in changed, true);
  if ("error" in changed) {
    assert.equal(changed.status, 503);
    assert.equal(changed.error, "Password was not saved. Try again.");
  }
});

function unlistableSeatsDrive(listJson: DriveAdapter["listJson"], readJson?: DriveAdapter["readJson"]) {
  const inner = memoryDrive();
  inner.files.set(SEATS_VAULT_FILE_ID, {
    file: { id: SEATS_VAULT_FILE_ID, name: SEATS_VAULT_NAME, properties: { kind: SEATS_VAULT_KIND } },
    content: `${JSON.stringify({ hashes: {}, extras: [] })}\n`,
  });
  const drive: DriveAdapter & { files: typeof inner.files; updatedIds: string[]; created: number } = {
    configured: true,
    files: inner.files,
    updatedIds: [],
    created: 0,
    listJson,
    async listAccessibleJson() {
      throw new Error("shared-with-me list failed");
    },
    readJson: readJson ?? ((fileId) => inner.readJson(fileId)),
    async createJson() {
      drive.created += 1;
      throw new Error("createJson must not run when seats.json is reachable by id");
    },
    async updateJson(fileId, content, name, properties) {
      drive.updatedIds.push(fileId);
      return inner.updateJson(fileId, content, name, properties);
    },
    deleteJson: (fileId) => inner.deleteJson(fileId),
  };
  return drive;
}

async function assertPasswordSaveAgainstUnlistableFolder(
  drive: ReturnType<typeof unlistableSeatsDrive>,
) {
  await hydrateSeatStore();
  const stored = findUserByEmail(OWNER_LOGIN_EMAIL);
  assert.ok(stored);
  stored.mustChangePassword = true;
  const changed = await setOwnPassword(OWNER_LOGIN_EMAIL, CHOSEN);
  assert.equal("ok" in changed, true);
  if ("error" in changed) {
    assert.equal(changed.error, "expected ok when updateJson of seats.json succeeded");
    return;
  }
  assert.equal(drive.created, 0);
  assert.ok(drive.updatedIds.length >= 1);
  assert.equal(
    drive.updatedIds.every((id) => id === SEATS_VAULT_FILE_ID),
    true,
  );
  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: CHOSEN }).status, "authenticated");
  assert.equal(loginOutcome({ email: OWNER_LOGIN_EMAIL, password: OWNER_SECRET }).status, "error");
  assert.equal(ownerSeatCount(), 1);
  const vaultRaw = [...drive.files.values()].map((row) => row.content).join();
  assert.match(vaultRaw, /robertmhenderson582@gmail.com/i);
  assert.equal(vaultRaw.includes(CHOSEN), false);
  assert.equal(vaultRaw.includes(OWNER_SECRET), false);
}

test("confirmOwnPasswordWrite succeeds when listJson throws and seats.json is updated by id", async () => {
  const drive = unlistableSeatsDrive(async () => {
    throw new Error("The user does not have sufficient permissions for this file.");
  });
  useSeatVaultForTests(drive);
  await assertPasswordSaveAgainstUnlistableFolder(drive);
});

test("confirmOwnPasswordWrite succeeds when listJson is empty and seats.json is updated by id", async () => {
  const drive = unlistableSeatsDrive(async () => []);
  useSeatVaultForTests(drive);
  await assertPasswordSaveAgainstUnlistableFolder(drive);
});

test("confirmOwnPasswordWrite succeeds when listJson and readJson throw and seats.json is updated by known id", async () => {
  const drive = unlistableSeatsDrive(
    async () => {
      throw new Error("The user does not have sufficient permissions for this file.");
    },
    async () => {
      throw new Error("read");
    },
  );
  useSeatVaultForTests(drive);
  await assertPasswordSaveAgainstUnlistableFolder(drive);
});
