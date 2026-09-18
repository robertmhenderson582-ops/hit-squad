import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { JOHN_BATTUELLO_EMAIL } from "./onboard-pipeline.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import {
  CONTROL_CENTER_COMPANY_ID,
  CONTROL_CENTER_SEED_LOGOS,
  controlCenterBrand,
  controlCenterBrandForUser,
  controlCenterTenantId,
  parseControlCenterBrand,
} from "./onboard-brand.ts";

describe("Control Center tenant brand", () => {
  it("defaults Madison to the shipped public mark and lets the live catalog win", () => {
    assert.equal(CONTROL_CENTER_COMPANY_ID, "madison");
    assert.equal(CONTROL_CENTER_SEED_LOGOS.madison, "/madison.png");
    assert.equal(existsSync(fileURLToPath(new URL("../public/madison.png", import.meta.url))), true);

    const seeded = controlCenterBrand([]);
    assert.equal(seeded.companyId, "madison");
    assert.equal(seeded.name, "Madison");
    assert.equal(seeded.logo, "/madison.png");
    assert.equal(seeded.fallbackLabel, "Madison");

    const uploaded = controlCenterBrand([{ id: "madison", name: "Madison", logo: "https://cdn.example/madison.webp" }]);
    assert.equal(uploaded.logo, "https://cdn.example/madison.webp");

    const other = controlCenterBrand([], "acme");
    assert.equal(other.companyId, "acme");
    assert.equal(other.logo, null);
    assert.equal(other.fallbackLabel, "acme");

    const rejected = controlCenterBrand([{ id: "madison", name: "Madison", logo: "javascript:alert(1)" }]);
    assert.equal(rejected.logo, "/madison.png");
  });

  it("uses the viewer’s assigned company, and Owner / Hit Squad stay on the Madison tenant", () => {
    const hall = { email: JOHN_BATTUELLO_EMAIL, role: "tester" };
    const owner = { email: OWNER_LOGIN_EMAIL, role: "owner" };
    assert.equal(controlCenterTenantId(hall), "madison");
    assert.equal(controlCenterTenantId(owner), "madison");
    assert.equal(controlCenterBrandForUser(hall, []).logo, "/madison.png");
    assert.equal(controlCenterBrandForUser(owner, []).name, "Madison");
    assert.equal(controlCenterTenantId({ email: "unknown.pm@example.com", role: "tester" }), "madison");
  });

  it("parses a board brand payload and drops a bad logo src", () => {
    const parsed = parseControlCenterBrand({
      companyId: "madison",
      name: "Madison",
      logo: "/madison.png",
      fallbackLabel: "Madison",
    });
    assert.deepEqual(parsed, {
      companyId: "madison",
      name: "Madison",
      logo: "/madison.png",
      fallbackLabel: "Madison",
    });
    assert.equal(parseControlCenterBrand({ companyId: "madison", name: "Madison", logo: "//evil.example/x" })?.logo, null);
    assert.equal(parseControlCenterBrand(null), null);

    const chrome = readFileSync(fileURLToPath(new URL("../components/DeskChrome.tsx", import.meta.url)), "utf8");
    const mark = readFileSync(fileURLToPath(new URL("../components/ControlCenterBrand.tsx", import.meta.url)), "utf8");
    const page = readFileSync(fileURLToPath(new URL("../app/onboard/page.tsx", import.meta.url)), "utf8");
    assert.match(chrome, /titleBrand/);
    assert.match(chrome, /ControlCenterBrandMark/);
    assert.match(mark, /alt=\{`\$\{brand\.name\} logo`\}/);
    assert.match(mark, /onError/);
    assert.match(page, /titleBrand=\{brand\}/);
  });
});
