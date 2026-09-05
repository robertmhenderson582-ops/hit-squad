import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ignoreClassForCapture,
  overlayClassesOpen,
  pickCaptureSelector,
  pickCaptureTarget,
} from "./capture.ts";

describe("capture root", () => {
  it("prefers the full desk shell over a nested paper-desk card", () => {
    assert.equal(
      pickCaptureSelector(["paper-desk", "paper-page", "data-capture-root"]),
      "[data-capture-root]",
    );
    assert.equal(pickCaptureSelector(["paper-desk", "paper-page"]), ".paper-page");
    assert.equal(pickCaptureSelector(["desk-home-root"]), ".desk-home-root");
    assert.equal(pickCaptureSelector(["paper-desk"]), "body");
  });

  it("shoots the document when a dialog, modal, or ticket drawer is open", () => {
    assert.equal(overlayClassesOpen([["estimate-modal"], ["paper-page"]]), true);
    assert.equal(overlayClassesOpen([["ticket-card"]]), true);
    assert.equal(overlayClassesOpen([["modal-scrim"]]), true);
    assert.equal(overlayClassesOpen([["paper-page"], ["desk-fabs"]]), false);
    assert.equal(pickCaptureTarget(true, ["data-capture-root"]), "document-element");
    assert.equal(pickCaptureTarget(false, ["data-capture-root"]), "[data-capture-root]");
  });

  it("keeps open dialogs and the ticket drawer in the shot", () => {
    assert.equal(ignoreClassForCapture(["ticket-card"]), false);
    assert.equal(ignoreClassForCapture(["ticket-scrim"]), false);
    assert.equal(ignoreClassForCapture(["modal-scrim"]), false);
    assert.equal(ignoreClassForCapture(["estimate-modal"]), false);
    assert.equal(ignoreClassForCapture(["ticket-card"], true), false);
    assert.equal(ignoreClassForCapture(["ticket-fab"]), true);
    assert.equal(ignoreClassForCapture(["inbox-fab"]), true);
    assert.equal(ignoreClassForCapture(["ticket-markup"]), true);
    assert.equal(ignoreClassForCapture(["desk-fabs"]), false);
  });
});
