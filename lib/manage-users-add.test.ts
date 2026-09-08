import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DESK_SEATS_CHANGED_EVENT,
  SEATS_RECOVER_DEADLINE_MS,
  SEATS_REQUEST_DEADLINE_MS,
  SEATS_TIMEOUT_ERROR,
  applyAddedSeats,
  isAlreadySeatedError,
  optimisticSeat,
  removeOptimisticSeat,
  seatsIncludeEmail,
} from "./manage-users-add.ts";

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const current = [
  { id: "owner-1", email: "robertmhenderson582@gmail.com", name: "Robert Henderson", role: "owner" },
];

test("optimistic add merges without a seats payload, then server seats replace it", () => {
  const pending = optimisticSeat({
    name: "Freddy Grimland",
    email: "Freddy@Example.com",
    role: "president",
    companyId: "madison",
  });
  assert.equal(pending.id, "pending-freddy@example.com");
  assert.equal(pending.role, "president");
  const shown = applyAddedSeats(current, undefined, undefined, pending);
  assert.equal(seatsIncludeEmail(shown, "freddy@example.com"), true);
  assert.equal(shown[shown.length - 1]?.name, "Freddy Grimland");

  const fromServer = applyAddedSeats(
    shown,
    [
      ...current,
      { id: "custom-freddy", email: "freddy@example.com", name: "Freddy Grimland", role: "president", companyId: "madison" },
    ],
    undefined,
    pending,
  );
  assert.equal(fromServer.some((row) => row.id === "pending-freddy@example.com"), false);
  assert.equal(fromServer.some((row) => row.id === "custom-freddy" && row.role === "president"), true);
});

test("created user lands when seats list is missing, and pending rows roll back", () => {
  const pending = optimisticSeat({
    name: "Freddy Grimland",
    email: "freddy@example.com",
    role: "president",
    companyId: "madison",
  });
  const shown = applyAddedSeats(current, undefined, undefined, pending);
  const merged = applyAddedSeats(
    shown,
    [],
    { id: "custom-freddy", email: "freddy@example.com", name: "Freddy Grimland", role: "president" },
    pending,
  );
  assert.equal(merged.some((row) => row.id === "custom-freddy"), true);
  assert.equal(removeOptimisticSeat(shown, "freddy@example.com").some((row) => row.email === "freddy@example.com"), false);
  assert.equal(isAlreadySeatedError("That email already has a seat."), true);
  assert.equal(isAlreadySeatedError("Could not add."), false);
});

test("Add user submit shows ADDING…, times out, and does not stay stuck", () => {
  assert.ok(SEATS_REQUEST_DEADLINE_MS <= 20000);
  assert.ok(SEATS_REQUEST_DEADLINE_MS >= 8000);
  assert.ok(SEATS_RECOVER_DEADLINE_MS <= 4000);
  assert.match(SEATS_TIMEOUT_ERROR, /timed out/i);
  const desk = source("../components/ManageUsersDesk.tsx");
  const people = source("../components/useDeskPeople.ts");
  const seats = source("../app/api/desk/seats/route.ts");
  assert.match(desk, /if \(adding\) return/);
  assert.match(desk, /setAdding\(true\)/);
  assert.match(desk, /ADDING…/);
  assert.match(desk, /disabled=\{adding\}/);
  assert.match(desk, /finally \{\s*setAdding\(false\);/);
  assert.match(desk, /fetchJsonWithDeadline/);
  assert.match(desk, /SEATS_REQUEST_DEADLINE_MS/);
  assert.match(desk, /SEATS_RECOVER_DEADLINE_MS/);
  assert.match(desk, /SEATS_TIMEOUT_ERROR/);
  assert.match(desk, /applyAddedSeats/);
  assert.match(desk, /removeOptimisticSeat/);
  assert.match(desk, /DESK_SEATS_CHANGED_EVENT/);
  assert.doesNotMatch(desk, /invite email sent/i);
  assert.match(people, /DESK_SEATS_CHANGED_EVENT/);
  assert.match(seats, /listSeatRows\(\{ hydrate: false \}\)/);
  assert.match(seats, /peekCompanies\(\)/);
});
