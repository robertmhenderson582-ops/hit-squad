import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("hold screen lock", () => {
  it("pins a steel/teal spinner on session and pack open", () => {
    const hold = source("../components/HoldScreen.tsx");
    const css = source("../app/globals.css");
    const login = source("../components/LoginForm.tsx");
    const gate = source("../components/AuthGate.tsx");
    const detail = source("../components/EstimateDetail.tsx");
    const fresh = source("../components/NewEstimateForm.tsx");
    const pack = source("../components/EstimatePackage.tsx");
    const jobs = source("../components/JobsDesk.tsx");

    assert.match(css, /\.hs-hold-spin/);
    assert.match(css, /#0f5f6d/);
    assert.match(css, /#3ec6d4/);
    assert.match(hold, /hs-hold-spin/);
    assert.match(gate, /HoldScreen/);
    assert.match(gate, /CHECKING DESK SESSION/);
    assert.match(gate, /HOLDING FOR SESSION/);
    assert.match(gate, /OPENING DESK/);
    assert.match(login, /HoldScreen/);
    assert.match(login, /CHECKING SESSION/);
    assert.match(login, /disabled=\{submitting\}/);
    assert.match(login, /if \(submitting\) return/);
    assert.match(detail, /LOADING ESTIMATE/);
    assert.match(detail, /OPENING PACKAGE/);
    assert.match(detail, /!pack\.ready/);
    assert.match(fresh, /OPENING PACKAGE/);
    assert.match(fresh, /!estimate\.ready/);
    assert.match(pack, /ready: boolean/);
    assert.match(pack, /ready: true/);
    assert.match(jobs, /HoldScreen/);
    assert.match(jobs, /REFRESHING JOBS/);
    assert.match(pack, /findLocalPack/);
    assert.match(pack, /hydrateOpenPack/);
    assert.match(pack, /requestAnimationFrame/);
    assert.match(pack, /paintFromLocal/);
  });
});
