"use client";

import { FieldBlock } from "@/components/FieldMark";
import {
  applyScopeClient,
  applyScopeJob,
  applyScopeSite,
  type JobScopeClient,
  type JobScopeJob,
  type JobScopePick,
  type JobScopeSite,
} from "@/lib/quality-hse-scope";

export function JobScopePicks({
  clients,
  sites,
  jobs,
  pick,
  onChange,
  alias,
}: {
  clients: JobScopeClient[];
  sites: JobScopeSite[];
  jobs: JobScopeJob[];
  pick: JobScopePick;
  onChange: (next: JobScopePick) => void;
  alias: (label: string) => string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <FieldBlock label="Client">
        <select
          value={pick.clientId}
          onChange={(event) => onChange(applyScopeClient(pick, event.target.value))}
          className="paper-field mt-1"
        >
          <option value="">Select client</option>
          {clients.map((item) => (
            <option key={item.id} value={item.id}>
              {alias(item.name)}
            </option>
          ))}
        </select>
      </FieldBlock>
      <FieldBlock label="Site">
        <select
          value={pick.siteId}
          onChange={(event) => onChange(applyScopeSite(pick, event.target.value))}
          disabled={!pick.clientId}
          className="paper-field mt-1"
        >
          <option value="">{pick.clientId ? "Select site" : "Pick a client first"}</option>
          {sites.map((item) => (
            <option key={item.id} value={item.id}>
              {alias(item.name)}
            </option>
          ))}
        </select>
      </FieldBlock>
      <FieldBlock label="Job">
        <select
          value={pick.jobId}
          onChange={(event) => onChange(applyScopeJob(pick, event.target.value))}
          disabled={!pick.siteId}
          className="paper-field mt-1"
        >
          <option value="">
            {!pick.siteId ? "Pick a site first" : jobs.length ? "Select job" : "No jobs on this site yet"}
          </option>
          {jobs.map((item) => (
            <option key={item.id} value={item.id}>
              {alias(item.title || item.code)}
            </option>
          ))}
        </select>
      </FieldBlock>
    </div>
  );
}

export function PickJobEmpty({ kind }: { kind: "quality" | "hse" }) {
  return (
    <section className="plant-card px-4 py-4">
      <h2 className="font-display text-xl">Pick a job</h2>
      <p className="mt-2 text-sm">
        {kind === "quality"
          ? "Client, then site, then the job — same as Jobs. The board and logs stay on that job. They do not mix with another job on this client."
          : "Client, then site, then the job — same as Jobs. Talks, permits, and the Day-1 package stay on that job. They do not mix with another job on this client."}
      </p>
    </section>
  );
}
