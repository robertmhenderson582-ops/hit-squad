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
});
