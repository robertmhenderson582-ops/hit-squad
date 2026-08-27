"use client";

import { useMemo, useState } from "react";
import { isOwner } from "@/lib/desk-role";
import {
  FRINGE_METHODS,
  FRINGE_METHOD_LABEL,
  compositeRates,
  newBuiltCraft,
  newFringeRow,
  type FringeMethod,
} from "@/lib/rate-builder";
import { saveCraftToLevel, type RateBookLevel } from "@/lib/rate-books";
import type { CompanyId } from "@/lib/companies";
import type { PublicUser } from "@/lib/types";
function money(amount: number) {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fieldClass() {
  return "w-full rounded border border-[#c5d4d4] bg-white px-2 py-1.5 text-sm text-[#163038]";
}

export function RateBuilderCard({
  companyId,
  companyName,
  siteId,
  siteName,
  bookLabel,
  jobs,
  initialJobId,
  initialJobTitle,
  user,
  alias,
  onSaved,
}: {
  companyId: CompanyId;
  companyName: string;
  siteId?: string;
  siteName?: string;
  bookLabel?: string;
  jobs: Array<{ id: string; title: string }>;
  initialJobId?: string;
  initialJobTitle?: string;
  user?: PublicUser | null;
  alias: (text: string) => string;
  onSaved: () => void;
}) {
  const owner = isOwner(user);
  const [craft, setCraft] = useState("");
  const [local, setLocal] = useState("");
  const [baseSt, setBaseSt] = useState("0");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [jobId, setJobId] = useState(initialJobId || jobs[0]?.id || "");
  const [note, setNote] = useState<string | null>(null);
  const [fringes, setFringes] = useState(() => [newFringeRow({ name: "H&W", method: "hour-worked" })]);

  const draft = useMemo(
    () =>
      newBuiltCraft({
        craft,
        local: local.trim() || undefined,
        baseSt: Number(baseSt) || 0,
        fringes,
      }),
    [baseSt, craft, fringes, local],
  );
  const readout = compositeRates(draft);
  const jobTitle = jobs.find((row) => row.id === jobId)?.title || initialJobTitle || jobId;

  function setFringe(id: string, patch: Partial<(typeof fringes)[number]>) {
    setFringes((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function save(level: RateBookLevel) {
    if (!craft.trim()) {
      setNote("Name the craft first.");
      return;
    }
    if (level !== "company" && !siteId) {
      setNote("Pick a site first.");
      return;
    }
    if (level === "job" && !jobId) {
      setNote("Pick a job for a job-only save.");
      return;
    }
    if (level === "company" && !owner) {
      setNote("Company default is owner-only.");
      return;
    }
    saveCraftToLevel({
      companyId,
      siteId,
      jobId: level === "job" ? jobId : undefined,
      jobTitle: level === "job" ? jobTitle : undefined,
      label: bookLabel,
      effectiveFrom: from,
      effectiveTo: to,
      craft: draft,
      level,
    });
    setNote(
      level === "job"
        ? `Saved ${craft} on this job only.`
        : level === "company"
          ? `Saved ${craft} as a company default.`
          : `Saved ${craft} to this site.`,
    );
    onSaved();
  }

  return (
    <section className="plant-card px-5 py-5">
      <h2 className="font-display text-2xl text-[#163038]">Rate builder</h2>
      <p className="mt-1 text-sm text-[#5b6f73]">
        One craft. Stack fringes the way the book pays them. Live ST / OT / DT updates as you type.
      </p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="font-mono text-[10px] tracking-[0.2em] text-[#5b6f73]">COMPANY</dt>
          <dd className="mt-1">{alias(companyName)}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] tracking-[0.2em] text-[#5b6f73]">SITE</dt>
          <dd className="mt-1">{siteName ? alias(siteName) : "No site yet"}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] tracking-[0.2em] text-[#5b6f73]">BOOK</dt>
          <dd className="mt-1">{bookLabel ? alias(bookLabel) : "Working book"}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] tracking-[0.2em] text-[#5b6f73]">EFFECTIVE</dt>
          <dd className="mt-1 flex gap-2">
            <input className={fieldClass()} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            <input className={fieldClass()} type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </dd>
        </div>
      </dl>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="font-mono text-[10px] tracking-[0.2em] text-[#5b6f73]">CRAFT</span>
          <input className={`${fieldClass()} mt-1`} value={craft} onChange={(event) => setCraft(event.target.value)} />
        </label>
        <label className="text-sm">
          <span className="font-mono text-[10px] tracking-[0.2em] text-[#5b6f73]">CBA / LOCAL</span>
          <input className={`${fieldClass()} mt-1`} value={local} onChange={(event) => setLocal(event.target.value)} />
        </label>
        <label className="text-sm">
          <span className="font-mono text-[10px] tracking-[0.2em] text-[#5b6f73]">BASE ST WAGE</span>
          <input
            className={`${fieldClass()} mt-1`}
            type="number"
            min="0"
            step="0.01"
            value={baseSt}
            onChange={(event) => setBaseSt(event.target.value)}
          />
        </label>
      </div>
      <div className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold tracking-[0.12em] text-[#5b6f73]">FRINGES</h3>
          <button
            type="button"
            className="rounded-lg border border-steel px-3 py-1.5 text-sm text-steel"
            onClick={() => setFringes((rows) => [...rows, newFringeRow()])}
          >
            Add fringe
          </button>
        </div>
        <ul className="mt-3 space-y-3">
          {fringes.map((row) => (
            <li key={row.id} className="grid gap-2 rounded-lg border border-[#d5e0de] px-3 py-3 sm:grid-cols-12">
              <label className="text-sm sm:col-span-3">
                <span className="font-mono text-[10px] tracking-[0.2em] text-[#5b6f73]">NAME</span>
                <input
                  className={`${fieldClass()} mt-1`}
                  value={row.name}
                  onChange={(event) => setFringe(row.id, { name: event.target.value })}
                />
              </label>
              <label className="text-sm sm:col-span-4">
                <span className="font-mono text-[10px] tracking-[0.2em] text-[#5b6f73]">METHOD</span>
                <select
                  className={`${fieldClass()} mt-1`}
                  value={row.method}
                  onChange={(event) => setFringe(row.id, { method: event.target.value as FringeMethod })}
                >
                  {FRINGE_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {FRINGE_METHOD_LABEL[method]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="font-mono text-[10px] tracking-[0.2em] text-[#5b6f73]">AMOUNT</span>
                <input
                  className={`${fieldClass()} mt-1`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.amount}
                  onChange={(event) => setFringe(row.id, { amount: Number(event.target.value) || 0 })}
                />
              </label>
              <label className="flex items-end gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={row.ridesOt}
                  onChange={(event) => setFringe(row.id, { ridesOt: event.target.checked })}
                />
                Rides OT
              </label>
              <div className="flex items-end sm:col-span-1">
                <button
                  type="button"
                  className="text-sm text-[#5b6f73] underline"
                  onClick={() => setFringes((rows) => rows.filter((item) => item.id !== row.id))}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="hud-readout mt-5 grid gap-3 rounded-lg border border-[#c5d4d4] px-4 py-3 sm:grid-cols-3">
        <div>
          <p className="font-mono text-[10px] tracking-[0.2em] text-[#5b6f73]">COMPOSITE ST</p>
          <p className="mt-1 font-mono text-xl">{money(readout.st)}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] tracking-[0.2em] text-[#5b6f73]">COMPOSITE OT</p>
          <p className="mt-1 font-mono text-xl">{money(readout.ot)}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] tracking-[0.2em] text-[#5b6f73]">COMPOSITE DT</p>
          <p className="mt-1 font-mono text-xl">{money(readout.dt)}</p>
        </div>
      </div>
      {jobs.length ? (
        <label className="mt-4 block text-sm">
          <span className="font-mono text-[10px] tracking-[0.2em] text-[#5b6f73]">JOB</span>
          <select className={`${fieldClass()} mt-1`} value={jobId} onChange={(event) => setJobId(event.target.value)}>
            <option value="">Pick a job</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {alias(job.title)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="rounded-lg bg-steel px-4 py-2 text-sm text-white" onClick={() => save("site")}>
          Save to this site
        </button>
        <button type="button" className="rounded-lg border border-steel px-4 py-2 text-sm text-steel" onClick={() => save("job")}>
          Save to this job only
        </button>
        {owner ? (
          <button type="button" className="rounded-lg border border-steel px-4 py-2 text-sm text-steel" onClick={() => save("company")}>
            Save as company default
          </button>
        ) : null}
      </div>
      {note ? <p className="mt-3 text-sm text-[#5b6f73]">{note}</p> : null}
    </section>
  );
}
