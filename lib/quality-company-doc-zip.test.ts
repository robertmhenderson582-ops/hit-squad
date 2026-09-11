import assert from "node:assert/strict";
import { describe, it } from "node:test";
import JSZip from "jszip";
import { leadToBytes } from "./lead-briefs.ts";
import {
  isQualityCompanyDocZipJunk,
  listQualityCompanyDocZipMembers,
  pickQualityCompanyDocZipMember,
  qualityCompanyDocZipMemberPath,
  qualityCompanyDocZipMemberType,
  readQualityCompanyDocZipMembers,
} from "./quality-company-doc-zip.ts";
import { qualityCompanyDocArchiveName, qualityCompanyDocPreviewType, qualityCompanyDocViewKind } from "./quality-company-docs.ts";

async function samplePack() {
  const zip = new JSZip();
  zip.file("__MACOSX/._ASME.pdf", "skip-me");
  zip.folder("docs");
  zip.file("docs/ASME IX.pdf", "%PDF-1.4 codes");
  zip.file("notes.txt", "read me");
  zip.file("sheet.xlsx", "not-a-workbook");
  zip.file("stamp.png", "png-bytes");
  return zip.generateAsync({ type: "uint8array" });
}

describe("Quality company-doc zip packs", () => {
  it("lists zip members and skips junk folders", () => {
    assert.equal(isQualityCompanyDocZipJunk("docs/", true), true);
    assert.equal(isQualityCompanyDocZipJunk("__MACOSX/._ASME.pdf"), true);
    assert.equal(isQualityCompanyDocZipJunk("docs/ASME IX.pdf"), false);
    assert.equal(qualityCompanyDocZipMemberPath("\\docs\\ASME IX.pdf"), "docs/ASME IX.pdf");
    assert.deepEqual(
      listQualityCompanyDocZipMembers([
        { name: "__MACOSX/", dir: true },
        { name: "__MACOSX/._ASME.pdf", dir: false },
        { name: "docs/", dir: true },
        { name: "docs/ASME IX.pdf", dir: false },
        { name: "notes.txt", dir: false },
        { name: "sheet.xlsx", dir: false },
      ]).map((member) => ({ path: member.path, kind: member.kind })),
      [
        { path: "docs/ASME IX.pdf", kind: "pdf" },
        { path: "notes.txt", kind: "text" },
        { path: "sheet.xlsx", kind: "office" },
      ],
    );
    assert.equal(qualityCompanyDocArchiveName("ASME IX.zip"), true);
    assert.equal(qualityCompanyDocArchiveName("manual.pdf"), false);
    assert.equal(qualityCompanyDocViewKind({ name: "ASME IX.zip", type: "application/zip" }), "zip");
    assert.equal(qualityCompanyDocViewKind({ name: "docs/ASME IX.pdf" }), "pdf");
    assert.equal(qualityCompanyDocZipMemberType("docs/ASME IX.pdf"), "application/pdf");
    assert.equal(qualityCompanyDocPreviewType({ name: "docs/ASME IX.pdf", type: "text/plain" }), "application/pdf");
    assert.equal(qualityCompanyDocZipMemberType("x.pdf"), "application/pdf");
  });

  it("opens a pdf member from the pack without treating the zip as other", async () => {
    const bytes = await samplePack();
    const members = await readQualityCompanyDocZipMembers(bytes);
    assert.deepEqual(
      members.map((member) => member.path),
      ["docs/ASME IX.pdf", "notes.txt", "sheet.xlsx", "stamp.png"],
    );
    assert.equal(
      members.some((member) => member.path.startsWith("__MACOSX") || member.path.endsWith("/")),
      false,
    );
    const pdf = await pickQualityCompanyDocZipMember(bytes, "docs/ASME IX.pdf");
    assert.ok(pdf);
    assert.equal(pdf?.name, "ASME IX.pdf");
    assert.equal(pdf?.type, "application/pdf");
    assert.equal(qualityCompanyDocViewKind(pdf!), "pdf");
    assert.equal(new TextDecoder().decode(leadToBytes(pdf!)), "%PDF-1.4 codes");
    const skipped = await pickQualityCompanyDocZipMember(bytes, "__MACOSX/._ASME.pdf");
    assert.equal(skipped, null);
    const office = await pickQualityCompanyDocZipMember(bytes, "sheet.xlsx");
    assert.equal(qualityCompanyDocViewKind(office!), "office");
  });
});
