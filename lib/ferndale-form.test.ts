import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { deskPackageTotal } from "./estimate-desk-total.ts";
import {
  FERNDALE_ESTIMATE_WORKBOOK_ID,
  FERNDALE_RFQ_LETTER_ID,
  FERNDALE_RFX_SOURCES,
  FERNDALE_WORK_FOLDER_ID,
  ferndaleRfxFromText,
} from "./ferndale-work.ts";
import {
  FERNDALE_FILL_ERROR,
  FERNDALE_TAB_ID,
  FERNDALE_TAB_LABEL,
  ferndaleFillMap,
  ferndaleFormToXlsx,
  hydrateFerndaleForm,
  resolveFerndaleRfx,
  showsFerndaleTab,
} from "./ferndale-form.ts";
import { estimateTabIdsForSite } from "./estimate-tabs.ts";
import { showsRodeoTab } from "./rodeo-form.ts";

function source(rel: string) {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("Ferndale tab gate", () => {
  it("shows only on Ferndale and leaves Rodeo / Bayway / Wood River alone", () => {
    assert.equal(showsFerndaleTab("Ferndale — Ferndale, WA", "Phillips 66"), true);
    assert.equal(showsFerndaleTab("site-ferndale", "Phillips 66"), true);
    assert.equal(showsFerndaleTab("Wood River — Roxana, IL", "Phillips 66"), false);
    assert.equal(showsFerndaleTab("Bayway — Linden, NJ", "Phillips 66"), false);
    assert.equal(showsFerndaleTab("Rodeo — Rodeo, CA", "Phillips 66"), false);
    assert.equal(showsFerndaleTab("Billings", "Phillips 66"), false);
    assert.equal(showsFerndaleTab("Yates", "Georgia Power"), false);
    assert.equal(showsFerndaleTab("Monroe Energy", "Monroe"), false);
    assert.equal(showsRodeoTab("Ferndale — Ferndale, WA", "Phillips 66"), false);
    assert.equal(showsRodeoTab("Rodeo — Rodeo, CA", "Phillips 66"), true);
    assert.equal(FERNDALE_TAB_ID, "ferndale");
    assert.equal(FERNDALE_TAB_LABEL, "Ferndale");

    assert.equal(estimateTabIdsForSite("Ferndale — Ferndale, WA", "Phillips 66").includes("ferndale"), true);
    assert.equal(estimateTabIdsForSite("Ferndale — Ferndale, WA", "Phillips 66").includes("rodeo"), false);
    assert.equal(estimateTabIdsForSite("Rodeo — Rodeo, CA", "Phillips 66").includes("rodeo"), true);
    assert.equal(estimateTabIdsForSite("Rodeo — Rodeo, CA", "Phillips 66").includes("ferndale"), false);
    assert.equal(estimateTabIdsForSite("Bayway — Linden, NJ", "Phillips 66").includes("ferndale"), false);
    assert.equal(estimateTabIdsForSite("Bayway — Linden, NJ", "Phillips 66").includes("rodeo"), false);
    assert.equal(estimateTabIdsForSite("Wood River — Roxana, IL", "Phillips 66").includes("ferndale"), false);
    assert.equal(estimateTabIdsForSite("Wood River — Roxana, IL", "Phillips 66").includes("rodeo"), false);

    const workspace = source("../components/EstimateWorkspace.tsx");
    const tabs = source("./estimate-tabs.ts");
    const detail = source("../components/EstimateDetail.tsx");
    const fresh = source("../components/NewEstimateForm.tsx");
    assert.match(workspace, /estimateTabsForSite/);
    assert.match(tabs, /showsFerndaleTab/);
    assert.match(tabs, /showsRodeoTab/);
    assert.doesNotMatch(workspace, /id: "ferndale"/);
    assert.match(detail, /FerndaleFormDesk/);
    assert.match(fresh, /FerndaleFormDesk/);
    assert.match(detail, /RodeoFormDesk/);
    assert.match(fresh, /RodeoFormDesk/);
  });
});

describe("Ferndale RFQ fill", () => {
  it("maps RFX from Work Folder titles and does not invent numbers or dollar locks", () => {
    assert.equal(ferndaleRfxFromText("FRN GM 2028 Reformer RFX0000267 EST Workbook")?.rfx, "RFX0000267");
    assert.equal(ferndaleRfxFromText("Formal Proposal RFX0000270")?.rfx, "RFX0000270");
    assert.equal(ferndaleRfxFromText("FCC Gas Plant RFX0000266")?.rfx, "RFX0000266");
    assert.equal(ferndaleRfxFromText("Ferndale bid"), null);
    assert.equal(resolveFerndaleRfx("", "Ferndale bid").source, "todo");
    assert.match(resolveFerndaleRfx("", "Ferndale bid").todo || "", new RegExp(FERNDALE_WORK_FOLDER_ID));
    assert.equal(resolveFerndaleRfx("", "RFX0000270 piping").rfx, "RFX0000270");
    assert.equal(resolveFerndaleRfx("RFX0000267", "").source, "form");
    assert.equal(FERNDALE_RFX_SOURCES.every((row) => /RFX000026[67]|RFX0000270/.test(row.rfx)), true);

    const emptyPack = { site: "Ferndale — Ferndale, WA", client: "Phillips 66", hours: 0 };
    const { cells, live, rfx } = ferndaleFillMap({
      form: hydrateFerndaleForm({}),
      pack: emptyPack,
      title: "Ferndale bid",
    });
    assert.equal(rfx.source, "todo");
    assert.equal(live.total, deskPackageTotal(emptyPack));
    assert.equal(live.total, 0);
    assert.match(live.note, /not an official RFX/);
    const text = cells.filter((cell) => cell.type === "text").map((cell) => cell.value).join("\n");
    assert.match(text, /Not a Rodeo clone/);
    assert.match(text, new RegExp(FERNDALE_WORK_FOLDER_ID));
    assert.match(text, new RegExp(FERNDALE_ESTIMATE_WORKBOOK_ID));
    assert.match(text, new RegExp(FERNDALE_RFQ_LETTER_ID));
    assert.doesNotMatch(text, /2314518|2,314,518/);
    assert.doesNotMatch(text, /RFX0000999/);
    assert.equal(FERNDALE_FILL_ERROR.includes("Could not fill"), true);
  });

  it("writes a non-empty fill map and errors instead of a silent empty file", async () => {
    const bytes = await ferndaleFormToXlsx({
      form: hydrateFerndaleForm({ scope: "Reformer Piping", rfx: "RFX0000270" }),
      pack: { site: "Ferndale — Ferndale, WA", client: "Phillips 66" },
      title: "Ferndale bid",
    });
    assert.equal(bytes.byteLength > 0, true);
    const mapped = ferndaleFillMap({
      form: hydrateFerndaleForm({ rfx: "RFX0000270" }),
      pack: { site: "Ferndale — Ferndale, WA", client: "Phillips 66" },
      title: "Ferndale bid",
    });
    assert.equal(mapped.rfx.rfx, "RFX0000270");
    const subject = mapped.cells.find((cell) => cell.ref === "B19");
    assert.equal(subject?.type, "text");
    if (subject?.type === "text") assert.match(subject.value, /RFX0000270/);
  });
});
