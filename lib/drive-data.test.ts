import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACTIVITY_VAULT_KIND,
  ACTIVITY_VAULT_NAME,
  COMPANIES_VAULT_KIND,
  COMPANIES_VAULT_NAME,
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
  writeVaultJson,
} from "./drive-data.ts";
import { memoryDrive } from "./drive-estimates.ts";

describe("vault named json", () => {
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
});
