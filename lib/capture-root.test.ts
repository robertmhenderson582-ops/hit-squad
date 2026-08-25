import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickCaptureSelector } from "./capture.ts";

describe("capture root", () => {
  it("prefers the full desk shell over a nested paper-desk card", () => {
    assert.equal(
      pickCaptureSelector(["paper-desk", "paper-page", "data-capture-root"]),
      "[data-capture-root]",
    );
    assert.equal(pickCaptureSelector(["paper-desk", "paper-page"]), ".paper-page");
    assert.equal(pickCaptureSelector(["paper-desk"]), "body");
  });
});
