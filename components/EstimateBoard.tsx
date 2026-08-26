"use client";

import { useEffect, useMemo, useState } from "react";
import { CreatedBy } from "@/components/CreatedBy";
import { useConfirmRemove } from "@/components/ConfirmDialog";
import { EstimateCard } from "@/components/EstimateCard";
import { useEstimateModal } from "@/components/EstimateModalContext";
import { PresencePulse } from "@/components/PresencePulse";
import { useAlias, useLensUser } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import type { EstimateStatus } from "@/components/EstimateWorkspace";
import {
  archiveCopy,
  archivedCopies,
  deleteCopy,
  ensureSeatEstimates,
  restoreCopy,
  setCopyStatus,
  workingCopies,
  writeSeatEstimates,
  type SeatEstimate,
} from "@/lib/seat-estimates";
import type { EstimateRecord } from "@/lib/types";

function asRecord(row: SeatEstimate, ownerId: string): EstimateRecord {
  return {
    id: row.id,
    ownerId,
    siteId: row.siteId,
    code: row.code,
    title: row.title,
    client: row.client,
    unit: row.unit,
    type: row.type,
    status: row.status === "Close out" ? "HOLD" : "WORKING",
    window: row.window,
    labor: "",
    material: "",
    total: row.total,
    estimator: row.estimator,
    revision: row.revision,
  };
}

export function EstimateBoard() {
  const alias = useAlias();
  const { user } = useSession();
  const lens = useLensUser();
  const { openNewEstimate } = useEstimateModal();
  const confirmRemove = useConfirmRemove();
  const seatId = lens?.id || user?.id || "";
  const seatName = lens?.name || user?.name || "Owner";
  const [list, setList] = useState<SeatEstimate[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    if (!seatId) return;
    setList(ensureSeatEstimates(seatId, seatName));
  }, [seatId, seatName]);

  function persist(next: SeatEstimate[]) {
    setList(next);
    writeSeatEstimates(seatId, next);
  }

  const rows = showArchived ? archivedCopies(list) : workingCopies(list);
  const groups = useMemo(() => {
    const map = new Map<string, SeatEstimate[]>();
    for (const row of rows) {
      const who = row.estimator || seatName;
      const bucket = map.get(who) ?? [];
      bucket.push(row);
      map.set(who, bucket);
    }
    return [...map.entries()];
  }, [rows, seatName]);

  return (
    <div className="mt-4 space-y-5">
      <PresencePulse />
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => setShowArchived((on) => !on)}
          className="rounded-lg border border-steel px-4 py-2 text-steel"
        >
          {showArchived ? "Working list" : `Archived (${archivedCopies(list).length})`}
        </button>
        <button
          type="button"
          onClick={() => openNewEstimate()}
          className="rounded-lg bg-steel px-4 py-2 text-white"
        >
          + New estimate
        </button>
      </div>
      <p className="max-w-3xl text-sm leading-6 text-[#5b6f73]">
        Working estimates on this desk. {alias("Madison")} / {alias("P66")} figures stay with the signed-in
        blotter. Each seat has its own copies — delete here does not erase anyone else’s folder.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <article className="steel-plate paper-grain px-4 py-4">
          <p className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">WORKING</p>
          <p className="mt-1 font-display text-3xl text-amber-label">{workingCopies(list).length || "—"}</p>
        </article>
        <article className="steel-plate paper-grain px-4 py-4">
          <p className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">ARCHIVED</p>
          <p className="mt-1 font-display text-3xl text-amber-label">{archivedCopies(list).length || "—"}</p>
        </article>
        <article className="steel-plate paper-grain px-4 py-4">
          <p className="font-mono text-[10px] tracking-[0.2em] text-steel-glow">THIS SEAT</p>
          <p className="mt-1 font-display text-2xl text-amber-label">{seatName}</p>
        </article>
      </div>
      {groups.map(([who, group]) => (
        <section key={who}>
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h2 className="font-display text-xl font-semibold text-[#163038]">{who}</h2>
            <CreatedBy author={who} />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {group.map((row) => (
              <EstimateCard
                key={row.id}
                estimate={asRecord(row, seatId)}
                status={row.status}
                archived={row.archived}
                onStatus={(next: EstimateStatus) => persist(setCopyStatus(list, row.id, next))}
                onArchive={() => persist(archiveCopy(list, row.id))}
                onRestore={() => persist(restoreCopy(list, row.id))}
                onDelete={() => {
                  void (async () => {
                    if (
                      !(await confirmRemove(`${row.code} · ${row.title}`, {
                        title: "Delete this estimate?",
                        confirmLabel: "Delete",
                      }))
                    ) {
                      return;
                    }
                    persist(deleteCopy(list, row.id));
                  })();
                }}
              />
            ))}
          </div>
        </section>
      ))}
      {rows.length === 0 ? (
        <p className="text-sm text-[#5b6f73]">
          {showArchived ? "No archived estimates on this seat." : "No working estimates on this seat."}
        </p>
      ) : null}
    </div>
  );
}
