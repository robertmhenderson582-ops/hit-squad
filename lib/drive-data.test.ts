import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ACTIVITY_VAULT_KIND,
  ACTIVITY_VAULT_NAME,
  COMPANIES_VAULT_KIND,
  COMPANIES_VAULT_NAME,
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
});
