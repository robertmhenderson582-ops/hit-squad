import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

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
    assert.match(menu, /hisSeatHide/);
    assert.match(menu, /menuSeatForDesk/);

    const confirm = read("../components/ConfirmDialog.tsx");
    assert.match(confirm, /ModalPortal/);
    assert.match(confirm, /modal-scrim/);

    const css = read("../app/globals.css");
    assert.match(css, /\.modal-scrim[\s\S]*z-index:\s*200/);
    assert.match(css, /\.estimate-card[\s\S]*z-index:\s*1/);
  });
});
