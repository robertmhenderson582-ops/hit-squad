"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { JobScopePicks, PickJobEmpty } from "@/components/JobScopePicks";
import { QualityCompanyDocRail } from "@/components/QualityCompanyDocRail";
import { QualityFolderDrop } from "@/components/QualityFolderDrop";
import { QualityPackageShelf } from "@/components/QualityPackageShelf";
import { QualityVaultOwnerTree } from "@/components/QualityVaultOwnerTree";
import { useQualityHseJobTree } from "@/components/useQualityHseJobTree";
import { useAlias, useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { assignedCompanyId, companyName, companyScopeFor, inferCompanyIdFromParts, type CompanyId } from "@/lib/companies";
import { buildDeskChrome, isQualityVaultSeat } from "@/lib/desk-role";
import { qualityRailCompanyId } from "@/lib/quality-company-docs";
import {
  QUALITY_DESK_RADIOS,
  isQualityDeskRadio,
  readQualityFolderPick,
  showsQualityFolderDesk,
  writeQualityFolderPick,
  type QualityDeskRadioId,
} from "@/lib/quality-folders";
import { canSeeMadisonManuals, madisonManualLabel } from "@/lib/quality-day1";
import {
  QUALITY_JOB_SCOPE_KEY,
  cascadeClients,
  cascadeCompanyId,
  cascadeJobs,
  cascadeSites,
  readJobScope,
  resolveJobScope,
  writeJobScope,
  type JobScopePick,
} from "@/lib/quality-hse-scope";

export function QualityDesk() {
  const alias = useAlias();
  const owner = useOwnerDesk();
  const { user } = useSession();
  const { tree, ready } = useQualityHseJobTree();
  const [pick, setPick] = useState<JobScopePick>(() => readJobScope(QUALITY_JOB_SCOPE_KEY));
  const [radio, setRadio] = useState<QualityDeskRadioId>(() => readQualityFolderPick(pick.jobId || "desk"));
  const chance = owner?.viewAs === "chance";
  const buildDesk = buildDeskChrome(user, owner?.viewAs);
  const manuals = canSeeMadisonManuals(user, companyScopeFor(user));
  const clients = cascadeClients(tree);
  const sites = cascadeSites(tree, pick.clientId);
  const siteJobs = cascadeJobs(tree, pick.clientId, pick.siteId);
  const jobOpen = Boolean(pick.jobId);
  const selectedJob = siteJobs.find((job) => job.id === pick.jobId);
  const selectedSite = sites.find((site) => site.id === pick.siteId);
  const selectedClient = clients.find((client) => client.id === pick.clientId);
  const companyId =
    cascadeCompanyId(tree, pick) ||
    inferCompanyIdFromParts(selectedClient?.name, selectedSite?.name, selectedJob?.title, selectedJob?.code);
  const vaultCompanyId =
    showsQualityFolderDesk(companyId)
      ? companyId
      : isQualityVaultSeat(user) && (jobOpen || radio === "packages")
        ? "madison"
        : companyId;
  const showFolderDesk = showsQualityFolderDesk(vaultCompanyId);
  const railCompanyId = qualityRailCompanyId(undefined, assignedCompanyId(companyScopeFor(user)));
  const radios = QUALITY_DESK_RADIOS;

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
    setRadio(readQualityFolderPick(pick.jobId || "desk"));
  }, [pick.jobId]);

  function changeScope(next: JobScopePick) {
    setPick(next);
    writeJobScope(QUALITY_JOB_SCOPE_KEY, next);
  }

  function openRadio(next: string) {
    if (!isQualityDeskRadio(next, vaultCompanyId || undefined)) return;
    setRadio(next);
    writeQualityFolderPick(pick.jobId || "desk", next);
  }

  function onRadioKey(event: KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const index = radios.findIndex((item) => item.id === radio);
    if (event.key === "Home") return openRadio(radios[0].id);
    if (event.key === "End") return openRadio(radios[radios.length - 1].id);
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = (index + step + radios.length) % radios.length;
    openRadio(radios[next].id);
  }

  return (
    <div className="field-desk mt-4 grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
      <QualityCompanyDocRail companyId={railCompanyId} />
      <div className="space-y-5">
      <JobScopePicks
        clients={clients}
        sites={sites}
        jobs={siteJobs}
        pick={pick}
        onChange={changeScope}
        alias={alias}
      />
      {buildDesk ? <QualityVaultOwnerTree /> : null}
      {showFolderDesk ? (
        <QualityPackageShelf
          companyId={vaultCompanyId || companyId}
          companyLabel={(vaultCompanyId || companyId) ? companyName((vaultCompanyId || companyId) as CompanyId) : undefined}
          jobId={pick.jobId || undefined}
          siteLabel={selectedSite?.name}
          jobLabel={selectedJob?.title || selectedJob?.code}
        />
      ) : null}
      {showFolderDesk ? (
        <div
          role="radiogroup"
          aria-label="Quality"
          className="flex flex-wrap gap-2"
          onKeyDown={onRadioKey}
        >
          {radios.map((item) => {
            const selected = radio === item.id;
            return (
              <label
                key={item.id}
                className={`rounded-sm border px-3 py-1.5 text-sm ${
                  selected ? "border-steel bg-steel text-white" : "border-steel text-steel"
                }`}
              >
                <input
                  id={`quality-radio-${item.id}`}
                  type="radio"
                  name="quality-desk-radio"
                  className="sr-only"
                  checked={selected}
                  onChange={() => openRadio(item.id)}
                />
                {item.label}
              </label>
            );
          })}
        </div>
      ) : null}
      {!jobOpen && radio !== "packages" ? <PickJobEmpty kind="quality" /> : null}
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
              Chance — pick a Quality radio, then drop files into it. Company files stay on the
              left rail.
            </p>
          ) : null}
          {showFolderDesk ? (
            <QualityFolderDrop
              jobId={pick.jobId}
              folderId={radio}
              companyId={vaultCompanyId || companyId}
              companyLabel={
                (vaultCompanyId || companyId) ? companyName((vaultCompanyId || companyId) as CompanyId) : undefined
              }
              siteLabel={selectedSite?.name}
              jobLabel={selectedJob?.title || selectedJob?.code}
            />
          ) : null}
          {manuals ? <p className="text-sm">{madisonManualLabel("quality")}</p> : null}
        </>
      ) : null}
      </div>
    </div>
  );
}
