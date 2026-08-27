import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BRIEF_ALLOWED_MIME,
  BRIEF_FILE_ACCEPT,
  BRIEF_MAX_DROP_BYTES,
  BRIEF_MAX_FILE_BYTES,
  BRIEF_SIZE_ERROR,
  BRIEF_TYPE_ERROR,
  briefDownloadContentType,
  checkBriefDrop,
  checkLeadFiles,
  isLeadKind,
  mergeLeadFiles,
  readBrief,
  writeBrief,
  type BriefDropFile,
  type LeadBrief,
  type LeadFile,
} from "./lead-briefs.ts";

class MemoryStorage {
  store = new Map<string, string>();
  getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}

describe("lead briefs local copy", () => {
  it("keeps both files on this desk and does not wipe when a later write is skipped", () => {
    assert.equal(isLeadKind("quality"), true);
    assert.equal(isLeadKind("hse"), true);
    assert.equal(isLeadKind("estimates"), false);
    const merged = mergeLeadFiles(
      [{ name: "a.pdf", type: "application/pdf", data: "QQ==" }],
      [
        { name: "b.txt", type: "text/plain", data: "Qg==" },
        { name: "a.pdf", type: "application/pdf", data: "QQI=" },
      ],
    );
    assert.equal(merged.length, 2);
    assert.equal(merged.find((file) => file.name === "a.pdf")?.data, "QQI=");
    assert.equal(merged.some((file) => file.name === "b.txt"), true);

    const memory = new MemoryStorage();
    const prior = (globalThis as { window?: { localStorage: MemoryStorage } }).window;
    (globalThis as { window?: { localStorage: MemoryStorage } }).window = { localStorage: memory };
    try {
      const brief: LeadBrief = {
        describe: "Chance drop",
        files: merged,
        savedAt: "26/08/2026, 21:00:00",
      };
      writeBrief("quality", brief);
      const kept = readBrief("quality");
      assert.equal(kept.describe, "Chance drop");
      assert.equal(kept.files.length, 2);
      assert.deepEqual(
        kept.files.map((file) => file.name),
        ["a.pdf", "b.txt"],
      );
    } finally {
      (globalThis as { window?: { localStorage: MemoryStorage } }).window = prior;
    }
  });
});

function drop(name: string, type: string, bytes = 16): BriefDropFile {
  return { name, type, bytes };
}

function lead(name: string, type: string, text = "ok"): LeadFile {
  return { name, type, data: Buffer.from(text).toString("base64") };
}

function sizedLead(name: string, type: string, bytes: number): LeadFile {
  return { name, type, data: "A".repeat(Math.ceil(bytes / 3) * 4) };
}

describe("brief drop type and size cap", () => {
  it("lets the allowed types through when extension and MIME match", () => {
    for (const [ext, mime] of Object.entries(BRIEF_ALLOWED_MIME)) {
      const name = ext === "jpeg" ? "photo.jpeg" : `form.${ext}`;
      assert.equal(checkBriefDrop([drop(name, mime)]).ok, true, name);
      assert.equal(checkLeadFiles([lead(name, mime)]).ok, true, name);
    }
    assert.match(BRIEF_FILE_ACCEPT, /\.pdf/);
    assert.match(BRIEF_FILE_ACCEPT, /\.heic/);
    assert.equal(BRIEF_FILE_ACCEPT.includes(".exe"), false);
    assert.equal(BRIEF_FILE_ACCEPT.includes(".html"), false);
    assert.equal(checkBriefDrop([]).ok, true);
  });

  it("rejects blocked and unknown types, including MIME mismatch", () => {
    const blocked = [
      "payload.exe",
      "page.html",
      "page.htm",
      "script.js",
      "pack.zip",
      "pack.rar",
      "pack.7z",
      "macro.docm",
      "macro.xlsm",
      "macro.pptm",
      "run.bat",
      "run.cmd",
      "run.ps1",
      "image.svg",
      "note.scr",
      "lib.dll",
      "tool.com",
      "setup.msi",
      "notes.txt",
      "letter.doc",
      "letter.docx",
      "unknown.foo",
      "noext",
    ];
    for (const name of blocked) {
      assert.deepEqual(checkBriefDrop([drop(name, "application/octet-stream")]), {
        ok: false,
        error: BRIEF_TYPE_ERROR,
      });
    }
    assert.deepEqual(checkBriefDrop([drop("form.pdf", "text/html")]), {
      ok: false,
      error: BRIEF_TYPE_ERROR,
    });
    assert.deepEqual(checkBriefDrop([drop("form.pdf", "")]), {
      ok: false,
      error: BRIEF_TYPE_ERROR,
    });
    assert.deepEqual(checkBriefDrop([drop("photo.png", "application/pdf")]), {
      ok: false,
      error: BRIEF_TYPE_ERROR,
    });
    assert.deepEqual(checkLeadFiles([lead("trap.exe", "application/x-msdownload")]), {
      ok: false,
      error: BRIEF_TYPE_ERROR,
    });
    assert.equal(briefDownloadContentType("form.pdf", "application/pdf"), "application/pdf");
    assert.equal(briefDownloadContentType("page.html", "text/html"), "application/octet-stream");
    assert.equal(briefDownloadContentType("script.js", "text/javascript"), "application/octet-stream");
  });

  it("rejects an oversize file and an oversize drop", () => {
    assert.deepEqual(checkBriefDrop([drop("big.pdf", "application/pdf", BRIEF_MAX_FILE_BYTES)]), {
      ok: true,
    });
    assert.deepEqual(checkBriefDrop([drop("big.pdf", "application/pdf", BRIEF_MAX_FILE_BYTES + 1)]), {
      ok: false,
      error: BRIEF_SIZE_ERROR,
    });
    assert.deepEqual(
      checkBriefDrop([
        drop("a.pdf", "application/pdf", BRIEF_MAX_FILE_BYTES),
        drop("b.pdf", "application/pdf", BRIEF_MAX_FILE_BYTES),
        drop("c.pdf", "application/pdf", BRIEF_MAX_FILE_BYTES),
        drop("d.csv", "text/csv", BRIEF_MAX_FILE_BYTES),
      ]),
      { ok: false, error: BRIEF_SIZE_ERROR },
    );
    assert.equal(BRIEF_MAX_FILE_BYTES * 3 <= BRIEF_MAX_DROP_BYTES, true);
    assert.equal(
      checkBriefDrop([
        drop("a.pdf", "application/pdf", BRIEF_MAX_FILE_BYTES),
        drop("b.pdf", "application/pdf", BRIEF_MAX_FILE_BYTES),
        drop("c.pdf", "application/pdf", BRIEF_MAX_FILE_BYTES),
      ]).ok,
      true,
    );
    assert.deepEqual(checkLeadFiles([sizedLead("huge.pdf", "application/pdf", BRIEF_MAX_FILE_BYTES + 1)]), {
      ok: false,
      error: BRIEF_SIZE_ERROR,
    });
  });
});
