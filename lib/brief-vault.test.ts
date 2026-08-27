import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  briefsLeak,
  briefsResponse,
  getVisibleBriefFile,
  listVisibleBriefs,
  saveBriefResponse,
  saveUserBrief,
} from "./brief-vault.ts";
import { HSE_ROOM_ID, QUALITY_ROOM_ID, memoryBriefDrive } from "./drive-briefs.ts";
import {
  BRIEF_ALLOWED_MIME,
  BRIEF_MAX_DROP_BYTES,
  BRIEF_MAX_FILE_BYTES,
  BRIEF_SIZE_ERROR,
  BRIEF_TYPE_ERROR,
} from "./lead-briefs.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { JOSEPH_EMAIL } from "./tester-seats.ts";

const owner = { email: OWNER_LOGIN_EMAIL, name: "Robert Henderson", role: "owner" as const };
const chance = { email: "chancec318@yahoo.com", name: "Chance Middlebrooks", role: "tester" as const };
const wendell = { email: "wlanderno@yahoo.com", name: "Wendell Landerno", role: "tester" as const };
const joseph = { email: JOSEPH_EMAIL, name: "Joseph Henderson", role: "tester" as const };

function files(label: string) {
  return [
    { name: `${label}-a.pdf`, type: "application/pdf", data: Buffer.from(`${label}-a`).toString("base64") },
    { name: `${label}-b.csv`, type: "text/csv", data: Buffer.from(`${label}-b`).toString("base64") },
  ];
}

function sizedFile(name: string, type: string, bytes: number) {
  return { name, type, data: "A".repeat(Math.ceil(bytes / 3) * 4) };
}

