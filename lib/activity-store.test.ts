import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, beforeEach, describe, it } from "node:test";

import { activityWhoNames, filterActivityByWho } from "./activity-filter.ts";
import {
  addActivity,
  forgetActivityCacheForTests,
  listActivity,
  resetActivityStoreForTests,
  useActivityVaultForTests,
  type ActivityRow,
} from "./activity-store.ts";
import { memoryDrive } from "./drive-estimates.ts";

const dir = mkdtempSync(join(tmpdir(), "hs-activity-"));
process.env.ACTIVITY_STORE_PATH = join(dir, "activity.json");

beforeEach(() => {
  resetActivityStoreForTests();
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("activity vault persist", () => {
  it("does not invent a demo ledger", async () => {
    assert.deepEqual(await listActivity(), []);
    const ownerDesk = readFileSync(fileURLToPath(new URL("./owner-desk.ts", import.meta.url)), "utf8");
    assert.equal(/seedOwnerDemo|Owner desk · sign-in ok/.test(ownerDesk), false);
    const desk = readFileSync(fileURLToPath(new URL("../components/ActivityDesk.tsx", import.meta.url)), "utf8");
    assert.equal(/Demo owner rows/.test(desk), false);
  });

  it("keeps a real row after the local cache is wiped", async () => {
    const drive = memoryDrive();
    useActivityVaultForTests(drive);
    const row = await addActivity({
      kind: "sign-in",
      who: "Robert Henderson",
      detail: "Owner desk · sign-in ok",
    });
    forgetActivityCacheForTests();
    useActivityVaultForTests(drive);
    const listed = await listActivity();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, row.id);
    assert.equal(listed[0].detail, "Owner desk · sign-in ok");
  });
});

function row(id: string, who: string, kind: ActivityRow["kind"] = "feature"): ActivityRow {
  return { id, at: 1, kind, who, detail: `${kind} · ${who}` };
}

describe("activity name filter", () => {
  const rows = [
    row("a", "Robert Henderson", "sign-in"),
    row("b", "Stephanie Hall", "session"),
    row("c", "Ben Peffley", "feature"),
    row("d", "Stephanie Hall", "error"),
    row("e", "  ", "failed"),
  ];

  it("defaults to every row and can keep one name", () => {
    assert.deepEqual(filterActivityByWho(rows, "").map((item) => item.id), ["a", "b", "c", "d", "e"]);
    assert.deepEqual(filterActivityByWho(rows).map((item) => item.id), ["a", "b", "c", "d", "e"]);
    assert.deepEqual(filterActivityByWho(rows, "Stephanie Hall").map((item) => item.id), ["b", "d"]);
    assert.deepEqual(filterActivityByWho(rows, "  Stephanie Hall  ").map((item) => item.id), ["b", "d"]);
    assert.deepEqual(filterActivityByWho(rows, "Ben Peffley").map((item) => item.id), ["c"]);
  });

  it("returns no rows when the name does not appear", () => {
    assert.deepEqual(filterActivityByWho(rows, "Nathan Boyte"), []);
    assert.deepEqual(filterActivityByWho([], "Robert Henderson"), []);
  });

  it("lists only names that have rows — not TESTER_SEATS", () => {
    assert.deepEqual(activityWhoNames(rows), ["Ben Peffley", "Robert Henderson", "Stephanie Hall"]);
    assert.equal(activityWhoNames(rows).includes("Nathan Boyte"), false);
    const filterSrc = readFileSync(fileURLToPath(new URL("./activity-filter.ts", import.meta.url)), "utf8");
    const storeSrc = readFileSync(fileURLToPath(new URL("./activity-store.ts", import.meta.url)), "utf8");
    const desk = readFileSync(fileURLToPath(new URL("../components/ActivityDesk.tsx", import.meta.url)), "utf8");
    const testers = readFileSync(fileURLToPath(new URL("./tester-seats.ts", import.meta.url)), "utf8");
    assert.equal(/TESTER_SEATS/.test(filterSrc), false);
    assert.equal(/TESTER_SEATS/.test(desk), false);
    assert.equal(/node:fs|node:path/.test(filterSrc), false);
    assert.match(testers, /Nathan Boyte/);
    assert.equal(/Nathan Boyte/.test(filterSrc), false);
    assert.equal(/activityWhoNames|filterActivityByWho/.test(storeSrc), false);
    assert.match(desk, /from "@\/lib\/activity-filter"/);
    assert.match(desk, /import type \{ ActivityKind, ActivityRow \} from "@\/lib\/activity-store"/);
    assert.match(desk, /activityWhoNames/);
    assert.match(desk, /filterActivityByWho/);
    assert.equal(/paper-field|type="search"|placeholder="Search/.test(desk), false);
    assert.match(desk, /Filter Activity by name/);
  });
});

describe("activity stays on the build desk", () => {
  it("does not open Activity to testers or leak Novus on tester chrome", () => {
    const page = readFileSync(fileURLToPath(new URL("../app/settings/activity/page.tsx", import.meta.url)), "utf8");
    const api = readFileSync(fileURLToPath(new URL("../app/api/desk/activity/route.ts", import.meta.url)), "utf8");
    const shell = readFileSync(fileURLToPath(new URL("../components/SettingsShell.tsx", import.meta.url)), "utf8");
    const follow = readFileSync(fileURLToPath(new URL("../components/FollowDesk.tsx", import.meta.url)), "utf8");
    assert.match(page, /SettingsGate buildDesk/);
    assert.match(api, /hasBuildDesk\(user\)/);
    assert.match(shell, /href: "\/settings\/activity".*buildDesk: true/);
    assert.match(follow, /NOVUS_EMAIL/);
    assert.match(follow, /seat\.email\.toLowerCase\(\) !== NOVUS_EMAIL/);
  });
});
