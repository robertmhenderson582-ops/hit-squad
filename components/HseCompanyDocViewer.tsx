"use client";

import { useEffect, useRef, useState } from "react";
import { ModalPortal } from "@/components/ModalPortal";
import { viewAsInit } from "@/lib/desk-scope";
import { leadToBytes } from "@/lib/lead-briefs";
import {
  pickHseCompanyDocZipMember,
  readHseCompanyDocZipMembers,
  type HseCompanyDocZipMember,
} from "@/lib/hse-company-doc-zip";
import {
  primaryHseCompanyDocFile,
  hseCompanyDocArchiveName,
  hseCompanyDocPreviewType,
  hseCompanyDocViewKind,
  hseCompanyDocViewPath,
  type HseCompanyDocId,
  type HseCompanyDocViewKind,
} from "@/lib/hse-company-docs";
import { HSE_UNVAULTED_MARK, type HseListedFile } from "@/lib/hse-vault-shared";

function bytesToObjectUrl(file: { name: string; type: string; data: string }) {
  const bytes = leadToBytes(file);
  const type = hseCompanyDocPreviewType(file);
  const blob = new Blob([bytes], { type });
  return URL.createObjectURL(blob);
}

export function HseCompanyDocViewer({
  open,
  title,
  home,
  docId,
  files,
  selectedName,
  viewAs,
  canRemove,
  lockedNote,
  onSelect,
  onRemove,
  onOpenForm,
  onClose,
}: {
  open: boolean;
  title: string;
  home: string;
  docId: HseCompanyDocId;
  files: HseListedFile[];
  selectedName: string | null;
  viewAs?: string | null;
  canRemove?: boolean;
  lockedNote?: string | null;
  onSelect: (name: string) => void;
  onRemove?: (name: string) => Promise<void>;
  onOpenForm?: (name: string) => void;
  onClose: () => void;
}) {
  const listed = files.filter((file) => file.name);
  const selected = listed.find((file) => file.name === selectedName) ?? primaryHseCompanyDocFile(listed);
  const [href, setHref] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [zipMembers, setZipMembers] = useState<HseCompanyDocZipMember[]>([]);
  const [zipMemberPath, setZipMemberPath] = useState<string | null>(null);
  const [memberFile, setMemberFile] = useState<{ name: string; type: string; data: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const zipCacheRef = useRef<{ name: string; type: string; data: string } | null>(null);
  const libraryKind: HseCompanyDocViewKind = selected
    ? hseCompanyDocViewKind({ name: selected.name, type: hseCompanyDocPreviewType(selected) })
    : "other";
  const kind = memberFile
    ? hseCompanyDocViewKind({ name: memberFile.name, type: hseCompanyDocPreviewType(memberFile) })
    : libraryKind;
  const previewName = memberFile?.name ?? selected?.name ?? "";

  useEffect(() => {
    setZipMemberPath(null);
    setMemberFile(null);
    setZipMembers([]);
    setConfirmRemove(null);
  }, [selectedName]);

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
        const cached = zipCacheRef.current;
        const reuseZip = hseCompanyDocViewKind(selected) === "zip" && cached?.name === selected.name && cached.data;
        if (!data && reuseZip && cached) {
          data = cached.data;
          type = cached.type || type;
        } else if (!data) {
          const response = await fetch(
            hseCompanyDocViewPath(home, docId, selected.name),
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
        if (hseCompanyDocViewKind(file) === "zip") {
          zipCacheRef.current = file;
          const bytes = leadToBytes(file);
          const members = await readHseCompanyDocZipMembers(bytes);
          if (cancelled) return;
          setZipMembers(members);
          if (zipMemberPath) {
            const member = await pickHseCompanyDocZipMember(bytes, zipMemberPath);
            if (!member) throw new Error("Could not open that file in the pack.");
            if (cancelled) return;
            setMemberFile(member);
            objectUrl = bytesToObjectUrl(member);
            if (hseCompanyDocViewKind({ name: member.name, type: hseCompanyDocPreviewType(member) }) === "text") {
              setText(new TextDecoder().decode(leadToBytes(member)));
            }
            setHref(objectUrl);
            return;
          }
          setMemberFile(null);
          objectUrl = bytesToObjectUrl(file);
          setHref(objectUrl);
          return;
        }
        zipCacheRef.current = null;
        setZipMembers([]);
        setMemberFile(null);
        objectUrl = bytesToObjectUrl(file);
        if (hseCompanyDocViewKind({ name: file.name, type: hseCompanyDocPreviewType(file) }) === "text") {
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
  }, [docId, home, open, selected?.data, selected?.name, selected?.type, viewAs, zipMemberPath]);

  function selectLibraryFile(name: string) {
    if (name !== selected?.name || hseCompanyDocViewKind({ name }) === "zip") {
      setZipMemberPath(null);
      setMemberFile(null);
    }
    setConfirmRemove(null);
    onSelect(name);
  }

  async function confirmAndRemove(name: string) {
    if (!onRemove || !canRemove) return;
    setRemoving(true);
    setNote(null);
    try {
      await onRemove(name);
      setConfirmRemove(null);
    } catch (error) {
      setNote(error instanceof Error && error.message ? error.message : "Could not remove that file.");
    } finally {
      setRemoving(false);
    }
  }

  if (!open) return null;

  return (
    <ModalPortal>
      <div
        className="modal-scrim"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hse-company-doc-library-title"
        id="hse-company-doc-library"
        onClick={onClose}
      >
        <div
          className="estimate-modal px-5 py-5"
          style={{ width: "min(52rem, 100%)" }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <h2 id="hse-company-doc-library-title" className="font-display text-2xl text-[#163038]">
              {title}
            </h2>
            <button type="button" className="estimate-modal-close px-3 py-1.5 text-sm" onClick={onClose}>
              Close
            </button>
          </div>
          <p className="mt-1 text-sm text-[#5b6f73]">
            {lockedNote
              ? lockedNote
              : canRemove
                ? "Blank templates stay here. Open form fills a copy. Drop on the bar to add. Remove a file, then confirm."
                : "Blank templates stay here. Open form fills a copy. Click a name to preview the blank."}
          </p>
          {confirmRemove ? (
            <div
              className="mt-3 rounded-sm border border-[#8a2a2a] bg-white px-3 py-3"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="hse-company-doc-remove-title"
              aria-describedby="hse-company-doc-remove-name"
            >
              <p id="hse-company-doc-remove-title" className="text-sm font-semibold text-[#163038]">
                Remove this file from {title}?
              </p>
              <p id="hse-company-doc-remove-name" className="mt-1 text-sm text-[#5b6f73]">
                {confirmRemove} leaves this library.
              </p>
              <div className="mt-3 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  className="rounded-sm border border-steel px-3 py-1.5 text-sm text-steel"
                  disabled={removing}
                  onClick={() => setConfirmRemove(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-sm bg-[#8a2a2a] px-3 py-1.5 text-sm text-white"
                  disabled={removing}
                  onClick={() => void confirmAndRemove(confirmRemove)}
                >
                  {removing ? "Removing…" : "Confirm remove"}
                </button>
              </div>
            </div>
          ) : null}
          <div className="mt-4 grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
            <ul className="space-y-1">
              {listed.length ? (
                listed.map((file) => {
                  const current = file.name === selected?.name;
                  return (
                    <li key={file.name}>
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          className={`min-w-0 flex-1 rounded-sm border px-3 py-2 text-left text-sm ${
                            current ? "border-steel bg-steel/10" : "border-steel"
                          }`}
                          aria-current={current && !zipMemberPath ? "true" : undefined}
                          onClick={() => selectLibraryFile(file.name)}
                        >
                          {file.name}
                          {hseCompanyDocArchiveName(file.name) ? (
                            <span className="ml-2 rounded-sm border border-steel px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#5b6f73]">
                              archive
                            </span>
                          ) : null}
                          {file.vaulted ? "" : ` · ${HSE_UNVAULTED_MARK}`}
                        </button>
                        {canRemove && !file.protected ? (
                          <button
                            type="button"
                            className="shrink-0 text-xs text-[#8a2a2a] underline"
                            disabled={removing}
                            aria-haspopup="dialog"
                            onClick={() => setConfirmRemove(file.name)}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                      {current && zipMembers.length ? (
                        <ul className="mt-1 ml-3 space-y-1" aria-label={`Files in ${file.name}`}>
                          {zipMembers.map((member) => {
                            const memberCurrent = member.path === zipMemberPath;
                            return (
                              <li key={member.path}>
                                <button
                                  type="button"
                                  className={`w-full rounded-sm border px-3 py-1.5 text-left text-sm ${
                                    memberCurrent ? "border-steel bg-steel/10" : "border-steel"
                                  }`}
                                  aria-current={memberCurrent ? "true" : undefined}
                                  onClick={() => setZipMemberPath(member.path)}
                                >
                                  {member.name}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </li>
                  );
                })
              ) : (
                <li className="text-sm text-[#5b6f73]">
                  {canRemove ? "Nothing in this bucket yet. Drop a file on the bar to add it." : "Nothing in this bucket yet."}
                </li>
              )}
            </ul>
            <div className="min-h-64 rounded-sm border border-steel bg-white px-3 py-3">
              {!selected ? (
                <p className="text-sm text-[#5b6f73]">Pick a file to bring it out.</p>
              ) : loading ? (
                <p className="text-sm">Opening {previewName}…</p>
              ) : note ? (
                <p className="text-sm text-[#8a2a2a]">{note}</p>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">
                      {memberFile ? `${selected.name} / ${memberFile.name}` : selected.name}
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      {canRemove && selected && !selected.protected && !memberFile ? (
                        <button
                          type="button"
                          className="text-sm text-[#8a2a2a] underline"
                          disabled={removing}
                          aria-haspopup="dialog"
                          onClick={() => setConfirmRemove(selected.name)}
                        >
                          Remove
                        </button>
                      ) : null}
                      {memberFile ? (
                        <button
                          type="button"
                          className="text-sm text-steel underline"
                          onClick={() => {
                            setZipMemberPath(null);
                            setMemberFile(null);
                          }}
                        >
                          Back to pack
                        </button>
                      ) : null}
                      {onOpenForm && selected && !memberFile ? (
                        <button
                          type="button"
                          className="text-sm text-steel underline"
                          onClick={() => onOpenForm(selected.name)}
                        >
                          Open form
                        </button>
                      ) : null}
                      {href ? (
                        <a
                          href={href}
                          download={previewName}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-steel underline"
                        >
                          {libraryKind === "zip" && !memberFile ? "Download pack" : "Download blank"}
                        </a>
                      ) : null}
                    </div>
                  </div>
                  {libraryKind === "zip" && !memberFile ? (
                    zipMembers.length ? (
                      <ul className="space-y-1" aria-label="Files in this pack">
                        {zipMembers.map((member) => (
                          <li key={member.path}>
                            <button
                              type="button"
                              className="w-full rounded-sm border border-steel px-3 py-2 text-left text-sm"
                              onClick={() => setZipMemberPath(member.path)}
                            >
                              {member.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-[#5b6f73]">This pack has no files to open here.</p>
                    )
                  ) : null}
                  {kind === "pdf" && href ? (
                    <iframe title={previewName} src={href} className="h-[28rem] w-full border-0" />
                  ) : null}
                  {kind === "image" && href ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={href} alt={previewName} className="max-h-[28rem] w-full object-contain" />
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