describe("brief vault service", () => {
  it("lets testers save their own drop, hides it from other testers, and lists both for the owner", async () => {
    const drive = memoryBriefDrive();
    const chanceSave = await saveUserBrief(
      chance,
      { kind: "quality", describe: "Chance ITP", files: files("chance") },
      drive,
    );
    const wendellSave = await saveUserBrief(
      wendell,
      { kind: "quality", describe: "Wendell weld", files: files("wendell") },
      drive,
    );
    assert.equal(chanceSave.ok, true);
    assert.equal(wendellSave.ok, true);
    if (!chanceSave.ok || !wendellSave.ok) return;
    assert.equal(chanceSave.stored, true);
    assert.equal(chanceSave.brief?.files.length, 2);

    const chanceList = await listVisibleBriefs(chance, "quality", drive);
    const wendellList = await listVisibleBriefs(wendell, "quality", drive);
    const josephList = await listVisibleBriefs(joseph, "quality", drive);
    const ownerList = await listVisibleBriefs(owner, "quality", drive);
    assert.deepEqual(chanceList.briefs, []);
    assert.deepEqual(wendellList.briefs, []);
    assert.deepEqual(josephList.briefs, []);
    assert.equal(ownerList.briefs.length, 2);
    assert.equal(
      ownerList.briefs.some((row) => row.who === chance.email && row.files.length === 2),
      true,
    );
    assert.equal(
      ownerList.briefs.some((row) => row.who === wendell.email && row.describe === "Wendell weld"),
      true,
    );

    const hidden = briefsResponse(chance, ownerList.briefs, "drive");
    assert.deepEqual(hidden.briefs, []);
    assert.equal("store" in hidden, false);
    assert.equal(briefsLeak(hidden), false);
    assert.equal(briefsLeak(briefsResponse(owner, ownerList.briefs, "drive")), false);
    assert.equal(briefsLeak({ room: QUALITY_ROOM_ID }), true);
    assert.equal(briefsLeak({ room: HSE_ROOM_ID }), true);

    const chanceFile = chanceSave.brief?.files[0];
    assert.ok(chanceFile);
    assert.equal(await getVisibleBriefFile(wendell, chanceFile.id, drive), null);
    assert.equal(await getVisibleBriefFile(joseph, chanceFile.id, drive), null);
    const ownerFile = await getVisibleBriefFile(owner, chanceFile.id, drive);
    assert.equal(new TextDecoder().decode(ownerFile?.bytes), "chance-a");

    const hse = await saveUserBrief(wendell, { kind: "hse", describe: "JSA", files: files("hse") }, drive);
    assert.equal(hse.ok, true);
    const ownerHse = await listVisibleBriefs(owner, "hse", drive);
    const ownerQuality = await listVisibleBriefs(owner, "quality", drive);
    assert.equal(ownerHse.briefs.length, 1);
    assert.equal(ownerQuality.briefs.length, 2);
  });

  it("keeps Save successful when the vault key is missing", async () => {
    const missing = await saveUserBrief(chance, {
      kind: "quality",
      describe: "still on this desk",
      files: files("local"),
    });
    assert.equal(missing.ok, true);
    if (!missing.ok) return;
    assert.equal(missing.stored, false);
    assert.equal(missing.store, "unconfigured");
    const testerBody = saveBriefResponse(chance, missing);
    assert.equal(testerBody.ok, true);
    assert.equal(testerBody.stored, false);
    assert.equal("store" in testerBody, false);
    const ownerBody = saveBriefResponse(owner, missing);
    assert.equal(ownerBody.store, "unconfigured");
    assert.equal(briefsLeak(testerBody), false);
  });

  it("lets allowed types through and rejects blocked types, oversize files, and oversize drops before upload", async () => {
    const drive = memoryBriefDrive();
    const allowed = await saveUserBrief(
      chance,
      {
        kind: "quality",
        describe: "allowed pack",
        files: Object.entries(BRIEF_ALLOWED_MIME).map(([ext, type]) => ({
          name: ext === "jpeg" ? "photo.jpeg" : `form.${ext}`,
          type,
          data: Buffer.from(ext).toString("base64"),
        })),
      },
      drive,
    );
    assert.equal(allowed.ok, true);
    if (!allowed.ok) return;
    assert.equal(allowed.stored, true);
    assert.equal(allowed.brief?.files.length, Object.keys(BRIEF_ALLOWED_MIME).length);

    const blocked = await saveUserBrief(
      chance,
      { kind: "quality", describe: "exe", files: [{ name: "trap.exe", type: "application/x-msdownload", data: "QQ==" }] },
      drive,
    );
    assert.equal(blocked.ok, false);
    if (blocked.ok) return;
    assert.equal(blocked.status, 400);
    assert.equal(blocked.error, BRIEF_TYPE_ERROR);

    const html = await saveUserBrief(
      wendell,
      { kind: "hse", describe: "html", files: [{ name: "page.html", type: "text/html", data: "PGg+" }] },
      drive,
    );
    assert.equal(html.ok, false);
    if (html.ok) return;
    assert.equal(html.error, BRIEF_TYPE_ERROR);

    const oversizeFile = await saveUserBrief(
      chance,
      {
        kind: "quality",
        describe: "too big",
        files: [sizedFile("huge.pdf", "application/pdf", BRIEF_MAX_FILE_BYTES + 1)],
      },
      drive,
    );
    assert.equal(oversizeFile.ok, false);
    if (oversizeFile.ok) return;
    assert.equal(oversizeFile.error, BRIEF_SIZE_ERROR);

    const oversizeDrop = await saveUserBrief(
      wendell,
      {
        kind: "hse",
        describe: "too many",
        files: [
          sizedFile("a.pdf", "application/pdf", BRIEF_MAX_FILE_BYTES),
          sizedFile("b.pdf", "application/pdf", BRIEF_MAX_FILE_BYTES),
          sizedFile("c.pdf", "application/pdf", BRIEF_MAX_FILE_BYTES),
          sizedFile("d.csv", "text/csv", BRIEF_MAX_DROP_BYTES - BRIEF_MAX_FILE_BYTES * 3 + 1),
        ],
      },
      drive,
    );
    assert.equal(oversizeDrop.ok, false);
    if (oversizeDrop.ok) return;
    assert.equal(oversizeDrop.error, BRIEF_SIZE_ERROR);

    const chanceList = await listVisibleBriefs(chance, "quality", drive);
    const wendellList = await listVisibleBriefs(wendell, "hse", drive);
    assert.deepEqual(chanceList.briefs, []);
    assert.deepEqual(wendellList.briefs, []);
    assert.equal(await getVisibleBriefFile(chance, allowed.brief?.files[0]?.id || "missing", drive), null);
    assert.equal(await getVisibleBriefFile(wendell, allowed.brief?.files[0]?.id || "missing", drive), null);
    assert.equal((await drive.listChildren(HSE_ROOM_ID)).length, 0);
  });
});
