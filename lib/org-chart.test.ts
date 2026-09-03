import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { assignedCompaniesForId, canSeeCompany, companyDeskLogoSrc, companyScopeFor } from "./companies.ts";
import { companyDoorLogoSrc } from "./desk-home.ts";
import { canUseRateBuilder } from "./desk-role.ts";
import { JOSEPH_EMAIL } from "./tester-seats.ts";
import { blankCraftRow, type CraftRow } from "./craft-labor.ts";
import {
  ORG_CHART_STORE_PREFIX,
  ORG_CHART_TAB_LABEL,
  ORG_COMPANY_PARENT,
  boxId,
  crewSourceForOrgChart,
  defaultParentId,
  emptyOrgChart,
  hydrateOrgChart,
  nameSlot,
  orgChartBoxLabel,
  orgChartBoxes,
  orgChartForest,
  orgChartHeaderFromAssigned,
  orgChartHasWork,
  peakShiftCount,
  positionShiftFromCards,
  pruneOrgChart,
  readOrgChart,
  setOrgChartName,
  setOrgChartParent,
  shouldSplitShifts,
  wouldCycle,
  writeOrgChart,
} from "./org-chart.ts";

function row(partial: Partial<CraftRow> & { id: string; position: string }): CraftRow {
  return {
    ...blankCraftRow(),
    ...partial,
    ranges: partial.ranges ?? [
      {
        id: `rg-${partial.id}`,
        start: "2026-09-14",
        end: "2026-09-18",
        headcount: 1,
        nightHeadcount: 0,
        hoursPerShift: 10,
        perDiemPeople: 1,
        days: [false, true, true, true, true, true, true],
      },
    ],
  };
}

const crew = {
  staff: [row({ id: "st-1", position: "Superintendent", shift: "Days" })],
  generalForeman: [row({ id: "gf-1", position: "General Foreman BM", shift: "Days & nights", ranges: [
    {
      id: "rg-gf",
      start: "2026-09-14",
      end: "2026-09-18",
      headcount: 1,
      nightHeadcount: 1,
      hoursPerShift: 10,
      perDiemPeople: 1,
      days: [false, true, true, true, true, true, true],
    },
  ] })],
  foreman: [row({ id: "fm-1", position: "Foreman PF", shift: "Days", ranges: [
    {
      id: "rg-fm",
      start: "2026-09-14",
      end: "2026-09-18",
      headcount: 3,
      nightHeadcount: 0,
      hoursPerShift: 10,
      perDiemPeople: 3,
      days: [false, true, true, true, true, true, true],
    },
  ] })],
  direct: [row({ id: "bm-1", position: "Boilermaker", shift: "Days", ranges: [
    {
      id: "rg-bm",
      start: "2026-09-14",
      end: "2026-09-18",
      headcount: 8,
      nightHeadcount: 0,
      hoursPerShift: 10,
      perDiemPeople: 8,
      days: [false, true, true, true, true, true, true],
    },
  ] })],
  support: [row({ id: "sup-1", position: "Hole Watch", shift: "Days" })],
};

