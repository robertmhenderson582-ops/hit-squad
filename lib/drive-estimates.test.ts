import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ESTIMATES_ROOM_ID,
  driveAdapter,
  driveAuthKind,
  driveConfigured,
  driveStoreKind,
  deleteEstimateInDrive,
  findDrivePackFile,
  listDrivePacks,
  memoryDrive,
  overwriteEstimateInDrive,
  parseOAuthClient,
  parseServiceAccount,
  readDrivePack,
  resetDriveTokenCache,
  resolveEstimatesFolder,
  upsertEstimateInDrive,
} from "./drive-estimates.ts";
import { estimateFileName, parseIncomingPack, publicPack, responseLeaksDrive, type EstimatePackSnapshot } from "./estimate-pack.ts";

function cat2(over: Partial<EstimatePackSnapshot> = {}): EstimatePackSnapshot {
  return {
    packId: "new-cat2pit",
    key: "new:new-cat2pit",
    title: "Cat 2 Pit Stop",
    client: "Phillips 66",
    site: "Wood River — Roxana, IL",
    siteId: "site-madison",
    createdAt: 100,
    updatedAt: 200,
    ownerEmail: "robertmhenderson582@gmail.com",
    crew: { support: [{ id: "sup-1", position: "Tool Room Attendant" }] },
    ...over,
  };
}

const oauthEnv = {
  GOOGLE_OAUTH_CLIENT_ID: "test-oauth-client-id",
  GOOGLE_OAUTH_CLIENT_SECRET: "test-oauth-client-secret",
  GOOGLE_OAUTH_REFRESH_TOKEN: "test-oauth-refresh-token",
};

const saEnv = {
  GOOGLE_CLIENT_EMAIL: "vault@hitsquad.iam.gserviceaccount.com",
  GOOGLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n",
};

