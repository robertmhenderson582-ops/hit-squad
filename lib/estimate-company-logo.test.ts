import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { COMPANIES, companyLogoSrc, type Company } from "./companies.ts";
import {
  COMPANY_LOGO_SPLASH_OPACITY,
  companyLogoFromApiPayload,
  prepareCompanyLogoSplash,
  resolveEstimateCompanyLogo,
} from "./estimate-company-logo.ts";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("estimate company logo", () => {
  it("resolves the inferred company’s live logo and invents nothing", () => {
    assert.equal(
      COMPANIES.every((row) => !row.logo),
      true,
    );
    assert.equal(resolveEstimateCompanyLogo("Phillips 66", "Wood River", COMPANIES), null);
    assert.equal(resolveEstimateCompanyLogo("Phillips 66", "Wood River", []), null);

    const catalog: Company[] = [
      { id: "hitsquad", name: "Hit Squad", logo: "/hitsquad.png" },
      { id: "madison", name: "Madison", logo: TINY_PNG },
      { id: "cbi", name: "CBI" },
    ];
    assert.equal(resolveEstimateCompanyLogo("Phillips 66", "Wood River — Roxana, IL", catalog), TINY_PNG);
    assert.equal(resolveEstimateCompanyLogo("CBI", "Some yard", catalog), null);
    assert.equal(resolveEstimateCompanyLogo("Unknown client", "Unknown site", catalog), "/hitsquad.png");
    assert.equal(
      resolveEstimateCompanyLogo("Phillips 66", "Wood River", catalog, {
        isOwner: false,
        email: "nathan@example.com",
        companyId: "madison",
      }),
      TINY_PNG,
    );
    assert.equal(
      resolveEstimateCompanyLogo("Phillips 66", "Wood River", catalog, {
        isOwner: false,
        email: "cbi@example.com",
        companyId: "cbi",
      }),
      null,
    );
    assert.equal(companyLogoSrc("javascript:alert(1)"), null);
    assert.equal(companyLogoFromApiPayload({ logo: TINY_PNG }), TINY_PNG);
    assert.equal(companyLogoFromApiPayload({ logo: "" }), null);
    assert.equal(companyLogoFromApiPayload({ logo: "//evil.example/x" }), null);
    assert.equal(companyLogoFromApiPayload({}), null);
    assert.equal(COMPANY_LOGO_SPLASH_OPACITY < 0.35, true);
    assert.equal(COMPANY_LOGO_SPLASH_OPACITY > 0.08, true);
  });

  it("prepares a splash from a data-URL and skips empty or junk src", async () => {
    const splash = await prepareCompanyLogoSplash(TINY_PNG);
    assert.ok(splash);
    assert.equal(splash.extension, "png");
    assert.ok(splash.base64.length > 20);
    assert.equal(await prepareCompanyLogoSplash(null), null);
    assert.equal(await prepareCompanyLogoSplash(""), null);
    assert.equal(await prepareCompanyLogoSplash("javascript:alert(1)"), null);
    assert.equal(await prepareCompanyLogoSplash("/missing-on-purpose.png"), null);
  });

  it("desk logo API resolves the estimate company, not the assigned door alone", () => {
    const api = readFileSync(fileURLToPath(new URL("../app/api/desk/company-logo/route.ts", import.meta.url)), "utf8");
    assert.match(api, /resolveEstimateCompanyLogo/);
    assert.match(api, /listCompanies/);
    assert.match(api, /companyScopeFor/);
    assert.equal(/companyDeskLogoForEmail/.test(api), false);
  });
});
