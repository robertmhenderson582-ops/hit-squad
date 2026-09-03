import assert from "node:assert/strict";
import { test } from "node:test";
import { NOVUS_EMAIL } from "./desk-role.ts";
import {
  canonicalEmail,
  identityBucket,
  isOwnerIdentity,
  OWNER_DISPLAY_NAME,
  OWNER_ID,
  resolveIdentity,
} from "./identity.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { TESTER_SEATS } from "./tester-seats.ts";

const NAMED = ["Nathan", "Chance", "Benny", "Shane", "Wendell", "Joseph", "James"] as const;

test("normalized email is the owner identity; display name and local-part are aliases", () => {
  const owner = resolveIdentity(OWNER_LOGIN_EMAIL);
  assert.ok(owner);
  assert.equal(owner.email, OWNER_LOGIN_EMAIL);
  assert.equal(owner.id, OWNER_ID);
  assert.equal(owner.role, "owner");

  for (const raw of [
    "  RobertMHenderson582@Gmail.com ",
    "robertmhenderson582",
    OWNER_DISPLAY_NAME,
    OWNER_ID,
  ]) {
    assert.equal(isOwnerIdentity(raw), true, raw);
    assert.equal(canonicalEmail(raw), OWNER_LOGIN_EMAIL, raw);
    assert.equal(resolveIdentity(raw)?.email, OWNER_LOGIN_EMAIL, raw);
  }

  assert.equal(isOwnerIdentity(NOVUS_EMAIL), false);
  assert.equal(canonicalEmail(NOVUS_EMAIL), NOVUS_EMAIL);
  assert.equal(resolveIdentity(NOVUS_EMAIL)?.role, "operator");
});

test("seeded people each have one identity bucket — no duplicate Nathan/Chance/Benny/Shane/Wendell/Joseph/James", () => {
  const people = [
    resolveIdentity(OWNER_LOGIN_EMAIL),
    resolveIdentity(NOVUS_EMAIL),
    ...TESTER_SEATS.map((seat) => resolveIdentity(seat.email)),
  ];
  assert.ok(people.every(Boolean));

  const emails = people.map((person) => person!.email);
  const ids = people.map((person) => person!.id);
  const buckets = people.map((person) => identityBucket(person!.email));
  assert.equal(new Set(emails).size, emails.length);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(buckets).size, buckets.length);

  for (const name of NAMED) {
    const matches = TESTER_SEATS.filter((seat) => seat.name.toLowerCase().includes(name.toLowerCase()));
    assert.equal(matches.length, 1, `${name} should have exactly one seeded seat`);
    assert.equal(identityBucket(matches[0].email), matches[0].email);
  }

  assert.equal(TESTER_SEATS.some((seat) => isOwnerIdentity(seat.email) || isOwnerIdentity(seat.id)), false);
  assert.equal(isOwnerIdentity("josephmhenderson2002@gmail.com"), false);
  assert.equal(isOwnerIdentity("nathanboyte@gmail.com"), false);
});