describe("drive estimate upsert", () => {
  it("reads service account env without treating SMTP as Drive", () => {
    assert.equal(parseServiceAccount({ GMAIL_APP_PASSWORD: "x" }), null);
    assert.equal(driveConfigured({ GMAIL_APP_PASSWORD: "x" }), false);
    assert.equal(driveStoreKind({}), "unconfigured");
    assert.equal(driveAuthKind({}), "unconfigured");
    const parsed = parseServiceAccount(saEnv);
    assert.equal(parsed?.client_email, "vault@hitsquad.iam.gserviceaccount.com");
    assert.match(parsed?.private_key || "", /BEGIN PRIVATE KEY/);
    assert.match(parsed?.private_key || "", /\n/);
    assert.equal(driveConfigured(saEnv), true);
    assert.equal(driveAuthKind(saEnv), "service-account");
    assert.equal(driveAdapter(saEnv).configured, true);
    assert.equal(parseOAuthClient({ GOOGLE_OAUTH_CLIENT_ID: "only-id" }), null);
    assert.equal(driveConfigured({ GOOGLE_OAUTH_CLIENT_ID: "only-id" }), false);
    assert.equal(parseOAuthClient(oauthEnv)?.clientId, "test-oauth-client-id");
    assert.equal(driveConfigured(oauthEnv), true);
    assert.equal(driveAuthKind(oauthEnv), "oauth");
    assert.equal(driveAuthKind({ ...saEnv, ...oauthEnv }), "oauth");
    assert.equal(driveStoreKind(oauthEnv), "drive");
  });

  it("uses a refresh-token bearer for createJson when OAuth env is set", async () => {
    resetDriveTokenCache();
    const calls: Array<{ url: string; method: string; auth: string; body: string }> = [];
    const previous = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method || "GET").toUpperCase();
      const headers = new Headers(init?.headers);
      const body = typeof init?.body === "string" ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : "";
      calls.push({ url, method, auth: headers.get("authorization") || "", body });
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        const params = new URLSearchParams(body);
        assert.equal(params.get("grant_type"), "refresh_token");
        assert.equal(params.get("client_id"), "test-oauth-client-id");
        assert.equal(params.get("client_secret"), "test-oauth-client-secret");
        assert.equal(params.get("refresh_token"), "test-oauth-refresh-token");
        return new Response(JSON.stringify({ access_token: "ya29.test-oauth", expires_in: 3600 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.startsWith("https://www.googleapis.com/upload/drive/v3/files")) {
        assert.equal(headers.get("authorization"), "Bearer ya29.test-oauth");
        return new Response(JSON.stringify({ id: "file-oauth-1", name: "wood-river-cat-2-pit-stop.json" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    }) as typeof fetch;
    try {
      const adapter = driveAdapter({ ...saEnv, ...oauthEnv });
      const file = await adapter.createJson("folder", "wood-river-cat-2-pit-stop.json", "{}", {
        packId: "new-cat2pit",
        ownerEmail: "nathanboyte@gmail.com",
      });
      assert.equal(file.id, "file-oauth-1");
      assert.equal(calls.length, 2);
      assert.equal(calls[0].url, "https://oauth2.googleapis.com/token");
      assert.equal(calls[0].method, "POST");
      assert.match(calls[1].url, /upload\/drive\/v3\/files/);
      assert.equal(calls[1].auth, "Bearer ya29.test-oauth");
      await adapter.createJson("folder", "second.json", "{}", { packId: "new-second", ownerEmail: "nathanboyte@gmail.com" });
      assert.equal(calls.filter((call) => call.url === "https://oauth2.googleapis.com/token").length, 1);
    } finally {
      globalThis.fetch = previous;
      resetDriveTokenCache();
    }
  });

  it("updates the same file in place and keeps testers off owner packs", async () => {
    const drive = memoryDrive();
    const first = await upsertEstimateInDrive(drive, cat2(), "folder");
    assert.equal(first.name, "wood-river-cat-2-pit-stop.json");
    const second = await upsertEstimateInDrive(
      drive,
      cat2({ updatedAt: 400, crew: { support: [{ id: "sup-2" }] } }),
      "folder",
    );
    assert.equal(second.id, first.id);
    assert.equal(drive.files.size, 1);
    const listed = await listDrivePacks(drive, "folder");
    assert.equal(listed.length, 1);
    assert.equal((listed[0].crew as { support: Array<{ id: string }> }).support[0].id, "sup-2");
    assert.equal(responseLeaksDrive(listed.map(publicPack)), false);

    await upsertEstimateInDrive(
      drive,
      cat2({ packId: "new-nathan1", ownerEmail: "nathanboyte@gmail.com", title: "Nathan trial" }),
      "folder",
    );
    assert.equal(drive.files.size, 2);
    const ownerFile = await findDrivePackFile(drive, "folder", "new-cat2pit", "robertmhenderson582@gmail.com");
    const testerFile = await findDrivePackFile(drive, "folder", "new-cat2pit", "nathanboyte@gmail.com");
    assert.ok(ownerFile);
    assert.equal(testerFile, null);
    assert.equal(estimateFileName(cat2()), "wood-river-cat-2-pit-stop.json");
    assert.equal(resolveEstimatesFolder(), ESTIMATES_ROOM_ID);
    assert.equal(resolveEstimatesFolder("1QtYnsIw_Os3nYKAdByS9V1mzsv2A6dWy"), ESTIMATES_ROOM_ID);
    assert.equal(resolveEstimatesFolder("1OvNT1G9UR69hXjIeR1DpJLFZPIhoPhuQ"), ESTIMATES_ROOM_ID);
    const firstName = [...drive.files.values()][0]?.file.name;
    assert.equal(firstName, "wood-river-cat-2-pit-stop.json");
    assert.equal(drive.files.size, 2);
  });

  it("overwrites the same file when the owner email changes and can delete that file", async () => {
    const drive = memoryDrive();
    const first = await upsertEstimateInDrive(drive, cat2(), "folder");
    const handed = await overwriteEstimateInDrive(
      drive,
      cat2({ ownerEmail: "nathanboyte@gmail.com", updatedAt: 800 }),
      "folder",
    );
    assert.equal(handed.id, first.id);
    assert.equal(drive.files.size, 1);
    assert.equal(handed.properties?.ownerEmail, "nathanboyte@gmail.com");
    const ownerFile = await findDrivePackFile(drive, "folder", "new-cat2pit", "robertmhenderson582@gmail.com");
    const testerFile = await findDrivePackFile(drive, "folder", "new-cat2pit", "nathanboyte@gmail.com");
    assert.equal(ownerFile, null);
    assert.ok(testerFile);
    const removed = await deleteEstimateInDrive(drive, "new-cat2pit", "nathanboyte@gmail.com", "folder");
    assert.equal(removed, true);
    assert.equal(drive.files.size, 0);
  });

  it("same packId leftover cannot win hydrate or list over the richer transferred copy", async () => {
    const drive = memoryDrive();
    const packId = "new-mtj7bvtk-akmei";
    const leftover = {
      packId,
      key: `new:${packId}`,
      title: "2027 Aromatics Turnaround",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 50,
      updatedAt: 9000,
      ownerEmail: "robertmhenderson582@gmail.com",
      crew: { staff: [], support: [] },
    };
    const working = {
      ...leftover,
      updatedAt: 400,
      ownerEmail: "nathanboyte@gmail.com",
      sharedWith: ["robertmhenderson582@gmail.com"],
      transferredFrom: "robertmhenderson582@gmail.com",
      transferredTo: "nathanboyte@gmail.com",
      equipment: {
        largeTools: [
          { id: "lt-1", itemId: "wet:8:truck-crew", qty: 1 },
          { id: "lt-2", itemId: "dry:36:trailer-trailer-40ft", qty: 4 },
          { id: "lt-3", itemId: "dry:37:trailer-tower-tray-hardware-consignment-cost-plus-6", qty: 1 },
        ],
        thirdParty: Array.from({ length: 30 }, (_, index) => ({
          id: `tp-${index + 1}`,
          item: index < 28 ? (index === 0 ? "6 pack Stick/Tig / Mig pulse" : `Third-party ${index + 1}`) : "",
          rate: index < 28 ? (index === 0 ? 1225 : 1) : 0,
          qty: index < 28 ? (index === 0 ? 12 : 1) : 0,
          freight: index === 0 ? 50 : 0,
        })),
      },
      otherCost: {
        travel: [
          { id: "travel-staff", travelers: 39, miles: 1700, perMile: 0.76 },
          { id: "travel-craft", travelers: 100, miles: 800, perMile: 0.76 },
        ],
        misc: [
          { id: "mc-1", item: "Alloy rod", qty: 65, each: 1000 },
          { id: "mc-2", item: "Steel", qty: 25, each: 1000 },
        ],
      },
      subcontractor: {
        cards: [
          { id: "sc-1", vendor: "JVIC Tensioning/Torquing/Machining/Bundle Equipment and Labor" },
          { id: "sc-2", vendor: "Hartford" },
          { id: "sc-3", vendor: "JVIC Engineering" },
          { id: "sc-4", vendor: "Logistics Trucking INplant" },
        ],
      },
      crew: {
        staff: Array.from({ length: 15 }, (_, index) => ({ id: `st-${index + 1}` })),
        generalForeman: [{ id: "gf-1" }],
        foreman: [{ id: "fm-1" }, { id: "fm-2" }],
        direct: [{ id: "dr-1" }, { id: "dr-2" }],
        support: Array.from({ length: 7 }, (_, index) => ({ id: `su-${index + 1}` })),
      },
    };
    await drive.createJson("folder", "wood-river-2027-aromatics-turnaround.json", JSON.stringify(leftover), {
      packId,
      ownerEmail: leftover.ownerEmail,
    });
    await drive.createJson("folder", "wood-river-2027-aromatics-turnaround.json", JSON.stringify(working), {
      packId,
      ownerEmail: working.ownerEmail,
    });
    assert.equal(drive.files.size, 2);

    const ownerLookup = await findDrivePackFile(drive, "folder", packId, leftover.ownerEmail);
    assert.ok(ownerLookup);
    const ownerPack = parseIncomingPack(JSON.parse(await drive.readJson(ownerLookup.id)));
    assert.equal(ownerPack.ok, true);
    if (ownerPack.ok) {
      assert.equal(ownerPack.pack.ownerEmail, "nathanboyte@gmail.com");
      assert.equal(((ownerPack.pack.equipment as { largeTools: unknown[] }).largeTools || []).length, 3);
      assert.equal(((ownerPack.pack.subcontractor as { cards: unknown[] }).cards || []).length, 4);
    }
    const asRobert = await readDrivePack(drive, packId, leftover.ownerEmail, "folder");
    assert.equal(asRobert?.ownerEmail, "nathanboyte@gmail.com");
    assert.equal(((asRobert?.equipment as { thirdParty: unknown[] }).thirdParty || []).length, 30);
    const listed = await listDrivePacks(drive, "folder");
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.ownerEmail, "nathanboyte@gmail.com");
    assert.equal(((listed[0]?.otherCost as { travel: Array<{ travelers: number }> }).travel || []).some((row) => row.travelers === 39), true);
  });

  it("skips the known thin Drive stub so it cannot overlay Aromatics", async () => {
    const { isThinDriveStub, THIN_DRIVE_STUB_IDS } = await import("./drive-estimates.ts");
    assert.equal(isThinDriveStub("1AEf_Shk8SEvMsdGodNSpaNgUCytXSLZ9"), true);
    assert.equal(THIN_DRIVE_STUB_IDS.has("1AEf_Shk8SEvMsdGodNSpaNgUCytXSLZ9"), true);
    const drive = memoryDrive();
    const packId = "new-mtj7bvtk-akmei";
    const stub = {
      packId,
      key: `new:${packId}`,
      title: "2027 Aromatics Turnaround",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 50,
      updatedAt: 9000,
      ownerEmail: "robertmhenderson582@gmail.com",
      crew: { staff: [], support: [] },
    };
    const working = {
      ...stub,
      updatedAt: 400,
      ownerEmail: "nathanboyte@gmail.com",
      equipment: { largeTools: [{ id: "lt-1", itemId: "wet:8:truck-crew", qty: 1 }], thirdParty: [] },
      crew: { staff: [{ id: "st-1" }], support: [] },
    };
    drive.files.set("1AEf_Shk8SEvMsdGodNSpaNgUCytXSLZ9", {
      file: {
        id: "1AEf_Shk8SEvMsdGodNSpaNgUCytXSLZ9",
        name: "wood-river-2027-aromatics-turnaround.json",
        properties: { packId, ownerEmail: stub.ownerEmail },
      },
      content: JSON.stringify(stub),
    });
    await drive.createJson("folder", "wood-river-2027-aromatics-turnaround.json", JSON.stringify(working), {
      packId,
      ownerEmail: working.ownerEmail,
    });
    const listed = await listDrivePacks(drive, "folder");
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.ownerEmail, "nathanboyte@gmail.com");
    assert.equal(((listed[0]?.equipment as { largeTools: unknown[] }).largeTools || []).length, 1);
  });
});
