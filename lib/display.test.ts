import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { effectiveLockMinutes } from "./display.ts";

describe("inactivity lock", () => {
  it("lets the owner Don’t lock stay unlocked", () => {
    assert.equal(effectiveLockMinutes("owner", 0), 0);
    assert.equal(effectiveLockMinutes("owner", 60), 60);
  });

  it("keeps testers and staff on 15 even if the device stored Don’t lock", () => {
    assert.equal(effectiveLockMinutes("tester", 0), 15);
    assert.equal(effectiveLockMinutes("operator", 30), 15);
    assert.equal(effectiveLockMinutes("tester", 10), 10);
  });
});
