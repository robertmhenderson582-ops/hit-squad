import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { effectiveLockMinutes, estimatePackageHeader } from "./display.ts";

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

describe("estimate package header chrome", () => {
  it("shows the job title first so phone truncate cannot hide Aromatics behind the plant", () => {
    const header = estimatePackageHeader("2027 Aromatics Turnaround", "Wood River — Roxana, IL");
    assert.equal(header.title, "2027 Aromatics Turnaround");
    assert.equal(header.site, "Wood River — Roxana, IL");
    assert.equal(header.title.startsWith("Wood River"), false);
    const smashed = estimatePackageHeader("Wood River — Roxana, IL / 2027 Aromatics Turnaround", "Wood River — Roxana, IL");
    assert.equal(smashed.title.startsWith("2027 Aromatics"), false);
    const desk = estimatePackageHeader("2027 Aromatics Turnaround", "Wood River — Roxana, IL");
    assert.match(`${desk.title} ${desk.site}`, /2027 Aromatics Turnaround/);
    const workspace = readFileSync(fileURLToPath(new URL("../components/EstimateWorkspace.tsx", import.meta.url)), "utf8");
    const detail = readFileSync(fileURLToPath(new URL("../components/EstimateDetail.tsx", import.meta.url)), "utf8");
    const fresh = readFileSync(fileURLToPath(new URL("../components/NewEstimateForm.tsx", import.meta.url)), "utf8");
    assert.match(workspace, /estimatePackageHeader\(name \|\| crumb, boundSite\)/);
    assert.match(workspace, /header\.title/);
    assert.match(workspace, /header\.site/);
    assert.doesNotMatch(detail, /crumb=\{\`\$\{alias\(siteName\)\} \/ \$\{shown\}`\}/);
    assert.match(detail, /crumb=\{shown\}/);
    assert.match(fresh, /crumb=\{title\}/);
  });
});
