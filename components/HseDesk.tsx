"use client";

import { useEffect, useState } from "react";
import { FieldBlock } from "@/components/FieldMark";
import { HseDay1Card } from "@/components/HseDay1Card";
import { LeadStudio } from "@/components/LeadStudio";
import { ModuleRegister } from "@/components/ModuleRegister";
import { useAlias, useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { companyScopeFor } from "@/lib/companies";
import { CLIENT_FOLDERS, type ClientFolderId } from "@/lib/quality-hse-modules";
import { canSeeHesRoster, canSeeMadisonSafetyManuals } from "@/lib/hse-day1";
import {
  HSE_EXECUTE_LANES,
  addHseLaneRow,
  emptyHseModule,
  hseBoardCounts,
  hseDay1CompleteCount,
  patchHseLaneRow,
  readHseModule,
  removeHseLaneRow,
  writeHseModule,
  type HseModuleState,
} from "@/lib/hse-module";

const LANE_GROUPS = [
  { id: "talks", title: "Talks", note: "JSA and toolbox talks you can add rows to." },
  { id: "permits", title: "Permits", note: "Field permits for this job. Not a plant permit office." },
  { id: "observations", title: "Observations", note: "Incidents, near misses, and observations. No invented hours." },
] as const;

export function HseDesk() {
  const alias = useAlias();
  const owner = useOwnerDesk();
  const { user } = useSession();
  const [folder, setFolder] = useState<ClientFolderId>("phillips-66");
  const [module, setModule] = useState<HseModuleState>(emptyHseModule);
  const assigned = owner?.viewAs === "wendell" || owner?.viewAs === "benny";
  const manuals = canSeeMadisonSafetyManuals(user, companyScopeFor(user));
  const roster = canSeeHesRoster(user);
  const counts = hseBoardCounts(module);
  const day1Done = hseDay1CompleteCount(module.day1);

  useEffect(() => {
    setModule(readHseModule(folder));
  }, [folder]);

  function persist(next: HseModuleState) {
    setModule(next);
    writeHseModule(folder, next);
  }

  return (
    <div className="field-desk mt-4 space-y-5">
      <FieldBlock label="Client folder">
        <select
          value={folder}
          onChange={(event) => setFolder(event.target.value as ClientFolderId)}
          className="paper-field mt-1"
        >
          {CLIENT_FOLDERS.map((item) => (
            <option key={item.id} value={item.id}>
              {alias(item.label)}
            </option>
          ))}
        </select>
      </FieldBlock>
      <LeadStudio title="HSE lead studio" kind="hse" />
      {assigned ? (
        <p className="plant-card px-4 py-3 text-base text-[#163038]">
          This is your HSE desk. Fill the package table, then type talks, permits, and observations. Drops you
          save stay on this desk.
        </p>
      ) : null}
      {manuals ? <p className="text-base text-[#163038]">Madison Safety Manual / HES SOPs</p> : null}
      {roster ? <p className="text-base text-[#163038]">HES Reporting roster stays owner-only.</p> : null}

      <section className="plant-card px-4 py-4">
        <h2 className="font-display text-xl text-[#163038]">BOARD</h2>
        <p className="mt-1 text-base text-[#163038]">Open counts. Click a tile to jump to that lane.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => document.getElementById("hse-day1")?.scrollIntoView({ behavior: "smooth" })}
            className="rounded-sm border border-[#c5d4d4] bg-[#fbf8f0] px-4 py-3 text-left"
          >
            <p className="text-sm font-semibold text-[#163038]">Day-1 package</p>
            <p className="mt-2 font-display text-3xl text-[#163038]">{day1Done}</p>
          </button>
          {HSE_EXECUTE_LANES.map((lane) => (
            <button
              key={lane.id}
              type="button"
              onClick={() => document.getElementById(`hse-${lane.id}`)?.scrollIntoView({ behavior: "smooth" })}
              className="rounded-sm border border-[#c5d4d4] bg-[#fbf8f0] px-4 py-3 text-left"
            >
              <p className="text-sm font-semibold text-[#163038]">{lane.title}</p>
              <p className="mt-2 font-display text-3xl text-[#163038]">{counts[lane.id]}</p>
            </button>
          ))}
        </div>
      </section>

      <div id="hse-day1">
        <HseDay1Card
          value={module.day1}
          plant={module.plant}
          onChange={(day1) => persist({ ...module, day1 })}
          onPlant={(plant) => persist({ ...module, plant })}
        />
      </div>
      {LANE_GROUPS.map((group) => (
        <section key={group.id} className="space-y-3">
          <div className="px-1">
            <h2 className="font-display text-xl text-[#163038]">{group.title}</h2>
            <p className="mt-1 text-base text-[#163038]">{group.note}</p>
          </div>
          {HSE_EXECUTE_LANES.filter((lane) => lane.group === group.id).map((lane) => (
            <ModuleRegister
              key={lane.id}
              id={`hse-${lane.id}`}
              title={lane.title}
              fields={lane.fields}
              rows={module.lanes[lane.id]}
              onAdd={() => persist(addHseLaneRow(module, lane.id))}
              onPatch={(rowId, field, value) => persist(patchHseLaneRow(module, lane.id, rowId, field, value))}
              onRemove={(rowId) => persist(removeHseLaneRow(module, lane.id, rowId))}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
