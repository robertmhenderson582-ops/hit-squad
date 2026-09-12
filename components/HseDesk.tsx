"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { JobScopePicks, PickJobEmpty } from "@/components/JobScopePicks";
import { HseCompanyDocRail } from "@/components/HseCompanyDocRail";
import { HseFolderDrop } from "@/components/HseFolderDrop";
import { HsePackageShelf } from "@/components/HsePackageShelf";
import { HseTemplateForm, type HseTemplateFormSession } from "@/components/HseTemplateForm";
import { HseVaultOwnerTree } from "@/components/HseVaultOwnerTree";
import { useQualityHseJobTree } from "@/components/useQualityHseJobTree";
import { useAlias, useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { viewAsInit } from "@/lib/desk-scope";
import { assignedCompanyId, companyName, companyScopeFor, inferCompanyIdFromParts, type CompanyId } from "@/lib/companies";
import { buildDeskChrome, isHseVaultSeat } from "@/lib/desk-role";
import { hseRailCompanyId } from "@/lib/hse-company-docs";
import {
  HSE_DESK_RADIOS,
  isHseDeskRadio,
  hseDeskVaultCompanyId,
  readHseFolderPick,
  showsHseFolderDesk,
  writeHseFolderPick,
  type HseDeskRadioId,
} from "@/lib/hse-folders";
import { canSeeMadisonSafetyManuals } from "@/lib/hse-day1";
import { madisonManualLabel } from "@/lib/quality-day1";
import {
  HSE_JOB_SCOPE_KEY,
  cascadeClients,
  cascadeCompanyId,
  cascadeJobs,
  cascadeSites,
  readJobScope,
  resolveJobScope,
  writeJobScope,
  type JobScopePick,
} from "@/lib/quality-hse-scope";
import { hseTemplateFillAcl, type HseTemplateFillAcl } from "@/lib/hse-template-form";
import { hseCompanyDocAcl } from "@/lib/hse-company-doc-acl";
import { hsePackageShelfAcl } from "@/lib/hse-package-shelf";

export function HseDesk() {
  const alias = useAlias();
  const owner = useOwnerDesk();
  const { user } = useSession();
  const { tree, ready } = useQualityHseJobTree();
  const [pick, setPick] = useState<JobScopePick>(() => readJobScope(HSE_JOB_SCOPE_KEY));
  const [radio, setRadio] = useState<HseDeskRadioId>(() => readHseFolderPick(pick.jobId || "desk"));
  const assigned = owner?.viewAs === "wendell" || owner?.viewAs === "benny";
  const buildDesk = buildDeskChrome(user, owner?.viewAs);
  const manuals = canSeeMadisonSafetyManuals(user, companyScopeFor(user));
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
  const vaultCompanyId = hseDeskVaultCompanyId(companyId, {
    hseSeat: isHseVaultSeat(user) || buildDesk,
  });
  const showFolderDesk = showsHseFolderDesk(vaultCompanyId);
  const railCompanyId = hseRailCompanyId(undefined, assignedCompanyId(companyScopeFor(user)));
  const radios = HSE_DESK_RADIOS;
  const [formSession, setFormSession] = useState<HseTemplateFormSession | null>(null);
  const [kits, setKits] = useState<Array<{ id: string; name: string }>>([]);
  const [fillAcl, setFillAcl] = useState<HseTemplateFillAcl>(() =>
    hseTemplateFillAcl(hseCompanyDocAcl(user), hsePackageShelfAcl(user)),
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
      writeJobScope(HSE_JOB_SCOPE_KEY, next);
      return next;
    });
  }, [ready, tree]);

  useEffect(() => {
    setRadio(readHseFolderPick(pick.jobId || "desk"));
  }, [pick.jobId]);

  useEffect(() => {
    let cancelled = false;
    const company = vaultCompanyId || companyId;
    const query = company ? `&company=${encodeURIComponent(company)}` : "";
    void fetch(`/api/desk/briefs?kind=hse&scope=template-fill${query}`, viewAsInit(owner?.viewAs))
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          kits?: Array<{ id?: string; name?: string }>;
          acl?: HseTemplateFillAcl;
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
        if (!cancelled) setFillAcl(hseTemplateFillAcl(hseCompanyDocAcl(user), hsePackageShelfAcl(user)));
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, owner?.viewAs, user?.email, vaultCompanyId, fillTick]);

  function openTemplateForm(session: HseTemplateFormSession) {
    setFormNote(null);
    setFormSession(session);
  }

  function changeScope(next: JobScopePick) {
    setPick(next);
    writeJobScope(HSE_JOB_SCOPE_KEY, next);
  }

  function openRadio(next: string) {
    if (!isHseDeskRadio(next, vaultCompanyId || undefined)) return;
    setRadio(next);
    writeHseFolderPick(pick.jobId || "desk", next);
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
      <HseCompanyDocRail
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
      {buildDesk ? <HseVaultOwnerTree key={`vault-${fillTick}`} refresh={fillTick} /> : null}
      {showFolderDesk ? (
        <HsePackageShelf
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
          aria-label="HSE"
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
                    id={`hse-radio-${item.id}`}
                    type="radio"
                    name="hse-desk-radio"
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
      {!jobOpen && radio !== "packages" ? <PickJobEmpty kind="hse" /> : null}
      {jobOpen ? (
        <>
          {selectedJob ? (
            <p className="text-sm">
              {alias(selectedJob.title)}
              {selectedSite ? ` · ${alias(selectedSite.name)}` : ""}
              {selectedClient ? ` · ${alias(selectedClient.name)}` : ""}
            </p>
          ) : null}
          {assigned && showFolderDesk ? (
            <p className="plant-card px-4 py-3 text-sm">
              This is your HSE desk. Pick a safety radio, then drop files or open the form. Company
              manuals and JSAs stay on the left rail.
            </p>
          ) : null}
          {showFolderDesk ? (
            <HseFolderDrop
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
                      kind: "hse",
                      scope: "template-fill",
                      dest: "job",
                      jobId: pick.jobId,
                      folderId: radio,
                      fileName,
                      companyId: vaultCompanyId || companyId,
                      companyLabel:
                        (vaultCompanyId || companyId)
                          ? companyName((vaultCompanyId || companyId) as CompanyId)
                          : undefined,
                      siteLabel: selectedSite?.name,
                      jobLabel: selectedJob?.title || selectedJob?.code,
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
          {manuals ? <p className="text-sm">{madisonManualLabel("hse")}</p> : null}
        </>
      ) : null}
      {formNote ? <p className="text-sm text-[#5b6f73]">{formNote}</p> : null}
      </div>
    </div>
      <HseTemplateForm
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
