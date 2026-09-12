"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { JobScopePicks, PickJobEmpty } from "@/components/JobScopePicks";
import { QualityCompanyDocRail } from "@/components/QualityCompanyDocRail";
import { QualityFolderDrop } from "@/components/QualityFolderDrop";
import { QualityPackageShelf } from "@/components/QualityPackageShelf";
import { QualityTemplateForm, type QualityTemplateFormSession } from "@/components/QualityTemplateForm";
import { QualityVaultOwnerTree } from "@/components/QualityVaultOwnerTree";
import { useQualityHseJobTree } from "@/components/useQualityHseJobTree";
import { useAlias, useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { viewAsInit } from "@/lib/desk-scope";
import { assignedCompanyId, companyName, companyScopeFor, inferCompanyIdFromParts, type CompanyId } from "@/lib/companies";
import { buildDeskChrome, isQualityVaultSeat } from "@/lib/desk-role";
import { qualityRailCompanyId } from "@/lib/quality-company-docs";
import {
  QUALITY_DESK_RADIOS,
  isQualityDeskRadio,
  qualityDeskVaultCompanyId,
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
import { qualityTemplateFillAcl, type QualityTemplateFillAcl } from "@/lib/quality-template-form";
import { qualityCompanyDocAcl } from "@/lib/quality-company-doc-acl";
import { qualityPackageShelfAcl } from "@/lib/quality-package-shelf";

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
  const vaultCompanyId = qualityDeskVaultCompanyId(companyId, {
    qualitySeat: isQualityVaultSeat(user) || buildDesk,
  });
  const showFolderDesk = showsQualityFolderDesk(vaultCompanyId);
  const railCompanyId = qualityRailCompanyId(undefined, assignedCompanyId(companyScopeFor(user)));
  const radios = QUALITY_DESK_RADIOS;
  const [formSession, setFormSession] = useState<QualityTemplateFormSession | null>(null);
  const [kits, setKits] = useState<Array<{ id: string; name: string }>>([]);
  const [fillAcl, setFillAcl] = useState<QualityTemplateFillAcl>(() =>
    qualityTemplateFillAcl(qualityCompanyDocAcl(user), qualityPackageShelfAcl(user)),
  );
  const [formNote, setFormNote] = useState<string | null>(null);
  const [fillTick, setFillTick] = useState(0);

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

  useEffect(() => {
    let cancelled = false;
    const company = vaultCompanyId || companyId;
    const query = company ? `&company=${encodeURIComponent(company)}` : "";
    void fetch(`/api/desk/briefs?kind=quality&scope=template-fill${query}`, viewAsInit(owner?.viewAs))
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          kits?: Array<{ id?: string; name?: string }>;
          acl?: QualityTemplateFillAcl;
        };
        if (cancelled || !response.ok) return;
        if (data.acl) setFillAcl(data.acl);
        setKits(
          (data.kits ?? [])
            .filter((kit) => typeof kit.id === "string" && typeof kit.name === "string")
            .map((kit) => ({ id: kit.id as string, name: kit.name as string })),
        );
      })
      .catch(() => {
        if (!cancelled) setFillAcl(qualityTemplateFillAcl(qualityCompanyDocAcl(user), qualityPackageShelfAcl(user)));
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, owner?.viewAs, user?.email, vaultCompanyId]);

  function openTemplateForm(session: QualityTemplateFormSession) {
    setFormNote(null);
    setFormSession(session);
  }

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
    <>
    <div className="field-desk mt-4 grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
      <QualityCompanyDocRail
        companyId={railCompanyId}
        onOpenForm={(docId, fileName) =>
          openTemplateForm({ source: "company-docs", folderId: docId, fileName })
        }
      />
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
          key={`shelf-${fillTick}`}
          companyId={vaultCompanyId || companyId}
          companyLabel={(vaultCompanyId || companyId) ? companyName((vaultCompanyId || companyId) as CompanyId) : undefined}
          jobId={pick.jobId || undefined}
          siteLabel={selectedSite?.name}
          jobLabel={selectedJob?.title || selectedJob?.code}
          onOpenFilled={(fileName, packageId, packageName) =>
            openTemplateForm({
              source: "catalog",
              folderId: "packages",
              dest: "prepackage",
              destPackageId: packageId,
              destPackageName: packageName,
              filledName: fileName,
            })
          }
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
              <span key={item.id} className="inline-flex items-center gap-1">
                <label
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
                <button
                  type="button"
                  className="rounded-sm border border-steel px-2 py-1.5 text-xs text-steel"
                  onClick={() => {
                    openRadio(item.id);
                    openTemplateForm({ source: "catalog", folderId: item.id });
                  }}
                >
                  Open form
                </button>
              </span>
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
              key={`${pick.jobId}:${radio}:${fillTick}`}
              jobId={pick.jobId}
              folderId={radio}
              companyId={vaultCompanyId || companyId}
              companyLabel={
                (vaultCompanyId || companyId) ? companyName((vaultCompanyId || companyId) as CompanyId) : undefined
              }
              siteLabel={selectedSite?.name}
              jobLabel={selectedJob?.title || selectedJob?.code}
              onOpenFilled={(fileName) =>
                openTemplateForm({
                  source: "catalog",
                  folderId: radio,
                  dest: "job",
                  destJobId: pick.jobId,
                  filledName: fileName,
                })
              }
              onRemoveFilled={async (fileName) => {
                const response = await fetch(
                  "/api/desk/briefs",
                  viewAsInit(owner?.viewAs, {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      kind: "quality",
                      scope: "template-fill",
                      dest: "job",
                      jobId: pick.jobId,
                      folderId: radio,
                      fileName,
                      companyId: vaultCompanyId || companyId,
                    }),
                  }),
                );
                const data = (await response.json().catch(() => ({}))) as { error?: string };
                if (!response.ok) {
                  setFormNote(typeof data.error === "string" ? data.error : "Could not remove that filled copy.");
                  return;
                }
                setFormNote(`Removed ${fileName}. The rail template is unchanged.`);
                setFillTick((n) => n + 1);
              }}
            />
          ) : null}
          {manuals ? <p className="text-sm">{madisonManualLabel("quality")}</p> : null}
        </>
      ) : null}
      {formNote ? <p className="text-sm text-[#5b6f73]">{formNote}</p> : null}
      </div>
    </div>
      <QualityTemplateForm
        open={Boolean(formSession)}
        session={formSession}
        clients={clients}
        sites={sites}
        jobs={siteJobs}
        jobPick={pick}
        onJobPick={changeScope}
        kits={kits}
        fillAcl={fillAcl}
        companyId={vaultCompanyId || companyId || railCompanyId}
        companyLabel={
          (vaultCompanyId || companyId) ? companyName((vaultCompanyId || companyId) as CompanyId) : undefined
        }
        onClose={() => setFormSession(null)}
        onSaved={(note) => {
          setFormNote(note);
          setFormSession(null);
          setFillTick((n) => n + 1);
        }}
      />
    </>
  );
}
