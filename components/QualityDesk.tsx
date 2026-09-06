"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { FieldBlock } from "@/components/FieldMark";
import { LeadStudio } from "@/components/LeadStudio";
import { ModuleRegister, type RegisterField } from "@/components/ModuleRegister";
import { QualityDay1Card } from "@/components/QualityDay1Card";
import { RollingChartMap } from "@/components/RollingChartMap";
import { useAlias, useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { companyScopeFor } from "@/lib/companies";
import { awardedLocalJobs, CLIENT_FOLDERS, clientFolderId, type AwardedJobPick, type ClientFolderId } from "@/lib/quality-hse-modules";
import { canSeeMadisonManuals, madisonManualLabel, type QualityDay1 } from "@/lib/quality-day1";
import {
  QUALITY_DESK_TABS,
  QUALITY_SECTIONS,
  addQualityRow,
  applyFlangeFormRows,
  emptyQualityModule,
  isQualityDeskTab,
  patchQualityRow,
  qualityBoardCounts,
  readQualityModule,
  removeQualityRow,
  writeQualityModule,
  type QualityDeskTabId,
  type QualityModuleState,
  type QualitySectionId,
} from "@/lib/quality-module";

function jobsForFolder(folder: ClientFolderId, packs: AwardedJobPick[]) {
  const scoped = packs.filter((job) => clientFolderId(job.client) === folder);
  return scoped.length ? scoped : packs;
}

function sectionFields(section: (typeof QUALITY_SECTIONS)[number], jobs: AwardedJobPick[], alias: (label: string) => string): readonly RegisterField[] {
  if (section.id !== "ncrs") return section.fields;
  return section.fields.map((field) => {
    if (field.id === "client") {
      return {
        ...field,
        kind: "select" as const,
        options: CLIENT_FOLDERS.map((item) => ({ value: item.id, label: alias(item.label) })),
      };
    }
    if (field.id === "job" && jobs.length) {
      return {
        ...field,
        kind: "select" as const,
        options: jobs.map((job) => ({
          value: job.id,
          label: [job.title, job.site].filter(Boolean).join(" · "),
        })),
      };
    }
    return field;
  });
}

export function QualityDesk() {
  const alias = useAlias();
  const owner = useOwnerDesk();
  const { user } = useSession();
  const [folder, setFolder] = useState<ClientFolderId>("phillips-66");
  const [tab, setTab] = useState<QualityDeskTabId>("board");
  const [module, setModule] = useState<QualityModuleState>(emptyQualityModule);
  const [jobs, setJobs] = useState<AwardedJobPick[]>([]);
  const chance = owner?.viewAs === "chance";
  const manuals = canSeeMadisonManuals(user, companyScopeFor(user));
  const counts = qualityBoardCounts(module);
  const ncrJobs = jobsForFolder(folder, jobs);

  useEffect(() => {
    setModule(readQualityModule(folder));
    setJobs(awardedLocalJobs());
  }, [folder]);

  function persist(next: QualityModuleState) {
    setModule(next);
    writeQualityModule(folder, next);
  }

  function persistDay1(day1: QualityDay1) {
    persist(applyFlangeFormRows({ ...module, day1 }, day1.forms["2.7.19"]?.rows ?? []));
  }

  function openTab(next: string) {
    if (isQualityDeskTab(next)) setTab(next);
  }

  function addRow(section: QualitySectionId) {
    let next = addQualityRow(module, section);
    if (section === "ncrs") {
      const row = next.sections.ncrs.at(-1);
      if (row) next = patchQualityRow(next, "ncrs", row.id, "client", folder);
    }
    persist(next);
  }

  function onTabKey(event: KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const index = QUALITY_DESK_TABS.findIndex((item) => item.id === tab);
    if (event.key === "Home") return openTab(QUALITY_DESK_TABS[0].id);
    if (event.key === "End") return openTab(QUALITY_DESK_TABS[QUALITY_DESK_TABS.length - 1].id);
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = (index + step + QUALITY_DESK_TABS.length) % QUALITY_DESK_TABS.length;
    openTab(QUALITY_DESK_TABS[next].id);
  }

  const log = QUALITY_SECTIONS.find((section) => section.id === tab);

  return (
    <div className="field-desk mt-4 space-y-5">
      <FieldBlock label="Client folder">
        <select
          value={folder}
          onChange={(event) => setFolder(event.target.value as ClientFolderId)}
          className="paper-field mt-1"
        >
          {CLIENT_FOLDERS.map((item) => (
            <option key={item.id} value={item.id}>
              {alias(item.label)}
            </option>
          ))}
        </select>
      </FieldBlock>
      <LeadStudio title="Quality lead studio" kind="quality" />
      {chance ? (
        <p className="plant-card px-4 py-3 text-sm">
          Chance — this is your Quality home. Named Day-1 forms, the board, and the live tube map sit
          on this module. Drops you save stay on this desk.
        </p>
      ) : null}
      {manuals ? <p className="text-sm">{madisonManualLabel("quality")}</p> : null}

      <div
        role="tablist"
        aria-label="Quality"
        className="flex flex-wrap gap-2"
        onKeyDown={onTabKey}
      >
        {QUALITY_DESK_TABS.map((item) => {
          const selected = tab === item.id;
          return (
            <button
              key={item.id}
              id={`quality-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`quality-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(item.id)}
              className={`rounded-sm border px-3 py-1.5 text-sm ${
                selected ? "border-steel bg-steel text-white" : "border-steel text-steel"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "board" ? (
        <section id="quality-panel-board" role="tabpanel" aria-labelledby="quality-tab-board" className="plant-card px-4 py-4">
          <h2 className="font-display text-xl">BOARD</h2>
          <p className="mt-1 text-sm">Open counts. Click a tile to jump to that log.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {QUALITY_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => setTab(section.id)}
                className="plant-card px-4 py-3 text-left"
              >
                <p className="text-sm font-semibold">{section.board}</p>
                <p className="mt-2 font-display text-3xl">{counts[section.id]}</p>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {log ? (
        <div id={`quality-panel-${log.id}`} role="tabpanel" aria-labelledby={`quality-tab-${log.id}`}>
          <ModuleRegister
            id={`quality-${log.id}`}
            title={log.title}
            note={
              log.id === "connections"
                ? "Source of truth is the 2.7.19 flange log. This board and that form share the same rows."
                : log.id === "welders"
                  ? "Welders stay on this job folder. Other companies do not see this list. Testers type on their own job."
                  : log.id === "ncrs"
                    ? "May later link a change order. Do not create money here."
                    : undefined
            }
            fields={sectionFields(log, ncrJobs, alias)}
            rows={module.sections[log.id]}
            onAdd={() => addRow(log.id)}
            onPatch={(rowId, field, value) => persist(patchQualityRow(module, log.id, rowId, field, value))}
            onRemove={(rowId) => persist(removeQualityRow(module, log.id, rowId))}
          />
        </div>
      ) : null}

      {tab === "day1" ? (
        <div id="quality-panel-day1" role="tabpanel" aria-labelledby="quality-tab-day1">
          <QualityDay1Card
            value={module.day1}
            workNames={module.workNames}
            travelerRows={module.sections.travelers.length}
            onChange={persistDay1}
            onWorkNames={(workNames) => persist({ ...module, workNames })}
          />
        </div>
      ) : null}

      {tab === "rolling" ? (
        <div id="quality-panel-rolling" role="tabpanel" aria-labelledby="quality-tab-rolling">
          <RollingChartMap
            state={module.rollingChart}
            onChange={(rollingChart) => persist({ ...module, rollingChart })}
          />
        </div>
      ) : null}
    </div>
  );
}
