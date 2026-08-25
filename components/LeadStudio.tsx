"use client";

import { FormEvent, useState } from "react";

export function LeadStudio({ title }: { title: string }) {
  const [describe, setDescribe] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [saved, setSaved] = useState<string | null>(null);

  function onSave(event: FormEvent) {
    event.preventDefault();
    setSaved("Saved on this desk. Empty chrome — no board.");
  }

  function submitBrief() {
    const body = `${title}\n\n${describe || "(no description)"}\n\nForms: ${files.join(", ") || "none"}\n`;
    const blob = new Blob([body], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.toLowerCase().replace(/\s+/g, "-")}-brief.zip`;
    link.click();
    URL.revokeObjectURL(url);
    setSaved("Submit brief downloaded a zip stub. Mail is not sent.");
  }

  return (
    <section className="plant-card mt-5 px-5 py-5">
      <h2 className="text-2xl font-semibold text-[#163038]">{title}</h2>
      <p className="mt-2 text-sm text-[#5b6f73]">Empty chrome. Lead studio only — no filled board.</p>
      <form onSubmit={onSave} className="mt-4 space-y-4">
        <label className="block">
          <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">DESCRIBE</span>
          <textarea
            value={describe}
            onChange={(event) => setDescribe(event.target.value)}
            rows={5}
            className="paper-field mt-1"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">DROP FORMS</span>
          <input
            type="file"
            multiple
            className="paper-field mt-1"
            onChange={(event) =>
              setFiles(Array.from(event.target.files ?? []).map((file) => file.name))
            }
          />
          {files.length ? <p className="mt-1 text-xs text-[#5b6f73]">{files.join(" · ")}</p> : null}
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="rounded-lg bg-steel px-4 py-2 text-white">
            Save
          </button>
          <button type="button" onClick={submitBrief} className="rounded-lg border border-steel px-4 py-2 text-steel">
            Submit brief
          </button>
        </div>
      </form>
      {saved ? <p className="mt-3 text-sm text-[#5b6f73]">{saved}</p> : null}
    </section>
  );
}
