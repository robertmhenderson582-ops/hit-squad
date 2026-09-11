import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  QUALITY_COMPANY_DOC_EDIT_ERROR,
  QUALITY_COMPANY_DOC_KEEP_ERROR,
  QUALITY_COMPANY_DOC_LOCK_ERROR,
  QUALITY_COMPANY_DOC_LOCKED_NOTE,
  canMutateQualityCompanyDoc,
  holdsCorporateQualityPosition,
  holdsFieldQualityPosition,
  qualityCompanyDocAcl,
  qualityCompanyDocMutateError,
} from "./quality-company-doc-acl.ts";
import type { OrgPosition, OrgPositionHold } from "./org-positions.ts";

const chance = { email: "chancec318@yahoo.com", name: "Chance", role: "tester" as const };
const wendell = { email: "wlanderno@yahoo.com", name: "Wendell", role: "tester" as const };
const owner = { email: "robertmhenderson582@gmail.com", name: "Robert", role: "owner" as const };
const president = { email: "johnbeech.madison@gmail.com", name: "John", role: "president" as const };

const catalog: OrgPosition[] = [
  {
    id: "corporate-qc-manager",
    kind: "custom",
    label: "Corporate QC Manager",
    desk: "corporate",
  },
  {
    id: "field-qc-manager",
    kind: "custom",
    label: "Field QC Manager",
    desk: "field",
  },
];

function hold(positionId: string, email: string): OrgPositionHold {
  return { id: `${positionId}:${email}`, positionId, email };
}

describe("Quality company-doc ACL seats", () => {
  it("maps Owner and Chance’s Quality vault seat; Wendell stays a viewer", () => {
    assert.deepEqual(qualityCompanyDocAcl(owner), {
      canAddRemove: true,
      canLock: true,
      seat: "owner",
    });
    assert.deepEqual(qualityCompanyDocAcl(chance), {
      canAddRemove: true,
      canLock: false,
      seat: "field-qc",
    });
    assert.deepEqual(qualityCompanyDocAcl(wendell), {
      canAddRemove: false,
      canLock: false,
      seat: "viewer",
    });
    assert.deepEqual(qualityCompanyDocAcl(president), {
      canAddRemove: false,
      canLock: false,
      seat: "viewer",
    });
    assert.equal(qualityCompanyDocAcl(null).seat, "viewer");
  });

  it("treats a custom corporate Quality position as Corporate QC for lock only when held", () => {
    const positions = { catalog, holds: [hold("corporate-qc-manager", president.email)] };
    const acl = qualityCompanyDocAcl(president, positions);
    assert.equal(acl.canAddRemove, true);
    assert.equal(acl.canLock, true);
    assert.equal(acl.seat, "corporate-qc");
    assert.equal(holdsCorporateQualityPosition(president.email, positions.holds, catalog), true);
    assert.equal(holdsFieldQualityPosition(president.email, positions.holds, catalog), false);
    assert.equal(qualityCompanyDocAcl(president).canLock, false);
  });

  it("lets a custom field QC position add/remove but not lock", () => {
    const positions = { catalog, holds: [hold("field-qc-manager", wendell.email)] };
    const acl = qualityCompanyDocAcl(wendell, positions);
    assert.equal(acl.canAddRemove, true);
    assert.equal(acl.canLock, false);
    assert.equal(acl.seat, "field-qc");
  });

  it("fails closed on lock for Field QC and viewers", () => {
    const chanceAcl = qualityCompanyDocAcl(chance);
    const ownerAcl = qualityCompanyDocAcl(owner);
    assert.equal(canMutateQualityCompanyDoc(chanceAcl, false, true), true);
    assert.equal(canMutateQualityCompanyDoc(chanceAcl, true, true), false);
    assert.equal(canMutateQualityCompanyDoc(chanceAcl, false, false), false);
    assert.equal(canMutateQualityCompanyDoc(ownerAcl, true, true), true);
    assert.equal(canMutateQualityCompanyDoc(ownerAcl, true, false), true);
    assert.equal(qualityCompanyDocMutateError(chanceAcl, true, true), QUALITY_COMPANY_DOC_LOCKED_NOTE);
    assert.equal(qualityCompanyDocMutateError(qualityCompanyDocAcl(wendell), false, true), QUALITY_COMPANY_DOC_EDIT_ERROR);
    assert.match(QUALITY_COMPANY_DOC_LOCK_ERROR, /Corporate Quality or the owner/);
    assert.match(QUALITY_COMPANY_DOC_KEEP_ERROR, /company Quality Control Manual/);
  });
});
