import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLeadKind, mergeLeadFiles, readBrief, writeBrief, type LeadBrief } from "./lead-briefs.ts";

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
