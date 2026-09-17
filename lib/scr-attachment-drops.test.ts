import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { memoryDrive } from "./drive-estimates.ts";
import { CHANGE_ORDERS_PRIVILEGE } from "./module-access.ts";
import { QUALITY_DROP_TYPE_ERROR } from "./quality-folders.ts";
import {
  readScrAttachmentBytes,
  removeScrAttachmentFile,
  saveScrAttachments,
} from "./scr-attachment-drops.ts";
import { SCR_ATTACHMENT_ROOT, scrAttachmentVaultPath } from "./scr-attachment-vault.ts";
import { SCR_ATTACHMENT_VIEW_ERROR } from "./scr-attachment-shared.ts";

const owner = { email: OWNER_LOGIN_EMAIL, name: "Robert Henderson", role: "owner" as const };
const tester = { email: "nathanboyte@gmail.com", name: "Nathan Boyte", role: "tester" as const };
const ownerPack = { packId: "new-cat2pit", ownerEmail: OWNER_LOGIN_EMAIL };
const testerPack = { packId: "new-tester1", ownerEmail: tester.email };

function pdf(name: string, text = name) {
  return { name, type: "application/pdf", data: Buffer.from(text).toString("base64") };
}

describe("SCR backup attachments", () => {
  it("uploads into the pack SCR folder, lists names, and removes the Drive file", async () => {
    const drive = memoryDrive();
    const saved = await saveScrAttachments(
      owner,
      {
        packId: ownerPack.packId,
        rowId: "scr-1",
        files: [pdf("IPS pack.pdf", "ips-bytes"), { name: "scope-photo.jpg", type: "image/jpeg", data: Buffer.from("photo").toString("base64") }],
      },
      { drive, pack: ownerPack },
    );
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    assert.equal(saved.store, "drive");
    assert.equal(saved.attachments.length, 2);
    assert.equal(saved.attachments[0]?.name, "IPS pack.pdf");
    assert.equal(saved.attachments[0]?.addedBy, "Robert Henderson");
    assert.ok(saved.attachments[0]?.driveId);
    assert.deepEqual(scrAttachmentVaultPath({ packId: ownerPack.packId, rowId: "scr-1" }), [
      SCR_ATTACHMENT_ROOT,
      ownerPack.packId,
      "scr-1",
    ]);

    const listed = await readScrAttachmentBytes(
      tester,
      { packId: ownerPack.packId, rowId: "scr-1", driveId: saved.attachments[0]!.driveId },
      { drive, pack: { ...ownerPack, sharedWith: [tester.email] } },
    );
    assert.equal(listed.ok, true);
    if (listed.ok) {
      assert.equal(listed.file.name, "IPS pack.pdf");
      assert.equal(Buffer.from(listed.file.bytes).toString(), "ips-bytes");
    }

    const removed = await removeScrAttachmentFile(
      owner,
      { packId: ownerPack.packId, rowId: "scr-1", driveId: saved.attachments[0]!.driveId },
      { drive, pack: ownerPack },
    );
    assert.equal(removed.ok, true);
    if (removed.ok) assert.equal(removed.trashed, 1);

    const missing = await readScrAttachmentBytes(
      owner,
      { packId: ownerPack.packId, rowId: "scr-1", driveId: saved.attachments[0]!.driveId },
      { drive, pack: ownerPack },
    );
    assert.equal(missing.ok, false);
  });

  it("blocks viewers from attach/remove and rejects executables", async () => {
    const drive = memoryDrive();
    const shared = { ...ownerPack, sharedWith: [tester.email] };
    const denied = await saveScrAttachments(
      tester,
      { packId: ownerPack.packId, rowId: "scr-1", files: [pdf("quote.pdf")] },
      { drive, pack: shared },
    );
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.equal(denied.status, 403);
      assert.equal(denied.error, SCR_ATTACHMENT_VIEW_ERROR);
    }
    const blocked = await saveScrAttachments(
      owner,
      {
        packId: ownerPack.packId,
        rowId: "scr-1",
        files: [{ name: "payload.exe", type: "application/octet-stream", data: Buffer.from("x").toString("base64") }],
      },
      { drive, pack: ownerPack },
    );
    assert.equal(blocked.ok, false);
    if (!blocked.ok) assert.equal(blocked.error, QUALITY_DROP_TYPE_ERROR);
    const own = await saveScrAttachments(
      tester,
      { packId: testerPack.packId, rowId: "scr-9", files: [pdf("my-ips.pdf")] },
      { drive, pack: testerPack },
    );
    assert.equal(own.ok, false);
    if (!own.ok) {
      assert.equal(own.status, 403);
      assert.equal(own.error, SCR_ATTACHMENT_VIEW_ERROR);
    }
    const assigned = await saveScrAttachments(
      { ...tester, privileges: [CHANGE_ORDERS_PRIVILEGE] },
      { packId: testerPack.packId, rowId: "scr-9", files: [pdf("my-ips.pdf")] },
      { drive, pack: testerPack },
    );
    assert.equal(assigned.ok, true);
  });

  it("wires Estimate workbook attach UI without a third SCR tab", () => {
    const source = readFileSync(fileURLToPath(new URL("../components/ChangeOrderPacket.tsx", import.meta.url)), "utf8");
    assert.match(source, /Backup attachments/);
    assert.match(source, /\{busy \? "Saving…" : "Attach"\}/);
    assert.match(source, /scr-attachments/);
    assert.match(source, /canEditChangeOrders/);
    assert.match(source, /CHANGE_ORDERS_DENIED/);
    assert.match(source, /useLensUser/);
    assert.doesNotMatch(source, /\["Log", "Estimate", "SCR"\]/);
    const route = readFileSync(
      fileURLToPath(new URL("../app/api/desk/estimates/[packId]/scr-attachments/route.ts", import.meta.url)),
      "utf8",
    );
    assert.match(route, /saveScrAttachments/);
    assert.match(route, /removeScrAttachmentFile/);
  });
});