describe("org chart sources", () => {
  it("takes Staff / GF / Foreman and leaves Direct Craft and Support off the chart", () => {
    const sources = crewSourceForOrgChart(crew);
    assert.deepEqual(sources.map((item) => item.lane), ["staff", "generalForeman", "foreman"]);
    assert.deepEqual(sources.map((item) => item.position), [
      "Superintendent",
      "General Foreman BM",
      "Foreman PF",
    ]);
    assert.equal(sources.some((item) => item.position === "Boilermaker"), false);
    assert.equal(sources.some((item) => item.position === "Hole Watch"), false);
    assert.equal(crewSourceForOrgChart({ staff: [row({ id: "empty", position: "  " })] }).length, 0);
  });

  it("keeps unnamed Staff and GF as the position title", () => {
    const boxes = orgChartBoxes(crew, emptyOrgChart());
    const staff = boxes.find((item) => item.rowId === "st-1");
    const gf = boxes.find((item) => item.rowId === "gf-1");
    assert.equal(staff?.kind, "title");
    assert.equal(orgChartBoxLabel(staff!), "Superintendent");
    assert.equal(gf?.kind, "title");
    assert.equal(orgChartBoxLabel(gf!), "General Foreman BM");
    assert.equal(staff?.name, "");
  });

  it("shows Foreman as proposed headcount only — no name", () => {
    const unnamed = orgChartBoxes(crew, emptyOrgChart()).find((item) => item.rowId === "fm-1");
    assert.equal(unnamed?.kind, "count");
    assert.equal(unnamed?.count, 3);
    assert.equal(orgChartBoxLabel(unnamed!), "3");

    const named = orgChartBoxes(crew, setOrgChartName(emptyOrgChart(), "fm-1", "days", "Ray Hall"));
    const box = named.find((item) => item.rowId === "fm-1");
    assert.equal(box?.kind, "count");
    assert.equal(orgChartBoxLabel(box!), "3");
    assert.equal(box?.position, "Foreman PF");
  });

  it("treats Days & Nights as two counterparts even without names", () => {
    const unnamed = orgChartBoxes(crew, emptyOrgChart()).filter((item) => item.rowId === "gf-1");
    assert.equal(unnamed.length, 2);
    assert.equal(unnamed[0]?.shift, "Days");
    assert.equal(unnamed[1]?.shift, "Nights");
    assert.notEqual(unnamed.length, 1);
    assert.equal(shouldSplitShifts(crewSourceForOrgChart(crew)[1]!, {}), true);
    const fromCard = positionShiftFromCards({
      shift: "Days",
      ranges: [{ shift: "Days & nights" }, { shift: "Days" }],
    });
    assert.equal(fromCard, "Days & nights");
  });

  it("uses two names for days and nights on the same position", () => {
    const slot = { days: "Pat Day", nights: "Sam Night" };
    assert.equal(shouldSplitShifts(crewSourceForOrgChart(crew)[1]!, slot), true);
    const boxes = orgChartBoxes(crew, {
      names: { "gf-1": slot },
      parents: {},
    });
    const halves = boxes.filter((item) => item.rowId === "gf-1");
    assert.equal(halves.length, 2);
    assert.equal(halves[0]?.shift, "Days");
    assert.equal(halves[0]?.name, "Pat Day");
    assert.equal(halves[1]?.shift, "Nights");
    assert.equal(halves[1]?.name, "Sam Night");
    assert.equal(halves[0]?.position, "General Foreman BM");
    assert.equal(halves[1]?.position, "General Foreman BM");
  });
});

describe("org chart hierarchy is visual only", () => {
  it("defaults Staff → company, GF → Staff, Foreman → GF and never rewrites Crew", () => {
    const snapshot = JSON.stringify(crew);
    const boxes = orgChartBoxes(crew, emptyOrgChart());
    assert.equal(boxes.find((item) => item.rowId === "st-1")?.parentId, ORG_COMPANY_PARENT);
    assert.equal(boxes.find((item) => item.rowId === "gf-1")?.parentId, boxId("st-1"));
    assert.equal(boxes.find((item) => item.rowId === "fm-1")?.parentId, boxId("gf-1"));
    assert.equal(JSON.stringify(crew), snapshot);
    assert.equal(crew.foreman?.[0]?.ranges[0]?.headcount, 3);
    assert.equal(crew.direct?.[0]?.ranges[0]?.headcount, 8);

    const moved = setOrgChartParent(emptyOrgChart(), boxId("fm-1"), boxId("st-1"));
    const after = orgChartBoxes(crew, moved);
    assert.equal(after.find((item) => item.rowId === "fm-1")?.parentId, boxId("st-1"));
    assert.equal(JSON.stringify(crew), snapshot);
    assert.equal(crew.staff?.[0]?.position, "Superintendent");
    assert.equal(peakShiftCount(crew.foreman![0]!, false), 3);
  });

  it("refuses a cycle and keeps default parents when a stored parent is gone", () => {
    assert.equal(wouldCycle({ "a:days": "b:days" }, "b:days", "a:days"), true);
    const looped = setOrgChartParent(
      setOrgChartParent(emptyOrgChart(), boxId("st-1"), boxId("gf-1")),
      boxId("gf-1"),
      boxId("st-1"),
    );
    assert.equal(looped.parents[boxId("gf-1")], undefined);
    const pruned = pruneOrgChart(
      { names: { gone: { days: "X" }, "st-1": { days: "Lee" } }, parents: { "gone:days": boxId("st-1") } },
      ["st-1"],
    );
    assert.deepEqual(Object.keys(pruned.names), ["st-1"]);
    assert.equal(pruned.parents["gone:days"], undefined);
  });

  it("builds a forest from parent pointers", () => {
    const boxes = orgChartBoxes(crew, emptyOrgChart());
    const forest = orgChartForest(boxes);
    assert.equal(forest.length, 1);
    assert.equal(forest[0]?.rowId, "st-1");
    const gfKids = forest[0]?.children.filter((child) => child.rowId === "gf-1") ?? [];
    assert.equal(gfKids.length, 2);
    assert.equal(gfKids.some((child) => child.children.some((kid) => kid.rowId === "fm-1")), true);
    assert.equal(defaultParentId({ lane: "staff" } as never, []), ORG_COMPANY_PARENT);
  });
});

