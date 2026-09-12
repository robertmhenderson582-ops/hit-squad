import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canEditHseJsaTemplate,
  canMutateHseCompanyDoc,
  hseCompanyDocAcl,
  hseCompanyDocMutateError,
  HSE_COMPANY_DOC_EDIT_ERROR,
  HSE_COMPANY_DOC_LOCK_ERROR,
} from "./hse-company-doc-acl.ts";
import { HSE_COMPANY_DOC_LOCKED_NOTE } from "./hse-vault-shared.ts";

const owner = { email: "robertmhenderson582@gmail.com", name: "Robert", role: "owner" as const };
const wendell = { email: "wlanderno@yahoo.com", name: "Wendell", role: "tester" as const };
const benny = { email: "bccamp2@gmail.com", name: "Benny", role: "tester" as const };
const chance = { email: "chancec318@yahoo.com", name: "Chance", role: "tester" as const };

describe("HSE company-doc ACL", () => {
  it("lets Owner lock; Wendell and Benny add/remove; Chance is view only", () => {
    assert.equal(hseCompanyDocAcl(owner).seat, "owner");
    assert.equal(hseCompanyDocAcl(owner).canLock, true);
    assert.equal(hseCompanyDocAcl(owner).canAddRemove, true);
    assert.equal(hseCompanyDocAcl(wendell).seat, "field-hse");
    assert.equal(hseCompanyDocAcl(wendell).canLock, false);
    assert.equal(hseCompanyDocAcl(wendell).canAddRemove, true);
    assert.equal(hseCompanyDocAcl(benny).seat, "field-hse");
    assert.equal(hseCompanyDocAcl(benny).canAddRemove, true);
    assert.equal(hseCompanyDocAcl(chance).seat, "viewer");
    assert.equal(hseCompanyDocAcl(chance).canAddRemove, false);
    assert.equal(canMutateHseCompanyDoc(hseCompanyDocAcl(wendell), false), true);
    assert.equal(canMutateHseCompanyDoc(hseCompanyDocAcl(wendell), true), false);
    assert.equal(canMutateHseCompanyDoc(hseCompanyDocAcl(owner), true), true);
    assert.equal(canEditHseJsaTemplate(hseCompanyDocAcl(wendell), false), true);
    assert.equal(canEditHseJsaTemplate(hseCompanyDocAcl(wendell), true), false);
    assert.equal(canEditHseJsaTemplate(hseCompanyDocAcl(chance), false), false);
    assert.equal(hseCompanyDocMutateError(hseCompanyDocAcl(chance), false), HSE_COMPANY_DOC_EDIT_ERROR);
    assert.equal(hseCompanyDocMutateError(hseCompanyDocAcl(wendell), true), HSE_COMPANY_DOC_LOCKED_NOTE);
    assert.equal(HSE_COMPANY_DOC_LOCK_ERROR.includes("owner"), true);
  });
});
