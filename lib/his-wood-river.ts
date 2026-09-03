import type { EstimatePackSnapshot } from "./estimate-pack.ts";
import type { LocalPack } from "./local-estimates.ts";

/** Nathan’s Wood River HIS cards. Identity only — no dollars, no sheet contents. */
export const NATHAN_DESK_EMAIL = "nathanboyte@gmail.com";

export type HisWoodRiverFile = {
  packId?: string;
  fileId: string;
  fileName: string;
  title: string;
  client: string;
  site: string;
  siteId: string;
  ownerEmail: string;
};

/** Live Drive files. Never the thin Aromatics stub. Snapshots folder is frozen and omitted. */
export const HIS_WOOD_RIVER_FILES: HisWoodRiverFile[] = [
  {
    packId: "new-mtj7bvtk-akmei",
    fileId: "1KLhPczzj-BHMqT8uOI5VxUkSJUagj7rz",
    fileName: "wood-river-2027-aromatics-turnaround.json",
    title: "2027 Aromatics Turnaround",
    client: "Phillips 66",
    site: "Wood River — Roxana, IL",
    siteId: "site-madison",
    ownerEmail: NATHAN_DESK_EMAIL,
  },
  {
    packId: "new-mtaajdwa-f7539",
    fileId: "1wa1bH4SgGlkMg2sUX7kLeyZXooI0aD-d",
    fileName: "wood-river-madison-cat-2-pit-stop.json",
    title: "Madison CAT 2 (Pit Stop)",
    client: "Phillips 66",
    site: "Wood River — Roxana, IL",
    siteId: "site-madison",
    ownerEmail: NATHAN_DESK_EMAIL,
  },
  {
    // Live job code EST-MTJ5D6 = first six of packId after `new-`. Not a guessed longer id.
    packId: "new-mtj5d6",
    fileId: "1bBWKw2aCy3fVKm0rQAWcoCi8OXzahoPI",
    fileName: "wood-river-wood-river-t-m-2027-01-to-06.json",
    title: "Wood River / T&M 2027-01 to 06",
    client: "Phillips 66",
    site: "Wood River — Roxana, IL",
    siteId: "site-madison",
    ownerEmail: NATHAN_DESK_EMAIL,
  },
];

export const HIS_AROMATICS_PACK_ID = "new-mtj7bvtk-akmei";
export const HIS_CAT2_PACK_ID = "new-mtaajdwa-f7539";
export const HIS_TM_PACK_ID = "new-mtj5d6";
export const HIS_AROMATICS_FILE_ID = "1KLhPczzj-BHMqT8uOI5VxUkSJUagj7rz";
export const HIS_CAT2_FILE_ID = "1wa1bH4SgGlkMg2sUX7kLeyZXooI0aD-d";
export const HIS_TM_FILE_ID = "1bBWKw2aCy3fVKm0rQAWcoCi8OXzahoPI";
export const HIS_AROMATICS_STUB_ID = "1AEf_Shk8SEvMsdGodNSpaNgUCytXSLZ9";
export const HIS_SNAPSHOTS_FOLDER_ID = "1yMOHR4ES9Ba7Y0G5C2wFcpwH34i0sJ7m";

export function hisKnownEstimateFiles() {
  return HIS_WOOD_RIVER_FILES.filter((row) => row.fileId !== HIS_AROMATICS_STUB_ID);
}

export function hisFileForPackId(packId: string) {
  const id = (packId || "").trim();
  if (!id) return null;
  const exact = hisKnownEstimateFiles().find((row) => row.packId && row.packId === id);
  if (exact) return exact;
  // Vault copy may be longer than the EST-MTJ5D6 paint id. Still the same T&M file.
  if (id.startsWith(HIS_TM_PACK_ID)) {
    return hisKnownEstimateFiles().find((row) => row.fileId === HIS_TM_FILE_ID) ?? null;
  }
  return null;
}

export function hisFileByDriveId(fileId: string) {
  return hisKnownEstimateFiles().find((row) => row.fileId === fileId) ?? null;
}

function cardFromHis(row: HisWoodRiverFile & { packId: string }): LocalPack {
  return {
    packId: row.packId,
    key: `new:${row.packId}`,
    title: row.title,
    client: row.client,
    site: row.site,
    siteId: row.siteId,
    createdAt: 1,
    updatedAt: 1,
    ownerEmail: row.ownerEmail,
  };
}

/** First-paint Wood River cards when local storage and Drive list are empty. */
export function hisWoodRiverCards(): LocalPack[] {
  return hisKnownEstimateFiles()
    .filter((row): row is HisWoodRiverFile & { packId: string } => Boolean(row.packId))
    .map(cardFromHis);
}

function hisCardAlreadyPresent(packs: LocalPack[], card: LocalPack) {
  return packs.some(
    (row) =>
      row.packId === card.packId ||
      (row.title === card.title && (row.siteId === card.siteId || row.site === card.site)),
  );
}

/** Identity cards only when the desk does not already have that job (by packId or title). */
export function mergeHisWoodRiverCards(packs: LocalPack[]): LocalPack[] {
  const extras = hisWoodRiverCards().filter((row) => !hisCardAlreadyPresent(packs, row));
  return [...packs, ...extras];
}

export function hisCardToSnapshot(row: HisWoodRiverFile & { packId: string }): EstimatePackSnapshot {
  return {
    packId: row.packId,
    key: `new:${row.packId}`,
    title: row.title,
    client: row.client,
    site: row.site,
    siteId: row.siteId,
    createdAt: 1,
    updatedAt: 1,
    ownerEmail: row.ownerEmail,
  };
}
