"use client";

import { useMemo, useState } from "react";
import { useEstimatePackage } from "@/components/EstimatePackage";
import {
  CIRCUIT_COUNT,
  DRUM_TUBE_COUNT,
  ROLL_STEPS,
  ROLLING_SHEETS,
  SIDE_WALL_TUBE_COUNT,
  SIDE_WALLS,
  drumTubeKey,
  emptyRollingTube,
  formatWallReduction,
  hydrateRollingChart,
  readRollingTube,
  rollingProgression,
  sideWallTubeKey,
  stepCount,
  type RollStepId,
  type RollingSheetId,
  type RollingTube,
  type SideWall,
} from "@/lib/rolling-chart";

const STEP_FILL = ["#d5e0de", "#9bb3b8", "#6d9299", "#3f737c", "#1f5a64", "#0f5f6d", "#c9a227"];

function tubeFill(tube: RollingTube) {
  return STEP_FILL[stepCount(tube)] || STEP_FILL[0];
}

export function RollingChartMap() {
  const pack = useEstimatePackage();
  const state = hydrateRollingChart(pack.jobMeta.rollingChart);
  const [sheet, setSheet] = useState<RollingSheetId>("steam");
  const [picked, setPicked] = useState<string | null>(null);
  const current = ROLLING_SHEETS.find((item) => item.id === sheet) ?? ROLLING_SHEETS[0];
  const pickedTube = picked ? readRollingTube(state, picked) : emptyRollingTube();
  const progression = useMemo(() => rollingProgression(state), [state]);

  function write(next: typeof state) {
    pack.setJobMeta((currentMeta) => ({
      ...currentMeta,
      rollingChart: hydrateRollingChart(next),
    }));
  }

  function patchInputs(partial: Partial<typeof state>) {
    write({ ...state, ...partial, tubes: state.tubes });
  }

  function patchTube(key: string, next: Partial<RollingTube>) {
    const currentTube = readRollingTube(state, key);
    const merged: RollingTube = {
      steps: { ...currentTube.steps, ...next.steps },
      actualTubeId: next.actualTubeId !== undefined ? next.actualTubeId : currentTube.actualTubeId,
    };
    const tubes = { ...state.tubes };
    if (!stepCount(merged) && !merged.actualTubeId.trim()) delete tubes[key];
    else tubes[key] = merged;
    write({ ...state, tubes });
  }

  function toggleStep(key: string, id: RollStepId, on: boolean) {
    const currentTube = readRollingTube(state, key);
    patchTube(key, { steps: { ...currentTube.steps, [id]: on } });
  }

  const wall = picked
    ? formatWallReduction(pickedTube.actualTubeId, state.averageTubeId, state.averageTubeOd)
    : "";

  return (
    <div className="mt-6 rounded-lg border border-[#d5e0de] bg-white px-4 py-4">
      <h2 className="text-sm font-semibold tracking-[0.12em] text-[#5b6f73]">ROLLING CHART</h2>
      <p className="mt-2 text-sm text-[#163038]">{current.title}</p>
      {current.tracking !== current.title ? (
        <p className="text-xs text-[#5b6f73]">{current.tracking}</p>
      ) : null}
      <p className="mt-2 text-sm text-[#5b6f73]">
        Live tube map. A row is a generating-bank circuit. Mark the six steps. Actual Tube ID sits
        with Final Roll. Empty Actual Tube ID stays empty.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {ROLLING_SHEETS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setSheet(item.id);
              setPicked(null);
            }}
            className={`rounded-full px-3 py-1.5 text-sm ${
              sheet === item.id ? "bg-steel text-white" : "border border-steel text-steel"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">IDEAL PERCENTAGE ROLL</span>
          <input
            className="paper-field mt-1"
            value={state.idealPercentageRoll}
            onChange={(event) => patchInputs({ idealPercentageRoll: event.target.value })}
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">AVERAGE TUBE ID</span>
          <input
            className="paper-field mt-1"
            value={state.averageTubeId}
            onChange={(event) => patchInputs({ averageTubeId: event.target.value })}
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">AVERAGE TUBE OD</span>
          <input
            className="paper-field mt-1"
            value={state.averageTubeOd}
            onChange={(event) => patchInputs({ averageTubeOd: event.target.value })}
          />
        </label>
      </div>

      {sheet === "steam" || sheet === "mud" ? (
        <div className="mt-4 space-y-2 overflow-x-auto">
          {Array.from({ length: CIRCUIT_COUNT }, (_, index) => {
            const circuit = index + 1;
            return (
              <div key={circuit} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-[10px] font-semibold tracking-[0.12em] text-[#5b6f73]">
                  C{circuit}
                </span>
                <div className="flex flex-wrap gap-px">
                  {Array.from({ length: DRUM_TUBE_COUNT }, (__, tubeIndex) => {
                    const tube = tubeIndex + 1;
                    const key = drumTubeKey(sheet, circuit, tube);
                    const mark = readRollingTube(state, key);
                    return (
                      <button
                        key={key}
                        type="button"
                        title={`Circuit ${circuit} tube ${tube}`}
                        aria-label={`Circuit ${circuit} tube ${tube}`}
                        onClick={() => setPicked(key)}
                        className={`h-3 w-3 rounded-[2px] ${picked === key ? "ring-2 ring-[#c9a227]" : ""}`}
                        style={{ background: tubeFill(mark) }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {sheet === "sidewalls" ? (
        <div className="mt-4 space-y-3">
          {SIDE_WALLS.map((side) => (
            <div key={side}>
              <p className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">{side}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {Array.from({ length: SIDE_WALL_TUBE_COUNT }, (_, index) => {
                  const tube = index + 1;
                  const key = sideWallTubeKey(side as SideWall, tube);
                  const mark = readRollingTube(state, key);
                  return (
                    <button
                      key={key}
                      type="button"
                      title={`${side} tube ${tube}`}
                      aria-label={`${side} tube ${tube}`}
                      onClick={() => setPicked(key)}
                      className={`h-5 w-5 rounded-[3px] text-[9px] text-[#163038] ${picked === key ? "ring-2 ring-[#c9a227]" : ""}`}
                      style={{ background: tubeFill(mark) }}
                    >
                      {tube}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {sheet === "productivity" ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-[#163038]">Generating Bank Retube Progression Chart</p>
          {progression.map((row) => (
            <div key={row.sheet}>
              <p className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">
                {row.sheet === "steam" ? "STEAM DRUM" : row.sheet === "mud" ? "MUD DRUM" : "SIDE WALLS"} · {row.total} TUBES
              </p>
              <div className="mt-2 grid gap-2">
                {ROLL_STEPS.map((step) => {
                  const count = row.steps[step.id];
                  const pct = row.total ? Math.round((count / row.total) * 1000) / 10 : 0;
                  return (
                    <div key={step.id}>
                      <div className="flex justify-between text-xs text-[#5b6f73]">
                        <span>{step.label}</span>
                        <span>
                          {count} / {row.total} · {pct}%
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded bg-[#d5e0de]">
                        <div className="h-full bg-steel" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {picked && sheet !== "productivity" ? (
        <div className="mt-4 rounded-lg border border-[#c5d4d4] bg-[#f4f1e8] px-3 py-3">
          <p className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">TUBE {picked.replace(/^(steam|mud|sidewalls):/, "")}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {ROLL_STEPS.map((step) => (
              <label key={step.id} className="flex items-center gap-2 text-sm text-[#163038]">
                <input
                  type="checkbox"
                  checked={Boolean(pickedTube.steps[step.id])}
                  onChange={(event) => toggleStep(picked, step.id, event.target.checked)}
                />
                {step.label}
              </label>
            ))}
          </div>
          {pickedTube.steps["final-roll"] ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">ACTUAL TUBE ID</span>
                <input
                  className="paper-field mt-1"
                  value={pickedTube.actualTubeId}
                  onChange={(event) => patchTube(picked, { actualTubeId: event.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="text-xs font-semibold tracking-[0.16em] text-[#5b6f73]">WALL REDUCTION %</span>
                <input className="paper-field mt-1" readOnly value={wall} placeholder="Empty until Actual Tube ID" />
              </label>
            </div>
          ) : (
            <p className="mt-3 text-xs text-[#5b6f73]">Rolling QA sits with Tube Final Roll.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
