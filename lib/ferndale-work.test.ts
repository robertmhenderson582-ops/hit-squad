import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { catalogSites } from "./desk-data.ts";
import {
  FERNDALE_ADDRESS,
  FERNDALE_B1_FILENAME,
  FERNDALE_B1_FOLDER_ID,
  FERNDALE_CLIENT,
  FERNDALE_CLIENT_TEMPLATE_NOTE,
  FERNDALE_CLIENT_TEMPLATE_PARKED,
  FERNDALE_COAST,
  FERNDALE_COMP_AMENDMENT,
  FERNDALE_CRAFT_PD,
  FERNDALE_IS_REGULAR,
  FERNDALE_PCA,
  FERNDALE_PLANT,
  FERNDALE_SITE_ID,
  FERNDALE_STAFF_PD,
  FERNDALE_STATUS_NOTE,
  FERNDALE_WORK_FOLDER_ID,
  FERNDALE_WORK_FOLDER_TITLE,
  FERNDALE_WORK_PILES,
  ferndaleWorkFolderIds,
  showsFerndaleTab,
} from "./ferndale-work.ts";
import { OWNER_LOGIN_EMAIL } from "./owner-login.ts";
import { GEORGIA_POWER_CLIENT_ID, PHILLIPS_66_CLIENT_ID, jobTree } from "./job-tree.ts";
import { jobsOnDesk } from "./jobs.ts";
import { seedRegularClient } from "./site-regular.ts";
import { FERNDALE_CRAFT_PD as BOOK_CRAFT_PD, FERNDALE_STAFF_PD as BOOK_STAFF_PD } from "./shahan-ferndale.ts";

const owner = { isOwner: true, email: OWNER_LOGIN_EMAIL, companyId: "hitsquad" as const };
const cat2 = {
  packId: "new-mtaajdwa-f7539",
  key: "new:new-mtaajdwa-f7539",
  title: "Madison CAT 2 (Pit Stop)",
  client: "Phillips 66",
  site: "Wood River — Roxana, IL",
  siteId: "site-madison",
  createdAt: 1,
  updatedAt: 2,
  ownerEmail: "nathanboyte@gmail.com",
  sharedWith: [OWNER_LOGIN_EMAIL],
};

describe("Ferndale work folder", () => {
  it("keeps Ferndale on the P66 Jobs tree with file-loaded vault facts", () => {
    assert.equal(FERNDALE_SITE_ID, "site-ferndale");
    assert.equal(FERNDALE_CLIENT, "Phillips 66");
    assert.equal(FERNDALE_PLANT, "Ferndale, WA");
    assert.equal(FERNDALE_ADDRESS, "3901 Unick Rd");
    assert.equal(FERNDALE_COAST, "West Coast COMP PCA0001100 Amd 9");
    assert.equal(FERNDALE_PCA, "PCA0001100");
    assert.equal(FERNDALE_COMP_AMENDMENT, 9);
    assert.equal(FERNDALE_WORK_FOLDER_ID, "1PnaQioJO1Zy43MvCwuKaKQ6w8tZpTwAm");
    assert.equal(FERNDALE_WORK_FOLDER_TITLE, "Ferndale");
    assert.deepEqual([...FERNDALE_WORK_PILES], ["2028 TASO", "GEP Response", "Invitation to Bid", "Submitted"]);
    assert.equal(FERNDALE_B1_FOLDER_ID, "1UIZ-HsWMGz2NvJFDZGkR8wqU0Mk_O2nS");
    assert.equal(
      FERNDALE_B1_FILENAME,
      "04 - Exhibit B-1_Labor Burden Buildup_Ferndale Union Positions added RH 1516 07252025.xlsx",
    );
    assert.equal(FERNDALE_IS_REGULAR, false);
    assert.equal(seedRegularClient(FERNDALE_SITE_ID), false);
    assert.equal(FERNDALE_CRAFT_PD, 135);
    assert.equal(FERNDALE_STAFF_PD, 145);
    assert.equal(BOOK_CRAFT_PD, 135);
    assert.equal(BOOK_STAFF_PD, 145);
    assert.equal(FERNDALE_CLIENT_TEMPLATE_PARKED, true);
    assert.equal(showsFerndaleTab(), false);
    assert.match(FERNDALE_CLIENT_TEMPLATE_NOTE, /Not a Rodeo clone/);
    assert.match(FERNDALE_STATUS_NOTE, /Competitive bid/);
    assert.deepEqual([...ferndaleWorkFolderIds()], [FERNDALE_WORK_FOLDER_ID, FERNDALE_B1_FOLDER_ID]);

    const catalog = catalogSites().find((site) => site.id === FERNDALE_SITE_ID);
    assert.equal(catalog?.client, "Phillips 66");
    assert.equal(catalog?.regularClient, false);
    assert.match(catalog?.notes || "", /3901 Unick Rd/);
    assert.match(catalog?.plant || "", /3901 Unick Rd/);

    const ownerTree = jobTree({ scope: owner, jobs: jobsOnDesk([], [cat2], false, owner), packs: [cat2] });
    const madison = ownerTree.find((row) => row.id === "madison");
    const p66 = madison?.clients.find((client) => client.id === PHILLIPS_66_CLIENT_ID);
    const georgia = madison?.clients.find((client) => client.id === GEORGIA_POWER_CLIENT_ID);
    const ferndale = p66?.sites.find((site) => site.id === FERNDALE_SITE_ID);
    assert.equal(ferndale?.name, "Ferndale");
    assert.equal(p66?.sites.some((site) => site.name === "Not assigned"), false);
    assert.equal(georgia?.sites.some((site) => site.id === FERNDALE_SITE_ID), false);
    assert.equal(p66?.sites.some((site) => site.name === "Yates"), false);
    assert.match(ferndale?.note || "", /GEP \/ TASO/);
    assert.equal(ferndale?.jobs.length, 0);

    const treeDesk = readFileSync(fileURLToPath(new URL("../components/JobTreeDesk.tsx", import.meta.url)), "utf8");
    const workspace = readFileSync(fileURLToPath(new URL("../components/EstimateWorkspace.tsx", import.meta.url)), "utf8");
    assert.equal(treeDesk.includes(FERNDALE_WORK_FOLDER_ID), false);
    assert.equal(treeDesk.includes(FERNDALE_B1_FOLDER_ID), false);
    assert.equal(treeDesk.includes(FERNDALE_B1_FILENAME), false);
    assert.equal(/showsFerndaleTab/.test(workspace), false);
    assert.doesNotMatch(treeDesk, /\.xlsx|\.xlsm/);
  });
});
