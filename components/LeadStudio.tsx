"use client";

import { FormEvent, useEffect, useState } from "react";
import { noteFeatureTrail } from "@/components/FeatureTrail";
import { useSession } from "@/components/SessionProvider";
import { hasBuildDesk } from "@/lib/desk-role";
import { fileToLead, leadToBytes, readBrief, writeBrief, type LeadFile, type PublicLeadBrief } from "@/lib/lead-briefs";
import { buildZip } from "@/lib/zip";

const JOBS = [
  { id: "describe", label: "Describe the desk", copy: "How this lead works. What the empty board should hold." },
  { id: "forms", label: "Drop forms", copy: "PDF, Excel, Word, or pictures people already use." },
  { id: "save", label: "Save", copy: "Owner sees the brief and files on this desk." },
] as const;

type Job = (typeof JOBS)[number]["id"];
type Screen = "welcome" | Job;

export function LeadStudio({ title, kind }: { title: string; kind: "hse" | "quality" }) {
  const [screen, setScreen] = useState<Screen>("welcome");
  const { user } = useSession();
  const canSeeAll = hasBuildDesk(user);
  const [describe, setDescribe] = useState("");
  const [files, setFiles] = useState<LeadFile[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedBriefs, setSavedBriefs] = useState<PublicLeadBrief[]>([]);

  useEffect(() => {
    const brief = readBrief(kind);
    setDescribe(brief.describe);
    setFiles(brief.files);
    setSavedAt(brief.savedAt);
  }, [kind]);

  useEffect(() => {
    void fetch(`/api/desk/briefs?kind=${kind}`, { credentials: "include" })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as { briefs?: PublicLeadBrief[] };
        if (!response.ok || !Array.isArray(data.briefs)) return;
        if (canSeeAll) setSavedBriefs(data.briefs);
        const mine = user?.email
          ? data.briefs.find((row) => row.who === user.email.trim().toLowerCase())
          : data.briefs[0];
        if (mine?.savedAt) setSavedAt(mine.savedAt);
      })
      .catch(() => undefined);
  }, [canSeeAll, kind, user?.email]);

  function persist(next: { describe?: string; files?: LeadFile[]; savedAt?: string | null }) {
    const brief = {
      describe: next.describe ?? describe,
      files: next.files ?? files,
      savedAt: next.savedAt === undefined ? savedAt : next.savedAt,
    };
    writeBrief(kind, brief);
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNote(null);
    try {
      await saveToOwner({ describe, files });
      setNote("Saved. Owner can open the brief and files. Empty board stays empty.");
    } catch (error) {
      setNote(error instanceof Error && error.message ? error.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function saveToOwner(next: { describe?: string; files?: LeadFile[] }) {
    const body = {
      kind,
      describe: next.describe ?? describe,
      files: next.files ?? files,
    };
    writeBrief(kind, { ...body, savedAt: savedAt });
    const response = await fetch("/api/desk/briefs", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      brief?: PublicLeadBrief;
    };
    if (!response.ok) {
      throw new Error(typeof data.error === "string" && data.error ? data.error : "Could not save. Try again.");
    }
    const stamp = data.brief?.savedAt || new Date().toLocaleString("en-GB", { hour12: false });
    setSavedAt(stamp);
    persist({ describe: body.describe, files: body.files, savedAt: stamp });
    if (data.brief) {
      setSavedBriefs((current) => {
        const rest = current.filter((row) => row.id !== data.brief?.id);
        return [data.brief, ...rest];
      });
    }
    return stamp;
  }

  async function onFiles(list: FileList | null) {
    setSaving(true);
    setNote(null);
    try {
      const next = await Promise.all(Array.from(list ?? []).map(fileToLead));
      setFiles(next);
      persist({ files: next });
      if (next.length) noteFeatureTrail("import");
      await saveToOwner({ files: next });
      setNote("Saved. Owner can open the brief and files. Empty board stays empty.");
    } catch (error) {
      setNote(error instanceof Error && error.message ? error.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function submitBrief() {
    const encoder = new TextEncoder();
    const body = `# ${title}\n\n${describe || "(no description)"}\n\nForms: ${files.map((file) => file.name).join(", ") || "none"}\n`;
    const zip = buildZip([
      { name: "brief.md", data: encoder.encode(body) },
      ...files.map((file) => ({ name: `forms/${file.name}`, data: leadToBytes(file) })),
    ]);
    const url = URL.createObjectURL(zip);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${kind}-brief.zip`;
    link.click();
    URL.revokeObjectURL(url);
    setNote("Submit brief downloaded brief.md plus forms. Mail is not sent.");
  }

  if (screen === "welcome") {
    return (
      <section className="plant-card px-5 py-5">
        <p className="font-mono text-[10px] tracking-[0.24em] text-amber-label">UNDER CONSTRUCTION</p>
        <h2 className="mt-2 font-display text-3xl tracking-wide">{title}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5b6f73]">
          You are the lead. This desk is empty on purpose — no invented board, no fake counts. Open
          it. Tell us how you work. Drop the forms you already carry. Save so the owner can see the
          brief.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {JOBS.map((job) => (
            <button
              key={job.id}
              type="button"
              onClick={() => setScreen(job.id)}
              className="rounded-lg border border-[#d5e0de] px-4 py-4 text-left"
            >
              <p className="font-semibold">{job.label}</p>
              <p className="mt-1 text-sm text-[#5b6f73]">{job.copy}</p>
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="plant-card px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] tracking-[0.24em] text-amber-label">UNDER CONSTRUCTION</p>
          <h2 className="mt-1 text-2xl font-semibold">{title}</h2>
        </div>
        <button type="button" onClick={() => setScreen("welcome")} className="text-sm underline">
          Replay welcome
        </button>
      </div>
      <nav className="mt-4 flex flex-wrap gap-2 text-sm">
        {JOBS.map((job) => (
          <button
            key={job.id}
            type="button"
            onClick={() => setScreen(job.id)}
            className={`rounded px-3 py-1.5 ${screen === job.id ? "bg-steel text-white" : "border border-steel text-steel"}`}
          >
            {job.label}
          </button>
        ))}
      </nav>
      <form onSubmit={onSave} className="mt-4 space-y-4">
        {screen === "describe" ? (
          <label className="block">
            <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">DESCRIBE THE DESK</span>
            <textarea
              value={describe}
              onChange={(event) => {
                setDescribe(event.target.value);
                persist({ describe: event.target.value });
              }}
              rows={6}
              className="paper-field mt-1"
              placeholder="What this lead needs on the empty board."
            />
          </label>
        ) : null}
        {screen === "forms" ? (
          <label className="block">
            <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">DROP FORMS</span>
            <p className="mt-1 text-sm text-[#5b6f73]">PDF, Excel, Word, or pictures.</p>
            <div
              className="paper-field mt-2"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void onFiles(event.dataTransfer.files);
              }}
            >
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.gif,.txt"
                className="w-full"
                disabled={saving}
                onChange={(event) => void onFiles(event.target.files)}
              />
            </div>
            {files.length ? <p className="mt-1 text-xs text-[#5b6f73]">{files.map((file) => file.name).join(" · ")}</p> : null}
            {saving ? <p className="mt-1 text-xs text-[#5b6f73]">Saving…</p> : null}
          </label>
        ) : null}
        {screen === "save" ? (
          <div className="space-y-3">
            <p className="text-sm text-[#5b6f73]">
              Save sends the brief and files so the owner can open them. Submit brief still downloads
              a zip (brief.md + forms). Mail is not sent.
            </p>
            <p className="text-sm">
              {describe ? describe : "No description yet."}
            </p>
            <p className="text-xs text-[#5b6f73]">
              {files.length ? files.map((file) => file.name).join(" · ") : "No forms yet."}
              {savedAt ? ` · Saved ${savedAt}` : ""}
            </p>
            {canSeeAll && savedBriefs.length ? (
              <div className="space-y-2 rounded-lg border border-[#d5e0de] px-3 py-3">
                <p className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">SAVED BRIEFS</p>
                {savedBriefs.map((brief) => (
                  <p key={brief.id} className="text-sm text-[#5b6f73]">
                    {brief.whoName}: {brief.describe || "No description yet."}
                    {brief.files.length ? ` · ${brief.files.map((file) => file.name).join(" · ")}` : ""}
                    {brief.savedAt ? ` · Saved ${brief.savedAt}` : ""}
                  </p>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={saving} className="rounded-lg bg-steel px-4 py-2 text-white disabled:opacity-60">
                {saving ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={submitBrief} className="rounded-lg border border-steel px-4 py-2 text-steel">
                Submit brief
              </button>
            </div>
          </div>
        ) : null}
      </form>
      {note ? <p className="mt-3 text-sm text-[#5b6f73]">{note}</p> : null}
    </section>
  );
}
