import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CAPTURE_ROOT_SELECTORS, pickCaptureSelector } from "./capture.ts";

describe("capture root", () => {
  it("never treats a nested paper-desk card as the shot target", () => {
    assert.equal(
      CAPTURE_ROOT_SELECTORS.some((selector) => selector.includes("paper-desk")),
      false,
    );
    assert.equal(
      pickCaptureSelector(["paper-desk", "paper-page", "data-capture-root"]),
      "[data-capture-root]",
    );
    assert.equal(pickCaptureSelector(["paper-desk", "paper-page"]), ".paper-page");
    assert.equal(pickCaptureSelector(["paper-desk"]), "documentElement");
  });
});
