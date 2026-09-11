"use client";

import { useEffect, useRef, useState } from "react";
import { noteFeatureTrail } from "@/components/FeatureTrail";
import { FieldBlock } from "@/components/FieldMark";
import { useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { fileToLead, type LeadFile } from "@/lib/lead-briefs";
import { viewAsInit } from "@/lib/desk-scope";
import { QUALITY_DROP_ACCEPT, checkQualityDrop } from "@/lib/quality-folders";
import type { QualityPackageShelfAcl } from "@/lib/quality-package-shelf";
import {
  QUALITY_VAULT_WRITE_ERROR,
  qualityVaultStored,
  type QualityListedFile,
} from "@/lib/quality-vault-shared";

type Kit = {
  id: string;
  jobId: string;
  name: string;
  files: QualityListedFile[];
  savedAt: string;
};

function dropFileFromBrowser(file: File) {
  return { name: file.name, type: file.type, bytes: file.size };
}

export function QualityPackageShelf({
  companyId,
  companyLabel,
  jobId,
  siteLabel,
  jobLabel,
}: {
  companyId?: string;
  companyLabel?: string;
  jobId?: string;
  siteLabel?: string;
  jobLabel?: string;
}) {
  const { user } = useSession();
  const owner = useOwnerDesk();
  const inputRef = useRef<HTMLInputElement>(null);
  const [kits, setKits] = useState<Kit[]>([]);
  const [acl, setAcl] = useState<QualityPackageShelfAcl>({ canBuild: false, canAttach: false, seat: "viewer" });
  const [name, setName] = useState("");
  const [activeId, setActiveId] = useState<string>("");
  const [note, setNote] = useState<string | null>(null);
  const [noteKind, setNoteKind] = useState<"ok" | "warn" | "err">("ok");
  const [saving, setSaving] = useState(false);
  const [over, setOver] = useState(false);

  async function load() {
    const company = companyId ? `&company=${encodeURIComponent(companyId)}` : "";
    const response = await fetch(
      `/api/desk/briefs?kind=quality&scope=package-shelf${company}`,
      viewAsInit(owner?.viewAs),
    );
    const data = (await response.json().catch(() => ({}))) as {
      kits?: Kit[];
      acl?: QualityPackageShelfAcl;
    };
    if (!response.ok) return;
    setKits(Array.isArray(data.kits) ? data.kits : []);
    if (data.acl) setAcl(data.acl);
  }

  useEffect(() => {
    void load();
  }, [companyId, owner?.viewAs, user?.email]);

  async function persistKit(packageId: string, kitName: string, files: LeadFile[]) {
    const response = await fetch("/api/desk/briefs", viewAsInit(owner?.viewAs, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "quality",
        scope: "package-shelf",
        packageId,
        name: kitName,
        companyId: companyId || undefined,
        companyLabel: companyLabel || undefined,
        files: files.filter((file) => file.data),
      }),
    }));
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      store?: string;
      stored?: boolean;
      kit?: { id?: string; name?: string };
    };
    if (!response.ok || (files.length > 0 && !qualityVaultStored(data.store, data.stored))) {
      throw new Error(typeof data.error === "string" && data.error ? data.error : QUALITY_VAULT_WRITE_ERROR);
    }
    return data;
  }

  async function onCreate() {
    if (!acl.canBuild) return;
    setSaving(true);
    setNote(null);
    try {
      const saved = await persistKit("", name, []);
      setName("");
      setActiveId(saved.kit?.id || "");
      setNoteKind("ok");
      setNote(`Ready package ${saved.kit?.name || name} is on the shelf.`);
      await load();
    } catch (error) {
      setNoteKind("err");
      setNote(error instanceof Error && error.message ? error.message : QUALITY_VAULT_WRITE_ERROR);
    } finally {
      setSaving(false);
    }
  }

  async function onFiles(list: FileList | File[] | null) {
    const kit = kits.find((row) => row.id === activeId) || kits[0];
    if (!kit) {
      setNoteKind("err");
      setNote("Create a Ready Quality package first.");
      return;
    }
    const picked = Array.from(list ?? []);
    if (!picked.length) return;
    const check = checkQualityDrop(picked.map(dropFileFromBrowser));
    if (!check.accepted.length) {
      setNoteKind("err");
      setNote(check.rejected.map((row) => `${row.name}: ${row.error}`).join(" · ") || "Drop at least one file.");
      return;
    }
    setSaving(true);
    setNote(null);
    try {
      const incoming = await Promise.all(
        picked.filter((file) => check.accepted.some((row) => row.name === file.name)).map(fileToLead),
      );
      await persistKit(kit.id, kit.name, incoming);
      if (incoming.length) noteFeatureTrail("import");
      setNoteKind("ok");
      setNote(
        incoming.length === 1
          ? `Saved ${incoming[0].name} on the Ready Quality shelf.`
          : `Saved ${incoming.length} files on the Ready Quality shelf.`,
      );
      await load();
    } catch (error) {
      setNoteKind("err");
      setNote(error instanceof Error && error.message ? error.message : QUALITY_VAULT_WRITE_ERROR);
    } finally {
      setSaving(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function onAttach(packageId: string) {
    if (!acl.canAttach || !jobId) return;
    setSaving(true);
    setNote(null);
    try {
      const response = await fetch("/api/desk/briefs", viewAsInit(owner?.viewAs, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "quality",
          scope: "package-shelf",
          action: "attach",
          packageId,
          jobId,
          companyId: companyId || undefined,
          companyLabel: companyLabel || undefined,
          siteLabel: siteLabel || undefined,
          jobLabel: jobLabel || undefined,
        }),
      }));
      const data = (await response.json().catch(() => ({}))) as { error?: string; attached?: string[] };
      if (!response.ok) {
        throw new Error(typeof data.error === "string" && data.error ? data.error : QUALITY_VAULT_WRITE_ERROR);
      }
      setNoteKind("ok");
      setNote(
        data.attached?.length === 1
          ? `Attached ${data.attached[0]} to this job.`
          : `Attached ${data.attached?.length || 0} files to this job.`,
      );
    } catch (error) {
      setNoteKind("err");
      setNote(error instanceof Error && error.message ? error.message : QUALITY_VAULT_WRITE_ERROR);
    } finally {
      setSaving(false);
    }
  }

  if (!acl.canBuild && !acl.canAttach) return null;

  return (
    <section className="plant-card px-4 py-4" aria-label="Ready Quality packages">
      <h2 className="font-display text-xl">Ready Quality packages</h2>
      <p className="mt-2 text-sm">
        Pre-build a job kit here before the job exists. It stays on the Quality vault shelf — not
        the company rail. Corporate QC, Site QC, and a PM / estimator can attach it to an estimate
        or job.
      </p>
      {acl.canBuild ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <FieldBlock label="Package name">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="paper-field mt-1"
              placeholder="Day-1 kit"
            />
          </FieldBlock>
          <button
            type="button"
            disabled={saving}
            onClick={() => void onCreate()}
            className="self-end rounded-sm border border-steel px-3 py-2 text-sm text-steel"
          >
            Add to shelf
          </button>
        </div>
      ) : null}
      {kits.length ? (
        <ul className="mt-4 space-y-2">
          {kits.map((kit) => {
            const selected = kit.id === (activeId || kits[0]?.id);
            return (
              <li key={kit.id} className={`rounded-sm border px-3 py-2 ${selected ? "border-steel bg-steel/10" : "border-steel"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button type="button" className="text-left text-sm font-semibold" onClick={() => setActiveId(kit.id)}>
                    {kit.name}
                  </button>
                  {acl.canAttach && jobId ? (
                    <button
                      type="button"
                      disabled={saving || !kit.files.length}
                      onClick={() => void onAttach(kit.id)}
                      className="text-xs text-steel underline"
                    >
                      Attach to this job
                    </button>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-[#5b6f73]">
                  {kit.files.length
                    ? kit.files.map((file) => file.name).join(" · ")
                    : "Empty kit — drop files after you pick it"}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-[#5b6f73]">No Ready Quality packages on the shelf yet.</p>
      )}
      {acl.canBuild && kits.length ? (
        <div
          className={`mt-4 rounded-sm border border-dashed px-4 py-6 ${over ? "border-steel bg-steel/5" : "border-steel"}`}
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
          <p className="text-sm font-semibold">
            Drop files into {(kits.find((row) => row.id === activeId) || kits[0])?.name}
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
        </div>
      ) : null}
      {saving ? <p className="mt-2 text-sm">Saving to the Quality vault…</p> : null}
      {note ? (
        <p className={`mt-2 text-sm ${noteKind === "err" ? "text-[#8a2a2a]" : "text-[#5b6f73]"}`}>{note}</p>
      ) : null}
    </section>
  );
}
