"use client";

import { useEffect, useRef, useState } from "react";
import { noteFeatureTrail } from "@/components/FeatureTrail";
import { FieldBlock } from "@/components/FieldMark";
import { useSession } from "@/components/SessionProvider";
import { fileToLead, type LeadFile } from "@/lib/lead-briefs";
import {
  QUALITY_DROP_ACCEPT,
  checkQualityDrop,
  isQualityFolderId,
  mergeQualityFolderFiles,
  qualityFolderLabel,
  qualityFoldersFor,
  readQualityFolderFiles,
  readQualityFolderPick,
  writeQualityFolderFiles,
  writeQualityFolderPick,
  type QualityFolderId,
} from "@/lib/quality-folders";
import {
  QUALITY_UNVAULTED_MARK,
  QUALITY_VAULT_WRITE_ERROR,
  mergeVaultedQualityFiles,
  qualityVaultStored,
  type QualityListedFile,
} from "@/lib/quality-vault-shared";

function dropFileFromBrowser(file: File) {
  return { name: file.name, type: file.type, bytes: file.size };
}

export function QualityFolderDrop({
  jobId,
  companyId,
  companyLabel,
  siteLabel,
  jobLabel,
}: {
  jobId: string;
  companyId?: string;
  companyLabel?: string;
  siteLabel?: string;
  jobLabel?: string;
}) {
  const folders = qualityFoldersFor(companyId || "madison");
  const { user } = useSession();
  const selectRef = useRef<HTMLSelectElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [folderId, setFolderId] = useState<QualityFolderId>(() => readQualityFolderPick(jobId));
  const [files, setFiles] = useState<QualityListedFile[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [noteKind, setNoteKind] = useState<"ok" | "warn" | "err">("ok");
  const [saving, setSaving] = useState(false);
  const [over, setOver] = useState(false);

  useEffect(() => {
    const next = readQualityFolderPick(jobId);
    setFolderId(next);
    setFiles(mergeVaultedQualityFiles([], readQualityFolderFiles(jobId, next)));
    setNote(null);
    setSavedAt(null);
    const frame = window.requestAnimationFrame(() => selectRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [jobId]);

  useEffect(() => {
    if (!jobId || !folderId) return;
    let cancelled = false;
    const company = companyId ? `&company=${encodeURIComponent(companyId)}` : "";
    const companyName = companyLabel ? `&companyLabel=${encodeURIComponent(companyLabel)}` : "";
    const site = siteLabel ? `&siteLabel=${encodeURIComponent(siteLabel)}` : "";
    const job = jobLabel ? `&jobLabel=${encodeURIComponent(jobLabel)}` : "";
    void fetch(
      `/api/desk/briefs?kind=quality&jobId=${encodeURIComponent(jobId)}&folder=${encodeURIComponent(folderId)}${company}${companyName}${site}${job}`,
      { credentials: "include" },
    )
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          files?: Array<{ name?: string; type?: string }>;
          briefs?: Array<{ savedAt?: string; files?: Array<{ name?: string; type?: string }> }>;
          store?: string;
          stored?: boolean;
        };
        if (cancelled) return;
        const listed = response.ok
          ? Array.isArray(data.files)
            ? data.files
            : data.briefs?.[0]?.files ?? []
          : [];
        const vaulted = qualityVaultStored(data.store, data.stored) ? listed : [];
        setFiles(mergeVaultedQualityFiles(vaulted, readQualityFolderFiles(jobId, folderId)));
        const stamp = vaulted.length ? data.briefs?.[0]?.savedAt : undefined;
        if (stamp) setSavedAt(stamp);
        else setSavedAt(null);
      })
      .catch(() => {
        if (!cancelled) setFiles(mergeVaultedQualityFiles([], readQualityFolderFiles(jobId, folderId)));
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, companyLabel, folderId, jobId, jobLabel, siteLabel, user?.email]);

  function pickFolder(next: QualityFolderId) {
    setFolderId(next);
    writeQualityFolderPick(jobId, next);
    setFiles(mergeVaultedQualityFiles([], readQualityFolderFiles(jobId, next)));
    setNote(null);
    setSavedAt(null);
  }

  async function persistVault(nextFiles: LeadFile[]) {
    const response = await fetch("/api/desk/briefs", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "quality",
        jobId,
        folderId,
        companyId: companyId || undefined,
        companyLabel: companyLabel || undefined,
        siteLabel: siteLabel || undefined,
        jobLabel: jobLabel || undefined,
        files: nextFiles.filter((file) => file.data),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      rejected?: Array<{ name?: string; error?: string }>;
      brief?: { savedAt?: string; files?: Array<{ name?: string; type?: string }> };
      store?: string;
      stored?: boolean;
    };
    if (!response.ok || !qualityVaultStored(data.store, data.stored)) {
      throw new Error(typeof data.error === "string" && data.error ? data.error : QUALITY_VAULT_WRITE_ERROR);
    }
    return data;
  }

  async function onFiles(list: FileList | File[] | null) {
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
    try {
      const incoming = await Promise.all(
        picked
          .filter((file) => check.accepted.some((row) => row.name === file.name))
          .map(fileToLead),
      );
      const saved = await persistVault(incoming);
      const vaulted = saved.brief?.files ?? [];
      setFiles(mergeVaultedQualityFiles(vaulted, []));
      writeQualityFolderFiles(jobId, folderId, []);
      if (saved.brief?.savedAt) setSavedAt(saved.brief.savedAt);
      if (incoming.length) noteFeatureTrail("import");
      const skipped = check.rejected.map((row) => `${row.name}: ${row.error}`);
      setNoteKind(skipped.length ? "warn" : "ok");
      setNote(
        [
          incoming.length === 1
            ? `Saved ${incoming[0].name} in ${qualityFolderLabel(folderId, companyId)}.`
            : `Saved ${incoming.length} files in ${qualityFolderLabel(folderId, companyId)}.`,
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
        files.filter((file) => !file.vaulted && file.data).map((file) => ({
          name: file.name,
          type: file.type,
          data: file.data || "",
        })),
        incoming,
      );
      writeQualityFolderFiles(jobId, folderId, leftover);
      setFiles(mergeVaultedQualityFiles(
        files.filter((file) => file.vaulted),
        leftover,
      ));
      setNoteKind("err");
      setNote(
        error instanceof Error && error.message
          ? error.message
          : QUALITY_VAULT_WRITE_ERROR,
      );
    } finally {
      setSaving(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const folder = qualityFolderLabel(folderId, companyId);
  const listed = files.filter((file) => file.name);
  if (!folders.length) return null;

  return (
    <section className="plant-card px-4 py-4">
      <h2 className="font-display text-xl">Quality folders</h2>
      <p className="mt-2 text-sm">
        Pick a folder, then drop files into it. Success shows only after the Quality vault
        confirms the write. Testers only see their own files.
      </p>
      <div className="mt-3 max-w-md">
        <FieldBlock label="Folder">
          <select
            ref={selectRef}
            id="quality-folder-pick"
            value={folderId}
            onChange={(event) => {
              if (isQualityFolderId(event.target.value, companyId)) pickFolder(event.target.value);
            }}
            className="paper-field mt-1"
            aria-label="Quality folder"
          >
            {folders.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </FieldBlock>
      </div>
      <div
        className={`mt-4 rounded-sm border border-dashed px-4 py-6 ${
          over ? "border-steel bg-steel/5" : "border-steel"
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          void onFiles(event.dataTransfer.files);
        }}
      >
        <p className="text-sm font-semibold">Drop files into {folder}</p>
        <p className="mt-1 text-sm text-[#5b6f73]">
          PDF, Excel, Word, CSV, pictures, or text. 15 MB each, 50 MB per drop.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={QUALITY_DROP_ACCEPT}
          className="paper-field mt-3"
          disabled={saving}
          onChange={(event) => void onFiles(event.target.files)}
        />
        {saving ? <p className="mt-2 text-sm">Saving into {folder}…</p> : null}
      </div>
      {listed.length ? (
        <ul className="mt-3 space-y-1 text-sm">
          {listed.map((file) => (
            <li key={file.name}>
              {file.name}
              {file.vaulted ? "" : ` · ${QUALITY_UNVAULTED_MARK}`}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-[#5b6f73]">
          Nothing in {folder} on this job yet. Drop a file or use the picker.
        </p>
      )}
      {savedAt ? <p className="mt-2 text-xs text-[#5b6f73]">Last saved {savedAt}</p> : null}
      {note ? (
        <p className={`mt-2 text-sm ${noteKind === "err" ? "text-[#8a2a2a]" : "text-[#5b6f73]"}`}>
          {note}
        </p>
      ) : null}
    </section>
  );
}
