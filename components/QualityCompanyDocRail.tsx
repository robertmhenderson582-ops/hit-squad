"use client";

import { useEffect, useRef, useState } from "react";
import { noteFeatureTrail } from "@/components/FeatureTrail";
import { useSession } from "@/components/SessionProvider";
import { fileToLead, type LeadFile } from "@/lib/lead-briefs";
import {
  isQualityCompanyDocId,
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

function dropFileFromBrowser(file: File) {
  return { name: file.name, type: file.type, bytes: file.size };
}

export function QualityCompanyDocRail({ companyId }: { companyId?: string }) {
  const home = qualityCompanyDocHome(companyId);
  const docs = qualityCompanyDocsListedFor(home);
  const { user } = useSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const [docId, setDocId] = useState<QualityCompanyDocId>(() => readQualityCompanyDocPick(home));
  const [filesByDoc, setFilesByDoc] = useState<Record<string, LeadFile[]>>(() =>
    Object.fromEntries(docs.map((doc) => [doc.id, readQualityCompanyDocFiles(home, doc.id)])),
  );
  const [note, setNote] = useState<string | null>(null);
  const [noteKind, setNoteKind] = useState<"ok" | "warn" | "err">("ok");
  const [saving, setSaving] = useState(false);
  const [overId, setOverId] = useState<QualityCompanyDocId | null>(null);

  useEffect(() => {
    const next = readQualityCompanyDocPick(home);
    setDocId(next);
    setFilesByDoc(Object.fromEntries(docs.map((doc) => [doc.id, readQualityCompanyDocFiles(home, doc.id)])));
    setNote(null);
  }, [home]);

  useEffect(() => {
    let cancelled = false;
    void fetch(
      `/api/desk/briefs?kind=quality&scope=company-docs&company=${encodeURIComponent(home)}`,
      { credentials: "include" },
    )
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          filesByFolder?: Record<string, Array<{ name?: string; type?: string }>>;
        };
        if (cancelled || !response.ok || !data.filesByFolder) return;
        setFilesByDoc((current) => {
          const next = { ...current };
          for (const [id, listed] of Object.entries(data.filesByFolder ?? {})) {
            const names = listed.map((file) => file.name).filter((name): name is string => Boolean(name));
            const kept = (current[id] ?? []).filter((file) => names.includes(file.name) || Boolean(file.data));
            const extras = names
              .filter((name) => !kept.some((file) => file.name === name))
              .map((name) => ({
                name,
                type: listed.find((file) => file.name === name)?.type || "application/octet-stream",
                data: "",
              }));
            next[id] = [...kept, ...extras];
          }
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [home, user?.email]);

  function pickDoc(next: QualityCompanyDocId) {
    setDocId(next);
    writeQualityCompanyDocPick(home, next);
    setNote(null);
  }

  async function persistVault(target: QualityCompanyDocId, nextFiles: LeadFile[]) {
    const response = await fetch("/api/desk/briefs", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "quality",
        scope: "company-docs",
        companyId: home,
        folderId: target,
        files: nextFiles.filter((file) => file.data),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok) {
      throw new Error(typeof data.error === "string" && data.error ? data.error : "Could not save. Try again.");
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
      const next = mergeQualityFolderFiles(filesByDoc[target] ?? [], incoming);
      setFilesByDoc((current) => ({ ...current, [target]: next }));
      writeQualityCompanyDocFiles(home, target, next);
      if (incoming.length) noteFeatureTrail("import");
      await persistVault(target, next);
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
      setNoteKind("err");
      setNote(
        error instanceof Error && error.message
          ? `${error.message} Files stay on this desk until they save.`
          : "Could not save. Files stay on this desk until they save.",
      );
    } finally {
      setSaving(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <aside id="quality-company-docs" className="plant-card h-fit px-3 py-4" aria-label="Quality files">
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
                  onClick={() => pickDoc(doc.id)}
                >
                  {doc.label}
                </button>
                {listed.length ? (
                  <ul className="mt-2 space-y-1 text-sm text-[#5b6f73]">
                    {listed.map((file) => (
                      <li key={file.name}>{file.name}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={QUALITY_DROP_ACCEPT}
        className="paper-field mt-3"
        disabled={saving}
        aria-label={`Add files to ${qualityCompanyDocLabel(docId, home)}`}
        onChange={(event) => void onFiles(docId, event.target.files)}
      />
      {saving ? <p className="mt-2 text-sm">Saving…</p> : null}
      {note ? (
        <p className={`mt-2 text-sm ${noteKind === "err" ? "text-[#8a2a2a]" : "text-[#5b6f73]"}`}>{note}</p>
      ) : null}
    </aside>
  );
}
