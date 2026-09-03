"use client";

import { useEffect, useState } from "react";
import { LeadStudio } from "@/components/LeadStudio";
import { ModuleRegister } from "@/components/ModuleRegister";
import { QualityDay1Card } from "@/components/QualityDay1Card";
import { RollingChartMap } from "@/components/RollingChartMap";
import { useAlias, useOwnerDesk } from "@/components/OwnerDeskContext";
import { useSession } from "@/components/SessionProvider";
import { companyScopeFor } from "@/lib/companies";
import { CLIENT_FOLDERS, type ClientFolderId } from "@/lib/quality-hse-modules";
import { canSeeMadisonManuals, madisonManualLabel } from "@/lib/quality-day1";
import {
  QUALITY_SECTIONS,
  addQualityRow,
  emptyQualityModule,
  patchQualityRow,
  qualityBoardCounts,
  readQualityModule,
  removeQualityRow,
  writeQualityModule,
  type QualityModuleState,
} from "@/lib/quality-module";

export function QualityDesk() {
  const alias = useAlias();
  const owner = useOwnerDesk();
  const { user } = useSession();
  const [folder, setFolder] = useState<ClientFolderId>("phillips-66");
  const [module, setModule] = useState<QualityModuleState>(emptyQualityModule);
  const chance = owner?.viewAs === "chance";
  const manuals = canSeeMadisonManuals(user, companyScopeFor(user));
  const counts = qualityBoardCounts(module);

  useEffect(() => {
    setModule(readQualityModule(folder));
  }, [folder]);

  function persist(next: QualityModuleState) {
    setModule(next);
    writeQualityModule(folder, next);
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
      <LeadStudio title="Quality lead studio" kind="quality" />
      {chance ? (
        <p className="plant-card px-4 py-3 text-sm">
          Chance — this is your Quality home. Named Day-1 forms, the board, and the live tube map sit
          on this module. Drops you save stay on this desk.
        </p>
      ) : null}
      {manuals ? <p className="text-xs text-[#5b6f73]">{madisonManualLabel("quality")}</p> : null}

      <section className="plant-card px-4 py-4">
        <h2 className="text-sm font-semibold tracking-[0.12em] text-[#5b6f73]">BOARD</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUALITY_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => document.getElementById(`quality-${section.id}`)?.scrollIntoView({ behavior: "smooth" })}
              className="rounded-lg border border-[#d5e0de] px-4 py-3 text-left"
            >
              <p className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">{section.board.toUpperCase()}</p>
              <p className="mt-2 font-display text-3xl text-[#163038]">{counts[section.id]}</p>
            </button>
          ))}
        </div>
      </section>

      {QUALITY_SECTIONS.map((section) => (
        <ModuleRegister
          key={section.id}
          id={`quality-${section.id}`}
          title={section.title}
          fields={section.fields}
          rows={module.sections[section.id]}
          onAdd={() => persist(addQualityRow(module, section.id))}
          onPatch={(rowId, field, value) => persist(patchQualityRow(module, section.id, rowId, field, value))}
          onRemove={(rowId) => persist(removeQualityRow(module, section.id, rowId))}
        />
      ))}

      <QualityDay1Card
        value={module.day1}
        workNames={module.workNames}
        onChange={(day1) => persist({ ...module, day1 })}
        onWorkNames={(workNames) => persist({ ...module, workNames })}
      />
      <RollingChartMap
        state={module.rollingChart}
        onChange={(rollingChart) => persist({ ...module, rollingChart })}
      />
    </div>
  );
}
