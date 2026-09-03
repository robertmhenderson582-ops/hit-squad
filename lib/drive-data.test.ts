import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  ACTIVITY_VAULT_KIND,
  ACTIVITY_VAULT_NAME,
  COMPANIES_VAULT_KIND,
  COMPANIES_VAULT_NAME,
  SEATS_VAULT_FILE_ID,
  SEATS_VAULT_KIND,
  SEATS_VAULT_NAME,
  SETTINGS_VAULT_KIND,
  SETTINGS_VAULT_NAME,
  TICKETS_VAULT_KIND,
  TICKETS_VAULT_NAME,
  RATES_VAULT_KIND,
  RATES_VAULT_NAME,
  QUALITY_BRIEFS_VAULT_KIND,
  QUALITY_BRIEFS_VAULT_NAME,
  INBOX_VAULT_KIND,
  INBOX_VAULT_NAME,
  findVaultJsonFile,
  readVaultJson,
  resetVaultFileIdsForTests,
  writeVaultJson,
} from "./drive-data.ts";
import { memoryDrive, type DriveAdapter } from "./drive-estimates.ts";

describe("vault named json", () => {
  beforeEach(() => {
    resetVaultFileIdsForTests();
  });

  it("writes and reads companies.json without inventing hall dollars", async () => {
    const drive = memoryDrive();
    const payload = { assignments: { "josephmhenderson2002@gmail.com": "acme" }, companies: [{ id: "acme", name: "Acme" }] };
    await writeVaultJson(drive, COMPANIES_VAULT_NAME, COMPANIES_VAULT_KIND, payload);
    const read = await readVaultJson<typeof payload>(drive, COMPANIES_VAULT_NAME, COMPANIES_VAULT_KIND);
    assert.deepEqual(read, payload);
    const activity = await readVaultJson(drive, ACTIVITY_VAULT_NAME, ACTIVITY_VAULT_KIND);
    assert.equal(activity, null);
  });

  it("keeps tickets, seats, and settings in separate named files", async () => {
    const drive = memoryDrive();
    await writeVaultJson(drive, TICKETS_VAULT_NAME, TICKETS_VAULT_KIND, { tickets: [{ id: "t1" }] });
    await writeVaultJson(drive, SEATS_VAULT_NAME, SEATS_VAULT_KIND, { hashes: { "nathanboyte@gmail.com": { passwordHash: "$2a$12$placeholder" } } });
    await writeVaultJson(drive, SETTINGS_VAULT_NAME, SETTINGS_VAULT_KIND, { aliasesOn: true });
    const tickets = await readVaultJson<{ tickets: Array<{ id: string }> }>(drive, TICKETS_VAULT_NAME, TICKETS_VAULT_KIND);
    const seats = await readVaultJson<{ hashes: Record<string, { passwordHash: string }> }>(
      drive,
      SEATS_VAULT_NAME,
      SEATS_VAULT_KIND,
    );
    const settings = await readVaultJson<{ aliasesOn: boolean }>(drive, SETTINGS_VAULT_NAME, SETTINGS_VAULT_KIND);
    assert.equal(tickets?.tickets[0].id, "t1");
    assert.equal(Boolean(seats?.hashes["nathanboyte@gmail.com"]?.passwordHash), true);
    assert.equal(settings?.aliasesOn, true);
    assert.equal(await readVaultJson(drive, ACTIVITY_VAULT_NAME, ACTIVITY_VAULT_KIND), null);
  });

  it("keeps rates.json apart from tickets and companies", async () => {
    const drive = memoryDrive();
    await writeVaultJson(drive, RATES_VAULT_NAME, RATES_VAULT_KIND, { catalog: [{ description: "Skip Pan", monthly: 847 }] });
    const rates = await readVaultJson<{ catalog: Array<{ description: string }> }>(drive, RATES_VAULT_NAME, RATES_VAULT_KIND);
    assert.equal(rates?.catalog[0].description, "Skip Pan");
    assert.equal(await readVaultJson(drive, TICKETS_VAULT_NAME, TICKETS_VAULT_KIND), null);
  });

  it("keeps quality briefs apart from tickets and prefers the newest inbox.json", async () => {
    const drive = memoryDrive();
    await writeVaultJson(drive, QUALITY_BRIEFS_VAULT_NAME, QUALITY_BRIEFS_VAULT_KIND, {
      briefs: [{ id: "brief-quality-chancec318@yahoo.com", who: "chancec318@yahoo.com" }],
    });
    const briefs = await readVaultJson<{ briefs: Array<{ id: string }> }>(
      drive,
      QUALITY_BRIEFS_VAULT_NAME,
      QUALITY_BRIEFS_VAULT_KIND,
    );
    assert.equal(briefs?.briefs[0].id, "brief-quality-chancec318@yahoo.com");
    assert.equal(await readVaultJson(drive, TICKETS_VAULT_NAME, TICKETS_VAULT_KIND), null);

    await drive.createJson("folder", INBOX_VAULT_NAME, JSON.stringify({ messages: [{ id: "old" }] }), {
      kind: INBOX_VAULT_KIND,
    });
    const newer = await drive.createJson("folder", INBOX_VAULT_NAME, JSON.stringify({ messages: [{ id: "new" }] }), {
      kind: INBOX_VAULT_KIND,
    });
    drive.files.get(newer.id)!.file.modifiedTime = "2026-09-02T21:00:00.000Z";
    const found = await findVaultJsonFile(drive, INBOX_VAULT_NAME, INBOX_VAULT_KIND);
    assert.equal(found?.id, newer.id);
  });

  it("updates vault JSON by accessible name or stored id when the parent folder cannot be listed", async () => {
    resetVaultFileIdsForTests();
    const inner = memoryDrive();
    await writeVaultJson(inner, TICKETS_VAULT_NAME, TICKETS_VAULT_KIND, { tickets: [{ id: "t-keep" }] });
    await writeVaultJson(inner, COMPANIES_VAULT_NAME, COMPANIES_VAULT_KIND, { companies: [{ id: "acme" }] });
    inner.files.set(SEATS_VAULT_FILE_ID, {
      file: { id: SEATS_VAULT_FILE_ID, name: SEATS_VAULT_NAME, properties: { kind: SEATS_VAULT_KIND } },
      content: `${JSON.stringify({ hashes: {}, extras: [] })}\n`,
    });

    async function throughUnlistable(listJson: DriveAdapter["listJson"]) {
      const drive: DriveAdapter = {
        configured: true,
        listJson,
        listAccessibleJson: (name) => inner.listAccessibleJson!(name),
        readJson: (fileId) => inner.readJson(fileId),
        async createJson() {
          throw new Error("createJson must not run when the vault file already exists");
        },
        updateJson: (fileId, content, name, properties) => inner.updateJson(fileId, content, name, properties),
        deleteJson: (fileId) => inner.deleteJson(fileId),
      };
      await writeVaultJson(drive, TICKETS_VAULT_NAME, TICKETS_VAULT_KIND, { tickets: [{ id: "t-updated" }] });
      await writeVaultJson(drive, SEATS_VAULT_NAME, SEATS_VAULT_KIND, { hashes: { "robertmhenderson582@gmail.com": {} } });
      const tickets = await readVaultJson<{ tickets: Array<{ id: string }> }>(drive, TICKETS_VAULT_NAME, TICKETS_VAULT_KIND);
      const seats = await readVaultJson<{ hashes: Record<string, unknown> }>(drive, SEATS_VAULT_NAME, SEATS_VAULT_KIND);
      const companies = await readVaultJson<{ companies: Array<{ id: string }> }>(
        drive,
        COMPANIES_VAULT_NAME,
        COMPANIES_VAULT_KIND,
      );
      assert.equal(tickets?.tickets[0].id, "t-updated");
      assert.equal(Boolean(seats?.hashes["robertmhenderson582@gmail.com"]), true);
      assert.equal(companies?.companies[0].id, "acme");
    }

    await throughUnlistable(async () => {
      throw new Error("The user does not have sufficient permissions for this file.");
    });
    await throughUnlistable(async () => []);

    const byStoredIdOnly: DriveAdapter = {
      configured: true,
      async listJson() {
        return [];
      },
      async listAccessibleJson() {
        return [];
      },
      readJson: (fileId) => inner.readJson(fileId),
      async createJson() {
        throw new Error("createJson must not run when seats.json is reachable by id");
      },
      updateJson: (fileId, content, name, properties) => inner.updateJson(fileId, content, name, properties),
      deleteJson: (fileId) => inner.deleteJson(fileId),
    };
    const found = await findVaultJsonFile(byStoredIdOnly, SEATS_VAULT_NAME, SEATS_VAULT_KIND);
    assert.equal(found?.id, SEATS_VAULT_FILE_ID);
    await writeVaultJson(byStoredIdOnly, SEATS_VAULT_NAME, SEATS_VAULT_KIND, {
      hashes: { "robertmhenderson582@gmail.com": { mustChangePassword: false } },
    });
    const seats = await readVaultJson<{ hashes: Record<string, { mustChangePassword?: boolean }> }>(
      byStoredIdOnly,
      SEATS_VAULT_NAME,
      SEATS_VAULT_KIND,
    );
    assert.equal(seats?.hashes["robertmhenderson582@gmail.com"]?.mustChangePassword, false);

    let created = 0;
    const unreadKnownId: DriveAdapter = {
      configured: true,
      async listJson() {
        throw new Error("The user does not have sufficient permissions for this file.");
      },
      async listAccessibleJson() {
        throw new Error("shared-with-me list failed");
      },
      async readJson() {
        throw new Error("read");
      },
      async createJson() {
        created += 1;
        throw new Error("createJson must not run when seats.json id is known");
      },
      updateJson: (fileId, content, name, properties) => inner.updateJson(fileId, content, name, properties),
      deleteJson: (fileId) => inner.deleteJson(fileId),
    };
    const unreadFound = await findVaultJsonFile(unreadKnownId, SEATS_VAULT_NAME, SEATS_VAULT_KIND);
    assert.equal(unreadFound?.id, SEATS_VAULT_FILE_ID);
    await writeVaultJson(unreadKnownId, SEATS_VAULT_NAME, SEATS_VAULT_KIND, {
      hashes: { "robertmhenderson582@gmail.com": { mustChangePassword: false } },
    });
    assert.equal(created, 0);
    const afterUnread = JSON.parse(await inner.readJson(SEATS_VAULT_FILE_ID)) as {
      hashes: Record<string, { mustChangePassword?: boolean }>;
    };
    assert.equal(afterUnread.hashes["robertmhenderson582@gmail.com"]?.mustChangePassword, false);
  });

  it("PATCHes the known seats.json id even when listAccessible returns a different file", async () => {
    resetVaultFileIdsForTests();
    const inner = memoryDrive();
    inner.files.set(SEATS_VAULT_FILE_ID, {
      file: { id: SEATS_VAULT_FILE_ID, name: SEATS_VAULT_NAME, properties: { kind: SEATS_VAULT_KIND } },
      content: `${JSON.stringify({ hashes: {}, extras: [] })}\n`,
    });
    const decoy = await inner.createJson("folder", SEATS_VAULT_NAME, JSON.stringify({ hashes: { decoy: {} } }), {
      kind: SEATS_VAULT_KIND,
    });
    const updated: string[] = [];
    const drive: DriveAdapter = {
      configured: true,
      async listJson() {
        return [];
      },
      async listAccessibleJson() {
        return [{ id: decoy.id, name: SEATS_VAULT_NAME, properties: { kind: SEATS_VAULT_KIND } }];
      },
      readJson: (fileId) => inner.readJson(fileId),
      async createJson() {
        throw new Error("createJson must not run when seats.json id is known");
      },
      async updateJson(fileId, content, name, properties) {
        updated.push(fileId);
        return inner.updateJson(fileId, content, name, properties);
      },
      deleteJson: (fileId) => inner.deleteJson(fileId),
    };
    const found = await findVaultJsonFile(drive, SEATS_VAULT_NAME, SEATS_VAULT_KIND);
    assert.equal(found?.id, SEATS_VAULT_FILE_ID);
    await writeVaultJson(drive, SEATS_VAULT_NAME, SEATS_VAULT_KIND, {
      hashes: { "robertmhenderson582@gmail.com": { mustChangePassword: false } },
    });
    assert.deepEqual(updated, [SEATS_VAULT_FILE_ID]);
    const seats = JSON.parse(await inner.readJson(SEATS_VAULT_FILE_ID)) as {
      hashes: Record<string, { mustChangePassword?: boolean }>;
    };
    assert.equal(seats.hashes["robertmhenderson582@gmail.com"]?.mustChangePassword, false);
    const decoyBody = JSON.parse(await inner.readJson(decoy.id)) as { hashes?: { decoy?: unknown } };
    assert.equal(Boolean(decoyBody.hashes?.decoy), true);
  });
});
