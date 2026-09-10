"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { FieldBlock } from "@/components/FieldMark";
import {
  RATE_VAULT_ACCEPT,
  RATE_VAULT_BUILDER_STEPS,
  RATE_VAULT_CBA_PLA_RULES,
  RATE_VAULT_CBA_PLA_SECTION,
  RATE_VAULT_CRAFT_DRAG,
  RATE_VAULT_KICKER,
  RATE_VAULT_OWNER_NOTE,
  RATE_VAULT_SCOPE_NOTE,
  RATE_VAULT_SITES,
  RATE_VAULT_SOURCE_DRAG,
  RATE_VAULT_SOURCE_KIND_LABEL,
  RATE_VAULT_SOURCE_KINDS,
  RATE_VAULT_STATE_LAW_RULES,
  RATE_VAULT_STATE_LAW_SECTION,
  RATE_VAULT_STATE_LAW_SITES,
  RATE_VAULT_TITLE,
  checkRateVaultDropFile,
  rateVaultHasFileDrag,
  rateVaultHasSourceDrag,
  rateVaultSiteLabel,
  reorderRateVaultItems,
  type RateVaultBuilderStepId,
  type RateVaultConfirmedReview,
  type RateVaultPublishStub,
  type RateVaultRecognitionReview,
  type RateVaultSheetSniff,
  type RateVaultSiteId,
  type RateVaultSourceEntry,
  type RateVaultSourceKind,
  type RateVaultWorkshop,
} from "@/lib/rate-vault";
import { filterRateVaultLibrary } from "@/lib/rate-vault-library";

