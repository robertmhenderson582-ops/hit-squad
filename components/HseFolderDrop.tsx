"use client";

import { useEffect, useRef, useState } from "react";
import { noteFeatureTrail } from "@/components/FeatureTrail";
import { useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { fileToLead, type LeadFile } from "@/lib/lead-briefs";
import { viewAsInit } from "@/lib/desk-scope";
import {
  HSE_DROP_ACCEPT,
  checkHseDrop,
  mergeHseFolderFiles,
  hseFolderLabel,
  hseFoldersFor,
  readHseFolderFiles,
  writeHseFolderFiles,
  writeHseFolderPick,
  type HseFolderId,
} from "@/lib/hse-folders";
import { isHseFilledCopyName } from "@/lib/hse-template-form";
import {
  HSE_UNVAULTED_MARK,
  HSE_VAULT_WRITE_ERROR,
  mergeVaultedHseFiles,
  hseVaultStored,
  type HseListedFile,
} from "@/lib/hse-vault-shared";

function dropFileFromBrowser(file: File) {
  return { name: file.name, type: file.type, bytes: file.size };
}

export function HseFolderDrop({
  jobId,
  folderId,
  companyId,
  companyLabel,
  siteLabel,
  jobLabel,
  onOpenFilled,
  onRemoveFilled,
}: {
  jobId: string;
  folderId: HseFolderId;
  companyId?: string;
  companyLabel?: string;
  siteLabel?: string;
  jobLabel?: string;
  onOpenFilled?: (fileName: string) => void;
  onRemoveFilled?: (fileName: string) => Promise<void>;
}) {
  const folders = hseFoldersFor(companyId || "madison");
  const { user } = useSession();
  const owner = useOwnerDesk();
  const dropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<HseListedFile[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [noteKind, setNoteKind] = useState<"ok" | "warn" | "err">("ok");
  const [saving, setSaving] = useState(false);
  const [over, setOver] = useState(false);

  useEffect(() => {
    writeHseFolderPick(jobId, folderId);
    setFiles(mergeVaultedHseFiles([], readHseFolderFiles(jobId, folderId)));
    setNote(null);
    setSavedAt(null);
    const frame = window.requestAnimationFrame(() => dropRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [folderId, jobId]);

  useEffect(() => {
    if (!jobId || !folderId) return;
    let cancelled = false;
    const company = companyId ? `&company=${encodeURIComponent(companyId)}` : "";
    const companyName = companyLabel ? `&companyLabel=${encodeURIComponent(companyLabel)}` : "";
    const site = siteLabel ? `&siteLabel=${encodeURIComponent(siteLabel)}` : "";
    const job = jobLabel ? `&jobLabel=${encodeURIComponent(jobLabel)}` : "";
    void fetch(
      `/api/desk/briefs?kind=hse&jobId=${encodeURIComponent(jobId)}&folder=${encodeURIComponent(folderId)}${company}${companyName}${site}${job}`,
      viewAsInit(owner?.viewAs),
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
        const vaulted = hseVaultStored(data.store, data.stored) ? listed : [];
        setFiles(mergeVaultedHseFiles(vaulted, readHseFolderFiles(jobId, folderId)));
        const stamp = vaulted.length ? data.briefs?.[0]?.savedAt : undefined;
        if (stamp) setSavedAt(stamp);
        else setSavedAt(null);
      })
      .catch(() => {
        if (!cancelled) setFiles(mergeVaultedHseFiles([], readHseFolderFiles(jobId, folderId)));
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, companyLabel, folderId, jobId, jobLabel, owner?.viewAs, siteLabel, user?.email]);

  async function persistVault(nextFiles: LeadFile[]) {
    const response = await fetch("/api/desk/briefs", viewAsInit(owner?.viewAs, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "hse",
        jobId,
        folderId,
        companyId: companyId || undefined,
        companyLabel: companyLabel || undefined,
        siteLabel: siteLabel || undefined,
        jobLabel: jobLabel || undefined,
        files: nextFiles.filter((file) => file.data),
      }),
    }));
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      rejected?: Array<{ name?: string; error?: string }>;
      brief?: { savedAt?: string; files?: Array<{ name?: string; type?: string }> };
      store?: string;
      stored?: boolean;
    };
    if (!response.ok || !hseVaultStored(data.store, data.stored)) {
      throw new Error(typeof data.error === "string" && data.error ? data.error : HSE_VAULT_WRITE_ERROR);
    }
    return data;
  }

  async function onFiles(list: FileList | File[] | null) {
    const picked = Array.from(list ?? []);
    if (!picked.length) return;
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
    try {
      const incoming = await Promise.all(
        picked
          .filter((file) => check.accepted.some((row) => row.name === file.name))
          .map(fileToLead),
      );
      const saved = await persistVault(incoming);
      const vaulted = saved.brief?.files ?? [];
      setFiles(mergeVaultedHseFiles(vaulted, []));
      writeHseFolderFiles(jobId, folderId, []);
      if (saved.brief?.savedAt) setSavedAt(saved.brief.savedAt);
      if (incoming.length) noteFeatureTrail("import");
      const skipped = check.rejected.map((row) => `${row.name}: ${row.error}`);
      setNoteKind(skipped.length ? "warn" : "ok");
      setNote(
        [
          incoming.length === 1
            ? `Saved ${incoming[0].name} in ${hseFolderLabel(folderId, companyId)}.`
            : `Saved ${incoming.length} files in ${hseFolderLabel(folderId, companyId)}.`,
          ...skipped,
        ].join(" "),
      );
    } catch (error) {
      const incoming = await Promise.all(
        picked
          .filter((file) => check.accepted.some((row) => row.name === file.name))
          .map(fileToLead),
      ).catch(() => [] as LeadFile[]);
      const leftover = mergeHseFolderFiles(
        files.filter((file) => !file.vaulted && file.data).map((file) => ({
          name: file.name,
          type: file.type,
          data: file.data || "",
        })),
        incoming,
      );
      writeHseFolderFiles(jobId, folderId, leftover);
      setFiles(mergeVaultedHseFiles(
        files.filter((file) => file.vaulted),
        leftover,
      ));
      setNoteKind("err");
      setNote(
        error instanceof Error && error.message
          ? error.message
          : HSE_VAULT_WRITE_ERROR,
      );
    } finally {
      setSaving(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const folder = hseFolderLabel(folderId, companyId);
  const listed = files.filter((file) => file.name);
  if (!folders.length) return null;

  return (
    <section className="plant-card px-4 py-4">
      <h2 className="font-display text-xl">{folder}</h2>
      <p className="mt-2 text-sm">
        Open form on the radio fills the blank sheet. Drop extra files here. Filled copies
        saved from the form land in this job folder under a new name. Testers only see their
        own files.
      </p>
      <div
        ref={dropRef}
        id="hse-folder-drop"
        tabIndex={-1}
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
          accept={HSE_DROP_ACCEPT}
          className="paper-field mt-3"
          disabled={saving}
          onChange={(event) => void onFiles(event.target.files)}
        />
        {saving ? <p className="mt-2 text-sm">Saving into {folder}…</p> : null}
      </div>
      {listed.length ? (
        <ul className="mt-3 space-y-1 text-sm">
          {listed.map((file) => (
            <li key={file.name} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {file.name}
                {file.vaulted ? "" : ` · ${HSE_UNVAULTED_MARK}`}
              </span>
              {isHseFilledCopyName(file.name) ? (
                <span className="flex gap-3">
                  {onOpenFilled ? (
                    <button type="button" className="text-xs text-steel underline" onClick={() => onOpenFilled(file.name)}>
                      Open form
                    </button>
                  ) : null}
                  {onRemoveFilled ? (
                    <button
                      type="button"
                      className="text-xs text-[#8a2a2a] underline"
                      onClick={() =>
                        void onRemoveFilled(file.name).then(() => {
                          setFiles((current) => current.filter((row) => row.name !== file.name));
                        })
                      }
                    >
                      Remove
                    </button>
                  ) : null}
                </span>
              ) : null}
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
