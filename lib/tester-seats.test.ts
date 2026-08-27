import assert from "node:assert/strict";
import { test } from "node:test";
import { aliasText } from "./catalog-aliases.ts";
import { NOVUS_EMAIL } from "./desk-role.ts";
import {
  FORBIDDEN_SEED_EMAILS,
  JOHN_BEECH_EMAIL,
  JAMES_EMAIL,
  JOSEPH_EMAIL,
  SHANE_EMAIL,
  TESTER_SEATS,
  hasForbiddenSeed,
  testerByEmail,
} from "./tester-seats.ts";

test("John Beech is only the madison gmail", () => {
  const john = testerByEmail("JohnBeech.madison@gmail.com");
  assert.equal(john?.email, JOHN_BEECH_EMAIL);
  assert.equal(
    TESTER_SEATS.some((row) => row.email === "beechj@madisonltd.com"),
    false,
  );
  assert.equal(FORBIDDEN_SEED_EMAILS.includes("beechj@madisonltd.com"), true);
});

test("seeds company homes without inventing extra seats", () => {
  assert.equal(testerByEmail("nathanboyte@gmail.com")?.company, "madison");
  assert.equal(testerByEmail(JOHN_BEECH_EMAIL)?.company, "madison");
  assert.equal(testerByEmail(JAMES_EMAIL)?.company, "cbi");
  assert.equal(testerByEmail(JAMES_EMAIL)?.email, "jameshcainjr@gmail.com");
  assert.equal(testerByEmail(JOSEPH_EMAIL)?.company, "hitsquad");
  assert.equal(testerByEmail("marks544@yahoo.com")?.company, "hitsquad");
  assert.equal(
    TESTER_SEATS.filter((row) => row.company === "cbi").map((row) => row.email).join(),
    JAMES_EMAIL,
  );
});

test("does not seed the held-out people", () => {
  assert.equal(hasForbiddenSeed(), false);
  assert.equal(TESTER_SEATS.length, 11);
  assert.equal(
    TESTER_SEATS.some((row) => row.email === NOVUS_EMAIL),
    false,
  );
});

test("alias flags and tools match the seat list", () => {
  const real = [
    "nathanboyte@gmail.com",
    JOHN_BEECH_EMAIL,
    "wlanderno@yahoo.com",
    "bccamp2@gmail.com",
    "chancec318@yahoo.com",
    SHANE_EMAIL,
  ];
  const aliased = [
    "marks544@yahoo.com",
    "puma.cody@gmail.com",
    "bstubby@aol.com",
    "jameshcainjr@gmail.com",
    JOSEPH_EMAIL,
  ];
  for (const email of real) {
    assert.equal(testerByEmail(email)?.aliased, false, email);
    assert.equal(testerByEmail(email)?.rateBuilder, true, email);
  }
  for (const email of aliased) {
    assert.equal(testerByEmail(email)?.aliased, true, email);
  }
  assert.equal(testerByEmail(JOSEPH_EMAIL)?.rateBuilder, false);
  assert.equal(testerByEmail(JOSEPH_EMAIL)?.viewAs, true);
  assert.deepEqual(
    TESTER_SEATS.filter((row) => row.viewAs).map((row) => row.email),
    [JOSEPH_EMAIL],
  );
});

test("Shane Smith is a field tester, not Joseph tools, and only the AP Controls email", () => {
  const shane = testerByEmail("Shane@APControlsLLC.com");
  assert.equal(shane?.id, "tester-shane");
  assert.equal(shane?.email, SHANE_EMAIL);
  assert.equal(shane?.email, shane?.email.toLowerCase());
  assert.equal(shane?.name, "Shane Smith");
  assert.equal(shane?.aliased, false);
  assert.equal(shane?.rateBuilder, true);
  assert.equal(shane?.viewAs, false);
  assert.equal(shane?.shop, "field");
  assert.equal(
    TESTER_SEATS.some((row) => row.email === "beechj@madisonltd.com"),
    false,
  );
  assert.equal(
    TESTER_SEATS.filter((row) => row.name === "Shane Smith").map((row) => row.email).join(),
    SHANE_EMAIL,
  );
  assert.equal(
    TESTER_SEATS.some((row) => /shane/i.test(row.email) && row.email !== SHANE_EMAIL),
    false,
  );
});

test("aliased catalog covers the locked plant names", () => {
  const sample = "P66 Wood River / Bayway / Rodeo / Ferndale / Billings · GP Yates · Monroe Trainer";
  const next = aliasText(sample, true, "aliased");
  assert.match(next, /Ironwood/);
  assert.match(next, /Midwest/);
  assert.match(next, /East/);
  assert.match(next, /West/);
  assert.match(next, /Northwest/);
  assert.match(next, /Rockies/);
  assert.match(next, /Ridge Station/);
  assert.match(next, /Harbor/);
  assert.equal(/P66|Wood River|Bayway|Rodeo|Ferndale|Billings|Yates|Trainer|Monroe|\bGP\b/i.test(next), false);
  assert.equal(aliasText(sample, true, "real"), sample);
});
