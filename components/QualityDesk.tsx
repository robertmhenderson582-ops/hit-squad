"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { JobScopePicks, PickJobEmpty } from "@/components/JobScopePicks";
import { ModuleRegister, type RegisterField } from "@/components/ModuleRegister";
import { QualityDay1Card } from "@/components/QualityDay1Card";
import { QualityFolderDrop } from "@/components/QualityFolderDrop";
import { RollingChartMap } from "@/components/RollingChartMap";
import { useQualityHseJobTree } from "@/components/useQualityHseJobTree";
import { useAlias, useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { companyScopeFor, inferCompanyIdFromParts } from "@/lib/companies";
import { showsQualityFolderDesk } from "@/lib/quality-folders";
import { canSeeMadisonManuals, madisonManualLabel, type QualityDay1 } from "@/lib/quality-day1";
import { CLIENT_FOLDERS } from "@/lib/quality-hse-modules";
import {
  QUALITY_JOB_SCOPE_KEY,
  cascadeClients,
  cascadeCompanyId,
  cascadeJobs,
  cascadeSites,
  readJobScope,
  resolveJobScope,
  writeJobScope,
  type JobScopeJob,
  type JobScopePick,
} from "@/lib/quality-hse-scope";
import {
  QUALITY_DESK_TABS,
  QUALITY_SECTIONS,
  addQualityRow,
  applyFlangeFormRows,
  emptyQualityModule,
  isQualityDeskTab,
  patchQualityRow,
  qualityBoardCounts,
  readQualityModuleForJob,
  removeQualityRow,
  writeQualityModuleForJob,
  type QualityDeskTabId,
  type QualityModuleState,
  type QualitySectionId,
} from "@/lib/quality-module";

function sectionFields(
  section: (typeof QUALITY_SECTIONS)[number],
  jobs: JobScopeJob[],
  clients: { id: string; name: string }[],
  alias: (label: string) => string,
): readonly RegisterField[] {
  if (section.id !== "ncrs") return section.fields;
  const clientOptions = clients.length
    ? clients.map((item) => ({ value: item.id, label: alias(item.name) }))
    : CLIENT_FOLDERS.map((item) => ({ value: item.id, label: alias(item.label) }));
  return section.fields.map((field) => {
    if (field.id === "client") {
      return {
        ...field,
        kind: "select" as const,
        options: clientOptions,
      };
    }
    if (field.id === "job" && jobs.length) {
      return {
        ...field,
        kind: "select" as const,
        options: jobs.map((job) => ({
          value: job.id,
          label: [job.title, job.code].filter(Boolean).join(" · "),
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
  const { tree, ready } = useQualityHseJobTree();
  const [pick, setPick] = useState<JobScopePick>(() => readJobScope(QUALITY_JOB_SCOPE_KEY));
  const [tab, setTab] = useState<QualityDeskTabId>("board");
  const [module, setModule] = useState<QualityModuleState>(emptyQualityModule);
  const chance = owner?.viewAs === "chance";
  const manuals = canSeeMadisonManuals(user, companyScopeFor(user));
  const clients = cascadeClients(tree);
  const sites = cascadeSites(tree, pick.clientId);
  const siteJobs = cascadeJobs(tree, pick.clientId, pick.siteId);
  const jobOpen = Boolean(pick.jobId);
  const counts = jobOpen ? qualityBoardCounts(module) : null;
  const selectedJob = siteJobs.find((job) => job.id === pick.jobId);
  const selectedSite = sites.find((site) => site.id === pick.siteId);
  const selectedClient = clients.find((client) => client.id === pick.clientId);
  const companyId =
    cascadeCompanyId(tree, pick) ||
    inferCompanyIdFromParts(selectedClient?.name, selectedSite?.name, selectedJob?.title, selectedJob?.code);
  const showFolderDesk = showsQualityFolderDesk(companyId);

  useEffect(() => {
    if (!ready) return;
    setPick((current) => {
      const next = resolveJobScope(current, tree);
      if (next.clientId === current.clientId && next.siteId === current.siteId && next.jobId === current.jobId) {
        return current;
      }
      writeJobScope(QUALITY_JOB_SCOPE_KEY, next);
      return next;
    });
  }, [ready, tree]);

  useEffect(() => {
    if (!pick.jobId) {
      setModule(emptyQualityModule());
      return;
    }
    setModule(readQualityModuleForJob(pick.jobId, undefined, pick.clientId));
  }, [pick.clientId, pick.jobId]);

  function changeScope(next: JobScopePick) {
    setPick(next);
    writeJobScope(QUALITY_JOB_SCOPE_KEY, next);
  }

  function persist(next: QualityModuleState) {
    if (!pick.jobId) return;
    setModule(next);
    writeQualityModuleForJob(pick.jobId, next);
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
      if (row) {
        next = patchQualityRow(next, "ncrs", row.id, "client", pick.clientId);
        next = patchQualityRow(next, "ncrs", row.id, "job", pick.jobId);
      }
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
      <JobScopePicks
        clients={clients}
        sites={sites}
        jobs={siteJobs}
        pick={pick}
        onChange={changeScope}
        alias={alias}
      />
      {!jobOpen ? <PickJobEmpty kind="quality" /> : null}
      {jobOpen ? (
        <>
          {selectedJob ? (
            <p className="text-sm">
              {alias(selectedJob.title)}
              {selectedSite ? ` · ${alias(selectedSite.name)}` : ""}
              {selectedClient ? ` · ${alias(selectedClient.name)}` : ""}
            </p>
          ) : null}
          {chance && showFolderDesk ? (
            <p className="plant-card px-4 py-3 text-sm">
              Chance — pick a Quality folder, then drop files into it. Named Day-1 forms, the board, and
              the live tube map stay on this job below.
            </p>
          ) : null}
          {showFolderDesk ? <QualityFolderDrop jobId={pick.jobId} companyId={companyId} /> : null}
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
                    <p className="mt-2 font-display text-3xl">{counts?.[section.id] ?? ""}</p>
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
                      ? "Welders stay on this job. Other companies do not see this list. Testers type on their own job."
                      : log.id === "ncrs"
                        ? "May later link a change order. Do not create money here."
                        : undefined
                }
                fields={sectionFields(log, siteJobs, clients, alias)}
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
        </>
      ) : null}
    </div>
  );
}
