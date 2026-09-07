"use client";

import { useAlias, useDeskLens } from "@/components/OwnerDeskContext";
import { useDeskBoard } from "@/components/useDeskBoard";
import { abidingDocumentsForScope, abidingDocumentsForSiteName, type AbidingDocument } from "@/lib/abiding-documents";
import { companyScopeFor } from "@/lib/companies";

function kindLabel(kind: AbidingDocument["kind"]) {
  if (kind === "pla") return "PLA";
  if (kind === "cba") return "CBA";
  if (kind === "msa") return "MSA / MLA";
  if (kind === "rate-sheet") return "Rate sheet";
  return "Folder";
}

export function AbidingDocumentsDesk({
  siteId,
  siteName,
  heading = "Abiding documents",
}: {
  siteId?: string;
  siteName?: string;
  heading?: string;
}) {
  const alias = useAlias();
  const { lens } = useDeskLens();
  const { companyId } = useDeskBoard();
  const scope = companyScopeFor(lens, companyId);
  const rows = siteId
    ? abidingDocumentsForScope(scope, siteId)
    : siteName
      ? abidingDocumentsForSiteName(siteName, scope)
      : abidingDocumentsForScope(scope);
  const title = siteName ? `${heading} · ${alias(siteName)}` : heading;

  if (!rows.length) {
    return (
      <section className="site-plate plant-card px-5 py-5">
        <h3 className="text-xl font-semibold text-[#163038]">{title}</h3>
        <p className="mt-2 text-sm text-[#5b6f73]">
          Contracts and agreements for this company stay in the vault. Nothing to open on this seat.
        </p>
      </section>
    );
  }

  return (
    <section className="site-plate plant-card px-5 py-5">
      <h3 className="text-xl font-semibold text-[#163038]">{title}</h3>
      <p className="mt-2 text-sm text-[#5b6f73]">
        PLA, CBA, and rate-sheet books stay in Drive. Open the live file — do not download a second
        copy onto this desk.
      </p>
      <ul className="mt-4 space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 border-t border-[#d5e0de] pt-3">
            <div>
              <p className="font-semibold text-[#163038]">{row.title}</p>
              <p className="mt-1 text-xs tracking-[0.14em] text-[#5b6f73]">
                {kindLabel(row.kind)} · {alias(row.siteName)}
              </p>
              <p className="mt-1 text-sm text-[#5b6f73]">{row.note}</p>
            </div>
            <a
              href={row.href}
              target="_blank"
              rel="noreferrer"
              className="job-action inline-flex shrink-0"
            >
              Open
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
