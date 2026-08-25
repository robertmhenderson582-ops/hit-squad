"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useDeskBoard } from "@/components/useDeskBoard";

export function NewEstimateForm() {
  const { board } = useDeskBoard();
  const [filed, setFiled] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [siteId, setSiteId] = useState("");
  const [type, setType] = useState("Hybrid");
  const [window, setWindow] = useState("");
  const [notes, setNotes] = useState("");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const stamp = new Date();
    const code = `EST-${stamp.getFullYear().toString().slice(2)}${String(stamp.getMonth() + 1).padStart(2, "0")}-${String(stamp.getDate()).padStart(2, "0")}`;
    setFiled(code);
  }

  if (filed) {
    return (
      <section className="steel-plate paper-grain mt-5 px-4 py-5">
        <p className="font-mono text-[10px] tracking-[0.22em] text-amber-label">FILED ON THIS DESK</p>
        <p className="mt-2 font-display text-2xl">{filed}</p>
        <p className="mt-2 text-sm text-paper-cream/80">
          Draft package opened for {title || "untitled work"}. Field trial does not push this to a
          client system. It stays on the owner blotter.
        </p>
        <Link href="/estimates" className="mt-4 inline-block text-amber-label underline underline-offset-4">
          Return to estimates
        </Link>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} className="steel-plate paper-grain mt-5 space-y-4 px-4 py-5">
      <p className="text-sm leading-6 text-paper-cream/80">
        Open a working package. Site list is owner-scoped. Nothing leaves this desk.
      </p>
      <label className="block">
        <span className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">PACKAGE TITLE</span>
        <input
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="steel-field mt-1 w-full px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">SITE</span>
        <select
          required
          value={siteId}
          onChange={(event) => setSiteId(event.target.value)}
          className="steel-field mt-1 w-full px-3 py-2"
        >
          <option value="">Select plant / pad</option>
          {(board?.sites ?? []).map((site) => (
            <option key={site.id} value={site.id}>
              {site.code} — {site.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">CONTRACT TYPE</span>
        <select value={type} onChange={(event) => setType(event.target.value)} className="steel-field mt-1 w-full px-3 py-2">
          <option>Hybrid</option>
          <option>T&M</option>
          <option>Lump sum</option>
        </select>
      </label>
      <label className="block">
        <span className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">OUTAGE / T&M WINDOW</span>
        <input
          value={window}
          onChange={(event) => setWindow(event.target.value)}
          className="steel-field mt-1 w-full px-3 py-2"
          placeholder="e.g. 12 Sep → 04 Oct 2026"
        />
      </label>
      <label className="block">
        <span className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">NOTES</span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="steel-field mt-1 min-h-24 w-full px-3 py-2"
        />
      </label>
      <button type="submit" className="bg-amber-flare px-4 py-2 font-display tracking-[0.18em] text-ink">
        OPEN PACKAGE
      </button>
    </form>
  );
}
