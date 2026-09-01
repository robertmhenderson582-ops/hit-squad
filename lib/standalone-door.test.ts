import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

describe("standalone door", () => {
  it("is a quiet second door on the same login, not a second product", () => {
    const desk = readFileSync(fileURLToPath(new URL("../components/StandaloneDesk.tsx", import.meta.url)), "utf8");
    const page = readFileSync(fileURLToPath(new URL("../app/standalone/page.tsx", import.meta.url)), "utf8");
    const home = readFileSync(fileURLToPath(new URL("../components/DeskHome.tsx", import.meta.url)), "utf8");
    assert.match(page, /STANDALONE/);
    assert.match(page, /StandaloneDesk/);
    assert.match(desk, /New estimate/);
    assert.match(desk, /Change-order log/);
    assert.match(desk, /Company desk/);
    assert.match(desk, /Same login/);
    assert.equal(/Phillips 66|Simple shop|shop job|Forgebook|Google login/i.test(desk), false);
    assert.match(home, /HOME_DOORS/);
  });
});
