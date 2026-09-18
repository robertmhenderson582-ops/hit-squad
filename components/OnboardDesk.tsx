"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useLensUser, useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { viewAsInit } from "@/lib/desk-scope";
import {
  BENNY_CAMP_NAME,
  DEFAULT_ONBOARD_PLANT,
  DEFAULT_ONBOARD_SETTINGS,
  HIRE_IN_OUTREACH_OWNERS,
  HIRE_IN_VERIFIED_FIELD_LABEL,
  MANPOWER_CERTS_PLACEHOLDER,
  MANPOWER_PACKAGE_PLACEHOLDER,
  MANPOWER_SCREENING_PLACEHOLDER,
  ONBOARD_CLASSIFICATIONS,
  ONBOARD_STAGES,
  TEKSOLV_LOCATION,
  TEKSOLV_NAME,
  TOM_FRIED_NAME,
  TOM_FRIED_TITLE,
  selectableOnboardLocals,
  defaultCraftForLocal,
  hallContactForLocal,
  hallLocalForSeat,
  formatSsnInput,
  maskSsnLast4,
  manpowerRequestLabel,
  nextOnboardStage,
  onboardLocal,
  onboardStage,
  peopleByStage,
  type ManpowerRequest,
  type OnboardHall,
  type OnboardLocalId,
  type OnboardPerson,
  type OnboardSettings,
  type TrainingStatus,
} from "@/lib/onboard-pipeline";

type BoardPayload = {
  people?: OnboardPerson[];
  requests?: ManpowerRequest[];
  settings?: OnboardSettings;
  halls?: OnboardHall[];
  canRegister?: boolean;
  canAdvance?: boolean;
  canCreateRequest?: boolean;
  canRespondRequest?: boolean;
  canUpdateTracker?: boolean;
  canUpdateOutreach?: boolean;
  canSeeRestrictedPii?: boolean;
  canConfigure?: boolean;
  canManageHalls?: boolean;
  error?: string;
  stored?: boolean;
  store?: string;
  notify?: { queued?: boolean; sent?: boolean; recipients?: number; skipped?: string; error?: string };
};

const EMPTY_HALL_FORM = {
  id: "",
  label: "",
  craft: "",
  union: "",
  contactName: "",
  contactEmail: "",
  contactTitle: "",
  phase1: true,
};

const TRAINING_OPTIONS: TrainingStatus[] = ["not-started", "scheduled", "complete"];

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

function localLabel(id: OnboardLocalId, halls?: readonly OnboardHall[] | null) {
  const local = onboardLocal(id, halls);
  return `${local.label} · ${local.short}`;
}

function notifyLine(notify?: BoardPayload["notify"]) {
  if (!notify) return "";
  if (notify.error) return ` Verification email: ${notify.error}`;
  if (notify.skipped) return ` Verification email held — ${notify.skipped}`;
  if (notify.sent) return ` Verification email sent to ${notify.recipients || 0} corp / PM recipients.`;
  return "";
}

