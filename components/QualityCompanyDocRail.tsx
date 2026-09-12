"use client";

import { useEffect, useRef, useState } from "react";
import { noteFeatureTrail } from "@/components/FeatureTrail";
import { useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { fileToLead, type LeadFile } from "@/lib/lead-briefs";
import { viewAsInit } from "@/lib/desk-scope";
import { QualityCompanyDocViewer } from "@/components/QualityCompanyDocViewer";
import {
  canMutateQualityCompanyDoc,
  qualityCompanyDocAcl,
  type QualityCompanyDocAcl,
} from "@/lib/quality-company-doc-acl";
import {
  primaryQualityCompanyDocFile,
  qualityCompanyDocHome,
  qualityCompanyDocLabel,
  qualityCompanyDocsListedFor,
  readQualityCompanyDocFiles,
  readQualityCompanyDocPick,
  writeQualityCompanyDocFiles,
  writeQualityCompanyDocPick,
  type QualityCompanyDocId,
} from "@/lib/quality-company-docs";
import {
  QUALITY_DROP_ACCEPT,
  checkQualityDrop,
  mergeQualityFolderFiles,
} from "@/lib/quality-folders";
import {
  QUALITY_COMPANY_DOC_LOCKED_NOTE,
  QUALITY_VAULT_WRITE_ERROR,
  mergeVaultedQualityFiles,
  qualityVaultStored,
  type QualityListedFile,
} from "@/lib/quality-vault-shared";

function dropFileFromBrowser(file: File) {
  return { name: file.name, type: file.type, bytes: file.size };
}

function localByDoc(home: string, docs: ReadonlyArray<{ id: string }>) {
  return Object.fromEntries(docs.map((doc) => [doc.id, readQualityCompanyDocFiles(home, doc.id as QualityCompanyDocId)]));
}

export function QualityCompanyDocRail({
  companyId,
  onOpenForm,
}: {
  companyId?: string;
  onOpenForm?: (docId: QualityCompanyDocId, fileName?: string) => void;
}) {
  const home = qualityCompanyDocHome(companyId);
  const docs = qualityCompanyDocsListedFor(home);
  const { user } = useSession();
  const owner = useOwnerDesk();
  const inputRef = useRef<HTMLInputElement>(null);
  const [docId, setDocId] = useState<QualityCompanyDocId>(() => readQualityCompanyDocPick(home));
  const [filesByDoc, setFilesByDoc] = useState<Record<string, QualityListedFile[]>>(() =>
    Object.fromEntries(
      docs.map((doc) => [doc.id, mergeVaultedQualityFiles([], readQualityCompanyDocFiles(home, doc.id))]),
    ),
  );
  const [note, setNote] = useState<string | null>(null);
  const [noteKind, setNoteKind] = useState<"ok" | "warn" | "err">("ok");
  const [saving, setSaving] = useState(false);
  const [overId, setOverId] = useState<QualityCompanyDocId | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [openFileName, setOpenFileName] = useState<string | null>(null);
  const viewingAs = Boolean(owner?.viewAs && owner.viewAs !== "owner");
  const [acl, setAcl] = useState<QualityCompanyDocAcl>(() =>
    viewingAs ? qualityCompanyDocAcl(null) : qualityCompanyDocAcl(user),
  );
  const [locksByDoc, setLocksByDoc] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(docs.map((doc) => [doc.id, false])),
  );
  const [locksKnown, setLocksKnown] = useState(true);
  const [locking, setLocking] = useState(false);

  useEffect(() => {
    const next = readQualityCompanyDocPick(home);
    setDocId(next);
    setFilesByDoc(
      Object.fromEntries(
        docs.map((doc) => [doc.id, mergeVaultedQualityFiles([], readQualityCompanyDocFiles(home, doc.id))]),
      ),
    );
    setNote(null);
  }, [home]);

  useEffect(() => {
    let cancelled = false;
    void fetch(
      `/api/desk/briefs?kind=quality&scope=company-docs&company=${encodeURIComponent(home)}`,
      viewAsInit(owner?.viewAs),
    )
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          filesByFolder?: Record<string, Array<{ name?: string; type?: string; protected?: boolean }>>;
          locksByFolder?: Record<string, boolean>;
          locksKnown?: boolean;
          acl?: QualityCompanyDocAcl;
          store?: string;
          stored?: boolean;
        };
        if (cancelled) return;
        if (data.acl) setAcl(data.acl);
        const locals = localByDoc(home, docs);
        if (!response.ok || !qualityVaultStored(data.store, data.stored) || !data.filesByFolder) {
          setLocksKnown(false);
          setLocksByDoc(Object.fromEntries(docs.map((doc) => [doc.id, true])));
          setFilesByDoc((current) => {
            const hasAny = docs.some((doc) => (current[doc.id] ?? []).length);
            if (hasAny) return current;
            return Object.fromEntries(docs.map((doc) => [doc.id, mergeVaultedQualityFiles([], locals[doc.id] ?? [])]));
          });
          return;
        }
        setLocksKnown(data.locksKnown !== false);
        setLocksByDoc(
          Object.fromEntries(
            docs.map((doc) => [doc.id, Boolean(data.locksByFolder?.[doc.id])]),
          ),
        );
        setFilesByDoc(
          Object.fromEntries(
            docs.map((doc) => [
              doc.id,
              mergeVaultedQualityFiles(data.filesByFolder?.[doc.id] ?? [], locals[doc.id] ?? []),
            ]),
          ),
        );
      })
      .catch(() => {
        if (cancelled) return;
        setLocksKnown(false);
        setLocksByDoc(Object.fromEntries(docs.map((doc) => [doc.id, true])));
        setFilesByDoc((current) => {
          const hasAny = docs.some((doc) => (current[doc.id] ?? []).length);
          if (hasAny) return current;
          return Object.fromEntries(
            docs.map((doc) => [doc.id, mergeVaultedQualityFiles([], readQualityCompanyDocFiles(home, doc.id))]),
          );
        });
      });
    return () => {
      cancelled = true;
    };
  }, [home, owner?.viewAs, user?.email]);

  function pickDoc(next: QualityCompanyDocId) {
    setDocId(next);
    writeQualityCompanyDocPick(home, next);
    setNote(null);
  }

  function openLibrary(next: QualityCompanyDocId, fileName?: string) {
    pickDoc(next);
    const listed = (filesByDoc[next] ?? []).filter((file) => file.name);
    setOpenFileName(fileName || primaryQualityCompanyDocFile(listed)?.name || null);
    setLibraryOpen(true);
  }

  async function persistVault(target: QualityCompanyDocId, nextFiles: LeadFile[]) {
    const response = await fetch("/api/desk/briefs", viewAsInit(owner?.viewAs, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "quality",
        scope: "company-docs",
        companyId: home,
        folderId: target,
        files: nextFiles.filter((file) => file.data),
      }),
    }));
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      store?: string;
      stored?: boolean;
      brief?: { files?: Array<{ name?: string; type?: string }> };
    };
    if (!response.ok || !qualityVaultStored(data.store, data.stored)) {
      const denied = new Error(typeof data.error === "string" && data.error ? data.error : QUALITY_VAULT_WRITE_ERROR);
      (denied as Error & { status?: number }).status = response.status;
      throw denied;
    }
    return data;
  }

  function docLocked(target: QualityCompanyDocId) {
    return Boolean(locksByDoc[target]);
  }

  function canEditDoc(target: QualityCompanyDocId) {
    return canMutateQualityCompanyDoc(acl, docLocked(target), locksKnown);
  }

  async function toggleLock(target: QualityCompanyDocId) {
    if (!acl.canLock) return;
    setLocking(true);
    setNote(null);
    try {
      const response = await fetch("/api/desk/briefs", viewAsInit(owner?.viewAs, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "quality",
          scope: "company-docs",
          action: "lock",
          companyId: home,
          folderId: target,
          locked: !docLocked(target),
        }),
      }));
      const data = (await response.json().catch(() => ({}))) as { error?: string; locked?: boolean };
      if (!response.ok) {
        throw new Error(typeof data.error === "string" && data.error ? data.error : QUALITY_VAULT_WRITE_ERROR);
      }
      setLocksByDoc((current) => ({ ...current, [target]: Boolean(data.locked) }));
      setLocksKnown(true);
      setNoteKind("ok");
      setNote(data.locked ? QUALITY_COMPANY_DOC_LOCKED_NOTE : `Unlocked ${qualityCompanyDocLabel(target, home)}.`);
    } catch (error) {
      setNoteKind("err");
      setNote(error instanceof Error && error.message ? error.message : QUALITY_VAULT_WRITE_ERROR);
    } finally {
      setLocking(false);
    }
  }

  async function onFiles(target: QualityCompanyDocId, list: FileList | File[] | null) {
    const picked = Array.from(list ?? []);
    if (!picked.length) return;
    if (!canEditDoc(target)) {
      setNoteKind("err");
      setNote(acl.canAddRemove ? QUALITY_COMPANY_DOC_LOCKED_NOTE : "View only — Quality seats add files here.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const check = checkQualityDrop(picked.map(dropFileFromBrowser));
    if (!check.accepted.length) {
      setNoteKind("err");
      setNote(
        check.rejected.length
          ? check.rejected.map((row) => `${row.name}: ${row.error}`).join(" · ")
          : "error" in check && check.error
            ? check.error
            : "Drop at least one file.",
      );
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setSaving(true);
    setNote(null);
    pickDoc(target);
    try {
      const incoming = await Promise.all(
        picked
          .filter((file) => check.accepted.some((row) => row.name === file.name))
          .map(fileToLead),
      );
      const saved = await persistVault(target, incoming);
      const vaulted = mergeVaultedQualityFiles(saved.brief?.files ?? incoming.map((file) => ({ name: file.name, type: file.type })), []);
      setFilesByDoc((current) => ({ ...current, [target]: vaulted }));
      writeQualityCompanyDocFiles(home, target, []);
      if (incoming.length) noteFeatureTrail("import");
      const skipped = check.rejected.map((row) => `${row.name}: ${row.error}`);
      setNoteKind(skipped.length ? "warn" : "ok");
      setNote(
        [
          incoming.length === 1
            ? `Saved ${incoming[0].name} in ${qualityCompanyDocLabel(target, home)}.`
            : `Saved ${incoming.length} files in ${qualityCompanyDocLabel(target, home)}.`,
          ...skipped,
        ].join(" "),
      );
    } catch (error) {
      const denied = error instanceof Error && "status" in error && (error as Error & { status?: number }).status === 403;
      if (denied) {
        setNoteKind("err");
        setNote(error instanceof Error && error.message ? error.message : QUALITY_COMPANY_DOC_LOCKED_NOTE);
        return;
      }
      const incoming = await Promise.all(
        picked
          .filter((file) => check.accepted.some((row) => row.name === file.name))
          .map(fileToLead),
      ).catch(() => [] as LeadFile[]);
      const leftover = mergeQualityFolderFiles(
        (filesByDoc[target] ?? [])
          .filter((file) => !file.vaulted && file.data)
          .map((file) => ({ name: file.name, type: file.type, data: file.data || "" })),
        incoming,
      );
      writeQualityCompanyDocFiles(home, target, leftover);
      setFilesByDoc((current) => ({
        ...current,
        [target]: mergeVaultedQualityFiles(
          (current[target] ?? []).filter((file) => file.vaulted),
          leftover,
        ),
      }));
      setNoteKind("err");
      setNote(error instanceof Error && error.message ? error.message : QUALITY_VAULT_WRITE_ERROR);
    } finally {
      setSaving(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const libraryFiles = (filesByDoc[docId] ?? []).filter((file) => file.name);
  const selectedEditable = canEditDoc(docId);

  async function removeLibraryFile(name: string) {
    const leftover = (filesByDoc[docId] ?? []).filter((file) => file.name === name && !file.vaulted);
    if (leftover.length && !(filesByDoc[docId] ?? []).some((file) => file.name === name && file.vaulted)) {
      const next = (filesByDoc[docId] ?? []).filter((file) => file.name !== name);
      writeQualityCompanyDocFiles(
        home,
        docId,
        next
          .filter((file) => !file.vaulted && file.data)
          .map((file) => ({ name: file.name, type: file.type, data: file.data || "" })),
      );
      setFilesByDoc((current) => ({ ...current, [docId]: next }));
      if (openFileName === name) setOpenFileName(primaryQualityCompanyDocFile(next)?.name || null);
      return;
    }
    const response = await fetch("/api/desk/briefs", viewAsInit(owner?.viewAs, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "quality",
        scope: "company-docs",
        companyId: home,
        folderId: docId,
        fileName: name,
      }),
    }));
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      files?: Array<{ name?: string; type?: string; protected?: boolean }>;
      store?: string;
      stored?: boolean;
    };
    if (!response.ok || !qualityVaultStored(data.store, data.stored) || !data.files) {
      throw new Error(typeof data.error === "string" && data.error ? data.error : QUALITY_VAULT_WRITE_ERROR);
    }
    const next = mergeVaultedQualityFiles(data.files, []);
    writeQualityCompanyDocFiles(home, docId, []);
    setFilesByDoc((current) => ({ ...current, [docId]: next }));
    if (openFileName === name) setOpenFileName(primaryQualityCompanyDocFile(next)?.name || null);
  }

  return (
    <aside id="quality-company-docs" className="plant-card h-fit px-3 py-4" aria-label="Quality files">
      <p className="mb-3 text-xs text-[#5b6f73]">
        {acl.canAddRemove
          ? "Open form fills the blank. Drop a file on a bar to keep the template. Files opens the library. Save a filled copy to a job or Ready prepackage — never this rail."
          : "Open form fills the blank template. The rail stays empty. Files opens the library."}
      </p>
      <ul className="space-y-2">
        {docs.map((doc) => {
          const selected = doc.id === docId;
          const listed = (filesByDoc[doc.id] ?? []).filter((file) => file.name);
          const locked = docLocked(doc.id);
          const editable = canEditDoc(doc.id);
          return (
            <li key={doc.id}>
              <div
                className={`rounded-sm border px-3 py-2 ${
                  overId === doc.id ? "border-steel bg-steel/5" : selected ? "border-steel bg-steel/10" : "border-steel"
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!editable) return;
                  setOverId(doc.id);
                }}
                onDragLeave={() => setOverId((current) => (current === doc.id ? null : current))}
                onDrop={(event) => {
                  event.preventDefault();
                  setOverId(null);
                  void onFiles(doc.id, event.dataTransfer.files);
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    id={`quality-company-doc-${doc.id}`}
                    className="w-full text-left text-sm font-semibold"
                    aria-current={selected ? "true" : undefined}
                    aria-haspopup="dialog"
                    onClick={() =>
                      onOpenForm
                        ? onOpenForm(doc.id, primaryQualityCompanyDocFile(listed)?.name)
                        : openLibrary(doc.id)
                    }
                  >
                    {doc.label}
                  </button>
                  {acl.canLock ? (
                    <button
                      type="button"
                      className="shrink-0 text-xs text-steel underline"
                      disabled={locking}
                      aria-pressed={locked}
                      onClick={() => void toggleLock(doc.id)}
                    >
                      {locked ? "Unlock" : "Lock"}
                    </button>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-[#5b6f73]">
                  {locked && !acl.canLock
                    ? QUALITY_COMPANY_DOC_LOCKED_NOTE
                    : overId === doc.id
                      ? "Drop to save here"
                      : listed.length
                        ? `${listed.length} file${listed.length === 1 ? "" : "s"} · Open form`
                        : editable
                          ? "Drop the blank template here"
                          : "Open form"}
                </p>
                <div className="mt-2 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="text-xs text-steel underline"
                    onClick={() => {
                      if (onOpenForm) onOpenForm(doc.id, primaryQualityCompanyDocFile(listed)?.name);
                      else openLibrary(doc.id);
                    }}
                  >
                    Open form
                  </button>
                  <button
                    type="button"
                    className="text-xs text-steel underline"
                    onClick={() => openLibrary(doc.id)}
                  >
                    Files
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {acl.canAddRemove ? (
        <label className="mt-3 block text-xs text-[#5b6f73]">
          Or choose files for {qualityCompanyDocLabel(docId, home)}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={QUALITY_DROP_ACCEPT}
            className="paper-field mt-1"
            disabled={saving || !selectedEditable}
            aria-label={`Add files to ${qualityCompanyDocLabel(docId, home)}`}
            onChange={(event) => void onFiles(docId, event.target.files)}
          />
        </label>
      ) : (
        <input ref={inputRef} type="file" className="hidden" tabIndex={-1} aria-hidden="true" />
      )}
      {saving ? <p className="mt-2 text-sm">Saving…</p> : null}
      {note ? (
        <p className={`mt-2 text-sm ${noteKind === "err" ? "text-[#8a2a2a]" : "text-[#5b6f73]"}`}>{note}</p>
      ) : null}
      <QualityCompanyDocViewer
        open={libraryOpen}
        title={qualityCompanyDocLabel(docId, home)}
        home={home}
        docId={docId}
        files={libraryFiles}
        selectedName={openFileName}
        viewAs={owner?.viewAs}
        canRemove={selectedEditable}
        lockedNote={!selectedEditable && docLocked(docId) ? QUALITY_COMPANY_DOC_LOCKED_NOTE : null}
        onSelect={setOpenFileName}
        onRemove={removeLibraryFile}
        onOpenForm={
          onOpenForm
            ? (name) => {
                setLibraryOpen(false);
                onOpenForm(docId, name);
              }
            : undefined
        }
        onClose={() => setLibraryOpen(false)}
      />
    </aside>
  );
}
