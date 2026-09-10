import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OWNER_ONLY_PRIVILEGES,
  PRESIDENT_SHARED,
  grantedPrivileges,
  hasPrivilege,
  isPrivilegeId,
  normalizePrivileges,
} from "./privileges.ts";

test("locked matrix lists shared President items and grantable owner-only items", () => {
  assert.deepEqual(
    [...OWNER_ONLY_PRIVILEGES],
    [
      "manage-users",
      "hitsquad-seats",
      "inbox-expand",
      "archive-delete",
      "view-as",
      "owner-log",
      "vault-wipe",
      "alias-config",
      "unaliased-export",
      "designer-ship",
      "security-billing",
      "rate-vault",
    ],
  );
  assert.equal(
    PRESIDENT_SHARED.includes("Madison Jobs / estimate / Excel / Rates / Cost / CO / Purchasing / Quality / HSE"),
    true,
  );
  assert.equal(PRESIDENT_SHARED.includes("Madison Inbox"), true);
  assert.equal(PRESIDENT_SHARED.includes("Madison presence"), true);
  assert.equal(isPrivilegeId("manage-users"), true);
  assert.equal(isPrivilegeId("hitsquad-seats"), true);
  assert.equal(isPrivilegeId("rate-vault"), true);
  assert.equal(isPrivilegeId("not-a-privilege"), false);
});

test("owner has every grantable privilege; President starts with none", () => {
  const owner = { role: "owner", email: "robertmhenderson582@gmail.com" };
  const president = { role: "president", email: "president.example@example.com" };
  for (const id of OWNER_ONLY_PRIVILEGES) {
    assert.equal(hasPrivilege(owner, id), true, id);
    assert.equal(hasPrivilege(president, id), false, id);
  }
  assert.deepEqual(grantedPrivileges(owner), [...OWNER_ONLY_PRIVILEGES]);
  assert.deepEqual(grantedPrivileges(president), []);
  assert.deepEqual(
    grantedPrivileges({ ...president, privileges: ["manage-users", "hitsquad-seats", "bogus"] }),
    ["manage-users", "hitsquad-seats"],
  );
  assert.deepEqual(normalizePrivileges(["view-as", "view-as", "nope"]), ["view-as"]);
  assert.equal(hasPrivilege(null, "manage-users"), false);
  const james = { role: "tester", email: "jhut26@gmail.com" };
  assert.equal(hasPrivilege(james, "rate-vault"), true);
  assert.equal(hasPrivilege(james, "manage-users"), false);
  assert.deepEqual(grantedPrivileges(james), ["rate-vault"]);
});
