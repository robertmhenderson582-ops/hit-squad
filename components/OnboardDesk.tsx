"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useLensUser, useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { viewAsInit } from "@/lib/desk-scope";
import {
  DEFAULT_ONBOARD_PLANT,
  ONBOARD_CLASSIFICATIONS,
  ONBOARD_LOCALS,
  ONBOARD_STAGES,
  TOM_FRIED_NAME,
  defaultCraftForLocal,
  hallLocalForSeat,
  nextOnboardStage,
  onboardLocal,
  onboardStage,
  peopleByStage,
  type OnboardLocalId,
  type OnboardPerson,
} from "@/lib/onboard-pipeline";

type BoardPayload = {
  people?: OnboardPerson[];
  canRegister?: boolean;
  canAdvance?: boolean;
  error?: string;
  stored?: boolean;
  store?: string;
};

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function localLabel(id: OnboardLocalId) {
  const local = onboardLocal(id);
  return `${local.label} · ${local.short}`;
}

export function OnboardDesk() {
  const { user } = useSession();
  const lens = useLensUser();
  const owner = useOwnerDesk();
  const actor = lens ?? user;
  const lockedLocal = hallLocalForSeat(actor);

  const [people, setPeople] = useState<OnboardPerson[]>([]);
  const [canRegister, setCanRegister] = useState(true);
  const [canAdvance, setCanAdvance] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [blockId, setBlockId] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState("");

  const [name, setName] = useState("");
  const [localId, setLocalId] = useState<OnboardLocalId>(lockedLocal || "553");
  const [craft, setCraft] = useState<string>(defaultCraftForLocal(lockedLocal || "553"));
  const [classification, setClassification] = useState("Journeyman");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [referredFor, setReferredFor] = useState("");

  useEffect(() => {
    if (!lockedLocal) return;
    setLocalId(lockedLocal);
    setCraft(defaultCraftForLocal(lockedLocal));
  }, [lockedLocal]);

  function applyBoard(data: BoardPayload) {
    if (Array.isArray(data.people)) setPeople(data.people);
    if (typeof data.canRegister === "boolean") setCanRegister(data.canRegister);
    if (typeof data.canAdvance === "boolean") setCanAdvance(data.canAdvance);
    if (data.error) {
      setError(data.error);
      return false;
    }
    if (data.stored === false) {
      setError("Saved on this desk only — Drive did not confirm.");
    }
    return true;
  }

  const loadBoard = useCallback(async () => {
    setError(null);
    const response = await fetch("/api/desk/onboard", viewAsInit(owner?.viewAs));
    const data = (await response.json().catch(() => ({}))) as BoardPayload;
    if (!response.ok) {
      setError(data.error || "Could not load the onboarding board.");
      setLoading(false);
      return;
    }
    applyBoard(data);
    setLoading(false);
  }, [owner?.viewAs]);

  useEffect(() => {
    void loadBoard();
  }, [actor?.email, loadBoard]);

  const columns = useMemo(() => peopleByStage(people), [people]);

  function changeLocal(next: OnboardLocalId) {
    if (lockedLocal) return;
    setLocalId(next);
    setCraft(defaultCraftForLocal(next));
  }

  async function onRegister(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNote(null);
    const response = await fetch(
      "/api/desk/onboard",
      viewAsInit(owner?.viewAs, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register",
          name,
          localId,
          craft,
          classification,
          phone,
          email,
          referredFor,
        }),
      }),
    );
    const data = (await response.json().catch(() => ({}))) as BoardPayload & { person?: OnboardPerson };
    setSaving(false);
    if (!response.ok) {
      setError(data.error || "Could not register that person.");
      return;
    }
    applyBoard(data);
    if (data.person) setOpenId(data.person.id);
    setName("");
    setPhone("");
    setEmail("");
    setReferredFor("");
    setNote(`Registered ${data.person?.name || "person"} at ${localLabel(localId)}.`);
  }

  async function postStage(action: "advance" | "block" | "reopen", person: OnboardPerson, extra: Record<string, string> = {}) {
    setSaving(true);
    setError(null);
    setNote(null);
    const response = await fetch(
      "/api/desk/onboard",
      viewAsInit(owner?.viewAs, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id: person.id, ...extra }),
      }),
    );
    const data = (await response.json().catch(() => ({}))) as BoardPayload & { person?: OnboardPerson };
    setSaving(false);
    if (!response.ok) {
      setError(data.error || "Could not update that stage.");
      return;
    }
    applyBoard(data);
    if (data.person) {
      setOpenId(data.person.id);
      const from = extra.note ? ` — ${extra.note}` : "";
      setNote(`${data.person.name}: ${onboardStage(person.stage).label} → ${onboardStage(data.person.stage).label}${from}`);
    }
    setBlockId(null);
    setBlockReason("");
  }

  return (
    <div className="field-desk onboard-desk mt-4 space-y-5">
      <section className="plant-card px-5 py-5">
        <p className="text-sm uppercase tracking-[0.18em] text-[#5b6f73]">Hall ↔ HSE</p>
        <h2 className="mt-1 text-2xl font-semibold text-[#163038]">Onboarding board</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5b6f73]">
          Halls register referred craftsmen. Tom Fried owns drug screen, background, TechSolve, and the
          P66 badge notify — P66 runs actual badging. Every stage change is timestamped. Default plant
          is {DEFAULT_ONBOARD_PLANT.site} / {DEFAULT_ONBOARD_PLANT.client}.
        </p>
        {lockedLocal ? (
          <p className="mt-2 text-sm text-[#163038]">This hall seat sees Local {lockedLocal} only.</p>
        ) : null}
      </section>

      {canRegister ? (
        <section className="plant-card px-5 py-5">
          <h3 className="text-lg font-semibold text-[#163038]">Hall register</h3>
          <p className="mt-1 text-sm text-[#5b6f73]">Name, craft, and local are required. Phone and email stay optional.</p>
          <form className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3" onSubmit={(event) => void onRegister(event)}>
            <label className="text-sm">
              <span className="mb-1 block text-[#5b6f73]">Name</span>
              <input className="paper-field w-full" value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[#5b6f73]">Local</span>
              <select
                className="paper-field w-full"
                value={localId}
                disabled={Boolean(lockedLocal)}
                onChange={(event) => changeLocal(event.target.value as OnboardLocalId)}
              >
                {ONBOARD_LOCALS.map((local) => (
                  <option key={local.id} value={local.id}>
                    {local.label} · {local.short} · {local.craft}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[#5b6f73]">Craft / classification</span>
              <div className="grid grid-cols-2 gap-2">
                <input className="paper-field w-full" value={craft} onChange={(event) => setCraft(event.target.value)} />
                <select
                  className="paper-field w-full"
                  value={classification}
                  onChange={(event) => setClassification(event.target.value)}
                >
                  {ONBOARD_CLASSIFICATIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[#5b6f73]">Phone (optional)</span>
              <input className="paper-field w-full" value={phone} onChange={(event) => setPhone(event.target.value)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[#5b6f73]">Email (optional)</span>
              <input className="paper-field w-full" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[#5b6f73]">Referred for job / site (optional)</span>
              <input
                className="paper-field w-full"
                value={referredFor}
                placeholder={`${DEFAULT_ONBOARD_PLANT.site} / ${DEFAULT_ONBOARD_PLANT.client}`}
                onChange={(event) => setReferredFor(event.target.value)}
              />
            </label>
            <div className="md:col-span-2 xl:col-span-3">
              <button type="submit" className="rounded-sm bg-steel px-3 py-1.5 text-sm text-white" disabled={saving}>
                Register person
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {note ? <p className="text-sm text-[#163038]">{note}</p> : null}
      {error ? <p className="text-sm text-[#163038]">{error}</p> : null}
      {loading ? <p className="text-sm text-[#5b6f73]">Loading the board…</p> : null}

      <section className="onboard-board" aria-label="HSE stage board">
        {ONBOARD_STAGES.map((stage) => {
          const rows = columns[stage.id];
          return (
            <article key={stage.id} className="plant-card onboard-column px-3 py-3">
              <header className="mb-3">
                <h3 className="text-base font-semibold leading-5 text-[#163038]">{stage.label}</h3>
                <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[#5b6f73]">
                  {stage.owner ? `Owner · ${stage.owner}` : stage.id === "registered" ? "Owner · Hall" : "Cleared / blocked"}
                </p>
                {stage.id === "notify-badge" ? (
                  <p className="mt-1 text-xs leading-5 text-[#5b6f73]">Notify P66 only. Badge is not issued here.</p>
                ) : null}
                <p className="mt-1 text-xs text-[#5b6f73]">{rows.length} people</p>
              </header>
              <ul className="space-y-2">
                {rows.length === 0 ? <li className="text-sm text-[#5b6f73]">Empty.</li> : null}
                {rows.map((person) => {
                  const next = nextOnboardStage(person.stage);
                  const open = openId === person.id;
                  return (
                    <li key={person.id} className="rounded-md border border-[#d5e0de] bg-white/70 px-3 py-2">
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => setOpenId(open ? null : person.id)}
                      >
                        <p className="text-sm font-medium text-[#163038]">{person.name}</p>
                        <p className="mt-0.5 text-xs text-[#5b6f73]">
                          {localLabel(person.localId)} · {person.craft}
                          {person.classification ? ` · ${person.classification}` : ""}
                        </p>
                        {person.referredFor ? <p className="mt-0.5 text-xs text-[#5b6f73]">{person.referredFor}</p> : null}
                        {person.stage === "blocked" && person.blockedReason ? (
                          <p className="mt-1 text-xs text-[#163038]">Reason: {person.blockedReason}</p>
                        ) : null}
                      </button>
                      {canAdvance ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {next ? (
                            <button
                              type="button"
                              className="rounded-sm bg-steel px-2.5 py-1 text-xs text-white"
                              disabled={saving}
                              onClick={() => void postStage("advance", person)}
                            >
                              Advance to {onboardStage(next).label}
                            </button>
                          ) : null}
                          {person.stage !== "blocked" ? (
                            blockId === person.id ? (
                              <form
                                className="flex w-full flex-wrap gap-2"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  void postStage("block", person, { note: blockReason });
                                }}
                              >
                                <input
                                  className="paper-field min-w-[10rem] flex-1"
                                  value={blockReason}
                                  placeholder="Blocked reason (required)"
                                  onChange={(event) => setBlockReason(event.target.value)}
                                  required
                                />
                                <button type="submit" className="rounded-sm border border-steel px-2.5 py-1 text-xs text-steel">
                                  Confirm block
                                </button>
                              </form>
                            ) : (
                              <button
                                type="button"
                                className="rounded-sm border border-steel px-2.5 py-1 text-xs text-steel"
                                onClick={() => {
                                  setBlockId(person.id);
                                  setBlockReason("");
                                }}
                              >
                                Block / fail
                              </button>
                            )
                          ) : (
                            <button
                              type="button"
                              className="rounded-sm bg-steel px-2.5 py-1 text-xs text-white"
                              disabled={saving}
                              onClick={() => void postStage("reopen", person, { toStage: "registered" })}
                            >
                              Reopen to Registered
                            </button>
                          )}
                        </div>
                      ) : null}
                      {open ? (
                        <div className="mt-3 border-t border-[#d5e0de] pt-2">
                          <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5b6f73]">Audit trail</h4>
                          <ol className="mt-2 space-y-2">
                            {person.events.map((event) => (
                              <li key={event.id} className="text-xs leading-5 text-[#163038]">
                                <span className="font-medium">{formatWhen(event.at)}</span>
                                {" · "}
                                {event.actorName}
                                {event.actorEmail ? ` <${event.actorEmail}>` : ""}
                                {" · "}
                                {event.fromStage ? onboardStage(event.fromStage).label : "—"}
                                {" → "}
                                {onboardStage(event.toStage).label}
                                {event.note ? ` — ${event.note}` : ""}
                              </li>
                            ))}
                          </ol>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-[#5b6f73]">Open for audit trail</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </article>
          );
        })}
      </section>

      <p className="text-xs text-[#5b6f73]">
        Stage owners on the four HSE columns are {TOM_FRIED_NAME}. This board is the onboarding
        pipeline only — hall notify after award and craftsman call-outs stay later.
      </p>
    </div>
  );
}
