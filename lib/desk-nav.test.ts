import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { DESK_NAV, deskNavHasSiblingWorkTabs, deskNavLabels } from "./desk-nav.ts";

describe("desk chrome nav", () => {
  it("drops sibling Jobs / Sites / Estimates tabs", () => {
    assert.deepEqual(
      deskNavLabels().filter((label) => ["Jobs", "Sites", "Estimates", "Job sites"].includes(label)),
      [],
    );
    assert.equal(deskNavHasSiblingWorkTabs(), false);
    assert.equal(DESK_NAV.some((item) => item.href === "/jobs"), false);
    assert.equal(DESK_NAV.some((item) => item.href === "/sites"), false);
    assert.equal(DESK_NAV.some((item) => item.href === "/estimates"), false);
    const chrome = readFileSync(fileURLToPath(new URL("../components/DeskChrome.tsx", import.meta.url)), "utf8");
    assert.match(chrome, /from "@\/lib\/desk-nav"/);
    assert.equal(/href: "\/jobs"/.test(chrome), false);
    assert.equal(/href: "\/sites"/.test(chrome), false);
    assert.equal(/href: "\/estimates"/.test(chrome), false);
  });
});
