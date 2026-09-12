import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  HSE_COMPANY_DOC_CATALOG,
  hseCompanyDocsJobId,
  hseCompanyDocViewPath,
  hseRailCompanyId,
  isHseCompanyDocsJobId,
} from "./hse-company-docs.ts";

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("HSE company docs", () => {
  it("keeps the four standing safety-file bars and never invents a Drive PDF id", () => {
    assert.deepEqual(
      HSE_COMPANY_DOC_CATALOG.map((row) => row.label),
      ["Madison Safety Manual", "JSAs", "Forms", "HSE Updates"],
    );
    assert.equal(hseCompanyDocsJobId("madison"), "company-docs:madison");
    assert.equal(isHseCompanyDocsJobId("company-docs:madison"), true);
    assert.equal(isHseCompanyDocsJobId("job-b17"), false);
    assert.equal(hseRailCompanyId("wood-river", null), "madison");
    assert.match(
      hseCompanyDocViewPath("madison", "safety-manual", "manual.pdf"),
      /kind=hse&scope=company-docs.*folder=safety-manual.*file=manual\.pdf/,
    );
    const vault = source("./hse-vault.ts");
    assert.match(vault, /isProtectedHseCompanyDocFile/);
    assert.match(vault, /return false/);
    assert.doesNotMatch(vault, /1IATimbehupRHwa9|1A7anV1UKx8m7/);
    const rail = source("../components/HseCompanyDocRail.tsx");
    assert.match(rail, /hse-company-docs/);
    assert.match(rail, /Open form/);
    assert.match(rail, /Edit/);
    assert.match(rail, /jsas/);
    assert.doesNotMatch(rail, /hse-briefs\.json|DRIVE_HSE/);
  });
});
