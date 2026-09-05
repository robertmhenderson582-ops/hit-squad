import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

describe("standalone door", () => {
  it("stays a quiet route on the same login, buried off home", () => {
    const desk = readFileSync(fileURLToPath(new URL("../components/StandaloneDesk.tsx", import.meta.url)), "utf8");
    const page = readFileSync(fileURLToPath(new URL("../app/standalone/page.tsx", import.meta.url)), "utf8");
    const home = readFileSync(fileURLToPath(new URL("../components/DeskHome.tsx", import.meta.url)), "utf8");
    const doors = readFileSync(fileURLToPath(new URL("./desk-home.ts", import.meta.url)), "utf8");
    assert.match(page, /STANDALONE/);
    assert.match(page, /StandaloneDesk/);
    assert.match(desk, /New estimate/);
    assert.match(desk, /Change-order log/);
    assert.match(desk, /Company desk/);
    assert.match(desk, /Same login/);
    assert.equal(/Phillips 66|Simple shop|shop job|Forgebook|Google login/i.test(desk), false);
    assert.equal(/\/standalone/.test(home), false);
    assert.equal(/Two doors, one home/.test(home), false);
    assert.match(doors, /export const STANDALONE_DOOR/);
    assert.match(doors, /BURIED_HOME_DOORS/);
  });
});
