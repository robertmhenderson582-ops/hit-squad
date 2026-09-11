"use client";

import { useEffect, useState } from "react";
import { ModalPortal } from "@/components/ModalPortal";
import { viewAsInit } from "@/lib/desk-scope";
import { leadToBytes } from "@/lib/lead-briefs";
import {
  primaryQualityCompanyDocFile,
  qualityCompanyDocViewKind,
  qualityCompanyDocViewPath,
  type QualityCompanyDocId,
} from "@/lib/quality-company-docs";
import { QUALITY_UNVAULTED_MARK, type QualityListedFile } from "@/lib/quality-vault-shared";

function bytesToObjectUrl(file: { name: string; type: string; data: string }) {
  const bytes = leadToBytes(file);
  const blob = new Blob([bytes], { type: file.type || "application/octet-stream" });
  return URL.createObjectURL(blob);
}

export function QualityCompanyDocViewer({
  open,
  title,
  home,
  docId,
  files,
  selectedName,
  viewAs,
  onSelect,
  onClose,
}: {
  open: boolean;
  title: string;
  home: string;
  docId: QualityCompanyDocId;
  files: QualityListedFile[];
  selectedName: string | null;
  viewAs?: string | null;
  onSelect: (name: string) => void;
  onClose: () => void;
}) {
  const listed = files.filter((file) => file.name);
  const selected = listed.find((file) => file.name === selectedName) ?? primaryQualityCompanyDocFile(listed);
  const [href, setHref] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const kind = selected ? qualityCompanyDocViewKind(selected) : "other";

  useEffect(() => {
    if (!open || !selected) {
      setHref(null);
      setText(null);
      setNote(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setNote(null);
    setText(null);
    setHref(null);

    void (async () => {
      try {
        let data = selected.data || "";
        let type = selected.type || "application/octet-stream";
        if (!data) {
          const response = await fetch(
            qualityCompanyDocViewPath(home, docId, selected.name),
            viewAsInit(viewAs),
          );
          const payload = (await response.json().catch(() => ({}))) as {
            file?: { name?: string; type?: string; data?: string };
            error?: string;
          };
          if (!response.ok || !payload.file?.data) {
            throw new Error(typeof payload.error === "string" && payload.error ? payload.error : "Could not open that file.");
          }
          data = payload.file.data;
          type = payload.file.type || type;
        }
        if (cancelled) return;
        const file = { name: selected.name, type, data };
        objectUrl = bytesToObjectUrl(file);
        if (qualityCompanyDocViewKind(file) === "text") {
          setText(new TextDecoder().decode(leadToBytes(file)));
        }
        setHref(objectUrl);
      } catch (error) {
        if (!cancelled) {
          setNote(error instanceof Error && error.message ? error.message : "Could not open that file.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [docId, home, open, selected?.data, selected?.name, selected?.type, viewAs]);

  if (!open) return null;

  return (
    <ModalPortal>
      <div
        className="modal-scrim"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quality-company-doc-library-title"
        id="quality-company-doc-library"
        onClick={onClose}
      >
        <div
          className="estimate-modal px-5 py-5"
          style={{ width: "min(52rem, 100%)" }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <h2 id="quality-company-doc-library-title" className="font-display text-2xl text-[#163038]">
              {title}
            </h2>
            <button type="button" className="estimate-modal-close px-3 py-1.5 text-sm" onClick={onClose}>
              Close
            </button>
          </div>
          <p className="mt-1 text-sm text-[#5b6f73]">
            Madison company files. Drop on the bar to add. Click a name to open it.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
            <ul className="space-y-1">
              {listed.length ? (
                listed.map((file) => {
                  const current = file.name === selected?.name;
                  return (
                    <li key={file.name}>
                      <button
                        type="button"
                        className={`w-full rounded-sm border px-3 py-2 text-left text-sm ${
                          current ? "border-steel bg-steel/10" : "border-steel"
                        }`}
                        aria-current={current ? "true" : undefined}
                        onClick={() => onSelect(file.name)}
                      >
                        {file.name}
                        {file.vaulted ? "" : ` · ${QUALITY_UNVAULTED_MARK}`}
                      </button>
                    </li>
                  );
                })
              ) : (
                <li className="text-sm text-[#5b6f73]">Nothing in this bucket yet. Drop a file on the bar to add it.</li>
              )}
            </ul>
            <div className="min-h-64 rounded-sm border border-steel bg-white px-3 py-3">
              {!selected ? (
                <p className="text-sm text-[#5b6f73]">Pick a file to bring it out.</p>
              ) : loading ? (
                <p className="text-sm">Opening {selected.name}…</p>
              ) : note ? (
                <p className="text-sm text-[#8a2a2a]">{note}</p>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{selected.name}</p>
                    {href ? (
                      <a
                        href={href}
                        download={selected.name}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-steel underline"
                      >
                        Open / download
                      </a>
                    ) : null}
                  </div>
                  {kind === "pdf" && href ? (
                    <iframe title={selected.name} src={href} className="h-[28rem] w-full border-0" />
                  ) : null}
                  {kind === "image" && href ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={href} alt={selected.name} className="max-h-[28rem] w-full object-contain" />
                  ) : null}
                  {kind === "text" && text != null ? (
                    <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap text-sm">{text}</pre>
                  ) : null}
                  {(kind === "office" || kind === "other") && href ? (
                    <p className="text-sm text-[#5b6f73]">
                      This file opens in a new tab or downloads. The desk does not preview every office type in place.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
