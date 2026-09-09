import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { BOILER17_PACK_ID, BOILER17_TITLE } from "./boiler-17.ts";
import { HIS_AROMATICS_PACK_ID } from "./his-wood-river.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { GEORGIA_POWER_CLIENT_ID, PHILLIPS_66_CLIENT_ID } from "./job-tree.ts";
import { addHseLaneRow, emptyHseModule, hseModuleJobKey, patchHseLaneRow, readHseModule, readHseModuleForJob, writeHseModule, writeHseModuleForJob } from "./hse-module.ts";
import { briefKey, readBrief, writeBrief } from "./lead-briefs.ts";
import {
  QUALITY_MODULE_PREFIX,
  addQualityRow,
  emptyQualityModule,
  patchQualityRow,
  qualityModuleJobKey,
  qualityModuleKey,
  readQualityModule,
  readQualityModuleForJob,
  writeQualityModule,
  writeQualityModuleForJob,
} from "./quality-module.ts";
import {
  HSE_JOB_SCOPE_KEY,
  QUALITY_JOB_SCOPE_KEY,
  applyScopeClient,
  applyScopeJob,
  applyScopeSite,
  attachLegacyClientModule,
  cascadeClients,
  cascadeCompanyId,
  cascadeJobs,
  cascadeSites,
  emptyJobScope,
  hydrateJobScope,
  qualityHseJobTree,
  readJobScope,
  resolveJobScope,
  writeJobScope,
} from "./quality-hse-scope.ts";
import type { StorageLike } from "./local-estimates.ts";

function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const owner = { isOwner: true, email: OWNER_LOGIN_EMAIL, companyId: "hitsquad" as const };

const boiler17 = {
  packId: BOILER17_PACK_ID,
  key: `new:${BOILER17_PACK_ID}`,
  title: BOILER17_TITLE,
  client: "Phillips 66",
  site: "Wood River — Roxana, IL",
  siteId: "site-madison",
  createdAt: 1,
  updatedAt: 2,
  ownerEmail: "nathanboyte@gmail.com",
  status: "Locked" as const,
};

const aromatics = {
  packId: HIS_AROMATICS_PACK_ID,
  key: `new:${HIS_AROMATICS_PACK_ID}`,
  title: "2027 Aromatics Turnaround",
  client: "Phillips 66",
  site: "Wood River — Roxana, IL",
  siteId: "site-madison",
  createdAt: 1,
  updatedAt: 2,
  ownerEmail: "nathanboyte@gmail.com",
  status: "Locked" as const,
};

const yates = {
  packId: "new-yates-1",
  key: "new:new-yates-1",
  title: "Yates outage",
  client: "Georgia Power",
  site: "Yates",
  siteId: "site-yates",
  createdAt: 1,
  updatedAt: 2,
  ownerEmail: OWNER_LOGIN_EMAIL,
};

