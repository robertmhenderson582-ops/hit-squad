"use client";

import Link from "next/link";
import { useAlias } from "@/components/OwnerDeskContext";
import { StatusStamp } from "@/components/StatusStamp";
import { ESTIMATE_STATUSES, type EstimateStatus } from "@/components/EstimateWorkspace";
import { estimateHref } from "@/lib/estimate-open";
import type { EstimateRecord } from "@/lib/types";

export function EstimateCard({
  estimate,
  status,
  archived = false,
  onStatus,
  onArchive,
  onRestore,
  onDelete,
}: {
  estimate: EstimateRecord;
  status?: EstimateStatus | string;
  archived?: boolean;
  onStatus?: (next: EstimateStatus) => void;
  onArchive?: () => void;
  onRestore?: () => void;
  onDelete?: () => void;
}) {
  const alias = useAlias();
  const stamp = status || estimate.status;

  return (
    <article className="estimate-card plant-card relative z-[1] px-5 py-5" data-estimate-id={estimate.id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Link href={estimateHref(estimate.id)} className="font-mono text-xs text-steel" title={`Open ${estimate.code}`}>
          {estimate.code}
        </Link>
        <StatusStamp value={stamp} />
      </div>
      <Link href={estimateHref(estimate.id)} className="mt-2 block" title={`Open ${estimate.code}`}>
        <h3 className="font-display text-2xl font-semibold text-[#163038]">{estimate.title}</h3>
        <p className="mt-1 text-sm text-[#5b6f73]">
          {alias(estimate.client)} · {alias(estimate.unit)} · {estimate.type}
        </p>
        <p className="mt-3 font-mono text-xs text-[#5b6f73]">
          {estimate.window} · {estimate.total} · Rev {estimate.revision}
        </p>
      </Link>
      {onStatus || onArchive || onDelete || onRestore ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {onStatus ? (
            <label className="text-xs text-[#5b6f73]">
              Status
              <select
                value={typeof status === "string" ? status : "Estimate"}
                onChange={(event) => onStatus(event.target.value as EstimateStatus)}
                className="paper-field mt-1 min-w-36"
              >
                {ESTIMATE_STATUSES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {archived && onRestore ? (
            <button type="button" onClick={onRestore} className="rounded-lg border border-steel px-3 py-1.5 text-sm text-steel">
              Restore
            </button>
          ) : null}
          {!archived && onArchive ? (
            <button type="button" onClick={onArchive} className="rounded-lg border border-steel px-3 py-1.5 text-sm text-steel">
              Archive
            </button>
          ) : null}
          {onDelete ? (
            <button type="button" onClick={onDelete} className="rounded-lg border border-[#b74120] px-3 py-1.5 text-sm text-[#b74120]">
              Delete
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
