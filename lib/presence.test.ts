import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  beatPresence,
  listSeats,
  PRESENCE_IDLE_MS,
  presenceStoreKind,
  resetPresenceStoreForTests,
} from "./presence.ts";
import { NOVUS_EMAIL } from "./desk-role.ts";
import { JOSEPH_EMAIL } from "./tester-seats.ts";

const dir = mkdtempSync(join(tmpdir(), "hs-presence-"));
const file = join(dir, "presence.json");

after(() => {
  resetPresenceStoreForTests();
});

test("presence persist is Live inside 90s and idle at 90s", () => {
  resetPresenceStoreForTests(file);
  const now = 1_700_000_000_000;
  beatPresence({ email: JOSEPH_EMAIL, name: "Joseph Henderson", path: "/estimates" }, now);
  beatPresence({ email: "robertmhenderson582@gmail.com", name: "Robert Henderson", path: "/" }, now);
  beatPresence({ email: NOVUS_EMAIL, name: "Novus", path: "/settings" }, now);

  const live = listSeats("robertmhenderson582@gmail.com", now + 1_000);
  assert.equal(presenceStoreKind(), "server-json-file");
  assert.equal(live.some((row) => row.email === JOSEPH_EMAIL && row.live), true);
  assert.equal(live.some((row) => row.email === "robertmhenderson582@gmail.com"), false);
  assert.equal(live.some((row) => row.email === NOVUS_EMAIL), false);

  resetPresenceStoreForTests(file);
  const again = listSeats("robertmhenderson582@gmail.com", now + 1_000);
  assert.equal(again.some((row) => row.email === JOSEPH_EMAIL && row.live), true);

  const idle = listSeats("robertmhenderson582@gmail.com", now + PRESENCE_IDLE_MS);
  assert.equal(idle.find((row) => row.email === JOSEPH_EMAIL)?.live, false);
});
