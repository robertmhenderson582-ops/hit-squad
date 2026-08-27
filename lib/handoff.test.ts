import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NOVUS_EMAIL } from "./desk-role.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { JOSEPH_EMAIL, SHANE_EMAIL } from "./tester-seats.ts";
import { findHandoffSeat, handoffSeats, handoffTargetsFor, isHandoffEmail } from "./handoff.ts";

describe("handoff seats", () => {
  it("lists real desk people and never Novus", () => {
    const seats = handoffSeats();
    assert.equal(seats.some((row) => row.email === OWNER_LOGIN_EMAIL), true);
    assert.equal(seats.some((row) => row.email === "nathanboyte@gmail.com"), true);
    assert.equal(seats.some((row) => row.email === JOSEPH_EMAIL), true);
    assert.equal(seats.some((row) => row.email === SHANE_EMAIL), true);
    assert.equal(seats.some((row) => row.email === NOVUS_EMAIL), false);
    assert.equal(seats.every((row) => row.name && row.email && !("passwordIssued" in row) && !("role" in row)), true);
    assert.equal(isHandoffEmail("not-a-desk@example.com"), false);
    assert.equal(isHandoffEmail(NOVUS_EMAIL), false);
    assert.equal(findHandoffSeat("NathanBoyte@gmail.com")?.name, "Nathan Boyte");
  });

  it("lets the current person pick someone else, not themselves", () => {
    const owner = handoffTargetsFor({ email: OWNER_LOGIN_EMAIL, role: "owner" });
    assert.equal(owner.some((row) => row.email === OWNER_LOGIN_EMAIL), false);
    assert.equal(owner.some((row) => row.email === "nathanboyte@gmail.com"), true);
    const nathan = handoffTargetsFor({ email: "nathanboyte@gmail.com", role: "tester" });
    assert.equal(nathan.some((row) => row.email === "nathanboyte@gmail.com"), false);
    assert.equal(nathan.some((row) => row.email === OWNER_LOGIN_EMAIL), true);
  });
});