function fileToPayload(file: File) {
  return new Promise<{ name: string; type: string; data: string }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const data = result.includes(",") ? result.slice(result.indexOf(",") + 1) : result;
      resolve({ name: file.name, type: file.type, data });
    };
    reader.onerror = () => reject(reader.error || new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

function kindLabel(kind: RateVaultSourceKind | "unknown") {
  return kind === "unknown" ? "Unknown" : RATE_VAULT_SOURCE_KIND_LABEL[kind];
}

function confidenceLabel(value: number) {
  return `${Math.round(value * 100)}%`;
}

function firstDroppedFile(list: FileList | File[] | null) {
  return Array.from(list ?? [])[0] ?? null;
}

function RateVaultFileDrop({
  label,
  note,
  ariaLabel,
  onFile,
  onSource,
  children,
}: {
  label: string;
  note: string;
  ariaLabel: string;
  onFile: (file: File) => void;
  onSource?: (sourceId: string) => void;
  children?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function takeFiles(list: FileList | File[] | null) {
    const file = firstDroppedFile(list);
    if (file) onFile(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div
      className={`rounded-lg border border-dashed px-4 py-6 ${over ? "border-steel bg-[#eef5f4]" : "border-[#d5e0de]"}`}
      onDragOver={(event) => {
        if (!rateVaultHasFileDrag(event.dataTransfer.types) && !rateVaultHasSourceDrag(event.dataTransfer.types)) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const sourceId = event.dataTransfer.getData(RATE_VAULT_SOURCE_DRAG);
        if (sourceId && onSource) {
          onSource(sourceId);
          return;
        }
        takeFiles(event.dataTransfer.files);
      }}
    >
      <p className="text-sm font-semibold text-[#163038]">{label}</p>
      <p className="mt-1 text-sm leading-6 text-[#5b6f73]">{note}</p>
      {children}
      <input
        ref={inputRef}
        type="file"
        accept={RATE_VAULT_ACCEPT}
        className="paper-field mt-3"
        aria-label={ariaLabel}
        onChange={(event) => takeFiles(event.target.files)}
      />
    </div>
  );
}

function RateVaultBucket({
  label,
  hint,
  onFile,
  onSource,
  children,
}: {
  label: string;
  hint: string;
  onFile: (file: File) => void;
  onSource: (sourceId: string) => void;
  children?: ReactNode;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`rounded-lg border border-dashed px-3 py-3 ${over ? "border-steel bg-[#eef5f4]" : "border-[#d5e0de]"}`}
      onDragOver={(event) => {
        if (!rateVaultHasFileDrag(event.dataTransfer.types) && !rateVaultHasSourceDrag(event.dataTransfer.types)) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const sourceId = event.dataTransfer.getData(RATE_VAULT_SOURCE_DRAG);
        if (sourceId) {
          onSource(sourceId);
          return;
        }
        const file = firstDroppedFile(event.dataTransfer.files);
        if (file) onFile(file);
      }}
    >
      <p className="text-sm font-semibold text-[#163038]">{label}</p>
      <p className="mt-1 text-xs text-[#5b6f73]">{hint}</p>
      {children}
    </div>
  );
}

export function RateVaultDesk() {
  const [workshop, setWorkshop] = useState<RateVaultWorkshop | null>(null);
  const [publish, setPublish] = useState<RateVaultPublishStub | null>(null);
  const [review, setReview] = useState<RateVaultRecognitionReview | null>(null);
  const [confirmed, setConfirmed] = useState<RateVaultConfirmedReview | null>(null);
  const [step, setStep] = useState<RateVaultBuilderStepId>("sources");
  const [siteId, setSiteId] = useState("");
  const [kind, setKind] = useState("");
  const [craft, setCraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/rate-vault", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as { workshop?: RateVaultWorkshop; error?: string };
        if (cancelled) return;
        if (!response.ok) {
          setError(data.error || "Rate Vault is owner-eyes-only.");
          return;
        }
        if (data.workshop) setWorkshop(data.workshop);
      })
      .catch(() => {
        if (!cancelled) setError("Could not reach Rate Vault.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function post(body: Record<string, unknown>) {
    setError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/rate-vault", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as {
        workshop?: RateVaultWorkshop;
        publish?: RateVaultPublishStub;
        review?: RateVaultRecognitionReview;
        confirmed?: RateVaultConfirmedReview;
        error?: string;
      };
      if (!response.ok) {
        setError(data.error || "Rate Vault is owner-eyes-only.");
        return null;
      }
      if (data.workshop) setWorkshop(data.workshop);
      if (data.publish) setPublish(data.publish);
      if (data.review) setReview(data.review);
      if (data.confirmed) setConfirmed(data.confirmed);
      return data;
    } catch {
      setError("Could not reach Rate Vault.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function recognizeFile(file: File, sourceId?: string) {
    const check = checkRateVaultDropFile({ name: file.name, type: file.type, bytes: file.size });
    if (!check.ok) {
      setError(check.error);
      return;
    }
    const payload = await fileToPayload(file);
    const data = await post({
      action: "recognize",
      fileName: payload.name,
      type: payload.type,
      data: payload.data,
      sourceId,
    });
    if (data?.review) {
      setStep("recognize");
      setNote("Review the guesses. Confirm before anything is cataloged — this does not write a rate book.");
    }
  }

  async function recognizeLinked(entry: RateVaultSourceEntry) {
    const data = await post({
      action: "recognize",
      fileName: entry.title,
      driveId: entry.driveId,
      sourceId: entry.id,
    });
    if (data?.review) {
      setStep("recognize");
      setNote("Guessed from the Drive title and path. Confirm or correct before mapping.");
    }
  }

  async function recognizeSourceId(sourceId: string) {
    const entry = (workshop?.library.entries ?? []).find((row) => row.id === sourceId);
    if (entry) await recognizeLinked(entry);
  }

  async function organizeSource(sourceId: string, bucket: { siteId?: string; kind?: string }) {
    const data = await post({
      action: "organize-source",
      sourceId,
      siteId: bucket.siteId,
      kind: bucket.kind,
    });
    if (data) setNote("Moved in the library. Metadata only — the Drive file did not move.");
  }

  const entries = workshop?.library.entries;
  const visible = useMemo(
    () => filterRateVaultLibrary(entries ?? [], { siteId, kind, craft, includeArchived: true }),
    [craft, entries, kind, siteId],
  );

  return (
    <div className="mt-4 space-y-5">
      <section className="plant-card px-5 py-5">
        <p className="text-xs tracking-[0.14em] text-[#5b6f73]">{RATE_VAULT_KICKER}</p>
        <h2 className="font-display text-3xl tracking-wide text-[#163038]">{RATE_VAULT_TITLE}</h2>
        <p className="mt-2 text-sm leading-6 text-[#5b6f73]">{RATE_VAULT_OWNER_NOTE}</p>
        <p className="mt-2 text-sm leading-6 text-[#5b6f73]">{RATE_VAULT_SCOPE_NOTE}</p>
        <p className="mt-2 text-sm leading-6 text-[#5b6f73]">
          Build a rate pack the way Exhibit B-1 does, with a clearer path: sources, recognize,
          map crafts, burden, then a publish preview. Drop PDF / Word / Excel on any step.
          Files stay on Drive — this catalog is ids and metadata only.
        </p>
        {error ? <p className="mt-3 text-sm text-[#163038]">{error}</p> : null}
        {note ? <p className="mt-3 text-sm text-[#163038]">{note}</p> : null}
      </section>

      <nav className="plant-card px-5 py-4" aria-label="B-1 Builder steps">
        <ol className="flex flex-wrap gap-2">
          {RATE_VAULT_BUILDER_STEPS.map((item, index) => {
            const active = item.id === step;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`rounded-lg px-3 py-2 text-left text-sm ${
                    active ? "bg-steel text-white" : "border border-[#d5e0de] text-[#163038]"
                  }`}
                  aria-current={active ? "step" : undefined}
                  onClick={() => setStep(item.id)}
                >
                  <span className="block text-xs tracking-[0.12em] opacity-80">{index + 1}</span>
                  {item.label}
                </button>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-sm leading-6 text-[#5b6f73]">
          {RATE_VAULT_BUILDER_STEPS.find((item) => item.id === step)?.note}
        </p>
        <div className="mt-4">
          <RateVaultFileDrop
            label="Drop a rate sheet on any Builder step"
            note="PDF, Word, or Excel. Same zone on Sources, Recognize, Map, Burden, and Publish. Binaries stay off git."
            ariaLabel="Rate Vault builder drop"
            onFile={(file) => void recognizeFile(file)}
            onSource={(sourceId) => void recognizeSourceId(sourceId)}
          />
        </div>
      </nav>

      {step === "sources" ? (
        <SourcesPane
          entries={visible}
          total={(entries ?? []).length}
          siteId={siteId}
          kind={kind}
          craft={craft}
          busy={busy}
          onSite={setSiteId}
          onKind={setKind}
          onCraft={setCraft}
          onRecognize={(entry) => void recognizeLinked(entry)}
          onDrop={(file) => void recognizeFile(file)}
          onOrganize={(sourceId, bucket) => void organizeSource(sourceId, bucket)}
          onAdd={async (payload) => {
            const data = await post({ action: "add-source", ...payload });
            if (data) setNote(`Linked ${payload.title}. File stays on Drive.`);
          }}
        />
      ) : null}

      {step === "recognize" ? (
        <RecognizePane
          review={review}
          confirmed={confirmed}
          busy={busy}
          onDrop={(file) => void recognizeFile(file)}
          onSource={(sourceId) => void recognizeSourceId(sourceId)}
          onConfirm={async (next) => {
            const data = await post({
              action: "confirm",
              sourceId: next.sourceId || review?.sourceId,
              driveId: next.sourceId,
              fileName: review?.fileName,
              review: next,
            });
            if (data?.confirmed) {
              setNote("Catalog updated. Recognition did not write a rate book.");
              setStep("map-crafts");
            }
          }}
        />
      ) : null}

      {step === "map-crafts" ? (
        <MapCraftsPane
          review={review}
          confirmed={confirmed}
          onDrop={(file) => void recognizeFile(file)}
          onSource={(sourceId) => void recognizeSourceId(sourceId)}
        />
      ) : null}

      {step === "burden" ? (
        <BurdenPane
          onDrop={(file) => void recognizeFile(file)}
          onSource={(sourceId) => void recognizeSourceId(sourceId)}
        />
      ) : null}

      {step === "publish" ? (
        <PublishPane
          publish={publish}
          busy={busy}
          onPublish={() => void post({ action: "publish" })}
          onDrop={(file) => void recognizeFile(file)}
          onSource={(sourceId) => void recognizeSourceId(sourceId)}
        />
      ) : null}
    </div>
  );
}

function SourceCard({ entry, busy, onRecognize }: { entry: RateVaultSourceEntry; busy: boolean; onRecognize: () => void }) {
  return (
    <li
      className="border-t border-[#d5e0de] pt-3"
      draggable
      onDragStart={(event: DragEvent<HTMLLIElement>) => {
        event.dataTransfer.setData(RATE_VAULT_SOURCE_DRAG, entry.id);
        event.dataTransfer.effectAllowed = "move";
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-[#163038]">{entry.title}</p>
          <p className="mt-1 text-xs tracking-[0.12em] text-[#5b6f73]">
            {kindLabel(entry.kind)}
            {entry.siteId ? ` · ${rateVaultSiteLabel(entry.siteId)}` : ""}
            {entry.craft ? ` · ${entry.craft}` : ""}
            {entry.local ? ` · L ${entry.local}` : ""}
            {entry.archived ? " · archived" : entry.primary ? " · primary" : ""}
            {entry.confirmed ? " · confirmed" : ""}
          </p>
          <p className="mt-1 text-sm text-[#5b6f73]">{entry.note}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={entry.href} target="_blank" rel="noreferrer" className="job-action inline-flex">
            Open Drive
          </a>
          <button type="button" className="job-action" disabled={busy} onClick={onRecognize}>
            Recognize
          </button>
        </div>
      </div>
    </li>
  );
}

function SourcesPane({
  entries,
  total,
  siteId,
  kind,
  craft,
  busy,
  onSite,
  onKind,
  onCraft,
  onRecognize,
  onDrop,
  onOrganize,
  onAdd,
}: {
  entries: RateVaultSourceEntry[];
  total: number;
  siteId: string;
  kind: string;
  craft: string;
  busy: boolean;
  onSite: (value: string) => void;
  onKind: (value: string) => void;
  onCraft: (value: string) => void;
  onRecognize: (entry: RateVaultSourceEntry) => void;
  onDrop: (file: File) => void;
  onOrganize: (sourceId: string, bucket: { siteId?: string; kind?: string }) => void;
  onAdd: (payload: {
    title: string;
    driveId: string;
    kind: string;
    siteId: string;
    craft: string;
    local: string;
    note: string;
    driveKind: string;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [driveId, setDriveId] = useState("");
  const [addKind, setAddKind] = useState<RateVaultSourceKind>("other");
  const [addSite, setAddSite] = useState("");
  const [addCraft, setAddCraft] = useState("");
  const [addLocal, setAddLocal] = useState("");
  const [addNote, setAddNote] = useState("");
  const [driveKind, setDriveKind] = useState<"file" | "folder">("file");
  const siteBuckets: Array<{ id: RateVaultSiteId | ""; label: string }> = [
    ...RATE_VAULT_SITES.map((site) => ({ id: site.id, label: site.label })),
    { id: "", label: "Unscoped" },
  ];

  return (
    <section className="plant-card px-5 py-5">
      <p className="text-xs tracking-[0.14em] text-[#5b6f73]">Source library</p>
      <h3 className="text-xl font-semibold text-[#163038]">Browse the vault catalog</h3>
      <p className="mt-2 text-sm leading-6 text-[#5b6f73]">
        {entries.length} shown · {total} indexed. Drag a book onto a site or kind bucket, or drop
        a file into the zone. Phillips 66 only — Wood River, Bayway, Rodeo, Ferndale, Billings,
        and East Coast COMP.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <FieldBlock label="Site">
          <select className="paper-field mt-1" value={siteId} onChange={(event) => onSite(event.target.value)}>
            <option value="">All sites</option>
            {RATE_VAULT_SITES.map((site) => (
              <option key={site.id} value={site.id}>
                {site.label}
              </option>
            ))}
          </select>
        </FieldBlock>
        <FieldBlock label="Kind">
          <select className="paper-field mt-1" value={kind} onChange={(event) => onKind(event.target.value)}>
            <option value="">All kinds</option>
            {RATE_VAULT_SOURCE_KINDS.map((id) => (
              <option key={id} value={id}>
                {RATE_VAULT_SOURCE_KIND_LABEL[id]}
              </option>
            ))}
          </select>
        </FieldBlock>
        <FieldBlock label="Craft / local">
          <input
            className="paper-field mt-1"
            value={craft}
            onChange={(event) => onCraft(event.target.value)}
            placeholder="PF, BM, 553…"
          />
        </FieldBlock>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {siteBuckets.map((bucket) => (
          <RateVaultBucket
            key={bucket.label}
            label={bucket.label}
            hint="Drop a file or drag a source here"
            onFile={onDrop}
            onSource={(sourceId) => onOrganize(sourceId, { siteId: bucket.id })}
          >
            <p className="mt-2 text-xs text-[#5b6f73]">
              {entries.filter((row) => (row.siteId || "") === bucket.id).length} in this bucket
            </p>
          </RateVaultBucket>
        ))}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3 lg:grid-cols-5">
        {RATE_VAULT_SOURCE_KINDS.map((id) => (
          <RateVaultBucket
            key={id}
            label={RATE_VAULT_SOURCE_KIND_LABEL[id]}
            hint="Kind bucket"
            onFile={onDrop}
            onSource={(sourceId) => onOrganize(sourceId, { kind: id })}
          />
        ))}
      </div>

      <ul className="mt-4 space-y-3">
        {entries.map((entry) => (
          <SourceCard key={entry.id} entry={entry} busy={busy} onRecognize={() => onRecognize(entry)} />
        ))}
      </ul>

      <div className="mt-6">
        <RateVaultFileDrop
          label="Drop PDF / Word / Excel into the source library"
          note="Recognition reads the file in this session. The binary is not saved to git or the catalog — link the Drive id if you want it to stay in the library."
          ariaLabel="Rate Vault source upload"
          onFile={onDrop}
          onSource={(sourceId) => {
            const entry = entries.find((row) => row.id === sourceId);
            if (entry) onRecognize(entry);
          }}
        />
      </div>

      <form
        className="mt-6 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void onAdd({
            title,
            driveId,
            kind: addKind,
            siteId: addSite,
            craft: addCraft,
            local: addLocal,
            note: addNote,
            driveKind,
          });
        }}
      >
        <h4 className="text-lg font-semibold text-[#163038]">Link another Drive source</h4>
        <div className="grid gap-3 md:grid-cols-2">
          <FieldBlock label="Title">
            <input className="paper-field mt-1" value={title} onChange={(event) => setTitle(event.target.value)} required />
          </FieldBlock>
          <FieldBlock label="Drive id">
            <input className="paper-field mt-1" value={driveId} onChange={(event) => setDriveId(event.target.value)} required />
          </FieldBlock>
          <FieldBlock label="Kind">
            <select className="paper-field mt-1" value={addKind} onChange={(event) => setAddKind(event.target.value as RateVaultSourceKind)}>
              {RATE_VAULT_SOURCE_KINDS.map((id) => (
                <option key={id} value={id}>
                  {RATE_VAULT_SOURCE_KIND_LABEL[id]}
                </option>
              ))}
            </select>
          </FieldBlock>
          <FieldBlock label="Site">
            <select className="paper-field mt-1" value={addSite} onChange={(event) => setAddSite(event.target.value)}>
              <option value="">Unscoped</option>
              {RATE_VAULT_SITES.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.label}
                </option>
              ))}
            </select>
          </FieldBlock>
          <FieldBlock label="Craft">
            <input className="paper-field mt-1" value={addCraft} onChange={(event) => setAddCraft(event.target.value)} />
          </FieldBlock>
          <FieldBlock label="Local">
            <input className="paper-field mt-1" value={addLocal} onChange={(event) => setAddLocal(event.target.value)} />
          </FieldBlock>
        </div>
        <FieldBlock label="Note">
          <input className="paper-field mt-1" value={addNote} onChange={(event) => setAddNote(event.target.value)} />
        </FieldBlock>
        <label className="flex items-center gap-2 text-sm text-[#163038]">
          <input
            type="checkbox"
            checked={driveKind === "folder"}
            onChange={(event) => setDriveKind(event.target.checked ? "folder" : "file")}
          />
          This id is a Drive folder
        </label>
        <button type="submit" className="rounded-lg bg-steel px-4 py-2 text-sm text-white" disabled={busy}>
          Add to library
        </button>
      </form>
    </section>
  );
}

function RecognizePane({
  review,
  confirmed,
  busy,
  onDrop,
  onSource,
  onConfirm,
}: {
  review: RateVaultRecognitionReview | null;
  confirmed: RateVaultConfirmedReview | null;
  busy: boolean;
  onDrop: (file: File) => void;
  onSource: (sourceId: string) => void;
  onConfirm: (next: {
    sourceId: string;
    kind: RateVaultSourceKind;
    siteId: string;
    craft: string;
    local: string;
  }) => Promise<void>;
}) {
  const [kind, setKind] = useState<RateVaultSourceKind | "unknown">(review?.guessedKind ?? "unknown");
  const [siteId, setSiteId] = useState(review?.guessedSiteId ?? "");
  const [craft, setCraft] = useState(review?.guessedCraft ?? "");
  const [local, setLocal] = useState(review?.guessedLocal ?? "");
  const [driveId, setDriveId] = useState(review?.sourceId?.startsWith("upload:") ? "" : review?.sourceId ?? "");

  useEffect(() => {
    setKind(review?.guessedKind ?? "unknown");
    setSiteId(review?.guessedSiteId ?? "");
    setCraft(review?.guessedCraft ?? "");
    setLocal(review?.guessedLocal ?? "");
    setDriveId(review?.sourceId?.startsWith("upload:") ? "" : review?.sourceId ?? "");
  }, [review]);

  return (
    <section className="plant-card px-5 py-5">
      <h3 className="text-xl font-semibold text-[#163038]">Recognize a rate sheet</h3>
      <p className="mt-2 text-sm leading-6 text-[#5b6f73]">
        Drop a file or a library card onto this pane. Guesses stay on the review card until you
        confirm.
      </p>
      <div className="mt-4">
        <RateVaultFileDrop
          label="Drop PDF / Word / Excel to recognize"
          note="Replace the current review by dropping another book. Nothing writes a rate book."
          ariaLabel="Recognize rate sheet"
          onFile={onDrop}
          onSource={onSource}
        />
      </div>
      {!review ? (
        <p className="mt-4 text-sm text-[#5b6f73]">No review card yet. Drop a sheet to start.</p>
      ) : (
        <div className="mt-6">
          <p className="text-xs tracking-[0.14em] text-[#5b6f73]">Review card</p>
          <h4 className="text-lg font-semibold text-[#163038]">{review.fileName}</h4>
          <p className="mt-2 text-sm leading-6 text-[#5b6f73]">{review.extractNote}</p>
          <p className="mt-2 text-sm text-[#163038]">
            Guess: {kindLabel(review.guessedKind)} · {rateVaultSiteLabel(review.guessedSiteId) || "site?"} ·{" "}
            {review.guessedCraft || "craft?"} · {review.guessedLocal ? `L ${review.guessedLocal}` : "local?"} ·{" "}
            confidence {confidenceLabel(review.confidence)}
          </p>
          <p className="mt-1 text-sm text-[#5b6f73]">Recognition does not write a rate book.</p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <FieldBlock label="Kind">
              <select
                className="paper-field mt-1"
                value={kind}
                onChange={(event) => setKind(event.target.value as RateVaultSourceKind)}
              >
                {RATE_VAULT_SOURCE_KINDS.map((id) => (
                  <option key={id} value={id}>
                    {RATE_VAULT_SOURCE_KIND_LABEL[id]}
                  </option>
                ))}
              </select>
            </FieldBlock>
            <FieldBlock label="Site">
              <select className="paper-field mt-1" value={siteId} onChange={(event) => setSiteId(event.target.value)}>
                <option value="">Unscoped</option>
                {RATE_VAULT_SITES.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.label}
                  </option>
                ))}
              </select>
            </FieldBlock>
            <FieldBlock label="Craft">
              <input className="paper-field mt-1" value={craft} onChange={(event) => setCraft(event.target.value)} />
            </FieldBlock>
            <FieldBlock label="Local">
              <input className="paper-field mt-1" value={local} onChange={(event) => setLocal(event.target.value)} />
            </FieldBlock>
            <FieldBlock label="Drive id">
              <input
                className="paper-field mt-1"
                value={driveId}
                onChange={(event) => setDriveId(event.target.value)}
                placeholder="Paste the Drive file id"
              />
            </FieldBlock>
          </div>

          {review.sheets.length ? (
            <ul className="mt-4 space-y-2 text-sm text-[#5b6f73]">
              {review.sheets.map((sheet) => (
                <li key={sheet.name}>
                  <span className="font-semibold text-[#163038]">{sheet.name}</span>
                  {sheet.headerRow ? ` · header row ${sheet.headerRow}` : ""}
                  {sheet.columns.length
                    ? ` · ${sheet.columns.map((column) => `${column.header || "—"} (${column.role})`).join(", ")}`
                    : ""}
                </li>
              ))}
            </ul>
          ) : null}

          {review.snippets.length ? (
            <div className="mt-4 space-y-1 text-sm text-[#5b6f73]">
              {review.snippets.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            className="mt-4 rounded-lg bg-steel px-4 py-2 text-sm text-white"
            disabled={busy || kind === "unknown"}
            onClick={() =>
              void onConfirm({
                sourceId: driveId.trim() || review.sourceId || "",
                kind: kind === "unknown" ? "other" : kind,
                siteId,
                craft,
                local,
              })
            }
          >
            Confirm into library
          </button>
          {confirmed ? (
            <p className="mt-3 text-sm text-[#163038]">
              Confirmed {kindLabel(confirmed.kind)} — still not a published rate book.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function MapCraftsPane({
  review,
  confirmed,
  onDrop,
  onSource,
}: {
  review: RateVaultRecognitionReview | null;
  confirmed: RateVaultConfirmedReview | null;
  onDrop: (file: File) => void;
  onSource: (sourceId: string) => void;
}) {
  const [rows, setRows] = useState<Array<{ id: string; header: string; role: RateVaultSheetSniff["columns"][number]["role"] }>>([]);
  const dragFrom = useRef<number | null>(null);

  useEffect(() => {
    setRows(
      review?.sheets.flatMap((sheet, sheetIndex) =>
        sheet.columns.map((column, index) => ({
          id: `${sheet.name}-${sheetIndex}-${index}`,
          header: column.header,
          role: column.role,
        })),
      ) ?? [],
    );
  }, [review]);

  return (
    <section className="plant-card px-5 py-5">
      <h3 className="text-xl font-semibold text-[#163038]">Map crafts</h3>
      <p className="mt-2 text-sm leading-6 text-[#5b6f73]">
        Column paths differ by hall, contractor, and client book. Drag rows to order crafts.
        Drop another sheet to re-sniff.
      </p>
      <div className="mt-4">
        <RateVaultFileDrop
          label="Drop a workbook to map crafts"
          note="Excel headers are sniffed — layouts are not universal. Confirm recognition before these guesses feed a pack."
          ariaLabel="Map crafts upload"
          onFile={onDrop}
          onSource={onSource}
        />
      </div>
      {!confirmed ? (
        <p className="mt-3 text-sm text-[#163038]">Confirm the review card first. Mapping will not auto-fill live estimates.</p>
      ) : (
        <p className="mt-3 text-sm text-[#163038]">
          Using {kindLabel(confirmed.kind)}
          {confirmed.craft ? ` · ${confirmed.craft}` : ""}
          {confirmed.local ? ` · L ${confirmed.local}` : ""}.
        </p>
      )}
      {rows.length ? (
        <ul className="mt-4 space-y-1 text-sm text-[#5b6f73]">
          {rows.map((column, index) => (
            <li
              key={column.id}
              draggable
              className="cursor-grab border-t border-[#d5e0de] py-2"
              onDragStart={(event) => {
                dragFrom.current = index;
                event.dataTransfer.setData(RATE_VAULT_CRAFT_DRAG, String(index));
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                const from = Number(event.dataTransfer.getData(RATE_VAULT_CRAFT_DRAG) || dragFrom.current);
                setRows((current) => reorderRateVaultItems(current, from, index));
                dragFrom.current = null;
              }}
            >
              {column.header || "Untitled column"} — {column.role}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-[#5b6f73]">No header sniff yet. Drop an Excel sheet to see craft / wage / fringe columns.</p>
      )}
    </section>
  );
}

function BurdenPane({
  onDrop,
  onSource,
}: {
  onDrop: (file: File) => void;
  onSource: (sourceId: string) => void;
}) {
  return (
    <div className="space-y-5">
      <section className="plant-card px-5 py-5">
        <p className="text-xs tracking-[0.14em] text-[#5b6f73]">{RATE_VAULT_CBA_PLA_SECTION.title}</p>
        <h3 className="text-xl font-semibold text-[#163038]">{RATE_VAULT_CBA_PLA_SECTION.label}</h3>
        <p className="mt-2 text-sm leading-6 text-[#5b6f73]">{RATE_VAULT_CBA_PLA_SECTION.note}</p>
        <div className="mt-4 space-y-3">
          <RateVaultFileDrop
            label="Drop a CBA or PLA"
            note="Same drag-and-drop as Quality folders. Capture into OT / fringe math is still incremental. File stays off git."
            ariaLabel="CBA / PLA upload stub"
            onFile={onDrop}
            onSource={onSource}
          />
          <p className="text-sm text-[#5b6f73]">Vault is empty. No CBA / PLA captures yet.</p>
          <ul className="space-y-1 text-sm text-[#5b6f73]">
            {RATE_VAULT_CBA_PLA_RULES.map((rule) => (
              <li key={rule.id}>{rule.label} — not captured</li>
            ))}
          </ul>
        </div>
      </section>
      <section className="plant-card px-5 py-5">
        <p className="text-xs tracking-[0.14em] text-[#5b6f73]">{RATE_VAULT_STATE_LAW_SECTION.title}</p>
        <h3 className="text-xl font-semibold text-[#163038]">{RATE_VAULT_STATE_LAW_SECTION.label}</h3>
        <p className="mt-2 text-sm leading-6 text-[#5b6f73]">{RATE_VAULT_STATE_LAW_SECTION.note}</p>
        <div className="mt-4">
          <RateVaultFileDrop
            label="Drop a state-law or wage notice"
            note="Illinois, California, New Jersey, and Montana sit beside CBA/PLA. Drop here to recognize — not a silent overwrite."
            ariaLabel="State law upload"
            onFile={onDrop}
            onSource={onSource}
          />
        </div>
        <p className="mt-3 text-sm text-[#5b6f73]">Vault is empty. No state-law captures yet.</p>
        <ul className="mt-3 space-y-1 text-sm text-[#5b6f73]">
          {RATE_VAULT_STATE_LAW_SITES.map((row) => (
            <li key={`${row.site}-${row.state}`}>
              {row.site} — {row.state}
            </li>
          ))}
        </ul>
        <ul className="mt-3 space-y-1 text-sm text-[#5b6f73]">
          {RATE_VAULT_STATE_LAW_RULES.map((rule) => (
            <li key={rule.id}>{rule.label} — not captured</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function PublishPane({
  publish,
  busy,
  onPublish,
  onDrop,
  onSource,
}: {
  publish: RateVaultPublishStub | null;
  busy: boolean;
  onPublish: () => void;
  onDrop: (file: File) => void;
  onSource: (sourceId: string) => void;
}) {
  return (
    <section className="plant-card px-5 py-5">
      <h3 className="text-xl font-semibold text-[#163038]">Publish preview</h3>
      <p className="mt-2 text-sm leading-6 text-[#5b6f73]">
        Publish is a stub. Live Rate Tables stay on Jobs / Rates. Drop a B-1 or builder book to
        recognize it against this preview — it will not publish itself.
      </p>
      <div className="mt-4">
        <RateVaultFileDrop
          label="Drop a B-1 or rate pack for preview"
          note="Recognition only. Publish stub does not write live Rate Tables."
          ariaLabel="Publish preview upload"
          onFile={onDrop}
          onSource={onSource}
        />
      </div>
      <button
        type="button"
        className="mt-4 rounded-lg bg-steel px-4 py-2 text-sm text-white"
        disabled={busy}
        onClick={onPublish}
      >
        Publish stub
      </button>
      {publish ? <p className="mt-3 text-sm text-[#163038]">{publish.note}</p> : null}
    </section>
  );
}
