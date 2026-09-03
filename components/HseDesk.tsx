"use client";

import { useEffect, useState } from "react";
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
  patchHseLaneRow,
  readHseModule,
  removeHseLaneRow,
  writeHseModule,
  type HseModuleState,
} from "@/lib/hse-module";

export function HseDesk() {
  const alias = useAlias();
  const owner = useOwnerDesk();
  const { user } = useSession();
  const [folder, setFolder] = useState<ClientFolderId>("phillips-66");
  const [module, setModule] = useState<HseModuleState>(emptyHseModule);
  const assigned = owner?.viewAs === "wendell" || owner?.viewAs === "benny";
  const manuals = canSeeMadisonSafetyManuals(user, companyScopeFor(user));
  const roster = canSeeHesRoster(user);

  useEffect(() => {
    setModule(readHseModule(folder));
  }, [folder]);

  function persist(next: HseModuleState) {
    setModule(next);
    writeHseModule(folder, next);
  }

  return (
    <div className="mt-4 space-y-5">
      <label className="block max-w-sm text-sm">
        Client folder
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
      </label>
      <LeadStudio title="HSE lead studio" kind="hse" />
      {assigned ? (
        <p className="plant-card px-4 py-3 text-sm">
          This is your HSE desk. Site safety slots sit on this module. Drops you save stay on this
          desk.
        </p>
      ) : null}
      {manuals ? <p className="text-xs text-[#5b6f73]">Madison Safety Manual / HES SOPs</p> : null}
      {roster ? <p className="text-xs text-[#5b6f73]">HES Reporting roster stays owner-only.</p> : null}
      <HseDay1Card
        value={module.day1}
        plant={module.plant}
        onChange={(day1) => persist({ ...module, day1 })}
        onPlant={(plant) => persist({ ...module, plant })}
      />
      {HSE_EXECUTE_LANES.map((lane) => (
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
    </div>
  );
}
