import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { companyScopeFor } from "./companies.ts";
import { QUALITY_BRIEFS_VAULT_NAME } from "./drive-data.ts";
import {
  QUALITY_PACKAGE_FORMS,
  canSeeMadisonManuals,
  emptyQualityDay1,
  hydrateQualityDay1,
  publicQualityDrops,
  qualityPackageForSeat,
  qualitySurfaceLeaks,
  qualityWorkNames,
} from "./quality-day1.ts";
import { JOSEPH_EMAIL } from "./tester-seats.ts";

describe("Quality Day-1 seat leaks", () => {
  it("does not leak vault ids or Madison manuals to a non-Madison seat", () => {
    const joseph = { email: JOSEPH_EMAIL, role: "tester" };
    const scope = companyScopeFor(joseph);
    assert.equal(canSeeMadisonManuals(joseph, scope), false);
    const pack = qualityPackageForSeat(emptyQualityDay1(), joseph, scope);
    assert.deepEqual(pack.manuals, []);
    assert.equal(qualitySurfaceLeaks(pack), false);
    assert.equal(qualitySurfaceLeaks({ vault: "1y6Q3TOnpXzV", file: QUALITY_BRIEFS_VAULT_NAME }), true);
    assert.equal(qualitySurfaceLeaks({ folder: "1k4xceUc5ihDuzSf7opdjEzwnt2ODJomC" }), true);
    const drops = publicQualityDrops(
      [
        {
          id: "b1",
          kind: "quality",
          who: "chancec318@yahoo.com",
          whoName: "Chance Middlebrooks",
          describe: "Inspection brief",
          files: [{ name: "plan.pdf", type: "application/pdf" }],
          savedAt: "now",
        },
      ],
      JOSEPH_EMAIL,
    );
    assert.deepEqual(drops, []);
    assert.deepEqual(qualityWorkNames([{ id: "mech", name: "Mechanical", on: true } as never]), ["Mechanical Window"]);
  });
});

describe("Quality Day-1 named package", () => {
  it("hosts Chance’s eight named forms and keeps prior Day-1 answers", () => {
    assert.deepEqual(
      QUALITY_PACKAGE_FORMS.map((item) => item.id),
      ["2.7.1", "2.7.11", "2.7.17", "2.7.19", "2.7.22", "2.7.34", "2.7.5", "nde-req"],
    );
    assert.equal(QUALITY_PACKAGE_FORMS.length, 8);
    assert.equal(QUALITY_PACKAGE_FORMS.some((item) => /2\.7\.29|2\.7\.3\b|sling/i.test(item.id + item.label)), false);
    const kept = hydrateQualityDay1({
      inspectionPlan: true,
      weldMap: true,
      travelerCount: "4",
      forms: { "2.7.1": { marked: true, fill: "on job", count: "2" } },
    });
    assert.equal(kept.inspectionPlan, true);
    assert.equal(kept.weldMap, true);
    assert.equal(kept.travelerCount, "4");
    assert.equal(kept.forms["2.7.1"]?.marked, true);
    assert.equal(kept.forms["2.7.1"]?.fill, "on job");
    assert.equal(kept.forms["2.7.1"]?.count, "2");
    const joseph = { email: JOSEPH_EMAIL, role: "tester" };
    const surface = qualityPackageForSeat(kept, joseph, companyScopeFor(joseph));
    assert.equal(surface.forms.some((item) => item.label.includes("Pressure Test Record")), true);
    assert.equal(surface.forms.some((item) => item.label.includes("NDE req spreadsheet")), true);
    assert.deepEqual(surface.manuals, []);
  });
});