export function OnboardDesk() {
  const { user } = useSession();
  const lens = useLensUser();
  const owner = useOwnerDesk();
  const actor = lens ?? user;
  const initialLocked = hallLocalForSeat(actor);

  const [people, setPeople] = useState<OnboardPerson[]>([]);
  const [requests, setRequests] = useState<ManpowerRequest[]>([]);
  const [settings, setSettings] = useState<OnboardSettings>(DEFAULT_ONBOARD_SETTINGS);
  const [halls, setHalls] = useState<OnboardHall[]>([]);
  const [canRegister, setCanRegister] = useState(false);
  const [canAdvance, setCanAdvance] = useState(false);
  const [canCreateRequest, setCanCreateRequest] = useState(false);
  const [canRespondRequest, setCanRespondRequest] = useState(false);
  const [canEditTracker, setCanEditTracker] = useState(false);
  const [canEditOutreach, setCanEditOutreach] = useState(false);
  const [canSeePii, setCanSeePii] = useState(false);
  const [canConfigure, setCanConfigure] = useState(false);
  const [canManageHalls, setCanManageHalls] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [blockId, setBlockId] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState("");

  const [name, setName] = useState("");
  const [localId, setLocalId] = useState<OnboardLocalId>(initialLocked || "553");
  const [craft, setCraft] = useState<string>(defaultCraftForLocal(initialLocked || "553"));
  const [classification, setClassification] = useState("Journeyman");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [referredFor, setReferredFor] = useState("");
  const [requestId, setRequestId] = useState("");

  const [neededDate, setNeededDate] = useState("");
  const [headcount, setHeadcount] = useState("1");
  const [reqTrade, setReqTrade] = useState<string>(defaultCraftForLocal(initialLocked || "553"));
  const [reqClass, setReqClass] = useState("Journeyman");
  const [reqSite, setReqSite] = useState<string>(DEFAULT_ONBOARD_PLANT.site);
  const [reqJob, setReqJob] = useState("");
  const [reqCerts, setReqCerts] = useState("");
  const [reqScreenings, setReqScreenings] = useState(MANPOWER_SCREENING_PLACEHOLDER);
  const [reqPackage, setReqPackage] = useState("");
  const [respondId, setRespondId] = useState<string | null>(null);
  const [fillCount, setFillCount] = useState("");
  const [fillDate, setFillDate] = useState("");

  const [corpEmails, setCorpEmails] = useState("");
  const [pmEmails, setPmEmails] = useState("");
  const [step1Submitter, setStep1Submitter] = useState<"site" | "hall">("site");

  const [hallForm, setHallForm] = useState(EMPTY_HALL_FORM);
  const [editingHallId, setEditingHallId] = useState<string | null>(null);

  const lockedLocal = hallLocalForSeat(actor, halls);
  const registerLocals = selectableOnboardLocals(halls);

  const [legalName, setLegalName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [ssn, setSsn] = useState("");
  const [ssnFocused, setSsnFocused] = useState(false);
  const [problemNote, setProblemNote] = useState("");

  useEffect(() => {
    if (!lockedLocal) return;
    setLocalId(lockedLocal);
    setCraft(onboardLocal(lockedLocal, halls).craft);
    setReqTrade(onboardLocal(lockedLocal, halls).craft);
  }, [halls, lockedLocal]);

  function applyBoard(data: BoardPayload) {
    if (Array.isArray(data.people)) setPeople(data.people);
    if (Array.isArray(data.requests)) setRequests(data.requests);
    if (data.settings) {
      setSettings(data.settings);
      setStep1Submitter(data.settings.step1Submitter);
      setCorpEmails(data.settings.corporateEmails.join(", "));
      setPmEmails(data.settings.pmEmails.join(", "));
    }
    if (typeof data.canRegister === "boolean") setCanRegister(data.canRegister);
    if (typeof data.canAdvance === "boolean") setCanAdvance(data.canAdvance);
    if (typeof data.canCreateRequest === "boolean") setCanCreateRequest(data.canCreateRequest);
    if (typeof data.canRespondRequest === "boolean") setCanRespondRequest(data.canRespondRequest);
    if (typeof data.canUpdateTracker === "boolean") setCanEditTracker(data.canUpdateTracker);
    if (typeof data.canUpdateOutreach === "boolean") setCanEditOutreach(data.canUpdateOutreach);
    if (typeof data.canSeeRestrictedPii === "boolean") setCanSeePii(data.canSeeRestrictedPii);
    if (Array.isArray(data.halls)) setHalls(data.halls);
    if (typeof data.canConfigure === "boolean") setCanConfigure(data.canConfigure);
    if (typeof data.canManageHalls === "boolean") setCanManageHalls(data.canManageHalls);
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
  const problemCases = useMemo(() => people.filter((row) => row.problemCase), [people]);

  function changeLocal(next: OnboardLocalId) {
    if (lockedLocal) return;
    setLocalId(next);
    const local = onboardLocal(next, halls);
    setCraft(local.craft);
    setReqTrade(local.craft);
  }

  function fillHallForm(hall: OnboardHall) {
    setEditingHallId(hall.id);
    setHallForm({
      id: hall.id,
      label: hall.label,
      craft: hall.craft,
      union: hall.union,
      contactName: hall.contactName,
      contactEmail: hall.contactEmail,
      contactTitle: hall.contactTitle,
      phase1: hall.phase1,
    });
  }

  function resetHallForm() {
    setEditingHallId(null);
    setHallForm(EMPTY_HALL_FORM);
  }

  function openPerson(person: OnboardPerson) {
    setOpenId(person.id);
    setLegalName(person.legalName);
    setDateOfBirth(person.dateOfBirth);
    setSsn(person.ssn || person.ssnLast4);
    setSsnFocused(false);
    setProblemNote(person.problemCaseNote);
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
          requestId,
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
    if (data.person) openPerson(data.person);
    setName("");
    setPhone("");
    setEmail("");
    setReferredFor("");
    setNote(`Submitted ${data.person?.name || "person"} to DISA DER.${notifyLine(data.notify)}`);
  }

  async function onCreateRequest(event: FormEvent) {
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
          action: "create-request",
          localId,
          dateNeeded: neededDate,
          headcount,
          trade: reqTrade,
          classification: reqClass,
          site: reqSite,
          job: reqJob,
          requiredCerts: reqCerts,
          requiredScreenings: reqScreenings,
          hiringPackageNotes: reqPackage,
        }),
      }),
    );
    const data = (await response.json().catch(() => ({}))) as BoardPayload & { request?: ManpowerRequest };
    setSaving(false);
    if (!response.ok) {
      setError(data.error || "Could not create that manpower request.");
      return;
    }
    applyBoard(data);
    if (data.request) setRequestId(data.request.id);
    setNote(`Manpower request sent to Local ${localId} hall (${data.request?.id || "saved"}).`);
  }

  async function onRespondRequest(event: FormEvent, id: string) {
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
          action: "respond-request",
          id,
          fillCount,
          fillDate,
        }),
      }),
    );
    const data = (await response.json().catch(() => ({}))) as BoardPayload & { request?: ManpowerRequest };
    setSaving(false);
    if (!response.ok) {
      setError(data.error || "Could not respond to that manpower request.");
      return;
    }
    applyBoard(data);
    setRespondId(null);
    setFillCount("");
    setFillDate("");
    if (data.request) setRequestId(data.request.id);
    setNote(`Hall response saved on ${data.request?.id || "request"}.`);
  }

  async function onSaveSettings(event: FormEvent) {
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
          action: "save-settings",
          step1Submitter,
          corporateEmails: corpEmails,
          pmEmails,
        }),
      }),
    );
    const data = (await response.json().catch(() => ({}))) as BoardPayload;
    setSaving(false);
    if (!response.ok) {
      setError(data.error || "Could not save Owner settings.");
      return;
    }
    applyBoard(data);
    setNote("Owner settings saved. Empty corp / PM lists do not invent addresses.");
  }

  async function onSaveHall(event: FormEvent) {
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
          action: "save-hall",
          localNumber: hallForm.id,
          label: hallForm.label,
          craft: hallForm.craft,
          union: hallForm.union,
          contactName: hallForm.contactName,
          contactEmail: hallForm.contactEmail,
          jobTitle: hallForm.contactTitle,
          phase1: hallForm.phase1,
        }),
      }),
    );
    const data = (await response.json().catch(() => ({}))) as BoardPayload;
    setSaving(false);
    if (!response.ok) {
      setError(data.error || "Could not save that hall.");
      return;
    }
    applyBoard(data);
    setNote(
      hallForm.phase1
        ? `Hall Local ${hallForm.id.replace(/\D/g, "")} saved. Phase-one on — it is on register and manpower lists.`
        : `Hall Local ${hallForm.id.replace(/\D/g, "")} saved. Phase-one off — parked until flipped on.`,
    );
    resetHallForm();
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
      openPerson(data.person);
      const from = extra.note ? ` — ${extra.note}` : "";
      setNote(`${data.person.name}: ${onboardStage(person.stage).label} → ${onboardStage(data.person.stage).label}${from}.${notifyLine(data.notify)}`);
    }
    setBlockId(null);
    setBlockReason("");
  }

  async function postTracker(person: OnboardPerson, extra: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    setNote(null);
    const response = await fetch(
      "/api/desk/onboard",
      viewAsInit(owner?.viewAs, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-tracker", id: person.id, ...extra }),
      }),
    );
    const data = (await response.json().catch(() => ({}))) as BoardPayload & { person?: OnboardPerson };
    setSaving(false);
    if (!response.ok) {
      setError(data.error || "Could not update tracker fields.");
      return;
    }
    applyBoard(data);
    if (data.person) {
      openPerson(data.person);
      setNote(`Tracker updated for ${data.person.name}.`);
    }
  }

  return (
    <div className="field-desk onboard-desk mt-4 space-y-5">
      <section className="plant-card px-5 py-5">
        <p className="text-sm uppercase tracking-[0.18em] text-[#5b6f73]">Hall ↔ HSE</p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5b6f73]">
          Phase-one locals are the ones flipped on in Halls — Local 553 ships on. Tom Fried or Benny Camp create a
          manpower request first; the hall contact responds with fill count and date; then site submits name + phone
          onto that request (Owner can switch Step 1 to hall). DISA DER is Tom Fried (friedt@madisonltd.com) —
          identity, DISA background, and drug. Benny Camp (bccamp2@gmail.com) is temp dispatcher until Donnie.
          Training is {TEKSOLV_NAME}, {TEKSOLV_LOCATION}. Hire-end
          outreach is Robert Henderson / Ben Peffley / Nathan Boyte. Tracker keepers are Tom Fried and Debbie. Every
          create, respond, and stage change is timestamped. No email blast on manpower. End-of-step verification
          emails go to Owner-configured corp + PM lists. Default plant is {DEFAULT_ONBOARD_PLANT.site} /{" "}
          {DEFAULT_ONBOARD_PLANT.client}. Phase-one off halls stay parked.
        </p>
        {hallContactForLocal("553", halls) ? (
          <p className="mt-3 text-sm text-[#163038]">
            Local 553 hall contact: John Battuello Jr. · jbattuello@ualocal553.org
          </p>
        ) : null}
        <p className="mt-1 text-sm text-[#163038]">
          DISA DER: Tom Fried · friedt@madisonltd.com
        </p>
        <p className="mt-1 text-sm text-[#163038]">
          Temp dispatcher until Donnie: Benny Camp · bccamp2@gmail.com
        </p>
        {lockedLocal ? (
          <p className="mt-2 text-sm text-[#163038]">This hall seat sees Local {lockedLocal} only.</p>
        ) : null}
      </section>

      {canManageHalls ? (
        <section className="plant-card px-5 py-5">
          <h3 className="text-lg font-semibold text-[#163038]">Halls</h3>
          <p className="mt-1 text-sm text-[#5b6f73]">
            Add or edit a hall without a code deploy. Contact email wires the hall seat for Dispatch-only home,
            manpower routing, and Local-only people. Phase-one off keeps the local out of register and manpower
            lists. Hall logins are still issued by Owner under Settings → Users.
          </p>
          <ul className="mt-4 space-y-2">
            {halls.map((hall) => {
              const contact = hallContactForLocal(hall.id, halls);
              return (
                <li key={hall.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#d5e0de] bg-white/70 px-3 py-2 text-sm text-[#163038]">
                  <p>
                    {hall.label} · {hall.short} · {hall.craft} · {hall.union}
                    {contact?.email ? ` · ${contact.name || "Hall"} · ${contact.email}` : " · no hall contact yet"}
                    {hall.phase1 ? " · phase-one on" : " · phase-one off"}
                  </p>
                  <button
                    type="button"
                    className="rounded-sm border border-steel px-2.5 py-1 text-xs text-steel"
                    onClick={() => fillHallForm(hall)}
                  >
                    Edit hall
                  </button>
                </li>
              );
            })}
          </ul>
          <form className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3" onSubmit={(event) => void onSaveHall(event)}>
            <label className="text-sm">
              <span className="mb-1 block text-[#5b6f73]">Local number</span>
              <input
                className="paper-field w-full"
                inputMode="numeric"
                value={hallForm.id}
                disabled={Boolean(editingHallId)}
                onChange={(event) => setHallForm((row) => ({ ...row, id: event.target.value }))}
                required
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[#5b6f73]">Hall name / label</span>
              <input
                className="paper-field w-full"
                value={hallForm.label}
                onChange={(event) => setHallForm((row) => ({ ...row, label: event.target.value }))}
                required
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[#5b6f73]">Craft / trade</span>
              <input
                className="paper-field w-full"
                value={hallForm.craft}
                onChange={(event) => setHallForm((row) => ({ ...row, craft: event.target.value }))}
                required
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[#5b6f73]">Union</span>
              <input
                className="paper-field w-full"
                value={hallForm.union}
                onChange={(event) => setHallForm((row) => ({ ...row, union: event.target.value }))}
                required
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[#5b6f73]">Contact name</span>
              <input
                className="paper-field w-full"
                value={hallForm.contactName}
                onChange={(event) => setHallForm((row) => ({ ...row, contactName: event.target.value }))}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[#5b6f73]">Contact email</span>
              <input
                className="paper-field w-full"
                type="email"
                value={hallForm.contactEmail}
                onChange={(event) => setHallForm((row) => ({ ...row, contactEmail: event.target.value }))}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[#5b6f73]">Job title (hall seat)</span>
              <input
                className="paper-field w-full"
                value={hallForm.contactTitle}
                placeholder="Hall Local 553"
                onChange={(event) => setHallForm((row) => ({ ...row, contactTitle: event.target.value }))}
              />
            </label>
            <label className="flex items-end gap-2 text-sm text-[#163038]">
              <input
                type="checkbox"
                checked={hallForm.phase1}
                onChange={(event) => setHallForm((row) => ({ ...row, phase1: event.target.checked }))}
              />
              <span>Phase-one on (selectable for register / manpower)</span>
            </label>
            <div className="flex flex-wrap items-end gap-2 md:col-span-2 xl:col-span-3">
              <button type="submit" className="rounded-sm bg-steel px-3 py-1.5 text-sm text-white" disabled={saving}>
                {editingHallId ? "Save hall" : "Add hall"}
              </button>
              {editingHallId ? (
                <button
                  type="button"
                  className="rounded-sm border border-steel px-3 py-1.5 text-sm text-steel"
                  onClick={resetHallForm}
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
        </section>
      ) : null}

      {canConfigure ? (
        <section className="plant-card px-5 py-5">
          <h3 className="text-lg font-semibold text-[#163038]">Owner settings</h3>
          <p className="mt-1 text-sm text-[#5b6f73]">
            Corporate and project management lists are placeholders. Do not invent addresses. Step 1 defaults to site
            submitting name + phone to the DISA DER.
          </p>
          <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={(event) => void onSaveSettings(event)}>
            <label className="text-sm">
              <span className="mb-1 block text-[#5b6f73]">Step 1 submitter</span>
              <select
                className="paper-field w-full"
                value={step1Submitter}
                onChange={(event) => setStep1Submitter(event.target.value === "hall" ? "hall" : "site")}
              >
                <option value="site">Site submits name + phone</option>
                <option value="hall">Hall submits name + phone</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[#5b6f73]">Corporate emails (comma-separated)</span>
              <input className="paper-field w-full" value={corpEmails} onChange={(event) => setCorpEmails(event.target.value)} placeholder="Owner fills later" />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="mb-1 block text-[#5b6f73]">Project management emails (comma-separated)</span>
              <input className="paper-field w-full" value={pmEmails} onChange={(event) => setPmEmails(event.target.value)} placeholder="Owner fills later" />
            </label>
            <div>
              <button type="submit" className="rounded-sm bg-steel px-3 py-1.5 text-sm text-white" disabled={saving}>
                Save Owner settings
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {canCreateRequest ? (
        <section className="plant-card px-5 py-5">
          <h3 className="text-lg font-semibold text-[#163038]">Manpower request</h3>
          <p className="mt-1 text-sm text-[#5b6f73]">
            Dispatcher create comes before hall register. Routes to the hall contact on the selected phase-one
            local. Certs, screenings, and hiring package fields are placeholders — not a final hiring list. No
            email blast.
          </p>
          <form className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3" onSubmit={(event) => void onCreateRequest(event)}>
            <label className="text-sm">
              <span className="mb-1 block text-[#5b6f73]">Local</span>
              <select
                className="paper-field w-full"
                value={localId}
                disabled={Boolean(lockedLocal) || registerLocals.length <= 1}
                onChange={(event) => changeLocal(event.target.value as OnboardLocalId)}
              >
                {registerLocals.map((local) => (
                  <option key={local.id} value={local.id}>
                    {local.label} · {local.short} · {local.craft}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[#5b6f73]">Date needed</span>
              <input className="paper-field w-full" type="date" value={neededDate} onChange={(event) => setNeededDate(event.target.value)} required />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[#5b6f73]">Quantity / headcount</span>
              <input className="paper-field w-full" type="number" min={1} value={headcount} onChange={(event) => setHeadcount(event.target.value)} required />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[#5b6f73]">Trade / classification</span>
              <div className="grid grid-cols-2 gap-2">
                <input className="paper-field w-full" value={reqTrade} onChange={(event) => setReqTrade(event.target.value)} required />
                <select className="paper-field w-full" value={reqClass} onChange={(event) => setReqClass(event.target.value)}>
                  {ONBOARD_CLASSIFICATIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[#5b6f73]">Site / job</span>
              <div className="grid grid-cols-2 gap-2">
                <input className="paper-field w-full" value={reqSite} onChange={(event) => setReqSite(event.target.value)} />
                <input className="paper-field w-full" value={reqJob} placeholder="Job / requisition" onChange={(event) => setReqJob(event.target.value)} />
              </div>
            </label>
            <label className="text-sm md:col-span-2 xl:col-span-3">
              <span className="mb-1 block text-[#5b6f73]">{MANPOWER_CERTS_PLACEHOLDER}</span>
              <textarea className="paper-field w-full" rows={2} value={reqCerts} onChange={(event) => setReqCerts(event.target.value)} />
            </label>
            <label className="text-sm md:col-span-2 xl:col-span-3">
              <span className="mb-1 block text-[#5b6f73]">{MANPOWER_SCREENING_PLACEHOLDER}</span>
              <textarea className="paper-field w-full" rows={2} value={reqScreenings} onChange={(event) => setReqScreenings(event.target.value)} />
            </label>
            <label className="text-sm md:col-span-2 xl:col-span-3">
              <span className="mb-1 block text-[#5b6f73]">{MANPOWER_PACKAGE_PLACEHOLDER}</span>
              <textarea className="paper-field w-full" rows={2} value={reqPackage} onChange={(event) => setReqPackage(event.target.value)} />
            </label>
            <div className="md:col-span-2 xl:col-span-3">
              <button type="submit" className="rounded-sm bg-steel px-3 py-1.5 text-sm text-white" disabled={saving}>
                Send manpower request
              </button>
            </div>
          </form>
          <h4 className="mt-5 text-sm font-semibold text-[#163038]">Request list</h4>
          <ul className="mt-2 space-y-2">
            {requests.length === 0 ? <li className="text-sm text-[#5b6f73]">No manpower requests yet.</li> : null}
            {requests.map((row) => (
              <li key={row.id} className="rounded-md border border-[#d5e0de] bg-white/70 px-3 py-2 text-sm text-[#163038]">
                {manpowerRequestLabel(row)}
                {row.job ? ` · ${row.job}` : ""} · {row.createdByName} · {formatWhen(row.createdAt)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {canRespondRequest ? (
        <section className="plant-card px-5 py-5">
          <h3 className="text-lg font-semibold text-[#163038]">Hall manpower inbox</h3>
          <p className="mt-1 text-sm text-[#5b6f73]">
            Open requests from Tom / Benny / HSE. Respond with how many you can fill and when. Then register
            people onto that request when Step 1 is set to hall.
          </p>
          <ul className="mt-4 space-y-3">
            {requests.filter((row) => row.status === "open").length === 0 ? (
              <li className="text-sm text-[#5b6f73]">No open manpower requests.</li>
            ) : null}
            {requests
              .filter((row) => row.status === "open")
              .map((row) => (
                <li key={row.id} className="rounded-md border border-[#d5e0de] bg-white/70 px-3 py-3">
                  <p className="text-sm font-medium text-[#163038]">{manpowerRequestLabel(row)}</p>
                  <p className="mt-1 text-xs text-[#5b6f73]">
                    {row.site}
                    {row.job ? ` · ${row.job}` : ""} · {row.classification || "—"} · created {formatWhen(row.createdAt)}
                  </p>
                  {row.requiredScreenings ? <p className="mt-1 text-xs text-[#5b6f73]">{row.requiredScreenings}</p> : null}
                  {respondId === row.id ? (
                    <form className="mt-3 grid gap-2 md:grid-cols-3" onSubmit={(event) => void onRespondRequest(event, row.id)}>
                      <label className="text-sm">
                        <span className="mb-1 block text-[#5b6f73]">Fill count</span>
                        <input className="paper-field w-full" type="number" min={0} value={fillCount} onChange={(event) => setFillCount(event.target.value)} required />
                      </label>
                      <label className="text-sm">
                        <span className="mb-1 block text-[#5b6f73]">Fill date</span>
                        <input className="paper-field w-full" type="date" value={fillDate} onChange={(event) => setFillDate(event.target.value)} required />
                      </label>
                      <div className="flex items-end">
                        <button type="submit" className="rounded-sm bg-steel px-3 py-1.5 text-sm text-white" disabled={saving}>
                          Send hall response
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="mt-2 rounded-sm border border-steel px-2.5 py-1 text-xs text-steel"
                      onClick={() => {
                        setRespondId(row.id);
                        setFillCount(String(row.headcount));
                        setFillDate(row.dateNeeded);
                      }}
                    >
                      Respond
                    </button>
                  )}
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      {canRegister ? (
        <section className="plant-card px-5 py-5">
          <h3 className="text-lg font-semibold text-[#163038]">
            {settings.step1Submitter === "hall" ? "Hall register" : "Submit name + phone to DISA DER"}
          </h3>
          <p className="mt-1 text-sm text-[#5b6f73]">
            Company working-desk, PM, HSE, Benny, and Tom seats can add people here. Step 1 submits name and phone
            to Tom Fried. A hall seat can register only when Owner sets Step 1 to hall, and only for that hall
            contact&apos;s local (Local 553 is gated to John Battuello Jr. / jbattuello@ualocal553.org). Restricted PII
            (legal name, DOB, full SSN) is captured by Tom on Step 2 — not on this form.
          </p>
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
                disabled={Boolean(lockedLocal) || registerLocals.length <= 1}
                onChange={(event) => changeLocal(event.target.value as OnboardLocalId)}
              >
                {registerLocals.map((local) => (
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
              <span className="mb-1 block text-[#5b6f73]">Phone</span>
              <input className="paper-field w-full" value={phone} onChange={(event) => setPhone(event.target.value)} required />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[#5b6f73]">Email (optional)</span>
              <input className="paper-field w-full" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            {requests.length ? (
              <label className="text-sm">
                <span className="mb-1 block text-[#5b6f73]">Manpower request</span>
                <select className="paper-field w-full" value={requestId} onChange={(event) => setRequestId(event.target.value)}>
                  <option value="">No request linked</option>
                  {requests
                    .filter((row) => row.localId === localId)
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {manpowerRequestLabel(row)}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
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
                Submit to DISA DER
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section className="plant-card px-5 py-5">
          <h3 className="text-lg font-semibold text-[#163038]">Hall register</h3>
          <p className="mt-1 text-sm text-[#5b6f73]">
            Step 1 name + phone defaults to site. Owner can switch this seat so the hall submits.
          </p>
        </section>
      )}

      {problemCases.length ? (
        <section className="plant-card px-5 py-5">
          <h3 className="text-lg font-semibold text-[#163038]">Problem cases</h3>
          <p className="mt-1 text-sm text-[#5b6f73]">
            Tracker keepers flag these so {HIRE_IN_OUTREACH_OWNERS} can jump on them.
          </p>
          <ul className="mt-3 space-y-2">
            {problemCases.map((row) => (
              <li key={row.id} className="text-sm text-[#163038]">
                {row.name} · {onboardStage(row.stage).label}
                {row.problemCaseNote ? ` — ${row.problemCaseNote}` : ""}
              </li>
            ))}
          </ul>
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
                  {stage.owner ? `Owner · ${stage.owner}` : "Cleared / blocked"}
                </p>
                {stage.id === "step-3" || stage.id === "step-5" ? (
                  <p className="mt-1 text-xs leading-5 text-[#5b6f73]">
                    {TEKSOLV_NAME}, {TEKSOLV_LOCATION}.
                  </p>
                ) : null}
                {stage.id === "step-4" ? (
                  <p className="mt-1 text-xs leading-5 text-[#5b6f73]">Verified Employee Received HireIn Link</p>
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
                        onClick={() => (open ? setOpenId(null) : openPerson(person))}
                      >
                        <p className="text-sm font-medium text-[#163038]">{person.name}</p>
                        <p className="mt-0.5 text-xs text-[#5b6f73]">
                          {localLabel(person.localId, halls)} · {person.craft}
                          {person.classification ? ` · ${person.classification}` : ""}
                        </p>
                        {person.requestId ? <p className="mt-0.5 text-xs text-[#5b6f73]">Request {person.requestId}</p> : null}
                        {person.phone ? <p className="mt-0.5 text-xs text-[#5b6f73]">{person.phone}</p> : null}
                        {person.problemCase ? <p className="mt-1 text-xs text-[#163038]">Problem case</p> : null}
                        {person.verifiedEmployeeReceivedHireInLink ? (
                          <p className="mt-0.5 text-xs text-[#163038]">{HIRE_IN_VERIFIED_FIELD_LABEL}</p>
                        ) : null}
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
                              onClick={() => void postStage("reopen", person, { toStage: "step-1" })}
                            >
                              Reopen to Submitted to DISA DER
                            </button>
                          )}
                        </div>
                      ) : null}
                      {open ? (
                        <div className="mt-3 space-y-3 border-t border-[#d5e0de] pt-2">
                          {canSeePii ? (
                            <div>
                              <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5b6f73]">Restricted PII</h4>
                              <p className="mt-1 text-xs text-[#5b6f73]">Least privilege. RESTRICTED PII. Masked SSN unless editing. Hall seats do not see this.</p>
                              {canEditTracker ? (
                                <form
                                  className="mt-2 grid gap-2"
                                  onSubmit={(event) => {
                                    event.preventDefault();
                                    void postTracker(person, {
                                      legalName,
                                      dateOfBirth,
                                      ssn,
                                      identityVerified: true,
                                    });
                                  }}
                                >
                                  <input className="paper-field w-full" placeholder="Legal name" value={legalName} onChange={(event) => setLegalName(event.target.value)} />
                                  <input className="paper-field w-full" type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} />
                                  <input
                                    className="paper-field w-full"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    maxLength={11}
                                    placeholder="XXX-XX-XXXX"
                                    aria-label="Social Security number (restricted PII)"
                                    value={ssnFocused ? formatSsnInput(ssn) : ssn ? maskSsnLast4(ssn) : ""}
                                    onFocus={() => setSsnFocused(true)}
                                    onBlur={() => setSsnFocused(false)}
                                    onChange={(event) => setSsn(event.target.value.replace(/\D/g, "").slice(0, 9))}
                                  />
                                  <p className="text-xs text-[#5b6f73]">{person.ssnLast4 ? maskSsnLast4(person.ssn || person.ssnLast4) : "No SSN yet"}</p>
                                  <button type="submit" className="rounded-sm bg-steel px-2.5 py-1 text-xs text-white" disabled={saving}>
                                    Verify legal name / DOB / SSN
                                  </button>
                                </form>
                              ) : (
                                <p className="mt-1 text-xs text-[#163038]">
                                  {person.legalName || "—"} · {person.dateOfBirth || "—"} · {person.ssnLast4 ? maskSsnLast4(person.ssn || person.ssnLast4) : "—"}
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-[#5b6f73]">Restricted PII is hidden on this seat.</p>
                          )}
                          {canEditTracker ? (
                            <div className="grid gap-2">
                              <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5b6f73]">P66 training</h4>
                              <label className="text-xs text-[#5b6f73]">
                                P66 corporate
                                <select
                                  className="paper-field mt-1 w-full"
                                  value={person.p66CorporateTraining}
                                  onChange={(event) => void postTracker(person, { p66CorporateTraining: event.target.value })}
                                >
                                  {TRAINING_OPTIONS.map((item) => (
                                    <option key={item} value={item}>
                                      {item}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="text-xs text-[#5b6f73]">
                                P66 site-specific
                                <select
                                  className="paper-field mt-1 w-full"
                                  value={person.p66SiteTraining}
                                  onChange={(event) => void postTracker(person, { p66SiteTraining: event.target.value })}
                                >
                                  {TRAINING_OPTIONS.map((item) => (
                                    <option key={item} value={item}>
                                      {item}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="text-xs text-[#5b6f73]">
                                P66 pre-cert
                                <select
                                  className="paper-field mt-1 w-full"
                                  value={person.p66PrecertTraining}
                                  onChange={(event) => void postTracker(person, { p66PrecertTraining: event.target.value })}
                                >
                                  {TRAINING_OPTIONS.map((item) => (
                                    <option key={item} value={item}>
                                      {item}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                          ) : (
                            <p className="text-xs text-[#5b6f73]">
                              P66 corporate {person.p66CorporateTraining} · site-specific {person.p66SiteTraining} · pre-cert{" "}
                              {person.p66PrecertTraining}
                            </p>
                          )}
                          {canEditOutreach ? (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="rounded-sm border border-steel px-2.5 py-1 text-xs text-steel"
                                disabled={saving}
                                onClick={() => void postTracker(person, { hireInLinkSent: !person.hireInLinkSent })}
                              >
                                {person.hireInLinkSent ? "Clear HireIn sent" : "Mark HireIn link sent"}
                              </button>
                              <button
                                type="button"
                                className="rounded-sm border border-steel px-2.5 py-1 text-xs text-steel"
                                disabled={saving}
                                onClick={() => void postTracker(person, { hireInDeliveryConfirmed: !person.hireInDeliveryConfirmed })}
                              >
                                {person.hireInDeliveryConfirmed ? "Clear delivery" : "Confirm HireIn delivery"}
                              </button>
                              <button
                                type="button"
                                className="rounded-sm border border-steel px-2.5 py-1 text-xs text-steel"
                                disabled={saving}
                                onClick={() =>
                                  void postTracker(person, {
                                    verifiedEmployeeReceivedHireInLink: !person.verifiedEmployeeReceivedHireInLink,
                                  })
                                }
                              >
                                {HIRE_IN_VERIFIED_FIELD_LABEL}
                              </button>
                              <button
                                type="button"
                                className="rounded-sm border border-steel px-2.5 py-1 text-xs text-steel"
                                disabled={saving}
                                onClick={() => void postTracker(person, { tomFriedContactConfirmed: !person.tomFriedContactConfirmed })}
                              >
                                {person.tomFriedContactConfirmed ? "Clear Tom contact" : "Confirm Tom Fried contact"}
                              </button>
                              <button
                                type="button"
                                className="rounded-sm border border-steel px-2.5 py-1 text-xs text-steel"
                                disabled={saving}
                                onClick={() => void postTracker(person, { problemCase: !person.problemCase, problemCaseNote: problemNote })}
                              >
                                {person.problemCase ? "Clear problem case" : "Flag problem case"}
                              </button>
                              <input
                                className="paper-field w-full"
                                placeholder="Problem case note"
                                value={problemNote}
                                onChange={(event) => setProblemNote(event.target.value)}
                              />
                            </div>
                          ) : null}
                          <div>
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
        Step 2 owner is {TOM_FRIED_NAME} ({TOM_FRIED_TITLE}). Temp dispatcher is {BENNY_CAMP_NAME}. This board is the
        onboarding pipeline only — hall notify after award and craftsman call-outs stay later.
      </p>
    </div>
  );
}
