"use client";

import { useEffect, useRef, useState } from "react";
import { noteFeatureTrail } from "@/components/FeatureTrail";
import { useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { fileToLead, type LeadFile } from "@/lib/lead-briefs";
import { viewAsInit } from "@/lib/desk-scope";
import { HseCompanyDocViewer } from "@/components/HseCompanyDocViewer";
import {
  canMutateHseCompanyDoc,
  hseCompanyDocAcl,
  type HseCompanyDocAcl,
} from "@/lib/hse-company-doc-acl";
import {
  primaryHseCompanyDocFile,
  hseCompanyDocHome,
  hseCompanyDocLabel,
  hseCompanyDocsListedFor,
  readHseCompanyDocFiles,
  readHseCompanyDocPick,
  writeHseCompanyDocFiles,
  writeHseCompanyDocPick,
  type HseCompanyDocId,
} from "@/lib/hse-company-docs";
import {
  HSE_DROP_ACCEPT,
  checkHseDrop,
  mergeHseFolderFiles,
} from "@/lib/hse-folders";
import {
  HSE_COMPANY_DOC_LOCKED_NOTE,
  HSE_VAULT_WRITE_ERROR,
  mergeVaultedHseFiles,
  hseVaultStored,
  type HseListedFile,
} from "@/lib/hse-vault-shared";

function dropFileFromBrowser(file: File) {
  return { name: file.name, type: file.type, bytes: file.size };
}

function localByDoc(home: string, docs: ReadonlyArray<{ id: string }>) {
  return Object.fromEntries(docs.map((doc) => [doc.id, readHseCompanyDocFiles(home, doc.id as HseCompanyDocId)]));
}

export function HseCompanyDocRail({
  companyId,
  onOpenForm,
}: {
  companyId?: string;
  onOpenForm?: (docId: HseCompanyDocId, fileName?: string) => void;
}) {
  const home = hseCompanyDocHome(companyId);
  const docs = hseCompanyDocsListedFor(home);
  const { user } = useSession();
  const owner = useOwnerDesk();
  const inputRef = useRef<HTMLInputElement>(null);
  const [docId, setDocId] = useState<HseCompanyDocId>(() => readHseCompanyDocPick(home));
  const [filesByDoc, setFilesByDoc] = useState<Record<string, HseListedFile[]>>(() =>
    Object.fromEntries(
      docs.map((doc) => [doc.id, mergeVaultedHseFiles([], readHseCompanyDocFiles(home, doc.id))]),
    ),
  );
  const [note, setNote] = useState<string | null>(null);
  const [noteKind, setNoteKind] = useState<"ok" | "warn" | "err">("ok");
  const [saving, setSaving] = useState(false);
  const [overId, setOverId] = useState<HseCompanyDocId | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [openFileName, setOpenFileName] = useState<string | null>(null);
  const viewingAs = Boolean(owner?.viewAs && owner.viewAs !== "owner");
  const [acl, setAcl] = useState<HseCompanyDocAcl>(() =>
    viewingAs ? hseCompanyDocAcl(null) : hseCompanyDocAcl(user),
  );
  const [locksByDoc, setLocksByDoc] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(docs.map((doc) => [doc.id, false])),
  );
  const [locksKnown, setLocksKnown] = useState(true);
  const [locking, setLocking] = useState(false);

  useEffect(() => {
    const next = readHseCompanyDocPick(home);
    setDocId(next);
    setFilesByDoc(
      Object.fromEntries(
        docs.map((doc) => [doc.id, mergeVaultedHseFiles([], readHseCompanyDocFiles(home, doc.id))]),
      ),
    );
    setNote(null);
  }, [home]);

  useEffect(() => {
    let cancelled = false;
    void fetch(
      `/api/desk/briefs?kind=hse&scope=company-docs&company=${encodeURIComponent(home)}`,
      viewAsInit(owner?.viewAs),
    )
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          filesByFolder?: Record<string, Array<{ name?: string; type?: string; protected?: boolean }>>;
          locksByFolder?: Record<string, boolean>;
          locksKnown?: boolean;
          acl?: HseCompanyDocAcl;
          store?: string;
          stored?: boolean;
        };
        if (cancelled) return;
        if (data.acl) setAcl(data.acl);
        const locals = localByDoc(home, docs);
        if (!response.ok || !hseVaultStored(data.store, data.stored) || !data.filesByFolder) {
          setLocksKnown(false);
          setLocksByDoc(Object.fromEntries(docs.map((doc) => [doc.id, true])));
          setFilesByDoc((current) => {
            const hasAny = docs.some((doc) => (current[doc.id] ?? []).length);
            if (hasAny) return current;
            return Object.fromEntries(docs.map((doc) => [doc.id, mergeVaultedHseFiles([], locals[doc.id] ?? [])]));
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
              mergeVaultedHseFiles(data.filesByFolder?.[doc.id] ?? [], locals[doc.id] ?? []),
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
            docs.map((doc) => [doc.id, mergeVaultedHseFiles([], readHseCompanyDocFiles(home, doc.id))]),
          );
        });
      });
    return () => {
      cancelled = true;
    };
  }, [home, owner?.viewAs, user?.email]);

  function pickDoc(next: HseCompanyDocId) {
    setDocId(next);
    writeHseCompanyDocPick(home, next);
    setNote(null);
  }

  function openLibrary(next: HseCompanyDocId, fileName?: string) {
    pickDoc(next);
    const listed = (filesByDoc[next] ?? []).filter((file) => file.name);
    setOpenFileName(fileName || primaryHseCompanyDocFile(listed)?.name || null);
    setLibraryOpen(true);
  }

  async function persistVault(target: HseCompanyDocId, nextFiles: LeadFile[]) {
    const response = await fetch("/api/desk/briefs", viewAsInit(owner?.viewAs, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "hse",
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
    if (!response.ok || !hseVaultStored(data.store, data.stored)) {
      const denied = new Error(typeof data.error === "string" && data.error ? data.error : HSE_VAULT_WRITE_ERROR);
      (denied as Error & { status?: number }).status = response.status;
      throw denied;
    }
    return data;
  }

  function docLocked(target: HseCompanyDocId) {
    return Boolean(locksByDoc[target]);
  }

  function canEditDoc(target: HseCompanyDocId) {
    return canMutateHseCompanyDoc(acl, docLocked(target), locksKnown);
  }

  async function toggleLock(target: HseCompanyDocId) {
    if (!acl.canLock) return;
    setLocking(true);
    setNote(null);
    try {
      const response = await fetch("/api/desk/briefs", viewAsInit(owner?.viewAs, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "hse",
          scope: "company-docs",
          action: "lock",
          companyId: home,
          folderId: target,
          locked: !docLocked(target),
        }),
      }));
      const data = (await response.json().catch(() => ({}))) as { error?: string; locked?: boolean };
      if (!response.ok) {
        throw new Error(typeof data.error === "string" && data.error ? data.error : HSE_VAULT_WRITE_ERROR);
      }
      setLocksByDoc((current) => ({ ...current, [target]: Boolean(data.locked) }));
      setLocksKnown(true);
      setNoteKind("ok");
      setNote(data.locked ? HSE_COMPANY_DOC_LOCKED_NOTE : `Unlocked ${hseCompanyDocLabel(target, home)}.`);
    } catch (error) {
      setNoteKind("err");
      setNote(error instanceof Error && error.message ? error.message : HSE_VAULT_WRITE_ERROR);
    } finally {
      setLocking(false);
    }
  }

  async function onFiles(target: HseCompanyDocId, list: FileList | File[] | null) {
    const picked = Array.from(list ?? []);
    if (!picked.length) return;
    if (!canEditDoc(target)) {
      setNoteKind("err");
      setNote(acl.canAddRemove ? HSE_COMPANY_DOC_LOCKED_NOTE : "View only — HSE seats add files here.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const check = checkHseDrop(picked.map(dropFileFromBrowser));
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
      const vaulted = mergeVaultedHseFiles(saved.brief?.files ?? incoming.map((file) => ({ name: file.name, type: file.type })), []);
      setFilesByDoc((current) => ({ ...current, [target]: vaulted }));
      writeHseCompanyDocFiles(home, target, []);
      if (incoming.length) noteFeatureTrail("import");
      const skipped = check.rejected.map((row) => `${row.name}: ${row.error}`);
      setNoteKind(skipped.length ? "warn" : "ok");
      setNote(
        [
          incoming.length === 1
            ? `Saved ${incoming[0].name} in ${hseCompanyDocLabel(target, home)}.`
            : `Saved ${incoming.length} files in ${hseCompanyDocLabel(target, home)}.`,
          ...skipped,
        ].join(" "),
      );
    } catch (error) {
      const denied = error instanceof Error && "status" in error && (error as Error & { status?: number }).status === 403;
      if (denied) {
        setNoteKind("err");
        setNote(error instanceof Error && error.message ? error.message : HSE_COMPANY_DOC_LOCKED_NOTE);
        return;
      }
      const incoming = await Promise.all(
        picked
          .filter((file) => check.accepted.some((row) => row.name === file.name))
          .map(fileToLead),
      ).catch(() => [] as LeadFile[]);
      const leftover = mergeHseFolderFiles(
        (filesByDoc[target] ?? [])
          .filter((file) => !file.vaulted && file.data)
          .map((file) => ({ name: file.name, type: file.type, data: file.data || "" })),
        incoming,
      );
      writeHseCompanyDocFiles(home, target, leftover);
      setFilesByDoc((current) => ({
        ...current,
        [target]: mergeVaultedHseFiles(
          (current[target] ?? []).filter((file) => file.vaulted),
          leftover,
        ),
      }));
      setNoteKind("err");
      setNote(error instanceof Error && error.message ? error.message : HSE_VAULT_WRITE_ERROR);
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
      writeHseCompanyDocFiles(
        home,
        docId,
        next
          .filter((file) => !file.vaulted && file.data)
          .map((file) => ({ name: file.name, type: file.type, data: file.data || "" })),
      );
      setFilesByDoc((current) => ({ ...current, [docId]: next }));
      if (openFileName === name) setOpenFileName(primaryHseCompanyDocFile(next)?.name || null);
      return;
    }
    const response = await fetch("/api/desk/briefs", viewAsInit(owner?.viewAs, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "hse",
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
    if (!response.ok || !hseVaultStored(data.store, data.stored) || !data.files) {
      throw new Error(typeof data.error === "string" && data.error ? data.error : HSE_VAULT_WRITE_ERROR);
    }
    const next = mergeVaultedHseFiles(data.files, []);
    writeHseCompanyDocFiles(home, docId, []);
    setFilesByDoc((current) => ({ ...current, [docId]: next }));
    if (openFileName === name) setOpenFileName(primaryHseCompanyDocFile(next)?.name || null);
  }

  return (
    <aside id="hse-company-docs" className="plant-card h-fit px-3 py-4" aria-label="HSE files">
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
                    id={`hse-company-doc-${doc.id}`}
                    className="w-full text-left text-sm font-semibold"
                    aria-current={selected ? "true" : undefined}
                    aria-haspopup="dialog"
                    onClick={() =>
                      onOpenForm
                        ? onOpenForm(doc.id, primaryHseCompanyDocFile(listed)?.name)
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
                    ? HSE_COMPANY_DOC_LOCKED_NOTE
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
                      if (onOpenForm) onOpenForm(doc.id, primaryHseCompanyDocFile(listed)?.name);
                      else openLibrary(doc.id);
                    }}
                  >
                    Open form
                  </button>
                  {doc.id === "jsas" && acl.canEditJsaTemplate && canMutateHseCompanyDoc(acl, locked, locksKnown) ? (
                    <button
                      type="button"
                      className="text-xs text-steel underline"
                      onClick={() => {
                        if (onOpenForm) onOpenForm(doc.id, primaryHseCompanyDocFile(listed)?.name);
                        else openLibrary(doc.id);
                      }}
                    >Edit</button>
                  ) : null}
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
          Or choose files for {hseCompanyDocLabel(docId, home)}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={HSE_DROP_ACCEPT}
            className="paper-field mt-1"
            disabled={saving || !selectedEditable}
            aria-label={`Add files to ${hseCompanyDocLabel(docId, home)}`}
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
      <HseCompanyDocViewer
        open={libraryOpen}
        title={hseCompanyDocLabel(docId, home)}
        home={home}
        docId={docId}
        files={libraryFiles}
        selectedName={openFileName}
        viewAs={owner?.viewAs}
        canRemove={selectedEditable}
        lockedNote={!selectedEditable && docLocked(docId) ? HSE_COMPANY_DOC_LOCKED_NOTE : null}
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
