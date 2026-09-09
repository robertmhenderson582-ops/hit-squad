import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { yieldToUi } from "./ui-yield.ts";

function read(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("modal portal", () => {
  it("ports confirm and delete scrims to document.body above estimate cards", () => {
    const portal = read("../components/ModalPortal.tsx");
    assert.match(portal, /createPortal/);
    assert.match(portal, /document\.body/);

    const menu = read("../components/JobMenuActions.tsx");
    assert.match(menu, /Delete this job\?/);
    assert.match(menu, /Archive this job\?/);
    assert.match(menu, /ModalPortal/);
    assert.match(menu, /deleteMenuItem/);
    assert.match(menu, /deleteVaultPack/);
    assert.match(menu, /archiveMenuItem/);

    const confirm = read("../components/ConfirmDialog.tsx");
    assert.match(confirm, /ModalPortal/);
    assert.match(confirm, /modal-scrim/);

    const css = read("../app/globals.css");
    assert.match(css, /\.modal-scrim[\s\S]*z-index:\s*200/);
    assert.match(css, /\.estimate-card[\s\S]*z-index:\s*1/);

    const building = read("../components/BuildingFileModal.tsx");
    assert.match(building, /ModalPortal/);
    assert.match(building, /Building file…/);
    assert.match(building, /hs-hold-spin/);
    assert.match(building, /aria-busy/);
    assert.doesNotMatch(building, /onClick=\{onCancel\}/);
    assert.match(building, /onDismissError/);
    assert.match(building, /aria-modal="true"/);
  });

  it("yields so the Building file overlay can paint before Excel work", async () => {
    const started = Date.now();
    await yieldToUi();
    assert.equal(Date.now() >= started, true);
    const src = read("./ui-yield.ts");
    assert.match(src, /requestAnimationFrame/);
    assert.match(src, /setTimeout/);
  });
});
