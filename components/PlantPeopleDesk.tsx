"use client";

import { useEffect, useMemo, useState } from "react";
import { useLensUser } from "@/components/OwnerDeskContext";
import { canAssignSitePeople } from "@/lib/module-access";
import { SITE_ACCESS_DURATION_COPY, type SiteAccessGrant } from "@/lib/site-access";
import {
  defaultToolRoomWindow,
  TOOL_ROOM_OWNER_PM_COPY,
  TOOL_ROOM_WINDOW_COPY,
  toolRoomTimeboxedFor,
  type ToolRoomDuty,
} from "@/lib/tool-room-duty";

type Person = { id: string; email?: string; name: string; jobTitle?: string; role?: string };

type PublicGrant = SiteAccessGrant & { status: "provisioning" | "live"; copy: string };

export function PlantPeopleDesk({
  siteId,
  siteName,
  people,
  postEndYmd,
}: {
  siteId: string;
  siteName: string;
  people: Person[];
  postEndYmd?: string | null;
}) {
  const lens = useLensUser();
  const canAssign = canAssignSitePeople(lens);
  const [grants, setGrants] = useState<PublicGrant[]>([]);
  const [duties, setDuties] = useState<ToolRoomDuty[]>([]);
  const [accessEmail, setAccessEmail] = useState("");
  const [dutyEmail, setDutyEmail] = useState("");
  const fallbackWindow = useMemo(() => defaultToolRoomWindow(postEndYmd), [postEndYmd]);
  const [startYmd, setStartYmd] = useState(fallbackWindow.start);
  const [endYmd, setEndYmd] = useState(fallbackWindow.end);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const roster = people.filter((row) => typeof row.email === "string" && row.email.includes("@"));

  useEffect(() => {
    setStartYmd(fallbackWindow.start);
    setEndYmd(fallbackWindow.end);
  }, [fallbackWindow.start, fallbackWindow.end]);

  async function load() {
    const response = await fetch(`/api/desk/site-access?siteId=${encodeURIComponent(siteId)}`, {
      credentials: "include",
      cache: "no-store",
    });
    const data = (await response.json().catch(() => ({}))) as {
      grants?: PublicGrant[];
      toolRoom?: ToolRoomDuty[];
      error?: string;
    };
    if (!response.ok) {
      setError(data.error || "Could not load site people.");
      return;
    }
    setGrants(Array.isArray(data.grants) ? data.grants : []);
    setDuties(Array.isArray(data.toolRoom) ? data.toolRoom : []);
  }

  useEffect(() => {
    void load();
  }, [siteId]);

  async function post(body: Record<string, unknown>) {
    setError(null);
    const response = await fetch("/api/desk/site-access", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, ...body }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      grants?: PublicGrant[];
      toolRoom?: ToolRoomDuty[];
      error?: string;
    };
    if (!response.ok) {
      setError(data.error || "Could not save that assignment.");
      return;
    }
    if (data.grants) setGrants(data.grants);
    if (data.toolRoom) setDuties(data.toolRoom);
  }

  const dutyPerson = roster.find((row) => row.email === dutyEmail);
  const dutyTimeboxed = toolRoomTimeboxedFor(dutyPerson || (dutyEmail ? { email: dutyEmail } : null));

  return (
    <section className="site-plate plant-card mt-6 space-y-6 px-5 py-6">
      <div>
        <h3 className="text-xl font-semibold text-[#163038]">People</h3>
        <p className="mt-2 text-sm text-[#5b6f73]">
          People is not Users. Users is who may sign in. People is who owns change orders, HSE, or
          Quality on {siteName}, plus site access and Tool Room duty. Users stay anonymous unless they
          share this shop.
        </p>
        {note ? <p className="mt-3 text-sm text-[#163038]">{note}</p> : null}
        {error ? <p className="mt-3 text-sm text-[#163038]">{error}</p> : null}
      </div>

      <div>
        <h4 className="text-lg font-semibold text-[#163038]">Site access</h4>
        <p className="mt-1 text-sm text-[#5b6f73]">
          Project Managers grant access on this plant. {SITE_ACCESS_DURATION_COPY}
        </p>
        {canAssign ? (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="block text-sm">
              Person
              <select
                className="paper-field mt-1"
                value={accessEmail}
                onChange={(event) => setAccessEmail(event.target.value)}
                aria-label="Person for site access"
              >
                <option value="">Pick someone</option>
                {roster.map((row) => (
                  <option key={row.id} value={row.email}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!accessEmail}
              onClick={() => {
                const person = roster.find((row) => row.email === accessEmail);
                setNote(SITE_ACCESS_DURATION_COPY);
                void post({ action: "grant-site-access", email: accessEmail, name: person?.name });
              }}
              className="rounded-lg bg-steel px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              Grant access
            </button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-[#5b6f73]">Owner and Project Managers grant site access.</p>
        )}
        <ul className="mt-3 space-y-2 text-sm">
          {grants.length === 0 ? <li className="text-[#5b6f73]">No site access grants yet.</li> : null}
          {grants.map((grant) => (
            <li key={grant.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#d5e0de] px-3 py-2">
              <span>
                <span className="font-medium text-[#163038]">{grant.name || grant.email}</span>
                <span className="ml-2 text-[#5b6f73]">{grant.copy}</span>
              </span>
              {canAssign ? (
                <button
                  type="button"
                  onClick={() => void post({ action: "revoke-site-access", email: grant.email })}
                  className="text-sm text-steel"
                >
                  Revoke
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="text-lg font-semibold text-[#163038]">Tool Room attendant</h4>
        <p className="mt-1 text-sm text-[#5b6f73]">{TOOL_ROOM_WINDOW_COPY}</p>
        {canAssign ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              General Foreman
              <select
                className="paper-field mt-1"
                value={dutyEmail}
                onChange={(event) => setDutyEmail(event.target.value)}
                aria-label="Person for Tool Room duty"
              >
                <option value="">Pick someone</option>
                {roster.map((row) => (
                  <option key={row.id} value={row.email}>
                    {row.name}
                    {row.jobTitle ? ` · ${row.jobTitle}` : ""}
                  </option>
                ))}
              </select>
            </label>
            {dutyTimeboxed ? (
              <>
                <label className="block text-sm">
                  Window start
                  <input
                    type="date"
                    className="paper-field mt-1"
                    value={startYmd}
                    onChange={(event) => setStartYmd(event.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  Window end
                  <input
                    type="date"
                    className="paper-field mt-1"
                    value={endYmd}
                    onChange={(event) => setEndYmd(event.target.value)}
                  />
                </label>
              </>
            ) : (
              <p className="self-end text-sm text-[#5b6f73]">{TOOL_ROOM_OWNER_PM_COPY}</p>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <button
                type="button"
                disabled={!dutyEmail}
                onClick={() => {
                  const person = roster.find((row) => row.email === dutyEmail);
                  void post({
                    action: "assign-tool-room",
                    email: dutyEmail,
                    name: person?.name,
                    startYmd,
                    endYmd,
                    postEndYmd,
                  });
                  setNote("Tool Room attendant window saved.");
                }}
                className="rounded-lg bg-steel px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                Assign attendant
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-[#5b6f73]">Owner and Project Managers set the Tool Room window.</p>
        )}
        <ul className="mt-3 space-y-2 text-sm">
          {duties.length === 0 ? <li className="text-[#5b6f73]">No Tool Room attendant on this plant.</li> : null}
          {duties.map((duty) => (
            <li key={duty.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#d5e0de] px-3 py-2">
              <span>
                <span className="font-medium text-[#163038]">{duty.name || duty.email}</span>
                <span className="ml-2 text-[#5b6f73]">
                  {duty.timeboxed
                    ? `${duty.startYmd || "—"} → ${duty.endYmd || "—"}`
                    : TOOL_ROOM_OWNER_PM_COPY}
                </span>
              </span>
              {canAssign ? (
                <button
                  type="button"
                  onClick={() => void post({ action: "clear-tool-room", email: duty.email })}
                  className="text-sm text-steel"
                >
                  Clear
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
