"use client";

import { useEffect, useRef, useState } from "react";
import { noteFeatureTrail } from "@/components/FeatureTrail";
import { useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { fileToLead, type LeadFile } from "@/lib/lead-briefs";
import { viewAsInit } from "@/lib/desk-scope";
import { QualityCompanyDocViewer } from "@/components/QualityCompanyDocViewer";
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

export function QualityCompanyDocRail({ companyId }: { companyId?: string }) {
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
          filesByFolder?: Record<string, Array<{ name?: string; type?: string }>>;
          store?: string;
          stored?: boolean;
        };
        if (cancelled) return;
        const locals = localByDoc(home, docs);
        if (!response.ok || !qualityVaultStored(data.store, data.stored) || !data.filesByFolder) {
          setFilesByDoc(
            Object.fromEntries(docs.map((doc) => [doc.id, mergeVaultedQualityFiles([], locals[doc.id] ?? [])])),
          );
          return;
        }
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
        setFilesByDoc(
          Object.fromEntries(
            docs.map((doc) => [doc.id, mergeVaultedQualityFiles([], readQualityCompanyDocFiles(home, doc.id))]),
          ),
        );
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
      throw new Error(typeof data.error === "string" && data.error ? data.error : QUALITY_VAULT_WRITE_ERROR);
    }
    return data;
  }

  async function onFiles(target: QualityCompanyDocId, list: FileList | File[] | null) {
    const picked = Array.from(list ?? []);
    if (!picked.length) return;
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

  return (
    <aside id="quality-company-docs" className="plant-card h-fit px-3 py-4" aria-label="Quality files">
      <p className="mb-3 text-xs text-[#5b6f73]">Drop a file on a bar to save it. Click a bar to open that library.</p>
      <ul className="space-y-2">
        {docs.map((doc) => {
          const selected = doc.id === docId;
          const listed = (filesByDoc[doc.id] ?? []).filter((file) => file.name);
          return (
            <li key={doc.id}>
              <div
                className={`rounded-sm border px-3 py-2 ${
                  overId === doc.id ? "border-steel bg-steel/5" : selected ? "border-steel bg-steel/10" : "border-steel"
                }`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setOverId(doc.id);
                }}
                onDragLeave={() => setOverId((current) => (current === doc.id ? null : current))}
                onDrop={(event) => {
                  event.preventDefault();
                  setOverId(null);
                  void onFiles(doc.id, event.dataTransfer.files);
                }}
              >
                <button
                  type="button"
                  id={`quality-company-doc-${doc.id}`}
                  className="w-full text-left text-sm font-semibold"
                  aria-current={selected ? "true" : undefined}
                  aria-haspopup="dialog"
                  onClick={() => openLibrary(doc.id)}
                >
                  {doc.label}
                </button>
                <p className="mt-1 text-xs text-[#5b6f73]">
                  {overId === doc.id
                    ? "Drop to save here"
                    : listed.length
                      ? `${listed.length} file${listed.length === 1 ? "" : "s"} · click to open`
                      : "Drop files here"}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <label className="mt-3 block text-xs text-[#5b6f73]">
        Or choose files for {qualityCompanyDocLabel(docId, home)}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={QUALITY_DROP_ACCEPT}
          className="paper-field mt-1"
          disabled={saving}
          aria-label={`Add files to ${qualityCompanyDocLabel(docId, home)}`}
          onChange={(event) => void onFiles(docId, event.target.files)}
        />
      </label>
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
        onSelect={setOpenFileName}
        onClose={() => setLibraryOpen(false)}
      />
    </aside>
  );
}