describe("org chart company header", () => {
  it("uses the same assigned-company logo field as the Company Desk door", () => {
    const catalog = [
      { id: "hitsquad" as const, name: "Hit Squad" },
      { id: "madison" as const, name: "Madison", logo: "/madison.png" },
      { id: "cbi" as const, name: "CBI", logo: "/cbi.png" },
    ];
    const joseph = assignedCompaniesForId("hitsquad", catalog);
    const nathan = assignedCompaniesForId("madison", catalog);
    const josephHeader = orgChartHeaderFromAssigned(joseph);
    const nathanHeader = orgChartHeaderFromAssigned(nathan);
    assert.equal(josephHeader.name, "Hit Squad");
    assert.equal(josephHeader.logo, null);
    assert.equal(nathanHeader.name, "Madison");
    assert.equal(nathanHeader.logo, "/madison.png");
    assert.equal(nathanHeader.logo, companyDeskLogoSrc(nathan));
    assert.equal(nathanHeader.logo, companyDoorLogoSrc(nathan));
    assert.equal(canSeeCompany(companyScopeFor({ email: JOSEPH_EMAIL, role: "tester" }, "hitsquad"), "madison"), false);
    assert.equal(orgChartHeaderFromAssigned(catalog).logo, null);
    assert.equal(orgChartHeaderFromAssigned([]).name, "");
  });
});

describe("org chart store", () => {
  it("round-trips names without inventing wage dollars", () => {
    const store: Record<string, string> = {};
    const target = {
      getItem(key: string) {
        return store[key] ?? null;
      },
      setItem(key: string, value: string) {
        store[key] = value;
      },
    };
    const next = setOrgChartName(emptyOrgChart(), "st-1", "days", "  Lee  ");
    writeOrgChart("new:new-demo", next, target);
    assert.equal(store[`${ORG_CHART_STORE_PREFIX}new:new-demo`].includes("Lee"), true);
    assert.equal(/141\.9|108\.38|"st":|"ot":|"dt":|wage/.test(store[`${ORG_CHART_STORE_PREFIX}new:new-demo`]), false);
    assert.deepEqual(readOrgChart("new:new-demo", target).names["st-1"], { days: "Lee" });
    assert.equal(nameSlot(hydrateOrgChart({ names: { "st-1": { days: " Lee " } } }), "st-1").days, "Lee");
    assert.equal(orgChartHasWork(next), true);
    assert.equal(orgChartHasWork(emptyOrgChart()), false);
  });
});

describe("org chart tab chrome", () => {
  it("puts Org chart on the estimate and keeps Rate builder off Joseph", () => {
    const workspace = readFileSync(fileURLToPath(new URL("../components/EstimateWorkspace.tsx", import.meta.url)), "utf8");
    const detail = readFileSync(fileURLToPath(new URL("../components/EstimateDetail.tsx", import.meta.url)), "utf8");
    const fresh = readFileSync(fileURLToPath(new URL("../components/NewEstimateForm.tsx", import.meta.url)), "utf8");
    const desk = readFileSync(fileURLToPath(new URL("../components/OrgChartDesk.tsx", import.meta.url)), "utf8");
    const rates = readFileSync(fileURLToPath(new URL("../components/RatesDesk.tsx", import.meta.url)), "utf8");
    assert.equal(ORG_CHART_TAB_LABEL, "Org chart");
    assert.match(workspace, /label: "Org chart"/);
    assert.match(workspace, /id: "org-chart"/);
    assert.match(detail, /OrgChartDesk/);
    assert.match(fresh, /OrgChartDesk/);
    assert.match(desk, /ORG_CHART_TAB_LABEL/);
    assert.match(desk, /viewAsInit/);
    assert.match(desk, /companyDeskLogo/);
    assert.match(desk, /orgChartHeaderFromAssigned|companyDoorLogoSrc/);
    assert.doesNotMatch(desk, /setCrew|RateBuilder|Rate builder|writeStoredRateBooks/);
    assert.match(rates, /canUseRateBuilder/);
    assert.match(rates, /RateBuilderCard/);
    assert.equal(canUseRateBuilder({ email: JOSEPH_EMAIL, role: "tester" }), true);
  });
});
