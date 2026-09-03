"use client";

import { useEffect, useMemo, useState } from "react";
import { useDisplay } from "@/components/DisplayProvider";
import { useAlias, useDeskLens } from "@/components/OwnerDeskContext";
import { useEstimatePackage } from "@/components/EstimatePackage";
import { viewAsInit } from "@/lib/desk-scope";
import { deskFetch } from "@/lib/estimate-vault-client";
import { companyDoorLogoSrc } from "@/lib/desk-home";
import {
  ORG_CHART_TAB_LABEL,
  ORG_COMPANY_PARENT,
  nameSlot,
  orgChartBoxLabel,
  orgChartBoxes,
  orgChartForest,
  parentChoices,
  canNameOrgLane,
  setOrgChartContact,
  setOrgChartName,
  setOrgChartParent,
  type OrgChartBox,
  type OrgChartHeader,
  type OrgChartState,
  type OrgChartTreeNode,
} from "@/lib/org-chart";

function laneMark(lane: OrgChartBox["lane"]) {
  if (lane === "staff") return "STAFF";
  if (lane === "generalForeman") return "GF";
  return "FOREMAN";
}

export function OrgChartDesk({
  client,
  site,
  name,
}: {
  client?: string;
  site?: string;
  name?: string;
}) {
  const alias = useAlias();
  const { resolvedTheme } = useDisplay();
  const { seat, viewingAs, lensReady, lensKey } = useDeskLens();
  const pack = useEstimatePackage();
  const night = resolvedTheme === "night";
  const [header, setHeader] = useState<OrgChartHeader>({ name: "", logo: null });

  useEffect(() => {
    if (!lensReady) return;
    let cancelled = false;
    deskFetch("/api/desk/jobs", viewAsInit(seat))
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        const logo =
          typeof data.companyDeskLogo === "string" ? companyDoorLogoSrc([{ logo: data.companyDeskLogo }]) : null;
        const assignedName = typeof data.companyName === "string" ? data.companyName.trim() : "";
        setHeader({ name: assignedName, logo });
      })
      .catch(() => {
        if (!cancelled) setHeader({ name: "", logo: null });
      });
    return () => {
      cancelled = true;
    };
  }, [lensKey, lensReady, seat, viewingAs]);

  const boxes = useMemo(() => orgChartBoxes(pack.crew, pack.orgChart), [pack.crew, pack.orgChart]);
  const forest = useMemo(() => orgChartForest(boxes), [boxes]);

  function patchChart(next: OrgChartState | ((current: OrgChartState) => OrgChartState)) {
    pack.setOrgChart(next);
  }

  return (
    <section className={night ? "org-chart-desk hud-tile" : "org-chart-desk plant-card"}>
      <header className={`org-chart-mast ${night ? "hud-rail hud-rail-active" : "paper-rail paper-rail-active"}`}>
        {header.logo ? (
          <span className="org-chart-logo">
            <img src={header.logo} alt="" />
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.28em] text-amber-label">{ORG_CHART_TAB_LABEL.toUpperCase()}</p>
          <h2 className="font-display text-2xl tracking-[0.14em]">
            {(header.name || name || ORG_CHART_TAB_LABEL).toUpperCase()}
          </h2>
          <p className="mt-1 truncate text-sm text-[#5b6f73]">
            {alias(client || "")}
            {client && site ? " · " : ""}
            {alias(site || "")}
            {(client || site) && name ? " · " : ""}
            {name || ""}
          </p>
        </div>
      </header>

      {boxes.length === 0 ? (
        <p className="px-5 py-6 text-sm text-[#5b6f73]">
          Add Staff, General Foreman, or Foreman on the Crew tab. Names are optional on Staff and GF.
          Foreman is proposed headcount only. Direct Craft and Support stay off this chart.
        </p>
      ) : (
        <>
          <div className="org-chart-stage" data-org-chart>
            {forest.map((node) => (
              <OrgBranch key={node.id} node={node} night={night} />
            ))}
          </div>
          <div className="org-chart-roster">
            <p className="px-5 pt-2 font-mono text-[10px] tracking-[0.22em] text-[#5b6f73]">NAMES · REPORTS TO</p>
            <p className="px-5 pt-1 text-sm text-[#5b6f73]">
              Moving a box does not change Crew dollars, billing, or headcount.
            </p>
            <ul className="space-y-3 px-5 py-4">
              {boxes.map((box) => (
                <OrgNameRow
                  key={box.id}
                  box={box}
                  boxes={boxes}
                  state={pack.orgChart}
                  night={night}
                  onName={(half, value) => patchChart((current) => setOrgChartName(current, box.rowId, half, value))}
                  onContact={(half, field, value) =>
                    patchChart((current) => setOrgChartContact(current, box.rowId, half, field, value))
                  }
                  onParent={(parentId) => patchChart((current) => setOrgChartParent(current, box.id, parentId))}
                />
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}

function OrgBranch({ node, night }: { node: OrgChartTreeNode; night: boolean }) {
  return (
    <div className="org-chart-branch">
      <OrgCard box={node} night={night} />
      {node.children.length ? (
        <div className="org-chart-kids">
          {node.children.map((child) => (
            <OrgBranch key={child.id} node={child} night={night} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function OrgCard({ box, night }: { box: OrgChartBox; night: boolean }) {
  return (
    <article className={`org-chart-card is-${box.lane} ${night ? "is-night" : "is-day"}`}>
      <p className="org-chart-card-lane">{laneMark(box.lane)}</p>
      <p className="org-chart-card-name">{orgChartBoxLabel(box)}</p>
      <p className="org-chart-card-role">
        {box.kind === "named" || box.kind === "count" ? box.position : box.shift}
      </p>
      {box.kind === "count" ? <p className="org-chart-card-count">{box.count}</p> : null}
      {box.shift !== "Days" && box.kind !== "count" ? (
        <p className="org-chart-card-shift">{box.shift}</p>
      ) : null}
    </article>
  );
}

function OrgNameRow({
  box,
  boxes,
  state,
  night,
  onName,
  onContact,
  onParent,
}: {
  box: OrgChartBox;
  boxes: OrgChartBox[];
  state: OrgChartState;
  night: boolean;
  onName: (half: "days" | "nights", value: string) => void;
  onContact: (half: "days" | "nights", field: "email" | "phone", value: string) => void;
  onParent: (parentId: string) => void;
}) {
  const slot = nameSlot(state, box.rowId);
  const dual = box.shift === "Days & nights" || boxes.some((item) => item.rowId === box.rowId && item.id !== box.id);
  const field = night ? "steel-field" : "paper-field";
  const half = box.shift === "Nights" ? "nights" : "days";
  const choices = parentChoices(box, boxes, state.parents);

  if (dual && box.shift === "Nights") {
    return (
      <li className="org-chart-name-row">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">{box.position.toUpperCase()} · NIGHTS</p>
          {canNameOrgLane(box.lane) ? (
            <>
              <input
                className={`${field} mt-2 w-full`}
                value={slot.nights || ""}
                placeholder="Name (optional)"
                aria-label={`${box.position} nights name`}
                onChange={(event) => onName("nights", event.target.value)}
              />
              <input
                className={`${field} mt-2 w-full`}
                value={slot.nightsEmail || ""}
                placeholder="Email (optional)"
                aria-label={`${box.position} nights email`}
                onChange={(event) => onContact("nights", "email", event.target.value)}
              />
              <input
                className={`${field} mt-2 w-full`}
                value={slot.nightsPhone || ""}
                placeholder="Phone (optional)"
                aria-label={`${box.position} nights phone`}
                onChange={(event) => onContact("nights", "phone", event.target.value)}
              />
            </>
          ) : (
            <p className="mt-2 text-sm text-[#5b6f73]">Proposed headcount {box.count}. No name on Foreman.</p>
          )}
        </div>
        <label className="block">
          <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">REPORTS TO</span>
          <select
            className={`${field} mt-2 w-full`}
            value={box.parentId}
            aria-label={`${box.position} nights reports to`}
            onChange={(event) => onParent(event.target.value)}
          >
            <option value={ORG_COMPANY_PARENT}>Company</option>
            {choices.map((item) => (
              <option key={item.id} value={item.id}>
                {orgChartBoxLabel(item)} · {item.position}
              </option>
            ))}
          </select>
        </label>
      </li>
    );
  }

  return (
    <li className="org-chart-name-row">
      <div>
        <p className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">
          {box.position.toUpperCase()}
          {dual ? " · DAYS" : box.shift === "Nights" ? " · NIGHTS" : ""}
        </p>
        {canNameOrgLane(box.lane) ? (
          <>
            <input
              className={`${field} mt-2 w-full`}
              value={(half === "nights" ? slot.nights : slot.days) || ""}
              placeholder="Name (optional)"
              aria-label={`${box.position} name`}
              onChange={(event) => onName(half, event.target.value)}
            />
            <input
              className={`${field} mt-2 w-full`}
              value={(half === "nights" ? slot.nightsEmail : slot.daysEmail) || ""}
              placeholder="Email (optional)"
              aria-label={`${box.position} email`}
              onChange={(event) => onContact(half, "email", event.target.value)}
            />
            <input
              className={`${field} mt-2 w-full`}
              value={(half === "nights" ? slot.nightsPhone : slot.daysPhone) || ""}
              placeholder="Phone (optional)"
              aria-label={`${box.position} phone`}
              onChange={(event) => onContact(half, "phone", event.target.value)}
            />
            {dual && box.shift === "Days & nights" ? (
              <>
                <input
                  className={`${field} mt-2 w-full`}
                  value={slot.nights || ""}
                  placeholder="Nights name (optional)"
                  aria-label={`${box.position} nights name`}
                  onChange={(event) => onName("nights", event.target.value)}
                />
                <input
                  className={`${field} mt-2 w-full`}
                  value={slot.nightsEmail || ""}
                  placeholder="Nights email (optional)"
                  aria-label={`${box.position} nights email`}
                  onChange={(event) => onContact("nights", "email", event.target.value)}
                />
                <input
                  className={`${field} mt-2 w-full`}
                  value={slot.nightsPhone || ""}
                  placeholder="Nights phone (optional)"
                  aria-label={`${box.position} nights phone`}
                  onChange={(event) => onContact("nights", "phone", event.target.value)}
                />
              </>
            ) : null}
          </>
        ) : (
          <p className="mt-2 text-sm text-[#5b6f73]">Proposed headcount {box.count}. No name on Foreman.</p>
        )}
      </div>
      <label className="block">
        <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">REPORTS TO</span>
        <select
          className={`${field} mt-2 w-full`}
          value={box.parentId}
          aria-label={`${box.position} reports to`}
          onChange={(event) => onParent(event.target.value)}
        >
          <option value={ORG_COMPANY_PARENT}>Company</option>
          {choices.map((item) => (
            <option key={item.id} value={item.id}>
              {orgChartBoxLabel(item)} · {item.position}
            </option>
          ))}
        </select>
      </label>
    </li>
  );
}
