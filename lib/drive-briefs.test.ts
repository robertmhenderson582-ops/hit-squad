import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DATA_ROOM_ID,
  HSE_ROOM_ID,
  QUALITY_ROOM_ID,
  briefDriveAdapter,
  decodeLeadBytes,
  ensureBriefRoom,
  fileInBriefRooms,
  listBriefsFromDrive,
  memoryBriefDrive,
  readBriefFile,
  responseLeaksBriefVault,
  saveBriefToDrive,
  saveFolderName,
  uniqueFileName,
  userFolderName,
} from "./drive-briefs.ts";
import { BRIEF_MAX_FILE_BYTES, BRIEF_SIZE_ERROR, BRIEF_TYPE_ERROR } from "./lead-briefs.ts";

function file(name: string, text: string, type = "application/pdf") {
  return { name, type, data: Buffer.from(text).toString("base64") };
}

describe("drive brief rooms", () => {
  it("names rooms the same way Estimates is named and does not invent folders over existing ones", async () => {
    assert.equal(DATA_ROOM_ID, "141Js9RQZKXqOMBb2EsIh3Olzr-pGLXgQ");
    assert.equal(QUALITY_ROOM_ID, "1A7anV1UKx8m7IgUW2uVpwWHxB5fHerOg");
    assert.equal(HSE_ROOM_ID, "10f8lfsKSVgvQ_0YE5ankEmcWUT8TGuu0");
    assert.equal(userFolderName("ChanceC318@yahoo.com"), "chancec318-at-yahoo.com");
    assert.match(saveFolderName(new Date("2026-08-26T21:05:00.000Z")), /2026-08-26T21-05-00/);
    assert.equal(uniqueFileName("form.pdf", ["form.pdf"]), "form-2.pdf");
    const drive = memoryBriefDrive();
    assert.equal(await ensureBriefRoom(drive, "quality"), QUALITY_ROOM_ID);
    assert.equal(await ensureBriefRoom(drive, "hse"), HSE_ROOM_ID);
    const qualityKids = await drive.listChildren(DATA_ROOM_ID);
    assert.equal(qualityKids.filter((row) => row.name === "Quality").length, 1);
    assert.equal(qualityKids.filter((row) => row.name === "HSE").length, 1);
    assert.equal(briefDriveAdapter({}).configured, false);
  });

  it("versions every save and keeps every file in the drop", async () => {
    const drive = memoryBriefDrive();
    const first = await saveBriefToDrive(drive, {
      kind: "quality",
      who: "chancec318@yahoo.com",
      whoName: "Chance Middlebrooks",
      describe: "ITP pack",
      files: [file("itp.pdf", "one"), file("notes.csv", "two", "text/csv")],
      savedAt: "2026-08-26T21:05:00.000Z",
    });
    const second = await saveBriefToDrive(drive, {
      kind: "quality",
      who: "chancec318@yahoo.com",
      whoName: "Chance Middlebrooks",
      describe: "ITP pack v2",
      files: [file("itp.pdf", "three")],
      savedAt: "2026-08-26T21:06:00.000Z",
    });
    assert.notEqual(first.id, second.id);
    assert.equal(first.files.length, 2);
    assert.deepEqual(
      first.files.map((row) => row.name),
      ["itp.pdf", "notes.csv"],
    );
    const one = await readBriefFile(drive, first.files[0].id);
    const two = await readBriefFile(drive, first.files[1].id);
    assert.equal(new TextDecoder().decode(one?.bytes), "one");
    assert.equal(new TextDecoder().decode(two?.bytes), "two");
    assert.equal(new TextDecoder().decode(decodeLeadBytes(file("x", "one"))), "one");
    const outside = await drive.uploadBytes(DATA_ROOM_ID, "nope.txt", new Uint8Array([1]), "text/plain");
    assert.equal(await fileInBriefRooms(drive, outside.id), null);
    const listed = await listBriefsFromDrive(drive, "quality");
    assert.equal(listed.length, 2);
    assert.equal(listed[0].describe, "ITP pack v2");
    assert.equal(responseLeaksBriefVault(listed), false);
    assert.equal(responseLeaksBriefVault({ folder: QUALITY_ROOM_ID }), true);
  });

  it("rejects blocked types and oversize files before any Drive write", async () => {
    const drive = memoryBriefDrive();
    const before = drive.files.size;
    await assert.rejects(
      () =>
        saveBriefToDrive(drive, {
          kind: "hse",
          who: "wlanderno@yahoo.com",
          whoName: "Wendell Landerno",
          describe: "nope",
          files: [file("trap.exe", "mz", "application/x-msdownload")],
        }),
      (error: unknown) => error instanceof Error && error.message === BRIEF_TYPE_ERROR,
    );
    await assert.rejects(
      () =>
        saveBriefToDrive(drive, {
          kind: "quality",
          who: "chancec318@yahoo.com",
          whoName: "Chance Middlebrooks",
          describe: "too big",
          files: [
            {
              name: "huge.pdf",
              type: "application/pdf",
              data: "A".repeat(Math.ceil((BRIEF_MAX_FILE_BYTES + 1) / 3) * 4),
            },
          ],
        }),
      (error: unknown) => error instanceof Error && error.message === BRIEF_SIZE_ERROR,
    );
    assert.equal(drive.files.size, before);
    assert.equal((await drive.listChildren(QUALITY_ROOM_ID)).length, 0);
    assert.equal((await drive.listChildren(HSE_ROOM_ID)).length, 0);
  });
});