describe("Quality / HSE job scope", () => {
  it("cascades Phillips 66 → Wood River → Boiler 17 and Aromatics from the Jobs tree", () => {
    const tree = qualityHseJobTree({ scope: owner, packs: [boiler17, aromatics, yates] });
    const clients = cascadeClients(tree);
    assert.equal(clients.some((row) => row.id === PHILLIPS_66_CLIENT_ID && row.name === "Phillips 66"), true);
    assert.equal(clients.some((row) => row.id === GEORGIA_POWER_CLIENT_ID && row.name === "Georgia Power"), true);
    assert.equal(clients.some((row) => /cbi|lucky\s*13/i.test(`${row.id} ${row.name}`)), false);
    assert.equal(tree.some((row) => /cbi|lucky\s*13/i.test(`${row.id} ${row.name}`)), false);
    const wood = cascadeSites(tree, PHILLIPS_66_CLIENT_ID).find((row) => row.id === "site-madison");
    assert.equal(Boolean(wood?.name.includes("Wood River") || wood?.name.includes("Madison")), true);
    assert.equal((wood?.jobCount ?? 0) >= 2, true);
    const jobs = cascadeJobs(tree, PHILLIPS_66_CLIENT_ID, "site-madison");
    assert.equal(jobs.some((row) => row.id === `job-${BOILER17_PACK_ID}` && row.title === BOILER17_TITLE), true);
    assert.equal(jobs.some((row) => row.id === `job-${HIS_AROMATICS_PACK_ID}` && /Aromatics/.test(row.title)), true);
    const georgiaJobs = cascadeJobs(tree, GEORGIA_POWER_CLIENT_ID, "site-yates");
    assert.equal(georgiaJobs.some((row) => row.id === "job-new-yates-1"), true);
    assert.equal(cascadeJobs(tree, PHILLIPS_66_CLIENT_ID, "site-rodeo").length, 0);
    assert.deepEqual(applyScopeClient(emptyJobScope(), PHILLIPS_66_CLIENT_ID), {
      clientId: PHILLIPS_66_CLIENT_ID,
      siteId: "",
      jobId: "",
    });
    assert.deepEqual(applyScopeSite({ clientId: PHILLIPS_66_CLIENT_ID, siteId: "site-rodeo", jobId: "job-x" }, "site-madison"), {
      clientId: PHILLIPS_66_CLIENT_ID,
      siteId: "site-madison",
      jobId: "",
    });
    assert.equal(applyScopeJob({ clientId: PHILLIPS_66_CLIENT_ID, siteId: "site-madison", jobId: "" }, `job-${BOILER17_PACK_ID}`).jobId, `job-${BOILER17_PACK_ID}`);
    assert.equal(
      cascadeCompanyId(tree, {
        clientId: PHILLIPS_66_CLIENT_ID,
        siteId: "site-madison",
        jobId: `job-${BOILER17_PACK_ID}`,
      }),
      "madison",
    );
    assert.equal(
      cascadeCompanyId(tree, {
        clientId: GEORGIA_POWER_CLIENT_ID,
        siteId: "site-yates",
        jobId: "job-new-yates-1",
      }),
      "madison",
    );
    assert.equal(cascadeCompanyId(tree, emptyJobScope()), "");
  });

  it("drops a stale job id and keeps client / site when the tree still has them", () => {
    const tree = qualityHseJobTree({ scope: owner, packs: [boiler17] });
    const stale = resolveJobScope(
      { clientId: PHILLIPS_66_CLIENT_ID, siteId: "site-madison", jobId: "job-gone" },
      tree,
    );
    assert.deepEqual(stale, { clientId: PHILLIPS_66_CLIENT_ID, siteId: "site-madison", jobId: "" });
    assert.deepEqual(resolveJobScope({ clientId: "nope", siteId: "x", jobId: "y" }, tree), emptyJobScope());
    assert.deepEqual(hydrateJobScope({ clientId: PHILLIPS_66_CLIENT_ID }), {
      clientId: PHILLIPS_66_CLIENT_ID,
      siteId: "",
      jobId: "",
    });
    const store = memoryStorage();
    writeJobScope(QUALITY_JOB_SCOPE_KEY, { clientId: PHILLIPS_66_CLIENT_ID, siteId: "site-madison", jobId: `job-${BOILER17_PACK_ID}` }, store);
    assert.deepEqual(readJobScope(QUALITY_JOB_SCOPE_KEY, store), {
      clientId: PHILLIPS_66_CLIENT_ID,
      siteId: "site-madison",
      jobId: `job-${BOILER17_PACK_ID}`,
    });
    assert.deepEqual(readJobScope(HSE_JOB_SCOPE_KEY, store), emptyJobScope());
  });

  it("persists Quality and HSE boards per job and does not smash the other job", () => {
    const store = memoryStorage();
    const boilerId = `job-${BOILER17_PACK_ID}`;
    const aromaId = `job-${HIS_AROMATICS_PACK_ID}`;
    let qualityA = addQualityRow(emptyQualityModule(), "ncrs");
    const ncrId = qualityA.sections.ncrs[0].id;
    qualityA = patchQualityRow(qualityA, "ncrs", ncrId, "ncr", "NCR-B17");
    writeQualityModuleForJob(boilerId, qualityA, store);
    let qualityB = addQualityRow(emptyQualityModule(), "ncrs");
    qualityB = patchQualityRow(qualityB, "ncrs", qualityB.sections.ncrs[0].id, "ncr", "NCR-ARO");
    writeQualityModuleForJob(aromaId, qualityB, store);
    assert.equal(readQualityModuleForJob(boilerId, store).sections.ncrs[0]?.cells.ncr, "NCR-B17");
    assert.equal(readQualityModuleForJob(aromaId, store).sections.ncrs[0]?.cells.ncr, "NCR-ARO");
    assert.equal(store.getItem(qualityModuleJobKey(boilerId))?.includes("NCR-B17"), true);
    assert.equal(store.getItem(qualityModuleKey("phillips-66")), null);

    let hseA = addHseLaneRow(emptyHseModule(), "toolbox");
    hseA = patchHseLaneRow(hseA, "toolbox", hseA.lanes.toolbox[0].id, "topic", "Boiler 17 talk");
    writeHseModuleForJob(boilerId, hseA, store);
    let hseB = addHseLaneRow(emptyHseModule(), "toolbox");
    hseB = patchHseLaneRow(hseB, "toolbox", hseB.lanes.toolbox[0].id, "topic", "Aromatics talk");
    writeHseModuleForJob(aromaId, hseB, store);
    assert.equal(readHseModuleForJob(boilerId, store).lanes.toolbox[0]?.cells.topic, "Boiler 17 talk");
    assert.equal(readHseModuleForJob(aromaId, store).lanes.toolbox[0]?.cells.topic, "Aromatics talk");
    assert.equal(store.getItem(hseModuleJobKey(boilerId))?.includes("Boiler 17 talk"), true);
  });

  it("attaches a leftover client-folder blob to the first job only", () => {
    const store = memoryStorage();
    let leftover = addQualityRow(emptyQualityModule(), "ncrs");
    leftover = patchQualityRow(leftover, "ncrs", leftover.sections.ncrs[0].id, "ncr", "OLD-CLIENT");
    writeQualityModule("phillips-66", leftover, store);
    const first = readQualityModuleForJob(`job-${BOILER17_PACK_ID}`, store, "phillips-66");
    const second = readQualityModuleForJob(`job-${HIS_AROMATICS_PACK_ID}`, store, "phillips-66");
    assert.equal(first.sections.ncrs[0]?.cells.ncr, "OLD-CLIENT");
    assert.equal(second.sections.ncrs.length, 0);
    assert.equal(readQualityModule("phillips-66", store).sections.ncrs[0]?.cells.ncr, "OLD-CLIENT");

    let hseLeft = addHseLaneRow(emptyHseModule(), "incidents");
    hseLeft = patchHseLaneRow(hseLeft, "incidents", hseLeft.lanes.incidents[0].id, "note", "old client near miss");
    writeHseModule("phillips-66", hseLeft, store);
    assert.equal(readHseModuleForJob("job-one", store, "phillips-66").lanes.incidents[0]?.cells.note, "old client near miss");
    assert.equal(readHseModuleForJob("job-two", store, "phillips-66").lanes.incidents.length, 0);
    assert.equal(readHseModule("phillips-66", store).lanes.incidents[0]?.cells.note, "old client near miss");

    const claimStore = memoryStorage();
    claimStore.setItem(`${QUALITY_MODULE_PREFIX}phillips-66`, JSON.stringify(leftover));
    const copied = attachLegacyClientModule(claimStore, {
      jobKey: qualityModuleJobKey("job-first"),
      folderKey: qualityModuleKey("phillips-66"),
      claimKey: `${QUALITY_MODULE_PREFIX}legacy-claim:phillips-66`,
    });
    assert.equal(Boolean(copied), true);
    assert.equal(
      attachLegacyClientModule(claimStore, {
        jobKey: qualityModuleJobKey("job-second"),
        folderKey: qualityModuleKey("phillips-66"),
        claimKey: `${QUALITY_MODULE_PREFIX}legacy-claim:phillips-66`,
      }),
      null,
    );
  });

  it("scopes local lead-studio drops to the job without sharing the leftover brief", () => {
    const store = memoryStorage();
    writeBrief("quality", { describe: "old client brief", files: [], savedAt: "yesterday" }, "", store);
    const first = readBrief("quality", `job-${BOILER17_PACK_ID}`, store);
    const second = readBrief("quality", `job-${HIS_AROMATICS_PACK_ID}`, store);
    assert.equal(first.describe, "old client brief");
    assert.equal(second.describe, "");
    writeBrief("quality", { describe: "boiler only", files: [], savedAt: "now" }, `job-${BOILER17_PACK_ID}`, store);
    assert.equal(readBrief("quality", `job-${BOILER17_PACK_ID}`, store).describe, "boiler only");
    assert.equal(readBrief("quality", `job-${HIS_AROMATICS_PACK_ID}`, store).describe, "");
    assert.equal(briefKey("quality", `job-${BOILER17_PACK_ID}`), `hs_lead_quality:job:job-${BOILER17_PACK_ID}`);
  });

  it("fails if Quality or HSE still stop at a client folder", () => {
    const quality = source("../components/QualityDesk.tsx");
    const hse = source("../components/HseDesk.tsx");
    const picks = source("../components/JobScopePicks.tsx");
    assert.match(quality, /JobScopePicks/);
    assert.match(hse, /JobScopePicks/);
    assert.match(picks, /label="Client"/);
    assert.match(picks, /label="Site"/);
    assert.match(picks, /label="Job"/);
    assert.match(picks, /Pick a job/);
    assert.doesNotMatch(quality, /Client folder/);
    assert.doesNotMatch(hse, /Client folder/);
    assert.match(quality, /readQualityModuleForJob/);
    assert.match(hse, /readHseModuleForJob/);
    assert.match(quality, /writeQualityModuleForJob/);
    assert.match(hse, /writeHseModuleForJob/);
    assert.match(quality, /PickJobEmpty/);
    assert.match(hse, /PickJobEmpty/);
    assert.doesNotMatch(quality, /OpenJobFrame|AwardedJobFrame|OPEN_JOB_EMPTY/);
    assert.doesNotMatch(hse, /OpenJobFrame|AwardedJobFrame|OPEN_JOB_EMPTY/);
  });
});
