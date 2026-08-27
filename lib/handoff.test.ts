import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NOVUS_EMAIL } from "./desk-role.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { JAMES_EMAIL, JOHN_HENRY_EMAIL, JOSEPH_EMAIL, SHANE_EMAIL } from "./tester-seats.ts";
import {
  findHandoffSeat,
  handoffMarkText,
  handoffSeats,
  handoffTargetsFor,
  isHandoffEmail,
  packSharedWithYou,
  packTransferredToYou,
  transferredFromLabel,
} from "./handoff.ts";

describe("handoff seats", () => {
  it("lists real desk people and never Novus", () => {
    const seats = handoffSeats();
    assert.equal(seats.some((row) => row.email === OWNER_LOGIN_EMAIL), true);
    assert.equal(seats.some((row) => row.email === "nathanboyte@gmail.com"), true);
    assert.equal(seats.some((row) => row.email === JOSEPH_EMAIL), true);
    assert.equal(seats.some((row) => row.email === SHANE_EMAIL), true);
    assert.equal(seats.some((row) => row.email === JAMES_EMAIL), true);
    assert.equal(seats.some((row) => row.email === JOHN_HENRY_EMAIL), true);
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

  it("marks a transferred job for the recipient and a shared job for the collaborator", () => {
    const transferred = {
      ownerEmail: "nathanboyte@gmail.com",
      transferredFrom: OWNER_LOGIN_EMAIL,
      transferredFromName: "Robert Henderson",
      transferredTo: "nathanboyte@gmail.com",
    };
    assert.equal(packTransferredToYou(transferred, "nathanboyte@gmail.com"), true);
    assert.equal(packTransferredToYou(transferred, OWNER_LOGIN_EMAIL), false);
    assert.equal(transferredFromLabel(transferred), "Robert Henderson");
    const shared = { ownerEmail: OWNER_LOGIN_EMAIL, sharedWith: ["nathanboyte@gmail.com"] };
    assert.equal(packSharedWithYou(shared, "nathanboyte@gmail.com"), true);
    assert.equal(packSharedWithYou(shared, OWNER_LOGIN_EMAIL), false);
    assert.equal(packSharedWithYou(shared, JOSEPH_EMAIL), false);
    assert.equal(handoffMarkText(transferred, "nathanboyte@gmail.com"), "Transferred to you from Robert Henderson.");
    assert.equal(handoffMarkText(shared, "nathanboyte@gmail.com"), "Shared. You can work on this job.");
    assert.equal(handoffMarkText(shared, OWNER_LOGIN_EMAIL), "Shared with Nathan Boyte.");
    assert.equal(handoffMarkText(shared, JOSEPH_EMAIL), null);
    const sharedToOwner = { ownerEmail: "nathanboyte@gmail.com", sharedWith: [OWNER_LOGIN_EMAIL] };
    assert.equal(packSharedWithYou(sharedToOwner, OWNER_LOGIN_EMAIL), true);
    assert.equal(packSharedWithYou(sharedToOwner, "nathanboyte@gmail.com"), false);
    assert.equal(handoffMarkText(sharedToOwner, OWNER_LOGIN_EMAIL), "Shared. You can work on this job.");
  });
});
