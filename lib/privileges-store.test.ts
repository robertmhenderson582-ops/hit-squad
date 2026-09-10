import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, test } from "node:test";
import {
  forgetPrivilegeCacheForTests,
  grantPrivilege,
  listPrivilegeGrants,
  peekPrivileges,
  resetPrivilegesForTests,
  revokePrivilege,
  setPrivileges,
} from "./privileges-store.ts";

const dir = mkdtempSync(join(tmpdir(), "hs-privileges-"));
process.env.PRIVILEGE_STORE_PATH = join(dir, "privileges.json");

beforeEach(() => {
  resetPrivilegesForTests();
});

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("owner can grant and revoke owner-only items per email", async () => {
  const email = "president.example@example.com";
  assert.deepEqual(peekPrivileges(email), []);
  assert.deepEqual(await grantPrivilege(email, "manage-users"), ["manage-users"]);
  assert.deepEqual(peekPrivileges(email), ["manage-users"]);
  assert.deepEqual(await grantPrivilege(email, "hitsquad-seats"), ["manage-users", "hitsquad-seats"]);
  assert.deepEqual((await listPrivilegeGrants())[email], ["manage-users", "hitsquad-seats"]);
  assert.deepEqual(await revokePrivilege(email, "manage-users"), ["hitsquad-seats"]);
  assert.deepEqual(await setPrivileges(email, []), []);
  forgetPrivilegeCacheForTests();
  assert.deepEqual(peekPrivileges(email), []);
});

test("James Hutton always peeks the Rate Vault grant without a stored row", async () => {
  const email = "jhut26@gmail.com";
  assert.deepEqual(peekPrivileges(email), ["rate-vault"]);
  assert.deepEqual(await revokePrivilege(email, "rate-vault"), []);
  assert.deepEqual(peekPrivileges(email), ["rate-vault"]);
  assert.equal((await listPrivilegeGrants())[email], undefined);
});
