import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { beatPresence, listSeats, resetPresenceForTests, seatFor } from "./presence.ts";

const dir = mkdtempSync(join(tmpdir(), "hs-presence-"));
const file = join(dir, "presence.json");

after(() => {
  resetPresenceForTests();
  rmSync(dir, { recursive: true, force: true });
});

test("presence persist keeps Live green across a memory reset", () => {
  resetPresenceForTests(file);
  const row = beatPresence({
    email: "nathanboyte@gmail.com",
    name: "Nathan Boyte",
    path: "/estimates/est-coker",
  });
  assert.equal(row.path, "/estimates/est-coker");
  assert.equal(existsSync(file), true);

  resetPresenceForTests(file);
  const saved = seatFor("nathanboyte@gmail.com");
  assert.equal(saved?.path, "/estimates/est-coker");
  assert.equal(saved?.name, "Nathan Boyte");

  const seats = listSeats("robertmhenderson582@gmail.com");
  const nathan = seats.find((seat) => seat.email === "nathanboyte@gmail.com");
  assert.ok(nathan);
  assert.equal(nathan.live, true);
  assert.equal(nathan.path, "/estimates/est-coker");
  assert.equal(
    seats.some((seat) => seat.email === "robertmhenderson582@gmail.com"),
    false,
  );
});

test("listSeats picks up a newer file beat so Live stays green", () => {
  resetPresenceForTests(file);
  beatPresence({ email: "owner-local@example.com", name: "Owner", path: "/" });
  const now = Date.now();
  const parsed = JSON.parse(readFileSync(file, "utf8")) as {
    seats: Array<{ email: string; name: string; path: string; startedAt: number; lastAt: number }>;
  };
  parsed.seats.push({
    email: "marks544@yahoo.com",
    name: "Mark Schneider",
    path: "/jobs",
    startedAt: now,
    lastAt: now,
  });
  writeFileSync(file, JSON.stringify(parsed), "utf8");
  const seats = listSeats("owner-local@example.com");
  const mark = seats.find((seat) => seat.email === "marks544@yahoo.com");
  assert.ok(mark);
  assert.equal(mark.live, true);
  assert.equal(mark.path, "/jobs");
});
