import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BOILER17_PACK_ID, BOILER17_TITLE } from "./boiler-17.ts";
import {
  mergeQualityVaultJobs,
  qualityVaultJobFromPack,
  qualityVaultJobsFromPacks,
  qualityVaultSeedJobs,
} from "./quality-vault-jobs.ts";

describe("Quality vault desk jobs", () => {
  it("exposes Madison job identity only — no money and no Drive ids", () => {
    const job = qualityVaultJobFromPack({
      packId: BOILER17_PACK_ID,
      title: BOILER17_TITLE,
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
    });
    assert.equal(job.id, `job-${BOILER17_PACK_ID}`);
    assert.equal(job.title, BOILER17_TITLE);
    assert.equal(job.client, "Phillips 66");
    assert.equal(job.workingFigure, "");
    assert.equal(job.hseNote, "");
    assert.doesNotMatch(JSON.stringify(job), /1A7anV1UKx8m7|drive\.google\.com|\$/);

    const fromPacks = qualityVaultJobsFromPacks([
      { packId: BOILER17_PACK_ID, title: BOILER17_TITLE, client: "Phillips 66", site: "Wood River" },
      { packId: "new-hitsquad-only", title: "Hit Squad shop", client: "Hit Squad", site: "Shop" },
    ]);
    assert.deepEqual(
      fromPacks.map((row) => row.id),
      [`job-${BOILER17_PACK_ID}`],
    );

    const seeds = qualityVaultSeedJobs("chancec318@yahoo.com", "tester");
    assert.equal(seeds.some((row) => /madison|p66/i.test(`${row.client} ${row.title}`)), true);
    const merged = mergeQualityVaultJobs(seeds, fromPacks);
    assert.equal(merged.some((row) => row.id === `job-${BOILER17_PACK_ID}`), true);
  });
});
