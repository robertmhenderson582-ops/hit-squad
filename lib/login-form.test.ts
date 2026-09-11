import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import {
  INITIAL_LOGIN_GATE,
  loginGateAfterProbe,
  loginShowsCreateFields,
  loginShowsPasswordField,
  loginSubmitLabel,
  looksLikeEmail,
  mustChangeGateBlocks,
} from "./login-form.ts";

const ISSUED = "issued-seat-secret";
const TESTER = "nathanboyte@gmail.com";

test("existing-hash seat sees the password field without a probe hop", () => {
  assert.equal(INITIAL_LOGIN_GATE, "password");
  assert.equal(loginShowsPasswordField(INITIAL_LOGIN_GATE, TESTER), true);
  assert.equal(loginShowsPasswordField(INITIAL_LOGIN_GATE, OWNER_LOGIN_EMAIL), true);
  assert.equal(loginShowsPasswordField(INITIAL_LOGIN_GATE, "jhut26@gmail.com"), true);
  assert.equal(loginShowsCreateFields(INITIAL_LOGIN_GATE, TESTER), false);
  assert.equal(loginSubmitLabel(INITIAL_LOGIN_GATE, false), "ENTER THE DESK");

  const login = readFileSync(fileURLToPath(new URL("../components/LoginForm.tsx", import.meta.url)), "utf8");
  assert.match(login, /useState<LoginGate>\(INITIAL_LOGIN_GATE\)/);
  assert.doesNotMatch(login, /identify/);
  assert.doesNotMatch(login, /CONTINUE/);
  assert.doesNotMatch(login, /if \(gate === "identify"\)/);
  assert.match(login, /loginShowsPasswordField\(gate, email\)/);
  assert.match(login, /silent: true/);
  assert.equal(login.includes("Need to get back in?"), true);
});

test("needsCreate still switches to one create step, never for the owner", () => {
  assert.equal(loginShowsCreateFields("create", TESTER), true);
  assert.equal(loginShowsPasswordField("create", TESTER), false);
  assert.equal(loginGateAfterProbe({ email: TESTER, probe: "create", current: "password" }), "create");
  assert.equal(loginGateAfterProbe({ email: OWNER_LOGIN_EMAIL, probe: "create", current: "password" }), "password");
  assert.equal(loginShowsCreateFields("create", OWNER_LOGIN_EMAIL), false);
  assert.equal(loginShowsPasswordField("create", OWNER_LOGIN_EMAIL), true);

  const login = readFileSync(fileURLToPath(new URL("../components/LoginForm.tsx", import.meta.url)), "utf8");
  assert.match(login, /FIRST SIGN-IN/);
  assert.match(login, /newPassword: nextPassword/);
  assert.match(login, /if \(next === "create"\)/);
  assert.match(login, /isOwnerLoginEmail\(email\) && gate === "create"/);
});

test("mustChange gate asks only for new+confirm and clears once", () => {
  assert.equal(
    mustChangeGateBlocks({ status: "authenticated", mustChangePassword: true, released: false }),
    true,
  );
  assert.equal(
    mustChangeGateBlocks({ status: "authenticated", mustChangePassword: true, released: true }),
    false,
  );
  assert.equal(
    mustChangeGateBlocks({ status: "authenticated", mustChangePassword: false, released: false }),
    false,
  );
  assert.equal(
    mustChangeGateBlocks({ status: "unauthenticated", mustChangePassword: true, released: false }),
    false,
  );

  const gate = readFileSync(
    fileURLToPath(new URL("../components/MustChangePasswordGate.tsx", import.meta.url)),
    "utf8",
  );
  assert.match(gate, /autoComplete="new-password"/);
  assert.doesNotMatch(gate, /current-password|Current password|temp password|TEMPORARY PASSWORD/i);
  assert.match(gate, /setReleased\(true\)/);
  assert.match(gate, /mustChangePassword: false/);
  assert.match(gate, /acceptUser/);
  assert.equal(gate.includes(ISSUED), false);
});

test("create-on-login does not stack a second must-change gate", () => {
  assert.equal(
    mustChangeGateBlocks({ status: "authenticated", mustChangePassword: false, released: false }),
    false,
  );
  const login = readFileSync(fileURLToPath(new URL("../components/LoginForm.tsx", import.meta.url)), "utf8");
  const users = readFileSync(fileURLToPath(new URL("./users.ts", import.meta.url)), "utf8");
  assert.match(users, /user\.mustChangePassword = false;/);
  assert.match(login, /newPassword: nextPassword/);
  assert.doesNotMatch(login, /MustChangePasswordGate/);
});

test("looksLikeEmail is strict enough for a silent probe", () => {
  assert.equal(looksLikeEmail("robertmhenderson582@gmail.com"), true);
  assert.equal(looksLikeEmail("  NathanBoyte@gmail.com "), true);
  assert.equal(looksLikeEmail("nathan"), false);
  assert.equal(looksLikeEmail(""), false);
});
