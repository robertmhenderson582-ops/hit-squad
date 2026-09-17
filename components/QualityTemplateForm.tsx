"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DeskTemplateFieldInput, DeskTemplateFormRows } from "@/components/DeskTemplateFormFields";
import { FieldBlock } from "@/components/FieldMark";
import { JobScopePicks } from "@/components/JobScopePicks";
import { ModalPortal } from "@/components/ModalPortal";
import { useAlias, useLensUser, useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { viewAsInit } from "@/lib/desk-scope";
import { qualityCompanyDocFileName } from "@/lib/quality-company-docs";
import {
  QUALITY_JOB_SCOPE_KEY,
  cascadeClients,
  cascadeJobs,
  cascadeSites,
  readJobScope,
  type JobScopeClient,
  type JobScopeJob,
  type JobScopePick,
  type JobScopeSite,
} from "@/lib/quality-hse-scope";
import {
  QUALITY_TEMPLATE_FILL_EMPTY_ERROR,
  QUALITY_TEMPLATE_FILL_OPEN_TIMEOUT_ERROR,
  QUALITY_TEMPLATE_FILL_VIEW_ERROR,
  QUALITY_TEMPLATE_FORM_MARK,
  qualityTemplateFillOpenNote,
  addQualityTemplateRow,
  emptyQualityTemplateFormRecord,
  hydrateQualityTemplateFormRecord,
  isQualityFilledCopyName,
  patchQualityTemplateField,
  patchQualityTemplateRow,
  qualityFilledCopyName,
  qualityTemplateCanSave,
  qualityTemplateFormViewOnly,
  qualityTemplateFormDef,
  qualityTemplateFormHasWork,
  qualityTemplateFormTitle,
  qualityTemplateFormToLead,
  removeQualityTemplateRow,
  serializeQualityTemplateForm,
  type QualityTemplateFillAcl,
  type QualityTemplateFormPayload,
  type QualityTemplateFillDest,
  type QualityTemplateFormDef,
  type QualityTemplateFormRecord,
  type QualityTemplateSourceKind,
} from "@/lib/quality-template-form";
import { fetchJsonWithDeadline } from "@/lib/session-fetch";
import {
  QUALITY_TEMPLATE_FILL_OPEN_DEADLINE_MS,
  QUALITY_TEMPLATE_FILL_SAVE_DEADLINE_MS,
  QUALITY_VAULT_WRITE_ERROR,
  QUALITY_VAULT_WRITE_TIMEOUT_ERROR,
} from "@/lib/quality-vault-shared";

export type QualityTemplateFormSession = {
  source: QualityTemplateSourceKind;
  folderId: string;
  fileName?: string;
  dest?: QualityTemplateFillDest;
  destJobId?: string;
  destPackageId?: string;
  destPackageName?: string;
  filledName?: string;
  record?: QualityTemplateFormRecord;
};

type Kit = { id: string; name: string };

export function QualityTemplateForm({
  open,
  session,
  clients,
  sites,
  jobs,
  jobPick,
  onJobPick,
  kits,
  fillAcl,
  companyId,
  companyLabel,
  onClose,
  onSaved,
}: {
  open: boolean;
  session: QualityTemplateFormSession | null;
  clients: JobScopeClient[];
  sites: JobScopeSite[];
  jobs: JobScopeJob[];
  jobPick: JobScopePick;
  onJobPick: (next: JobScopePick) => void;
  kits: Kit[];
  fillAcl: QualityTemplateFillAcl;
  companyId?: string;
  companyLabel?: string;
  onClose: () => void;
  onSaved?: (note: string) => void;
}) {
  const alias = useAlias();
  const owner = useOwnerDesk();
  const lens = useLensUser();
  const { user } = useSession();
  const def = session
    ? qualityTemplateFormDef({
        source: session.source,
        folderId: session.folderId,
        fileName: session.fileName || session.filledName,
      })
    : null;
  const [record, setRecord] = useState<QualityTemplateFormRecord>(() =>
    def ? emptyQualityTemplateFormRecord(def) : { fields: {}, rows: [] },
  );
  const [dest, setDest] = useState<QualityTemplateFillDest>(session?.dest || (jobPick.jobId ? "job" : "prepackage"));
  const [packageId, setPackageId] = useState(session?.destPackageId || "");
  const [packageName, setPackageName] = useState(session?.destPackageName || "");
  const [filledName, setFilledName] = useState(session?.filledName || "");
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const saveGen = useRef(0);

  useEffect(() => {
    saveGen.current += 1;
    setSaving(false);
    setLoading(false);
    if (!open || !session || !def) return;
    setDest(session.dest || (jobPick.jobId ? "job" : "prepackage"));
    setPackageId(session.destPackageId || "");
    setPackageName(session.destPackageName || "");
    setFilledName(session.filledName || "");
    setNote(null);
    let cancelled = false;
    if (session.record) {
      setRecord(hydrateQualityTemplateFormRecord(session.record, def));
      return () => {
        cancelled = true;
      };
    }
    if (session.filledName) {
      setLoading(true);
      const destKind = session.dest || "job";
      const siteName = sites.find((site) => site.id === jobPick.siteId)?.name;
      const destJob = jobs.find((job) => job.id === (session.destJobId || jobPick.jobId));
      const jobName = destJob?.title || destJob?.code;
      const destLabel = destKind === "prepackage" ? session.destPackageName : jobName;
      const folder = destKind === "prepackage" ? "packages" : def.folderId || session.folderId;
      void fetchJsonWithDeadline<{
        form?: { fields?: Record<string, string>; rows?: QualityTemplateFormRecord["rows"] };
        error?: string;
      }>(
        `/api/desk/briefs?kind=quality&scope=template-fill&dest=${encodeURIComponent(destKind)}&file=${encodeURIComponent(session.filledName)}${session.destJobId ? `&jobId=${encodeURIComponent(session.destJobId)}` : ""}${session.destPackageId ? `&packageId=${encodeURIComponent(session.destPackageId)}` : ""}${session.destPackageName ? `&packageName=${encodeURIComponent(session.destPackageName)}` : ""}${folder ? `&folder=${encodeURIComponent(folder)}` : ""}${companyId ? `&company=${encodeURIComponent(companyId)}` : ""}${companyLabel ? `&companyLabel=${encodeURIComponent(companyLabel)}` : ""}${siteName ? `&siteLabel=${encodeURIComponent(siteName)}` : ""}${destLabel ? `&jobLabel=${encodeURIComponent(destLabel)}` : ""}`,
        viewAsInit(owner?.viewAs),
        QUALITY_TEMPLATE_FILL_OPEN_DEADLINE_MS,
        QUALITY_TEMPLATE_FILL_OPEN_TIMEOUT_ERROR,
      )
        .then((result) => {
          if (cancelled) return;
          if (!result.ok || !result.data.form) {
            setNote(qualityTemplateFillOpenNote({ status: result.status, error: result.data.error }));
            setRecord(emptyQualityTemplateFormRecord(def));
            return;
          }
          setRecord(hydrateQualityTemplateFormRecord(result.data.form, def));
        })
        .catch((error) => {
          if (cancelled) return;
          setNote(
            qualityTemplateFillOpenNote({
              timedOut: error instanceof Error && error.message === QUALITY_TEMPLATE_FILL_OPEN_TIMEOUT_ERROR,
              error: error instanceof Error ? error.message : undefined,
            }),
          );
          setRecord(emptyQualityTemplateFormRecord(def));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }
    setRecord(emptyQualityTemplateFormRecord(def));
    return () => {
      cancelled = true;
    };
  }, [companyId, companyLabel, def?.id, jobPick.jobId, jobPick.siteId, open, owner?.viewAs, session?.dest, session?.destJobId, session?.destPackageId, session?.destPackageName, session?.fileName, session?.filledName, session?.folderId, session?.source]);

  const title = def ? qualityTemplateFormTitle(def, session?.fileName) : "Quality form";
  const selectedJob = jobs.find((job) => job.id === jobPick.jobId);
  const destLabel =
    dest === "job"
      ? alias(selectedJob?.title || selectedJob?.code || "job")
      : packageName || kits.find((kit) => kit.id === packageId)?.name || "prepackage";
  const previewName = useMemo(() => {
    if (filledName) return filledName;
    if (!def) return "";
    return qualityFilledCopyName({
      title: def.title,
      destLabel,
      userName: user?.name || "desk",
      sourceName: session?.fileName,
    });
  }, [def, destLabel, filledName, session?.fileName, user?.name]);
  const viewOnly = qualityTemplateFormViewOnly(fillAcl, lens);
  const canSave = !viewOnly && qualityTemplateCanSave(fillAcl, dest);
  const editing = Boolean(filledName);

  if (!open || !session || !def) return null;
  const active = session;
  const formDef = def;

  async function persist() {
    if (!canSave) {
      setNote(QUALITY_TEMPLATE_FILL_VIEW_ERROR);
      return;
    }
    if (!qualityTemplateFormHasWork(record)) {
      setNote(QUALITY_TEMPLATE_FILL_EMPTY_ERROR);
      return;
    }
    if (dest === "job" && !jobPick.jobId) {
      setNote("Pick a job for this filled copy.");
      return;
    }
    if (dest === "prepackage" && !packageId && packageName.trim().length < 2) {
      setNote("Name a Ready prepackage, or pick one on the shelf.");
      return;
    }
    const gen = saveGen.current;
    setSaving(true);
    setNote(null);
    const name = filledName || previewName;
    const payload: QualityTemplateFormPayload = {
      mark: QUALITY_TEMPLATE_FORM_MARK,
      id: formDef.id,
      title: formDef.title,
      folderId: formDef.folderId,
      source: active.source,
      sourceFolder: active.folderId,
      sourceName: active.fileName || "",
      dest,
      destLabel,
      savedAt: new Date().toISOString(),
      user: user?.name || "",
      fields: record.fields,
      rows: record.rows,
    };
    const file = qualityTemplateFormToLead(payload, name);
    try {
      const result = await fetchJsonWithDeadline<{ error?: string; fileName?: string }>(
        "/api/desk/briefs",
        viewAsInit(owner?.viewAs, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "quality",
            scope: "template-fill",
            dest,
            jobId: dest === "job" ? jobPick.jobId : undefined,
            folderId: formDef.folderId,
            packageId: dest === "prepackage" ? packageId || undefined : undefined,
            packageName: dest === "prepackage" ? packageName || kits.find((kit) => kit.id === packageId)?.name : undefined,
            companyId,
            companyLabel,
            siteLabel: sites.find((site) => site.id === jobPick.siteId)?.name,
            jobLabel: selectedJob?.title || selectedJob?.code,
            source: active.source,
            sourceFolder: active.folderId,
            sourceName: active.fileName,
            fileName: name,
            files: [file],
            replace: Boolean(filledName),
          }),
        }),
        QUALITY_TEMPLATE_FILL_SAVE_DEADLINE_MS,
        QUALITY_VAULT_WRITE_TIMEOUT_ERROR,
      );
      if (gen !== saveGen.current) return;
      if (!result.ok) {
        throw new Error(
          typeof result.data.error === "string" && result.data.error ? result.data.error : QUALITY_VAULT_WRITE_ERROR,
        );
      }
      setFilledName(result.data.fileName || name);
      const savedNote =
        dest === "job"
          ? `Saved ${result.data.fileName || name} under ${alias(selectedJob?.title || selectedJob?.code || "this job")}. The rail template is unchanged.`
          : `Saved ${result.data.fileName || name} on the Ready prepackage shelf. The rail template is unchanged.`;
      setNote(savedNote);
      onSaved?.(savedNote);
    } catch (error) {
      if (gen !== saveGen.current) return;
      setNote(error instanceof Error && error.message ? error.message : QUALITY_VAULT_WRITE_ERROR);
    } finally {
      if (gen === saveGen.current) setSaving(false);
    }
  }

  function downloadFilled() {
    const text = serializeQualityTemplateForm({
      mark: QUALITY_TEMPLATE_FORM_MARK,
      id: formDef.id,
      title: formDef.title,
      folderId: formDef.folderId,
      source: active.source,
      sourceFolder: active.folderId,
      sourceName: active.fileName || "",
      dest,
      destLabel,
      savedAt: new Date().toISOString(),
      user: user?.name || "",
      fields: record.fields,
      rows: record.rows,
    });
    const blob = new Blob([text], { type: "text/plain" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = previewName;
    link.click();
    URL.revokeObjectURL(href);
  }

  return (
    <ModalPortal>
      <div
        className="modal-scrim"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quality-template-form-title"
        id="quality-template-form"
        onClick={onClose}
      >
        <div
          className="estimate-modal px-5 py-5"
          style={{ width: "min(52rem, 100%)" }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <h2 id="quality-template-form-title" className="font-display text-2xl text-[#163038]">
              {title}
            </h2>
            <button type="button" className="estimate-modal-close px-3 py-1.5 text-sm" onClick={onClose}>
              Close
            </button>
          </div>
          <p className="mt-1 text-sm text-[#5b6f73]">
            {viewOnly
              ? "View only. This seat can read the form and cannot save over a job or prepackage."
              : editing
                ? "Editing a filled copy. Re-save updates that copy. The always-present blank stays on the rail."
                : "Blank template. Open fills this web form. Save writes a new named copy to a job or a Ready prepackage — never the rail template."}
          </p>
          {active.fileName && !isQualityFilledCopyName(active.fileName) ? (
            <p className="mt-2 text-xs text-[#5b6f73]">
              Template on the rail: {qualityCompanyDocFileName(active.fileName)}
            </p>
          ) : null}
          {loading ? <p className="mt-3 text-sm">Opening filled copy…</p> : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {formDef.fields.map((field) => (
              <FieldBlock key={field.id} label={field.label}>
                <DeskTemplateFieldInput
                  def={field}
                  value={record.fields[field.id] || ""}
                  viewOnly={viewOnly}
                  onChange={(next) => setRecord(patchQualityTemplateField(record, field.id, next))}
                />
              </FieldBlock>
            ))}
          </div>
          {formDef.rowFields.length ? (
            <DeskTemplateFormRows
              hint={formDef.hint}
              fields={formDef.rowFields}
              rows={record.rows}
              viewOnly={viewOnly}
              onAdd={() => setRecord(addQualityTemplateRow(record))}
              onPatch={(rowId, field, next) => setRecord(patchQualityTemplateRow(record, rowId, field, next))}
              onRemove={(rowId) => setRecord(removeQualityTemplateRow(record, rowId))}
            />
          ) : formDef.hint ? (
            <p className="mt-4 text-sm text-[#5b6f73]">{formDef.hint}</p>
          ) : null}
          {canSave ? (
            <section className="mt-5 rounded-sm border border-steel px-3 py-3" aria-label="Save destination">
              <p className="text-sm font-semibold">Save this filled copy</p>
              <div className="mt-2 flex flex-wrap gap-3">
                {fillAcl.canSaveJob ? (
                  <label className="text-sm">
                    <input
                      type="radio"
                      name="quality-template-dest"
                      className="mr-2"
                      checked={dest === "job"}
                      disabled={editing && active.dest === "prepackage"}
                      onChange={() => setDest("job")}
                    />
                    Save to a job
                  </label>
                ) : null}
                {fillAcl.canSavePrepackage ? (
                  <label className="text-sm">
                    <input
                      type="radio"
                      name="quality-template-dest"
                      className="mr-2"
                      checked={dest === "prepackage"}
                      disabled={editing && active.dest === "job"}
                      onChange={() => setDest("prepackage")}
                    />
                    Ready prepackage
                  </label>
                ) : null}
              </div>
              {dest === "job" && fillAcl.canSaveJob ? (
                <div className="mt-3">
                  <JobScopePicks clients={clients} sites={sites} jobs={jobs} pick={jobPick} onChange={onJobPick} alias={alias} />
                </div>
              ) : null}
              {dest === "prepackage" && fillAcl.canSavePrepackage ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <FieldBlock label="Existing prepackage">
                    <select
                      className="paper-field mt-1"
                      value={packageId}
                      disabled={Boolean(editing && active.destPackageId)}
                      onChange={(event) => {
                        setPackageId(event.target.value);
                        const kit = kits.find((row) => row.id === event.target.value);
                        if (kit) setPackageName(kit.name);
                      }}
                    >
                      <option value="">New prepackage</option>
                      {kits.map((kit) => (
                        <option key={kit.id} value={kit.id}>
                          {kit.name}
                        </option>
                      ))}
                    </select>
                  </FieldBlock>
                  {!packageId ? (
                    <FieldBlock label="New prepackage name">
                      <input
                        className="paper-field mt-1"
                        value={packageName}
                        placeholder="Upcoming job kit"
                        onChange={(event) => setPackageName(event.target.value)}
                      />
                    </FieldBlock>
                  ) : null}
                </div>
              ) : null}
              <p className="mt-3 text-xs text-[#5b6f73]">Filled copy name: {previewName}</p>
            </section>
          ) : null}
          <div className="mt-4 flex flex-wrap justify-end gap-3">
            {qualityTemplateFormHasWork(record) ? (
              <button type="button" className="text-sm text-steel underline" onClick={downloadFilled}>
                Download filled copy
              </button>
            ) : null}
            <button type="button" className="rounded-sm border border-steel px-3 py-1.5 text-sm text-steel" onClick={onClose}>
              Close
            </button>
            {canSave ? (
              <button
                type="button"
                className="rounded-sm bg-steel px-3 py-1.5 text-sm text-white"
                disabled={saving || loading || !qualityTemplateFormHasWork(record)}
                onClick={() => void persist()}
              >
                {saving ? "Saving…" : editing ? "Save filled copy" : "Save as new"}
              </button>
            ) : null}
          </div>
          {note ? <p className="mt-3 text-sm text-[#5b6f73]">{note}</p> : null}
        </div>
      </div>
    </ModalPortal>
  );
}

export function readQualityJobScopePick() {
  return readJobScope(QUALITY_JOB_SCOPE_KEY);
}
