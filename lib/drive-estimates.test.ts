import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { describe, it } from "node:test";
import { createHash } from "node:crypto";
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
  readDrivePackById,
  resetDriveTokenCache,
  resolveEstimatesFolder,
  upsertEstimateInDrive,
  vaultDriveAdapter,
  DriveApiError,
  SEATS_SA_OPEN_ERROR,
} from "./drive-estimates.ts";
import { estimateFileName, parseIncomingPack, publicPack, responseLeaksDrive, type EstimatePackSnapshot } from "./estimate-pack.ts";
import { defaultPhaseSchedule } from "./phase-schedule.ts";
import { HIS_AROMATICS_FILE_ID, HIS_AROMATICS_FREEZE_FILE_ID, HIS_AROMATICS_PACK_ID } from "./his-wood-river.ts";

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

  it("posts RFC 7523 jwt-bearer grant_type on the service-account token request", async () => {
    resetDriveTokenCache();
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const grants: string[] = [];
    const previous = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method || "GET").toUpperCase();
      const headers = new Headers(init?.headers);
      const body = typeof init?.body === "string" ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : "";
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        const params = new URLSearchParams(body);
        const grant = params.get("grant_type") || "";
        grants.push(grant);
        assert.equal(grant, "urn:ietf:params:oauth:grant-type:jwt-bearer");
        assert.notEqual(grant, "urn:ietf:params:oauth-2.0:grant-type:jwt-bearer");
        assert.ok(params.get("assertion"));
        return new Response(JSON.stringify({ access_token: "ya29.test-sa", expires_in: 3600 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/upload/drive/v3/files/") && method === "PATCH") {
        assert.equal(headers.get("authorization"), "Bearer ya29.test-sa");
        return new Response(JSON.stringify({ id: "1d3lzLDxCPwC963fdplsnwYgrDEanohZc", name: "seats.json" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    }) as typeof fetch;
    try {
      const adapter = driveAdapter({
        GOOGLE_CLIENT_EMAIL: "vault@hitsquad.iam.gserviceaccount.com",
        GOOGLE_PRIVATE_KEY: pem,
      });
      const file = await adapter.updateJson("1d3lzLDxCPwC963fdplsnwYgrDEanohZc", '{"hashes":{}}');
      assert.equal(file.id, "1d3lzLDxCPwC963fdplsnwYgrDEanohZc");
      assert.deepEqual(grants, ["urn:ietf:params:oauth:grant-type:jwt-bearer"]);
    } finally {
      globalThis.fetch = previous;
      resetDriveTokenCache();
    }
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
      assert.match(calls[1].url, /supportsAllDrives=true/);
    } finally {
      globalThis.fetch = previous;
      resetDriveTokenCache();
    }
  });

  it("falls back to the service account when OAuth token refresh fails", async () => {
    resetDriveTokenCache();
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const env = {
      ...oauthEnv,
      GOOGLE_CLIENT_EMAIL: "vault@hitsquad.iam.gserviceaccount.com",
      GOOGLE_PRIVATE_KEY: pem,
    };
    const calls: Array<{ url: string; method: string; auth: string; grant?: string }> = [];
    const warnings: string[] = [];
    const previous = globalThis.fetch;
    const warn = console.warn;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method || "GET").toUpperCase();
      const headers = new Headers(init?.headers);
      const body = typeof init?.body === "string" ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : "";
      const params = body ? new URLSearchParams(body) : null;
      calls.push({ url, method, auth: headers.get("authorization") || "", grant: params?.get("grant_type") || undefined });
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        if (params?.get("grant_type") === "refresh_token") {
          return new Response(JSON.stringify({ error: "invalid_grant" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
        assert.equal(params?.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
        return new Response(JSON.stringify({ access_token: "ya29.test-sa", expires_in: 3600 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/drive/v3/files/") && method === "PATCH") {
        assert.equal(headers.get("authorization"), "Bearer ya29.test-sa");
        return new Response(JSON.stringify({ id: "1d3lzLDxCPwC963fdplsnwYgrDEanohZc", name: "seats.json" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    }) as typeof fetch;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      const adapter = driveAdapter(env);
      const file = await adapter.updateJson("1d3lzLDxCPwC963fdplsnwYgrDEanohZc", '{"hashes":{}}', "seats.json");
      assert.equal(file.id, "1d3lzLDxCPwC963fdplsnwYgrDEanohZc");
      assert.equal(calls.some((call) => call.grant === "refresh_token"), true);
      assert.equal(calls.some((call) => call.grant === "urn:ietf:params:oauth:grant-type:jwt-bearer"), true);
      assert.equal(
        calls.some((call) => call.url.includes("/upload/drive/v3/files/") && call.auth === "Bearer ya29.test-sa"),
        true,
      );
      assert.equal(
        calls.some((call) => call.url.includes("/upload/drive/v3/files/") && call.auth === "Bearer ya29.test-oauth"),
        false,
      );
      assert.equal(warnings.some((line) => line.includes("falling back to service account")), true);
      assert.equal(warnings.every((line) => !line.includes("test-oauth-refresh-token")), true);
      assert.equal(warnings.every((line) => !line.includes("test-oauth-client-secret")), true);
      assert.equal(warnings.every((line) => !line.includes(pem)), true);
      assert.equal(warnings.every((line) => !line.includes("ya29.")), true);
    } finally {
      globalThis.fetch = previous;
      console.warn = warn;
      resetDriveTokenCache();
    }
  });

  it("prefers the service account for vaultDriveAdapter writes when OAuth still refreshes", async () => {
    resetDriveTokenCache();
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const env = {
      ...oauthEnv,
      GOOGLE_CLIENT_EMAIL: "vault@hitsquad.iam.gserviceaccount.com",
      GOOGLE_PRIVATE_KEY: pem,
    };
    const content = '{"hashes":{}}';
    const md5 = createHash("md5").update(content).digest("hex");
    const calls: Array<{ url: string; method: string; auth: string; grant?: string }> = [];
    const previous = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method || "GET").toUpperCase();
      const headers = new Headers(init?.headers);
      const body = typeof init?.body === "string" ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : "";
      const params = body ? new URLSearchParams(body) : null;
      calls.push({ url, method, auth: headers.get("authorization") || "", grant: params?.get("grant_type") || undefined });
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        if (params?.get("grant_type") === "refresh_token") {
          return new Response(JSON.stringify({ access_token: "ya29.test-oauth", expires_in: 3600 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ access_token: "ya29.test-sa", expires_in: 3600 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/upload/drive/v3/files/") && method === "PATCH") {
        assert.equal(headers.get("authorization"), "Bearer ya29.test-sa");
        return new Response(JSON.stringify({ id: "1d3lzLDxCPwC963fdplsnwYgrDEanohZc", name: "seats.json" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/drive/v3/files/") && method === "PATCH") {
        assert.equal(headers.get("authorization"), "Bearer ya29.test-sa");
        return new Response(JSON.stringify({ id: "1d3lzLDxCPwC963fdplsnwYgrDEanohZc", name: "seats.json" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/drive/v3/files/") && method === "GET" && url.includes("fields=")) {
        assert.equal(headers.get("authorization"), "Bearer ya29.test-sa");
        return new Response(JSON.stringify({ id: "1d3lzLDxCPwC963fdplsnwYgrDEanohZc", md5Checksum: md5 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    }) as typeof fetch;
    try {
      const adapter = vaultDriveAdapter(env);
      const file = await adapter.updateJson("1d3lzLDxCPwC963fdplsnwYgrDEanohZc", content, "seats.json");
      assert.equal(file.id, "1d3lzLDxCPwC963fdplsnwYgrDEanohZc");
      assert.equal(
        calls.some((call) => call.url.includes("/upload/drive/v3/files/") && call.auth === "Bearer ya29.test-sa"),
        true,
      );
      assert.equal(
        calls.some((call) => call.url.includes("/upload/drive/v3/files/") && call.auth === "Bearer ya29.test-oauth"),
        false,
      );
      assert.equal(calls.some((call) => call.grant === "refresh_token"), false);
      assert.match(calls.find((call) => call.url.includes("/upload/drive/v3/files/"))?.url || "", /supportsAllDrives=true/);
    } finally {
      globalThis.fetch = previous;
      resetDriveTokenCache();
    }
  });

  it("falls back to the service account when OAuth updateJson succeeds but the write did not land", async () => {
    resetDriveTokenCache();
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const env = {
      ...oauthEnv,
      GOOGLE_CLIENT_EMAIL: "vault@hitsquad.iam.gserviceaccount.com",
      GOOGLE_PRIVATE_KEY: pem,
    };
    const content = '{"hashes":{}}';
    const md5 = createHash("md5").update(content).digest("hex");
    const calls: Array<{ url: string; method: string; auth: string }> = [];
    const warnings: string[] = [];
    const previous = globalThis.fetch;
    const warn = console.warn;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method || "GET").toUpperCase();
      const headers = new Headers(init?.headers);
      const body = typeof init?.body === "string" ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : "";
      calls.push({ url, method, auth: headers.get("authorization") || "" });
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        const params = new URLSearchParams(body);
        if (params.get("grant_type") === "refresh_token") {
          return new Response(JSON.stringify({ access_token: "ya29.test-oauth", expires_in: 3600 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ access_token: "ya29.test-sa", expires_in: 3600 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/upload/drive/v3/files/") && method === "PATCH") {
        return new Response(JSON.stringify({ id: "1d3lzLDxCPwC963fdplsnwYgrDEanohZc" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/drive/v3/files/") && method === "GET" && url.includes("fields=")) {
        if (headers.get("authorization") === "Bearer ya29.test-oauth") {
          return new Response(JSON.stringify({ error: { message: "forbidden" } }), {
            status: 403,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ id: "1d3lzLDxCPwC963fdplsnwYgrDEanohZc", md5Checksum: md5 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    }) as typeof fetch;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      const adapter = driveAdapter(env);
      const file = await adapter.updateJson("1d3lzLDxCPwC963fdplsnwYgrDEanohZc", content);
      assert.equal(file.id, "1d3lzLDxCPwC963fdplsnwYgrDEanohZc");
      assert.equal(
        calls.some((call) => call.url.includes("/upload/drive/v3/files/") && call.auth === "Bearer ya29.test-oauth"),
        true,
      );
      assert.equal(
        calls.some((call) => call.url.includes("/upload/drive/v3/files/") && call.auth === "Bearer ya29.test-sa"),
        true,
      );
      assert.equal(warnings.some((line) => line.includes("falling back to service account")), true);
      assert.equal(warnings.every((line) => !line.includes("test-oauth-refresh-token")), true);
      assert.equal(warnings.every((line) => !line.includes("ya29.")), true);
      assert.equal(warnings.every((line) => !line.includes(pem)), true);
    } finally {
      globalThis.fetch = previous;
      console.warn = warn;
      resetDriveTokenCache();
    }
  });

  it("lists shared-with-me JSON and reads/updates files with all-drives flags", async () => {
    resetDriveTokenCache();
    const calls: string[] = [];
    const previous = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method || "GET").toUpperCase();
      calls.push(`${method} ${url}`);
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "ya29.test-oauth", expires_in: 3600 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/drive/v3/files") && !url.includes("upload") && method === "GET" && !url.includes("alt=media")) {
        const parsed = new URL(url);
        assert.equal(parsed.searchParams.get("supportsAllDrives"), "true");
        assert.equal(parsed.searchParams.get("includeItemsFromAllDrives"), "true");
        if (parsed.searchParams.get("q")?.includes("name='seats.json'")) {
          assert.equal(parsed.searchParams.get("spaces"), null);
          assert.equal(parsed.searchParams.get("corpora"), "user");
        } else {
          assert.equal(parsed.searchParams.get("spaces"), "drive");
        }
        return new Response(JSON.stringify({ files: [{ id: "1d3lzLDxCPwC963fdplsnwYgrDEanohZc", name: "seats.json" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("alt=media")) {
        assert.match(url, /supportsAllDrives=true/);
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/upload/drive/v3/files/") && method === "PATCH") {
        assert.match(url, /supportsAllDrives=true/);
        return new Response(JSON.stringify({ id: "file-1" }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/drive/v3/files/") && method === "PATCH") {
        assert.match(url, /supportsAllDrives=true/);
        return new Response(JSON.stringify({ id: "file-1" }), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    }) as typeof fetch;
    try {
      const adapter = driveAdapter(oauthEnv);
      const accessible = await adapter.listAccessibleJson("seats.json");
      assert.equal(accessible[0]?.id, "1d3lzLDxCPwC963fdplsnwYgrDEanohZc");
      await adapter.listJson("1y6Q3TOnpXzV-Y1oeqjjrHfSXt9hcIrgW");
      await adapter.readJson("1d3lzLDxCPwC963fdplsnwYgrDEanohZc");
      await adapter.updateJson("1d3lzLDxCPwC963fdplsnwYgrDEanohZc", "{}", "seats.json", { kind: "seats" });
      await adapter.deleteJson("1d3lzLDxCPwC963fdplsnwYgrDEanohZc");
      assert.equal(
        calls.some((call) => call.includes("listAccessible") || (call.includes("name='seats.json'") && call.includes("spaces=drive"))),
        false,
      );
      assert.equal(
        calls.filter((call) => call.includes("/drive/v3/files") || call.includes("/upload/drive/v3/files")).every((call) =>
          call.includes("supportsAllDrives=true"),
        ),
        true,
      );
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
    assert.equal(isThinDriveStub("1bBWKw2aCy3fVKm0rQAWcoCi8OXzahoPI"), true);
    assert.equal(THIN_DRIVE_STUB_IDS.has("1bBWKw2aCy3fVKm0rQAWcoCi8OXzahoPI"), true);
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

  it("still reads known HIS files when the Estimates folder list fails", async () => {
    const drive = memoryDrive();
    const packId = "new-mtj7bvtk-akmei";
    const working = {
      packId,
      key: `new:${packId}`,
      title: "2027 Aromatics Turnaround",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 50,
      updatedAt: 400,
      ownerEmail: "nathanboyte@gmail.com",
    };
    drive.files.set("1KLhPczzj-BHMqT8uOI5VxUkSJUagj7rz", {
      file: {
        id: "1KLhPczzj-BHMqT8uOI5VxUkSJUagj7rz",
        name: "wood-river-2027-aromatics-turnaround.json",
        properties: { packId, ownerEmail: working.ownerEmail },
      },
      content: JSON.stringify(working),
    });
    drive.listJson = async () => {
      throw new Error("403");
    };
    const listed = await listDrivePacks(drive, "folder");
    assert.equal(listed.some((pack) => pack.packId === packId), true);
    assert.equal(listed.find((pack) => pack.packId === packId)?.ownerEmail, "nathanboyte@gmail.com");
  });

  it("lists smashed live Aromatics and writes the Sep 2 freeze clock back onto the live file only", async () => {
    const drive = memoryDrive();
    const seed = defaultPhaseSchedule();
    const job2027 = {
      projectStart: "2027-01-11",
      phases: seed.phases.map((row) => {
        if (row.id === "pre") return { ...row, start: "2027-01-11", stop: "2027-02-28" };
        if (row.id === "oil-out") return { ...row, start: "2027-03-01", stop: "2027-03-10" };
        if (row.id === "mech") return { ...row, start: "2027-03-11", stop: "2027-04-17" };
        if (row.id === "oil-in") return { ...row, start: "2027-04-18", stop: "2027-05-03" };
        return { ...row, start: "2027-05-04", stop: "2027-05-21" };
      }),
    };
    const smashedOther = {
      perDiemRate: 0,
      travel: [{ id: "travel-staff", kind: "staff", travelers: 2, miles: 80, perMile: 0.76 }],
      misc: [{ id: "mc-thin", item: "Seed leftover", qty: 1, each: 50 }],
    };
    const freezeOther = {
      perDiemRate: 0,
      travel: [
        { id: "travel-staff", kind: "staff", travelers: 39, miles: 1700, perMile: 0.76 },
        { id: "travel-craft", kind: "craft", travelers: 100, miles: 800, perMile: 0.76 },
      ],
      misc: [{ id: "mc-1", item: "Alloy rod", qty: 65, each: 1000 }],
    };
    const smashed = {
      packId: HIS_AROMATICS_PACK_ID,
      key: `new:${HIS_AROMATICS_PACK_ID}`,
      title: "2027 Aromatics Turnaround",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 50,
      updatedAt: 9000,
      ownerEmail: "nathanboyte@gmail.com",
      sharedWith: ["robertmhenderson582@gmail.com"],
      status: "Budgetary" as const,
      schedule: seed,
      crew: { staff: [{ id: "st-1", ranges: [{ phaseId: "pre", start: "2026-09-03", end: "2026-09-03" }] }] },
      otherCost: smashedOther,
      equipment: { largeTools: [], thirdParty: [] },
    };
    const freeze = {
      ...smashed,
      updatedAt: 400,
      ownerEmail: "freeze-should-not-win@example.com",
      sharedWith: [],
      status: "Draft" as const,
      schedule: job2027,
      crew: { staff: [{ id: "st-1", ranges: [{ phaseId: "pre", start: "2027-01-11", end: "2027-02-28" }] }] },
      otherCost: freezeOther,
      equipment: { largeTools: [{ id: "lt-1", itemId: "wet:8:truck-crew", qty: 1 }], thirdParty: [] },
      subcontractor: { lines: [], cards: [{ id: "sc-1", vendor: "Hartford" }] },
      jobMeta: { staffPerDiemRate: 185 },
      orgChart: { names: { "st-1": { days: "Lee" } } },
      activities: [{ id: "act-1", name: "Tray work", hours: 40 }],
    };
    drive.files.set(HIS_AROMATICS_FILE_ID, {
      file: {
        id: HIS_AROMATICS_FILE_ID,
        name: "wood-river-2027-aromatics-turnaround.json",
        properties: { packId: HIS_AROMATICS_PACK_ID, ownerEmail: smashed.ownerEmail },
      },
      content: JSON.stringify(smashed),
    });
    drive.files.set(HIS_AROMATICS_FREEZE_FILE_ID, {
      file: {
        id: HIS_AROMATICS_FREEZE_FILE_ID,
        name: "2026-09-02 2027 Aromatics freeze.json",
      },
      content: JSON.stringify(freeze),
    });
    const listed = await listDrivePacks(drive, "folder");
    const pack = listed.find((row) => row.packId === HIS_AROMATICS_PACK_ID);
    assert.equal((pack?.schedule as { projectStart?: string }).projectStart, "2027-01-11");
    assert.equal(
      ((pack?.crew as { staff: Array<{ ranges: Array<{ start: string }> }> }).staff[0]?.ranges[0]?.start),
      "2027-01-11",
    );
    assert.equal(listed.some((row) => JSON.stringify(row.schedule).includes("2026-08-21")), false);
    assert.equal(((pack?.otherCost as { misc: Array<{ qty: number }> }).misc || [])[0]?.qty, 65);
    assert.equal(((pack?.equipment as { largeTools: unknown[] }).largeTools || []).length, 1);
    assert.equal(pack?.ownerEmail, "nathanboyte@gmail.com");
    assert.deepEqual(pack?.sharedWith, ["robertmhenderson582@gmail.com"]);
    assert.equal(pack?.status, "Budgetary");
    const liveWritten = JSON.parse(await drive.readJson(HIS_AROMATICS_FILE_ID));
    assert.equal((liveWritten.schedule as { projectStart?: string }).projectStart, "2027-01-11");
    assert.equal(((liveWritten.otherCost as { misc: Array<{ qty: number }> }).misc || [])[0]?.qty, 65);
    assert.equal(liveWritten.ownerEmail, "nathanboyte@gmail.com");
    const freezeWritten = JSON.parse(await drive.readJson(HIS_AROMATICS_FREEZE_FILE_ID));
    assert.equal(freezeWritten.updatedAt, 400);
    assert.equal(freezeWritten.ownerEmail, "freeze-should-not-win@example.com");
    assert.equal(((freezeWritten.otherCost as { misc: Array<{ qty: number }> }).misc || [])[0]?.qty, 65);
  });

  it("refuses to persist a smashed Aromatics upsert and writes the freeze sheets onto the live file only", async () => {
    const drive = memoryDrive();
    const seed = defaultPhaseSchedule();
    const remapped = {
      projectStart: "2026-08-21",
      phases: seed.phases.map((row) =>
        row.id === "pre" ? { ...row, start: "2026-08-24", stop: "2026-09-04" } : row,
      ),
    };
    const job2027 = {
      projectStart: "2027-01-11",
      phases: seed.phases.map((row) => {
        if (row.id === "pre") return { ...row, start: "2027-01-11", stop: "2027-02-28" };
        if (row.id === "oil-out") return { ...row, start: "2027-03-01", stop: "2027-03-10" };
        if (row.id === "mech") return { ...row, start: "2027-03-11", stop: "2027-04-17" };
        if (row.id === "oil-in") return { ...row, start: "2027-04-18", stop: "2027-05-03" };
        return { ...row, start: "2027-05-04", stop: "2027-05-21" };
      }),
    };
    const smashed = {
      packId: HIS_AROMATICS_PACK_ID,
      key: `new:${HIS_AROMATICS_PACK_ID}`,
      title: "2027 Aromatics Turnaround",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 50,
      updatedAt: 12_000,
      ownerEmail: "nathanboyte@gmail.com",
      sharedWith: ["robertmhenderson582@gmail.com"],
      schedule: remapped,
      crew: { staff: [{ id: "st-1", ranges: [{ phaseId: "pre", start: "2026-08-24", end: "2026-09-04" }] }] },
      otherCost: {
        travel: [{ id: "travel-staff", travelers: 2, miles: 80, perMile: 0.76 }],
        misc: [{ id: "mc-thin", item: "Seed leftover", qty: 1, each: 50 }],
      },
    };
    const freeze = {
      ...smashed,
      updatedAt: 400,
      ownerEmail: "freeze-should-not-win@example.com",
      schedule: job2027,
      crew: { staff: [{ id: "st-1", ranges: [{ phaseId: "pre", start: "2027-01-11", end: "2027-02-28" }] }] },
      otherCost: {
        travel: [{ id: "travel-staff", travelers: 39, miles: 1700, perMile: 0.76 }],
        misc: [{ id: "mc-1", item: "Alloy rod", qty: 65, each: 1000 }],
      },
    };
    drive.files.set(HIS_AROMATICS_FILE_ID, {
      file: {
        id: HIS_AROMATICS_FILE_ID,
        name: "wood-river-2027-aromatics-turnaround.json",
        properties: { packId: HIS_AROMATICS_PACK_ID, ownerEmail: smashed.ownerEmail },
      },
      content: JSON.stringify(smashed),
    });
    drive.files.set(HIS_AROMATICS_FREEZE_FILE_ID, {
      file: {
        id: HIS_AROMATICS_FREEZE_FILE_ID,
        name: "2026-09-02 2027 Aromatics freeze.json",
      },
      content: JSON.stringify(freeze),
    });
    const saved = await upsertEstimateInDrive(drive, smashed, "folder");
    assert.equal(saved.id, HIS_AROMATICS_FILE_ID);
    const liveWritten = JSON.parse(await drive.readJson(HIS_AROMATICS_FILE_ID));
    assert.equal((liveWritten.schedule as { projectStart?: string }).projectStart, "2027-01-11");
    assert.equal(((liveWritten.otherCost as { misc: Array<{ qty: number }> }).misc || [])[0]?.qty, 65);
    assert.equal(
      ((liveWritten.crew as { staff: Array<{ ranges: Array<{ start: string }> }> }).staff[0]?.ranges[0]?.start),
      "2027-01-11",
    );
    assert.equal(liveWritten.ownerEmail, "nathanboyte@gmail.com");
    assert.deepEqual(liveWritten.sharedWith, ["robertmhenderson582@gmail.com"]);
    const freezeWritten = JSON.parse(await drive.readJson(HIS_AROMATICS_FREEZE_FILE_ID));
    assert.equal(freezeWritten.updatedAt, 400);
    assert.equal(freezeWritten.ownerEmail, "freeze-should-not-win@example.com");
    assert.equal((freezeWritten.schedule as { projectStart?: string }).projectStart, "2027-01-11");
  });

  it("refuses a 2027 stub-smashed Aromatics upsert so local cannot overwrite healthy Drive", async () => {
    const drive = memoryDrive();
    const seed = defaultPhaseSchedule();
    const job2027 = {
      projectStart: "2027-01-11",
      phases: seed.phases.map((row) => {
        if (row.id === "pre") return { ...row, start: "2027-01-11", stop: "2027-02-28" };
        if (row.id === "oil-out") return { ...row, start: "2027-03-01", stop: "2027-03-10" };
        if (row.id === "mech") return { ...row, start: "2027-03-11", stop: "2027-04-17" };
        if (row.id === "oil-in") return { ...row, start: "2027-04-18", stop: "2027-05-03" };
        return { ...row, start: "2027-05-04", stop: "2027-05-21" };
      }),
    };
    const healthy = {
      packId: HIS_AROMATICS_PACK_ID,
      key: `new:${HIS_AROMATICS_PACK_ID}`,
      title: "2027 Aromatics Turnaround",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 50,
      updatedAt: 400,
      ownerEmail: "nathanboyte@gmail.com",
      schedule: job2027,
      crew: { staff: [{ id: "st-1", ranges: [{ phaseId: "pre", start: "2027-01-11", end: "2027-02-28" }] }] },
      otherCost: { misc: [{ id: "mc-1", item: "Alloy rod", qty: 65, each: 1000 }] },
    };
    const stubs = {
      ...healthy,
      updatedAt: 99_000,
      crew: { staff: [{ id: "st-1", ranges: [{ phaseId: "pre", start: "2027-01-11", end: "2027-01-11" }] }] },
      otherCost: { misc: [{ id: "mc-thin", item: "Seed leftover", qty: 1, each: 50 }] },
    };
    drive.files.set(HIS_AROMATICS_FILE_ID, {
      file: {
        id: HIS_AROMATICS_FILE_ID,
        name: "wood-river-2027-aromatics-turnaround.json",
        properties: { packId: HIS_AROMATICS_PACK_ID, ownerEmail: healthy.ownerEmail },
      },
      content: JSON.stringify(healthy),
    });
    drive.files.set(HIS_AROMATICS_FREEZE_FILE_ID, {
      file: { id: HIS_AROMATICS_FREEZE_FILE_ID, name: "2026-09-02 2027 Aromatics freeze.json" },
      content: JSON.stringify({ ...healthy, ownerEmail: "freeze-should-not-win@example.com" }),
    });
    const saved = await upsertEstimateInDrive(drive, stubs, "folder");
    assert.equal(saved.id, HIS_AROMATICS_FILE_ID);
    const liveWritten = JSON.parse(await drive.readJson(HIS_AROMATICS_FILE_ID));
    assert.equal((liveWritten.schedule as { projectStart?: string }).projectStart, "2027-01-11");
    assert.equal(
      ((liveWritten.crew as { staff: Array<{ ranges: Array<{ end: string }> }> }).staff[0]?.ranges[0]?.end),
      "2027-02-28",
    );
    assert.equal(((liveWritten.otherCost as { misc: Array<{ qty: number }> }).misc || [])[0]?.qty, 65);
    const freezeWritten = JSON.parse(await drive.readJson(HIS_AROMATICS_FREEZE_FILE_ID));
    assert.equal(freezeWritten.ownerEmail, "freeze-should-not-win@example.com");
    await overwriteEstimateInDrive(drive, stubs, "folder");
    const afterOverwrite = JSON.parse(await drive.readJson(HIS_AROMATICS_FILE_ID));
    assert.equal(
      ((afterOverwrite.crew as { staff: Array<{ ranges: Array<{ end: string }> }> }).staff[0]?.ranges[0]?.end),
      "2027-02-28",
    );
  });

  it("empty Drive upsert cannot wipe a filled Boiler 17 or Cat 2 pack", async () => {
    const drive = memoryDrive();
    const filled = {
      packId: "new-b1726",
      key: "new:new-b1726",
      title: "Boiler 17 2026",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 50,
      updatedAt: 400,
      ownerEmail: "nathanboyte@gmail.com",
      schedule: {
        projectStart: "2026-08-10",
        phases: defaultPhaseSchedule().phases.map((row) =>
          row.id === "pre" ? { ...row, start: "2026-08-10", stop: "2026-12-06" } : row,
        ),
      },
      crew: { staff: [{ id: "st-1", ranges: [{ phaseId: "pre", start: "2026-08-10", end: "2026-12-06" }] }] },
    };
    drive.files.set("1SDOBakDxjUCUE-PgTlBUjqnbgchNlG8Y", {
      file: {
        id: "1SDOBakDxjUCUE-PgTlBUjqnbgchNlG8Y",
        name: "wood-river-boiler-17-2026.json",
        properties: { packId: "new-b1726", ownerEmail: filled.ownerEmail },
      },
      content: JSON.stringify(filled),
    });
    const empty = {
      ...filled,
      updatedAt: 99_000,
      schedule: defaultPhaseSchedule(),
      crew: { staff: [], generalForeman: [], foreman: [], direct: [], support: [] },
    };
    await upsertEstimateInDrive(drive, empty, "folder");
    const written = JSON.parse(await drive.readJson("1SDOBakDxjUCUE-PgTlBUjqnbgchNlG8Y"));
    assert.equal((written.schedule as { projectStart?: string }).projectStart, "2026-08-10");
    assert.equal((written.crew.staff || []).length, 1);

    drive.files.set("1SDOBakDxjUCUE-PgTlBUjqnbgchNlG8Y", {
      file: {
        id: "1SDOBakDxjUCUE-PgTlBUjqnbgchNlG8Y",
        name: "wood-river-boiler-17-2026.json",
        properties: { packId: "new-b1726", ownerEmail: filled.ownerEmail },
      },
      content: JSON.stringify({ ...filled, jobMeta: { afeName: "Boiler 17 2026" } }),
    });
    const emptyU250 = {
      ...empty,
      jobMeta: { afeName: "P66 Rodeo U-250" },
    };
    await upsertEstimateInDrive(drive, emptyU250, "folder");
    const afterAfe = JSON.parse(await drive.readJson("1SDOBakDxjUCUE-PgTlBUjqnbgchNlG8Y"));
    assert.equal((afterAfe.jobMeta as { afeName?: string })?.afeName, "Boiler 17 2026");
    assert.equal((afterAfe.crew.staff || []).length, 1);
  });

  it("Jobs list retries a timed-out live restore write onto the Aromatics file id only", async () => {
    const drive = memoryDrive();
    const seed = defaultPhaseSchedule();
    const job2027 = {
      projectStart: "2027-01-11",
      phases: seed.phases.map((row) => {
        if (row.id === "pre") return { ...row, start: "2027-01-11", stop: "2027-02-28" };
        if (row.id === "oil-out") return { ...row, start: "2027-03-01", stop: "2027-03-10" };
        if (row.id === "mech") return { ...row, start: "2027-03-11", stop: "2027-04-17" };
        if (row.id === "oil-in") return { ...row, start: "2027-04-18", stop: "2027-05-03" };
        return { ...row, start: "2027-05-04", stop: "2027-05-21" };
      }),
    };
    const smashed = {
      packId: HIS_AROMATICS_PACK_ID,
      key: `new:${HIS_AROMATICS_PACK_ID}`,
      title: "2027 Aromatics Turnaround",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 50,
      updatedAt: 9000,
      ownerEmail: "nathanboyte@gmail.com",
      schedule: seed,
      crew: { staff: [{ id: "st-1", ranges: [{ phaseId: "pre", start: "2026-09-03", end: "2026-09-03" }] }] },
      otherCost: { misc: [{ id: "mc-thin", item: "Seed leftover", qty: 1, each: 50 }] },
    };
    const freeze = {
      ...smashed,
      updatedAt: 400,
      schedule: job2027,
      crew: { staff: [{ id: "st-1", ranges: [{ phaseId: "pre", start: "2027-01-11", end: "2027-02-28" }] }] },
      otherCost: { misc: [{ id: "mc-1", item: "Alloy rod", qty: 65, each: 1000 }] },
    };
    drive.files.set(HIS_AROMATICS_FILE_ID, {
      file: {
        id: HIS_AROMATICS_FILE_ID,
        name: "wood-river-2027-aromatics-turnaround.json",
        properties: { packId: HIS_AROMATICS_PACK_ID, ownerEmail: smashed.ownerEmail },
      },
      content: JSON.stringify(smashed),
    });
    drive.files.set(HIS_AROMATICS_FREEZE_FILE_ID, {
      file: { id: HIS_AROMATICS_FREEZE_FILE_ID, name: "2026-09-02 2027 Aromatics freeze.json" },
      content: JSON.stringify(freeze),
    });
    const writes: string[] = [];
    const inner = drive.updateJson.bind(drive);
    drive.updateJson = async (fileId, content, name, properties) => {
      writes.push(fileId);
      if (writes.length === 1) throw new Error("timeout");
      return inner(fileId, content, name, properties);
    };
    const listed = await listDrivePacks(drive, "folder");
    const pack = listed.find((row) => row.packId === HIS_AROMATICS_PACK_ID);
    assert.deepEqual(writes, [HIS_AROMATICS_FILE_ID, HIS_AROMATICS_FILE_ID]);
    assert.equal((pack?.schedule as { projectStart?: string }).projectStart, "2027-01-11");
    assert.equal(((pack?.otherCost as { misc: Array<{ qty: number }> }).misc || [])[0]?.qty, 65);
    const liveWritten = JSON.parse(await drive.readJson(HIS_AROMATICS_FILE_ID));
    assert.equal((liveWritten.schedule as { projectStart?: string }).projectStart, "2027-01-11");
    assert.equal(((liveWritten.otherCost as { misc: Array<{ qty: number }> }).misc || [])[0]?.qty, 65);
    const freezeWritten = JSON.parse(await drive.readJson(HIS_AROMATICS_FREEZE_FILE_ID));
    assert.equal(freezeWritten.updatedAt, 400);
    assert.equal(writes.includes(HIS_AROMATICS_FREEZE_FILE_ID), false);
  });

  it("Jobs open still returns the freeze restore when both live write attempts time out", async () => {
    const drive = memoryDrive();
    const seed = defaultPhaseSchedule();
    const job2027 = {
      projectStart: "2027-01-11",
      phases: seed.phases.map((row) =>
        row.id === "pre" ? { ...row, start: "2027-01-11", stop: "2027-02-28" } : row,
      ),
    };
    const smashed = {
      packId: HIS_AROMATICS_PACK_ID,
      key: `new:${HIS_AROMATICS_PACK_ID}`,
      title: "2027 Aromatics Turnaround",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 50,
      updatedAt: 9000,
      ownerEmail: "nathanboyte@gmail.com",
      schedule: seed,
      crew: { staff: [{ id: "st-1", ranges: [{ phaseId: "pre", start: "2026-09-03", end: "2026-09-03" }] }] },
      otherCost: { misc: [{ id: "mc-thin", item: "Seed leftover", qty: 1, each: 50 }] },
    };
    const freeze = {
      ...smashed,
      updatedAt: 400,
      schedule: job2027,
      crew: { staff: [{ id: "st-1", ranges: [{ phaseId: "pre", start: "2027-01-11", end: "2027-02-28" }] }] },
      otherCost: { misc: [{ id: "mc-1", item: "Alloy rod", qty: 65, each: 1000 }] },
    };
    drive.files.set(HIS_AROMATICS_FILE_ID, {
      file: {
        id: HIS_AROMATICS_FILE_ID,
        name: "wood-river-2027-aromatics-turnaround.json",
        properties: { packId: HIS_AROMATICS_PACK_ID, ownerEmail: smashed.ownerEmail },
      },
      content: JSON.stringify(smashed),
    });
    drive.files.set(HIS_AROMATICS_FREEZE_FILE_ID, {
      file: { id: HIS_AROMATICS_FREEZE_FILE_ID, name: "2026-09-02 2027 Aromatics freeze.json" },
      content: JSON.stringify(freeze),
    });
    const writes: string[] = [];
    drive.updateJson = async (fileId) => {
      writes.push(fileId);
      throw new Error("timeout");
    };
    const opened = await readDrivePackById(drive, HIS_AROMATICS_PACK_ID, "folder");
    const listed = await listDrivePacks(drive, "folder");
    assert.equal(writes.every((id) => id === HIS_AROMATICS_FILE_ID), true);
    assert.ok(writes.length >= 2);
    assert.equal((opened?.schedule as { projectStart?: string }).projectStart, "2027-01-11");
    assert.equal(((opened?.otherCost as { misc: Array<{ qty: number }> }).misc || [])[0]?.qty, 65);
    assert.equal((listed.find((row) => row.packId === HIS_AROMATICS_PACK_ID)?.schedule as { projectStart?: string }).projectStart, "2027-01-11");
    const liveWritten = JSON.parse(await drive.readJson(HIS_AROMATICS_FILE_ID));
    assert.equal((liveWritten.schedule as { projectStart?: string }).projectStart, "2026-08-21");
    const freezeWritten = JSON.parse(await drive.readJson(HIS_AROMATICS_FREEZE_FILE_ID));
    assert.equal(freezeWritten.updatedAt, 400);
  });

  it("refuses a broken Rodeo-like first create and writes a good Family A seed", async () => {
    const { rodeoU110FilledSnapshot, RODEO_U110_VAULT_FILE } = await import("./madison-u110.ts");
    const { rodeoU250FilledSnapshot, RODEO_U250_VAULT_FILE } = await import("./madison-u250.ts");
    const { PACK_INTEGRITY_ERROR_PREFIX } = await import("./pack-integrity.ts");
    const dropRate = (rows: unknown[] | undefined) =>
      (rows ?? []).map((row) => {
        if (!row || typeof row !== "object") return row;
        const next = { ...(row as Record<string, unknown>) };
        delete next.bookRate;
        return next;
      });
    const good = rodeoU110FilledSnapshot({
      createdAt: 9_000,
      updatedAt: 9_001,
      ownerEmail: "robertmhenderson582@gmail.com",
    });
    const created = await upsertEstimateInDrive(memoryDrive(), good, "folder");
    assert.equal(created.name, RODEO_U110_VAULT_FILE);

    const u250 = await upsertEstimateInDrive(
      memoryDrive(),
      rodeoU250FilledSnapshot({
        createdAt: 9_000,
        updatedAt: 9_001,
        ownerEmail: "robertmhenderson582@gmail.com",
      }),
      "folder",
    );
    assert.equal(u250.name, RODEO_U250_VAULT_FILE);

    const crew = good.crew as {
      staff?: unknown[];
      generalForeman?: unknown[];
      foreman?: unknown[];
      direct?: unknown[];
      support?: unknown[];
    };
    const other = good.otherCost as { misc?: Array<Record<string, unknown>> };
    const broken = {
      ...good,
      crew: {
        ...crew,
        staff: dropRate(crew.staff),
        generalForeman: dropRate(crew.generalForeman),
        foreman: dropRate(crew.foreman),
        direct: dropRate(crew.direct),
        support: dropRate(crew.support),
      },
      otherCost: {
        ...other,
        misc: (other.misc ?? []).map((row) => {
          const next = { ...row };
          delete next.bookPriced;
          return next;
        }),
      },
    };
    const drive = memoryDrive();
    await assert.rejects(
      () => upsertEstimateInDrive(drive, broken, "folder"),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message.startsWith(PACK_INTEGRITY_ERROR_PREFIX), true);
        assert.match(error.message, /Rodeo U110 desk \$815,?419(?:\.38)? ≠ locked \$5,?247,?587/);
        return true;
      },
    );
    assert.equal(drive.files.size, 0);
    await assert.rejects(
      () => overwriteEstimateInDrive(drive, broken, "folder"),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Rodeo U110 desk \$815,?419(?:\.38)? ≠ locked \$5,?247,?587/);
        return true;
      },
    );
    assert.equal(drive.files.size, 0);
  });

  it("pins Aromatics writes to the known file id instead of minting a stub", async () => {
    const drive = memoryDrive();
    const packId = "new-mtj7bvtk-akmei";
    const pack = {
      packId,
      key: `new:${packId}`,
      title: "2027 Aromatics Turnaround",
      client: "Phillips 66",
      site: "Wood River — Roxana, IL",
      siteId: "site-madison",
      createdAt: 50,
      updatedAt: 400,
      ownerEmail: "nathanboyte@gmail.com",
      sharedWith: ["robertmhenderson582@gmail.com"],
    };
    drive.listJson = async () => {
      throw new Error("403");
    };
    const saved = await upsertEstimateInDrive(drive, pack, "folder");
    assert.equal(saved.id, "1KLhPczzj-BHMqT8uOI5VxUkSJUagj7rz");
    assert.equal(drive.files.has("1AEf_Shk8SEvMsdGodNSpaNgUCytXSLZ9"), false);
    const parsed = JSON.parse(await drive.readJson(saved.id));
    assert.deepEqual(parsed.sharedWith, ["robertmhenderson582@gmail.com"]);
    assert.equal(parsed.ownerEmail, "nathanboyte@gmail.com");
  });

  it("updateJson throws HTTP status and Drive error.message without secrets", async () => {
    resetDriveTokenCache();
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const previous = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method || "GET").toUpperCase();
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "ya29.test-sa", expires_in: 3600 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/upload/drive/v3/files/") && method === "PATCH") {
        return new Response(
          JSON.stringify({ error: { message: "The user does not have sufficient permissions for this file." } }),
          { status: 403, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    }) as typeof fetch;
    try {
      const adapter = vaultDriveAdapter({
        GOOGLE_CLIENT_EMAIL: "hitsquad-vault@hit-squad-vault.iam.gserviceaccount.com",
        GOOGLE_PRIVATE_KEY: pem,
      });
      await assert.rejects(
        () => adapter.updateJson("1d3lzLDxCPwC963fdplsnwYgrDEanohZc", '{"hashes":{}}'),
        (error: unknown) => {
          assert.ok(error instanceof DriveApiError);
          assert.equal(error.status, 403);
          assert.match(error.message, /403/);
          assert.match(error.message, /sufficient permissions/i);
          assert.equal(error.message.includes(pem), false);
          assert.equal(error.message.includes("ya29."), false);
          return true;
        },
      );
    } finally {
      globalThis.fetch = previous;
      resetDriveTokenCache();
    }
  });

  it("writePreferSa logs which principal failed with status then surfaces SA cannot open seats.json", async () => {
    resetDriveTokenCache();
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const warnings: string[] = [];
    const warn = console.warn;
    const previous = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method || "GET").toUpperCase();
      const headers = new Headers(init?.headers);
      const body = typeof init?.body === "string" ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : "";
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        const params = new URLSearchParams(body);
        const token =
          params.get("grant_type") === "refresh_token" ? "ya29.test-oauth" : "ya29.test-sa";
        return new Response(JSON.stringify({ access_token: token, expires_in: 3600 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/upload/drive/v3/files/") && method === "PATCH") {
        const who = headers.get("authorization") === "Bearer ya29.test-sa" ? "service account" : "OAuth";
        return new Response(
          JSON.stringify({ error: { message: `${who} cannot PATCH this file.` } }),
          { status: 403, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`unexpected fetch ${method} ${url}`);
    }) as typeof fetch;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      const adapter = vaultDriveAdapter({
        ...oauthEnv,
        GOOGLE_CLIENT_EMAIL: "hitsquad-vault@hit-squad-vault.iam.gserviceaccount.com",
        GOOGLE_PRIVATE_KEY: pem,
      });
      await assert.rejects(
        () => adapter.updateJson("1d3lzLDxCPwC963fdplsnwYgrDEanohZc", '{"hashes":{}}'),
        (error: unknown) => {
          assert.ok(error instanceof DriveApiError);
          assert.equal(error.message, SEATS_SA_OPEN_ERROR);
          assert.equal(error.status, 403);
          return true;
        },
      );
      assert.equal(
        warnings.some((line) => line.includes("service-account") && line.includes("403")),
        true,
      );
      assert.equal(warnings.some((line) => line.includes("oauth") && line.includes("403")), true);
      assert.equal(warnings.every((line) => !line.includes("test-oauth-refresh-token")), true);
      assert.equal(warnings.every((line) => !line.includes("ya29.")), true);
      assert.equal(warnings.every((line) => !line.includes(pem)), true);
    } finally {
      globalThis.fetch = previous;
      console.warn = warn;
      resetDriveTokenCache();
    }
  });
});
