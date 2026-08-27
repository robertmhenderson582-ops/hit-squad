import assert from "node:assert/strict";
import { test } from "node:test";
import { aliasText } from "./catalog-aliases.ts";
import { NOVUS_EMAIL } from "./desk-role.ts";
import { boundOtLabel } from "./hours-clock.ts";
import {
  FORBIDDEN_SEED_EMAILS,
  FORBIDDEN_SEED_NAMES,
  JOHN_BEECH_EMAIL,
  JAMES_EMAIL,
  JOHN_HENRY_EMAIL,
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
  assert.equal(testerByEmail(JOHN_HENRY_EMAIL)?.company, "lucky13");
  assert.equal(testerByEmail("JohnHenry484@gmail.com")?.email, JOHN_HENRY_EMAIL);
  assert.equal(testerByEmail(JOHN_HENRY_EMAIL)?.aliased, true);
  assert.equal(testerByEmail(JOHN_HENRY_EMAIL)?.rateBuilder, true);
  assert.equal(testerByEmail(JOHN_HENRY_EMAIL)?.shop, "field");
  assert.equal(testerByEmail(JOHN_HENRY_EMAIL)?.viewAs, false);
  assert.equal(
    TESTER_SEATS.filter((row) => row.company === "cbi").map((row) => row.email).join(),
    JAMES_EMAIL,
  );
});

test("does not seed the held-out people", () => {
  assert.equal(hasForbiddenSeed(), false);
  assert.equal(TESTER_SEATS.length, 12);
  assert.equal(FORBIDDEN_SEED_EMAILS.includes("johnhenry" as never), false);
  assert.equal((FORBIDDEN_SEED_NAMES as readonly string[]).includes("john henry"), false);
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
    JOHN_HENRY_EMAIL,
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

test("aliased Mark never sees the East Coast PCA lock; real Nathan still does", () => {
  const mark = testerByEmail("marks544@yahoo.com");
  const nathan = testerByEmail("nathanboyte@gmail.com");
  const john = testerByEmail(JOHN_BEECH_EMAIL);
  assert.equal(mark?.aliased, true);
  assert.equal(nathan?.aliased, false);
  assert.equal(john?.aliased, false);

  const lock = boundOtLabel("Wood River — Roxana, IL", "Phillips 66");
  assert.equal(lock, "East Coast (PCA0001103)");
  const markLine = aliasText(lock, true, mark?.aliased ? "aliased" : "real");
  const nathanLine = aliasText(lock, true, nathan?.aliased ? "aliased" : "real");
  assert.equal(markLine, "Atlantic overtime");
  assert.equal(/PCA0001103|East Coast/.test(markLine), false);
  assert.equal(nathanLine, "East Coast (PCA0001103)");
  assert.equal(aliasText(lock, true, "real"), "East Coast (PCA0001103)");
  assert.equal(aliasText("PCA0001103", true, "aliased"), "Atlantic");
  assert.equal(aliasText("West Coast (PCA0001100)", true, "aliased"), "Pacific overtime");
  assert.equal(aliasText("PCA0001100", true, "aliased"), "Pacific");
  assert.equal(aliasText("West Coast (PCA0001100)", true, "real"), "West Coast (PCA0001100)");

  const ratesBlurb = "Pull the live book for this site. Wood River is the only loaded book. Hours, headcount, dates, qty, freight, and typed third-party stay.";
  const markRates = aliasText(ratesBlurb, true, "aliased");
  assert.match(markRates, /Midwest is the only loaded book/);
  assert.equal(/Wood River/i.test(markRates), false);
  assert.equal(aliasText(ratesBlurb, true, "real"), ratesBlurb);
  assert.match(aliasText("Only Wood River is loaded.", true, "aliased"), /Only Midwest is loaded/);
  assert.match(aliasText("Shahan TM OCIP — Wood River", true, "aliased"), /Midwest/);
  assert.equal(/Wood River/i.test(aliasText("Shahan TM OCIP — Wood River", true, "aliased")), false);
});
