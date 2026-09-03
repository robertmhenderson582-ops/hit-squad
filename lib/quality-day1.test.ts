import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { companyScopeFor } from "./companies.ts";
import { QUALITY_BRIEFS_VAULT_NAME } from "./drive-data.ts";
import {
  canSeeMadisonManuals,
  emptyQualityDay1,
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
